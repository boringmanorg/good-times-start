-- Swiggy / Zomato readiness, per-restaurant sandbox (19 Nov 2026).
--
-- * New plan feature `aggregators`: Pro Lite, Pro and Enterprise / Brand; never Basic.
-- * restaurant_integrations: one row per restaurant and platform — mode off / sandbox / live,
--   the platform's store id. Set only by the super admin (platform_set_integration); the
--   restaurant's staff can read their own.
-- * guest_orders learns `platform` (swiggy | zomato), `external_id` and `is_test`, and the
--   payment value `platform` (paid on the platform, settled to the restaurant later).
-- * platform_send_test_order: the super admin drops a sandbox order into ONE restaurant's
--   online-order inbox. It arrives on that restaurant's POS like a real one (chime, Accept,
--   KOT, a Swiggy/Zomato bill) and is marked as a test everywhere.
-- * Live mode is refused until partner API keys exist: nothing pretends to be connected.

-- 1. Plans --------------------------------------------------------------------------------
UPDATE public.plans SET features = features || jsonb_build_object('aggregators', id IN ('pro_lite', 'pro', 'enterprise', 'owner', 'growth', 'chain', 'trial'))
 WHERE id IN ('basic', 'pro_lite', 'pro', 'enterprise', 'owner', 'starter', 'growth', 'chain', 'trial');

CREATE OR REPLACE FUNCTION public.restaurant_entitlements(_restaurant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    'kds','accounting','audit_log','multi_outlet']) k;
  RETURN jsonb_build_object('plan', p.id, 'planName', p.name, 'price', p.monthly_price, 'quote', p.quote,
    'status', a.status, 'paidUntil', a.paid_until, 'trialEndsAt', a.trial_ends_at, 'live', account_is_live(a.id), 'complimentary', a.complimentary, 'features', feats,
    'seats', jsonb_build_object(
      'manager', jsonb_build_object('limit', plan_seats(_restaurant, 'manager'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'manager' AND status = 'active')),
      'pos', jsonb_build_object('limit', plan_seats(_restaurant, 'pos'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'pos' AND status = 'active')),
      'waiter', jsonb_build_object('limit', plan_seats(_restaurant, 'waiter'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'waiter' AND status = 'active'))),
    'waiting', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND status = 'over_plan'));
END $$;

-- 2. Integrations ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurant_integrations (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('swiggy', 'zomato')),
  mode text NOT NULL DEFAULT 'off' CHECK (mode IN ('off', 'sandbox', 'live')),
  store_id text NOT NULL DEFAULT '' CHECK (length(store_id) <= 60),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (restaurant_id, platform)
);
ALTER TABLE public.restaurant_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read their integrations" ON public.restaurant_integrations;
CREATE POLICY "Members read their integrations" ON public.restaurant_integrations FOR SELECT TO authenticated
  USING (public.is_member(restaurant_id, auth.uid()) OR public.is_platform_admin());
REVOKE INSERT, UPDATE, DELETE ON public.restaurant_integrations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_set_integration(_restaurant uuid, _platform text, _mode text, _store_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _account uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Super admin only' USING ERRCODE = '42501'; END IF;
  IF _platform NOT IN ('swiggy', 'zomato') THEN RAISE EXCEPTION 'Unknown platform' USING ERRCODE = '22023'; END IF;
  IF _mode NOT IN ('off', 'sandbox', 'live') THEN RAISE EXCEPTION 'Unknown mode' USING ERRCODE = '22023'; END IF;
  SELECT account_id INTO _account FROM restaurants WHERE id = _restaurant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant not found' USING ERRCODE = '22023'; END IF;
  IF _mode <> 'off' AND NOT public.account_feature(_account, 'aggregators') THEN
    RAISE EXCEPTION 'Swiggy and Zomato are on Pro Lite and above. Move this restaurant off Basic first.' USING ERRCODE = '42501';
  END IF;
  IF _mode = 'live' THEN
    RAISE EXCEPTION 'Live needs the platform''s partner API keys, which aren''t set up yet. Use sandbox until then.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO restaurant_integrations (restaurant_id, platform, mode, store_id, updated_at, updated_by)
  VALUES (_restaurant, _platform, _mode, btrim(coalesce(_store_id, '')), now(), auth.uid())
  ON CONFLICT (restaurant_id, platform) DO UPDATE SET mode = EXCLUDED.mode, store_id = EXCLUDED.store_id, updated_at = now(), updated_by = auth.uid();
  INSERT INTO account_events (account_id, kind, detail, by_user)
  VALUES (_account, 'integration_changed', jsonb_build_object('restaurant', _restaurant, 'platform', _platform, 'mode', _mode, 'store_id', btrim(coalesce(_store_id, ''))), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.platform_integrations(_restaurant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Super admin only' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'links', coalesce((SELECT jsonb_agg(jsonb_build_object('platform', platform, 'mode', mode, 'storeId', store_id, 'updatedAt', updated_at) ORDER BY platform)
                        FROM restaurant_integrations WHERE restaurant_id = _restaurant), '[]'::jsonb),
    'tests', coalesce((SELECT jsonb_agg(jsonb_build_object('code', code, 'platform', platform, 'status', status, 'subtotal', subtotal, 'billNo', bill_no, 'at', created_at) ORDER BY created_at DESC)
                        FROM (SELECT * FROM guest_orders WHERE restaurant_id = _restaurant AND is_test ORDER BY created_at DESC LIMIT 10) t), '[]'::jsonb));
