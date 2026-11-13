-- Subscription expiry blocks the whole outlet, and the super admin has exclusive control of
-- restaurant info (13 Nov 2026, owner's instruction).

-- 1. An expired or paused account can't sync: every terminal of its restaurants is refused on push,
--    exactly like a blocked device. account_is_live keeps the 7-day grace after paid_until, so this
--    bites only after the grace runs out (the apps show the renewal screen; data stays on devices).
CREATE OR REPLACE FUNCTION public.terminal_is_blocked(_restaurant_id uuid, _device text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.terminals t WHERE t.restaurant_id = _restaurant_id AND t.device_id = _device AND t.status IN ('blocked', 'over_plan', 'pending'))
      OR NOT public.account_is_live((SELECT r.account_id FROM public.restaurants r WHERE r.id = _restaurant_id))
$$;

-- 2. Restaurant info is the super admin's: name, outlet address (slug), city and billing contacts
--    are changed only in the console. A slug change breaks printed QR cards, so the console warns.
CREATE OR REPLACE FUNCTION public.platform_update_restaurant(_id uuid, _name text, _slug text, _city text, _billing_phone text, _billing_email text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE before restaurants; slug_clean text := lower(trim(coalesce(_slug, '')));
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Super admin only'; END IF;
  SELECT * INTO before FROM restaurants WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant not found'; END IF;
  IF length(trim(coalesce(_name, ''))) < 2 THEN RAISE EXCEPTION 'Give the restaurant a name.'; END IF;
  IF slug_clean <> '' AND slug_clean !~ '^[a-z0-9][a-z0-9-]{2,39}$' THEN RAISE EXCEPTION 'The QR address can use 3-40 lower-case letters, digits and dashes.'; END IF;
  IF slug_clean <> '' AND EXISTS (SELECT 1 FROM restaurants x WHERE x.slug = slug_clean AND x.id <> _id) THEN RAISE EXCEPTION 'Another restaurant already uses that QR address.'; END IF;
  UPDATE restaurants SET name = trim(_name), slug = nullif(slug_clean, ''), city = left(trim(coalesce(_city, '')), 80) WHERE id = _id;
  UPDATE accounts SET name = trim(_name), billing_phone = left(trim(coalesce(_billing_phone, '')), 20), billing_email = left(lower(trim(coalesce(_billing_email, ''))), 120)
  WHERE id = before.account_id;
  INSERT INTO account_events (account_id, kind, detail, by_user) VALUES (before.account_id, 'info_changed', jsonb_build_object(
    'restaurant', _id,
    'from', jsonb_build_object('name', before.name, 'slug', before.slug, 'city', before.city),
    'to', jsonb_build_object('name', trim(_name), 'slug', nullif(slug_clean, ''), 'city', left(trim(coalesce(_city, '')), 80))), auth.uid());
END $$;

REVOKE ALL ON FUNCTION public.platform_update_restaurant(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_restaurant(uuid, text, text, text, text, text) TO authenticated;

-- 3. Renewals and payment status are the super admin's alone: a restaurant has no self-serve path.
--    Each payment is recorded by hand, extends the paid-until date and makes the account live again.
--    Payments are kept in account_events so the console can show a restaurant's payment history.
CREATE OR REPLACE FUNCTION public.platform_record_payment(_account uuid, _amount numeric, _months integer, _method text, _reference text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a accounts; starts timestamptz; ends timestamptz;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Super admin only'; END IF;
  SELECT * INTO a FROM accounts WHERE id = _account;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF _months IS NULL OR _months < 1 OR _months > 36 THEN RAISE EXCEPTION 'Renew for 1 to 36 months.'; END IF;
  IF _amount IS NULL OR _amount < 0 OR _amount > 10000000 THEN RAISE EXCEPTION 'Check the amount.'; END IF;
  IF coalesce(_method, '') NOT IN ('cash', 'upi', 'bank', 'card', 'other') THEN RAISE EXCEPTION 'Unknown payment method.'; END IF;
  -- Renew from the current paid-until when it is still ahead, else from today: paid time is never lost.
  starts := greatest(coalesce(a.paid_until, now()), now());
  ends := starts + (_months || ' months')::interval;
  UPDATE accounts SET paid_until = ends, status = 'active' WHERE id = _account;
  INSERT INTO account_events (account_id, kind, detail, by_user) VALUES (_account, 'payment_recorded', jsonb_build_object(
    'amount', _amount, 'months', _months, 'method', _method, 'reference', left(coalesce(_reference, ''), 120),
    'from', a.paid_until, 'until', ends, 'planAtPayment', a.plan_id), auth.uid());
  RETURN jsonb_build_object('paidUntil', ends, 'status', 'active');
END $$;

-- A restaurant's payment history, newest first (super admin only).
CREATE OR REPLACE FUNCTION public.platform_payments(_account uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Super admin only'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('at', created_at, 'detail', detail) ORDER BY created_at DESC)
                   FROM (SELECT created_at, detail FROM account_events WHERE account_id = _account AND kind = 'payment_recorded' ORDER BY created_at DESC LIMIT 24) q), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.platform_record_payment(uuid, numeric, integer, text, text), public.platform_payments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_record_payment(uuid, numeric, integer, text, text), public.platform_payments(uuid) TO authenticated;
