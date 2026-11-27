-- Prices per client, and current customers keep their price when the website price changes
-- (owner, 27 Nov 2026). Payments stay manual; only the super admin sets prices.

-- 1. Each account may carry its own price (an initial offer, a kept earlier price).
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS custom_price integer;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS custom_included_rooms integer;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS custom_extra_room_price integer;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS price_note text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS price_set_at timestamptz;

-- 2. When a plan's price or room terms change, everyone already on it keeps the old terms.
CREATE OR REPLACE FUNCTION public.keep_price_for_current_customers()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE acc record;
BEGIN
  IF NEW.monthly_price IS NOT DISTINCT FROM OLD.monthly_price
     AND NEW.included_rooms IS NOT DISTINCT FROM OLD.included_rooms
     AND NEW.extra_room_price IS NOT DISTINCT FROM OLD.extra_room_price THEN
    RETURN NEW;
  END IF;
  FOR acc IN
    UPDATE accounts SET custom_price = OLD.monthly_price, custom_included_rooms = OLD.included_rooms,
      custom_extra_room_price = OLD.extra_room_price,
      price_note = format('Kept at the earlier %s price when the plan changed on %s', OLD.name, to_char(now() AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY')),
      price_set_at = now()
    WHERE plan_id = OLD.id AND custom_price IS NULL AND NOT complimentary AND status IN ('active', 'past_due', 'trialing')
    RETURNING id
  LOOP
    INSERT INTO account_events (account_id, kind, detail, by_user) VALUES (acc.id, 'price_kept', jsonb_build_object(
      'plan', OLD.id, 'price', OLD.monthly_price, 'includedRooms', OLD.included_rooms, 'extraRoomPrice', OLD.extra_room_price,
      'newPrice', NEW.monthly_price), auth.uid());
  END LOOP;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS plans_keep_customer_prices ON public.plans;
CREATE TRIGGER plans_keep_customer_prices AFTER UPDATE OF monthly_price, included_rooms, extra_room_price ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.keep_price_for_current_customers();

-- 3. Moving an account to another plan drops a price that belonged to the old plan,
--    unless the same update sets a new one.
CREATE OR REPLACE FUNCTION public.clear_custom_price_on_plan_change()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
     AND NEW.custom_price IS NOT DISTINCT FROM OLD.custom_price
     AND NEW.custom_included_rooms IS NOT DISTINCT FROM OLD.custom_included_rooms
     AND NEW.custom_extra_room_price IS NOT DISTINCT FROM OLD.custom_extra_room_price THEN
    NEW.custom_price := NULL; NEW.custom_included_rooms := NULL; NEW.custom_extra_room_price := NULL;
    NEW.price_note := NULL; NEW.price_set_at := NULL;
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS accounts_clear_custom_price ON public.accounts;
CREATE TRIGGER accounts_clear_custom_price BEFORE UPDATE OF plan_id ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.clear_custom_price_on_plan_change();

-- 4. Super admin sets (or clears, with all NULLs) one client's price.
CREATE OR REPLACE FUNCTION public.platform_set_account_price(_account uuid, _price integer, _included_rooms integer, _extra_room_price integer, _note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE before accounts;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Super admin only'; END IF;
  SELECT * INTO before FROM accounts WHERE id = _account;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF _price IS NOT NULL AND (_price < 0 OR _price > 1000000) THEN RAISE EXCEPTION 'Price must be between ₹0 and ₹10,00,000'; END IF;
  IF _included_rooms IS NOT NULL AND (_included_rooms < 1 OR _included_rooms > 2000) THEN RAISE EXCEPTION 'Included rooms must be 1 to 2000'; END IF;
  IF _extra_room_price IS NOT NULL AND (_extra_room_price < 0 OR _extra_room_price > 100000) THEN RAISE EXCEPTION 'Extra room price must be ₹0 to ₹1,00,000'; END IF;
  IF _price IS NULL AND (_included_rooms IS NOT NULL OR _extra_room_price IS NOT NULL) THEN RAISE EXCEPTION 'Set a monthly price with the room terms'; END IF;
  IF _price IS NOT NULL AND length(trim(coalesce(_note, ''))) < 3 THEN RAISE EXCEPTION 'Say why this client has its own price (the offer)'; END IF;
  UPDATE accounts SET custom_price = _price, custom_included_rooms = _included_rooms, custom_extra_room_price = _extra_room_price,
    price_note = CASE WHEN _price IS NULL THEN NULL ELSE left(trim(_note), 200) END,
    price_set_at = CASE WHEN _price IS NULL THEN NULL ELSE now() END
  WHERE id = _account;
  INSERT INTO account_events (account_id, kind, detail, by_user) VALUES (_account, 'price_changed', jsonb_build_object(
    'from', jsonb_build_object('price', before.custom_price, 'includedRooms', before.custom_included_rooms, 'extraRoomPrice', before.custom_extra_room_price, 'note', before.price_note),
    'to', jsonb_build_object('price', _price, 'includedRooms', _included_rooms, 'extraRoomPrice', _extra_room_price, 'note', _note)), auth.uid());
END $function$;
REVOKE ALL ON FUNCTION public.platform_set_account_price(uuid, integer, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_account_price(uuid, integer, integer, integer, text) TO authenticated;

-- 5. The console's plan editor sets room terms and the property/outlet limit too.
DROP FUNCTION IF EXISTS public.platform_save_plan(text, text, integer, integer, integer, integer, jsonb, boolean, boolean, text);
CREATE FUNCTION public.platform_save_plan(_id text, _name text, _monthly integer, _billdesk integer, _waiter integer, _admin integer, _features jsonb,
  _active boolean, _quote boolean, _tagline text,
  _set_rooms boolean DEFAULT false, _included_rooms integer DEFAULT NULL, _extra_room_price integer DEFAULT NULL, _max_outlets integer DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Super admin only'; END IF;
  IF _id !~ '^[a-z0-9_]{2,24}$' THEN RAISE EXCEPTION 'Plan id: 2-24 lower-case letters, digits or _'; END IF;
  IF _set_rooms AND _included_rooms IS NOT NULL AND (_included_rooms < 1 OR _included_rooms > 2000) THEN RAISE EXCEPTION 'Included rooms must be 1 to 2000'; END IF;
  IF _set_rooms AND _extra_room_price IS NOT NULL AND (_extra_room_price < 0 OR _extra_room_price > 100000) THEN RAISE EXCEPTION 'Extra room price must be ₹0 to ₹1,00,000'; END IF;
  IF _max_outlets IS NOT NULL AND (_max_outlets < 1 OR _max_outlets > 500) THEN RAISE EXCEPTION 'Properties/outlets must be 1 to 500'; END IF;
  INSERT INTO plans (id, name, monthly_price, yearly_price, max_outlets, max_staff, features, active, sort, billdesk_seats, waiter_seats, admin_seats, quote, tagline, included_rooms, extra_room_price)
  VALUES (_id, _name, coalesce(_monthly, 0), 0, coalesce(_max_outlets, 1), coalesce(_billdesk, 50) + coalesce(_waiter, 50) + coalesce(_admin, 50), coalesce(_features, '{}'), coalesce(_active, true),
          (SELECT coalesce(max(sort), 0) + 10 FROM plans WHERE sort < 99), _billdesk, _waiter, _admin, coalesce(_quote, false), left(coalesce(_tagline, ''), 120),
          CASE WHEN _set_rooms THEN _included_rooms END, CASE WHEN _set_rooms THEN _extra_room_price END)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, monthly_price = EXCLUDED.monthly_price, features = EXCLUDED.features, active = EXCLUDED.active,
    billdesk_seats = EXCLUDED.billdesk_seats, waiter_seats = EXCLUDED.waiter_seats, admin_seats = EXCLUDED.admin_seats, quote = EXCLUDED.quote,
    tagline = EXCLUDED.tagline, max_staff = EXCLUDED.max_staff,
    max_outlets = coalesce(_max_outlets, plans.max_outlets),
    included_rooms = CASE WHEN _set_rooms THEN _included_rooms ELSE plans.included_rooms END,
    extra_room_price = CASE WHEN _set_rooms THEN _extra_room_price ELSE plans.extra_room_price END;
END $function$;
REVOKE ALL ON FUNCTION public.platform_save_plan(text, text, integer, integer, integer, integer, jsonb, boolean, boolean, text, boolean, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_save_plan(text, text, integer, integer, integer, integer, jsonb, boolean, boolean, text, boolean, integer, integer, integer) TO authenticated;

-- 6. The outlet's own plan screen shows the price it actually pays.
CREATE OR REPLACE FUNCTION public.restaurant_entitlements(_restaurant uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE a accounts; p plans; feats jsonb;
BEGIN
  IF NOT (is_member(_restaurant, auth.uid()) OR is_platform_admin()) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT * INTO a FROM accounts WHERE id = (SELECT account_id FROM restaurants WHERE id = _restaurant);
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM plans WHERE id = a.plan_id;
  SELECT jsonb_object_agg(k, account_feature(a.id, k)) INTO feats FROM unnest(ARRAY[
    'billing','menu','gst_reports','manager_app','insights',
    'purchases','vendors','recipes','loyalty','bookings','admin_approval','aggregators',
    'waiter_app','qr_ordering','online_ordering','marketing','gift_cards','feedback',
    'kds','accounting','audit_log','multi_outlet','pms',
    'booking_engine','channel_manager','rate_suggestions','multi_property','restaurant_link']) k;
  RETURN jsonb_build_object('plan', p.id, 'planName', p.name, 'price', coalesce(a.custom_price, p.monthly_price), 'listPrice', p.monthly_price, 'priceNote', a.price_note,
    'includedRooms', CASE WHEN a.custom_price IS NOT NULL THEN a.custom_included_rooms ELSE p.included_rooms END,
    'extraRoomPrice', CASE WHEN a.custom_price IS NOT NULL THEN a.custom_extra_room_price ELSE p.extra_room_price END, 'quote', p.quote,
    'status', a.status, 'paidUntil', a.paid_until, 'trialEndsAt', a.trial_ends_at, 'live', account_is_live(a.id), 'complimentary', a.complimentary, 'features', feats,
    'seats', jsonb_build_object(
      'manager', jsonb_build_object('limit', plan_seats(_restaurant, 'manager'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'manager' AND status = 'active')),
      'pos', jsonb_build_object('limit', plan_seats(_restaurant, 'pos'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'pos' AND status = 'active')),
      'waiter', jsonb_build_object('limit', plan_seats(_restaurant, 'waiter'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'waiter' AND status = 'active'))),
    'waiting', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND status = 'over_plan'));
END $function$;
