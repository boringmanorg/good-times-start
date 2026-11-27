-- Each POS model has its own features and prices (owner approved, 27 Nov 2026).
-- 1. Stay-only feature keys reach the devices.
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
  RETURN jsonb_build_object('plan', p.id, 'planName', p.name, 'price', p.monthly_price, 'quote', p.quote,
    'status', a.status, 'paidUntil', a.paid_until, 'trialEndsAt', a.trial_ends_at, 'live', account_is_live(a.id), 'complimentary', a.complimentary, 'features', feats,
    'seats', jsonb_build_object(
      'manager', jsonb_build_object('limit', plan_seats(_restaurant, 'manager'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'manager' AND status = 'active')),
      'pos', jsonb_build_object('limit', plan_seats(_restaurant, 'pos'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'pos' AND status = 'active')),
      'waiter', jsonb_build_object('limit', plan_seats(_restaurant, 'waiter'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'waiter' AND status = 'active'))),
    'waiting', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND status = 'over_plan'));
END $function$;

-- 2. Restaurant POS prices, per outlet per month.
UPDATE plans SET monthly_price = 449  WHERE id = 'basic';
UPDATE plans SET monthly_price = 899  WHERE id = 'pro_lite';
UPDATE plans SET monthly_price = 1299 WHERE id = 'pro';
UPDATE plans SET monthly_price = 1999 WHERE id = 'enterprise';

-- 3. Hostel POS plans, per property per month. No restaurant features, no waiter seats.
INSERT INTO plans (id, name, monthly_price, yearly_price, max_outlets, features, sort, active, billdesk_seats, waiter_seats, admin_seats, quote, tagline) VALUES
 ('hostel_essential', 'Essential', 1299, 0, 1,
  '{"pms":true,"gst_reports":true,"manager_app":true,"insights":true,"booking_engine":true,"channel_manager":false,"rate_suggestions":false,"loyalty":false,"admin_approval":false,"audit_log":false,"multi_property":false,"accounting":false,"purchases":false,"vendors":false,"restaurant_link":false}',
  110, true, 2, 0, 1, false, 'PMS and your own booking engine'),
 ('hostel_connect', 'Connect', 2299, 0, 1,
  '{"pms":true,"gst_reports":true,"manager_app":true,"insights":true,"booking_engine":true,"channel_manager":true,"rate_suggestions":true,"loyalty":true,"admin_approval":true,"audit_log":true,"multi_property":false,"accounting":false,"purchases":false,"vendors":false,"restaurant_link":false}',
  120, true, 4, 0, 2, false, 'Adds the channel manager and smart rates'),
 ('hostel_group', 'Group', 3999, 0, 10,
  '{"pms":true,"gst_reports":true,"manager_app":true,"insights":true,"booking_engine":true,"channel_manager":true,"rate_suggestions":true,"loyalty":true,"admin_approval":true,"audit_log":true,"multi_property":true,"accounting":true,"purchases":true,"vendors":true,"restaurant_link":false}',
  130, true, NULL, 0, 4, false, 'Several properties, accounts and purchases')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, monthly_price = EXCLUDED.monthly_price, max_outlets = EXCLUDED.max_outlets,
  features = EXCLUDED.features, sort = EXCLUDED.sort, active = EXCLUDED.active, billdesk_seats = EXCLUDED.billdesk_seats,
  waiter_seats = EXCLUDED.waiter_seats, admin_seats = EXCLUDED.admin_seats, quote = EXCLUDED.quote, tagline = EXCLUDED.tagline;

-- 4. The pilot property gets the stay keys (restaurant link stays off until asked for).
UPDATE plans SET features = features || '{"booking_engine":true,"channel_manager":true,"rate_suggestions":true,"multi_property":false,"restaurant_link":false}'::jsonb,
  tagline = 'PMS, channel manager and booking engine for the pilot property'
WHERE id = 'stay_pilot';