END $$;

-- 3. Orders from the platforms ------------------------------------------------------------
ALTER TABLE public.guest_orders ADD COLUMN IF NOT EXISTS platform text CHECK (platform IS NULL OR platform IN ('swiggy', 'zomato'));
ALTER TABLE public.guest_orders ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.guest_orders ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.guest_orders DROP CONSTRAINT IF EXISTS guest_orders_payment_check;
ALTER TABLE public.guest_orders ADD CONSTRAINT guest_orders_payment_check CHECK (payment = ANY (ARRAY['counter'::text, 'upi'::text, 'platform'::text]));

-- Platform orders are paid on the platform: no UPI step, and they don't take a number from the
-- restaurant's own QR series (QR/0001…). Everything else is exactly the previous function.
CREATE OR REPLACE FUNCTION public.guest_order_pay_state_default()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  outlet public.restaurants;
  settings jsonb;
  room_service boolean := false;
BEGIN
  SELECT * INTO outlet FROM public.restaurants WHERE id = NEW.restaurant_id;
  IF outlet.id IS NULL THEN RAISE EXCEPTION 'Restaurant not found'; END IF;
  NEW.pay_proof := NULL;
  NEW.paid_at := NULL;
  NEW.confirmed_at := NULL;
  IF NEW.payment = 'platform' THEN
    IF NEW.platform IS NULL THEN RAISE EXCEPTION 'Unknown payment option'; END IF;
    NEW.pay_state := 'paid';
    NEW.paid_at := now();
    RETURN NEW;
  END IF;
  IF NEW.channel = 'table' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.restaurant_records
      WHERE restaurant_id = NEW.restaurant_id AND kind = 'table' AND record_id = NEW.table_id AND NOT deleted
        AND trim(coalesce(payload ->> 'section', '')) ~* '^rooms?$'
        AND (coalesce(outlet.ordering #> '{rooms,on}', '[]'::jsonb) ? NEW.table_id
          OR coalesce(outlet.ordering #> '{rooms,priority}', '[]'::jsonb) ? NEW.table_id)
    ) INTO room_service;
  END IF;
  IF NEW.payment = 'counter' THEN
    IF NOT room_service THEN
      RAISE EXCEPTION 'Pay at counter is only available for in-house room service. Please choose UPI.';
    END IF;
    NEW.pay_state := 'none';
  ELSIF NEW.payment = 'upi' THEN
    SELECT payload INTO settings FROM public.restaurant_records
      WHERE restaurant_id = NEW.restaurant_id AND kind = 'settings' AND NOT deleted LIMIT 1;
    IF NOT coalesce((outlet.ordering ->> 'upi')::boolean, false)
       OR length(trim(coalesce(settings ->> 'upiVpa', ''))) = 0 THEN
      RAISE EXCEPTION 'UPI ordering is unavailable right now. Please contact the restaurant.';
    END IF;
    NEW.pay_state := 'awaiting_confirm';
  ELSE
    RAISE EXCEPTION 'Unknown payment option';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.assign_guest_order_qr_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
BEGIN
  IF NEW.platform IS NOT NULL THEN NEW.qr_no := NULL; RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.restaurant_id::text || ':guest-qr-series', 0));
  SELECT coalesce(max(qr_no), 0) + 1 INTO NEW.qr_no FROM public.guest_orders WHERE restaurant_id = NEW.restaurant_id;
  RETURN NEW;
END;
$function$;

-- Staff may handle guest orders, but where an order came from is not theirs to change: a test
-- order can't be passed off as real (or the reverse), nor a QR order as a Swiggy one.
CREATE OR REPLACE FUNCTION public.guard_guest_order_origin()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() AND (
       NEW.platform IS DISTINCT FROM OLD.platform OR NEW.external_id IS DISTINCT FROM OLD.external_id
       OR NEW.is_test IS DISTINCT FROM OLD.is_test OR NEW.payment IS DISTINCT FROM OLD.payment) THEN
    RAISE EXCEPTION 'Where an order came from and how it was paid can''t be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS guest_orders_origin ON public.guest_orders;
CREATE TRIGGER guest_orders_origin BEFORE UPDATE ON public.guest_orders FOR EACH ROW EXECUTE FUNCTION public.guard_guest_order_origin();

CREATE OR REPLACE FUNCTION public.platform_send_test_order(_restaurant uuid, _platform text, _lines jsonb, _customer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mode text; _subtotal numeric; _code text; _row guest_orders;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Super admin only' USING ERRCODE = '42501'; END IF;
  SELECT mode INTO _mode FROM restaurant_integrations WHERE restaurant_id = _restaurant AND platform = _platform;
  IF coalesce(_mode, 'off') <> 'sandbox' THEN
    RAISE EXCEPTION 'Turn on % sandbox for this restaurant first.', initcap(_platform) USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(_lines) = 0 OR jsonb_array_length(_lines) > 30 THEN
    RAISE EXCEPTION 'A test order needs 1 to 30 items' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(sum((l->>'qty')::numeric * (l->>'price')::numeric), 0) INTO _subtotal FROM jsonb_array_elements(_lines) l;
  _code := CASE _platform WHEN 'swiggy' THEN 'SW-' ELSE 'ZO-' END || lpad((floor(random() * 10000))::int::text, 4, '0');
  INSERT INTO guest_orders (restaurant_id, code, channel, order_type, customer_name, customer_phone, note, lines, subtotal,
                            payment, pay_state, status, source, platform, external_id, is_test, delivery_address)
  VALUES (_restaurant, _code, 'online', 'delivery', left(coalesce(nullif(btrim(_customer), ''), initcap(_platform) || ' test guest'), 60), '',
          'Sandbox test order from the XTSY console — not a real order', _lines, _subtotal,
          'platform', 'paid', 'new', 'sandbox', _platform, 'SBX-' || replace(gen_random_uuid()::text, '-', ''), true,
          initcap(_platform) || ' delivery partner picks up (sandbox)')
  RETURNING * INTO _row;
  INSERT INTO account_events (account_id, kind, detail, by_user)
  SELECT account_id, 'sandbox_order', jsonb_build_object('restaurant', _restaurant, 'platform', _platform, 'code', _code, 'subtotal', _subtotal), auth.uid()
    FROM restaurants WHERE id = _restaurant;
  RETURN jsonb_build_object('code', _row.code, 'id', _row.id, 'subtotal', _subtotal);
END $$;

REVOKE ALL ON FUNCTION public.platform_set_integration(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_integrations(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_send_test_order(uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_integration(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_integrations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_send_test_order(uuid, text, jsonb, text) TO authenticated;

-- The console's sandbox picker: the restaurant's own dishes, so a test order rings up with real
-- menu items (and their Swiggy/Zomato prices) instead of made-up lines.
CREATE OR REPLACE FUNCTION public.platform_menu_dishes(_restaurant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Super admin only' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', record_id, 'name', payload ->> 'name', 'category', payload ->> 'category',
      'price', payload -> 'price', 'prices', payload -> 'prices', 'veg', payload -> 'veg',
      'available', payload -> 'available', 'variantId', payload #>> '{variants,0,id}', 'variantPrice', payload #> '{variants,0,price}')
      ORDER BY payload ->> 'category', payload ->> 'name')
    FROM (SELECT record_id, payload FROM restaurant_records
           WHERE restaurant_id = _restaurant AND kind = 'menu' AND NOT deleted LIMIT 400) m), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.platform_menu_dishes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_menu_dishes(uuid) TO authenticated;
