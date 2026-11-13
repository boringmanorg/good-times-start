-- New plan features (owner's decisions, 13 Nov 2026 — see docs/roadmap.md):
--   recipes     recipe management and food costing — Pro Lite and above
--   gift_cards  gift cards issued by the super admin or the restaurant admin — Pro and above
--   feedback    guest feedback after a QR order — Pro and above
--   kds         kitchen display screen — OFF on every plan; the super admin turns it on per
--               restaurant with feature_overrides. It is not sold with a plan and is not on the
--               price cards.
--   accounting  accounting and restaurant bookkeeping — Enterprise / Brand only
-- The sales dashboard (insights) is confirmed as part of Basic.

UPDATE public.plans SET features = features || jsonb_build_object(
  'recipes', false, 'gift_cards', false, 'feedback', false, 'kds', false, 'accounting', false),
  tagline = 'Billing, menu, GST reports and your sales dashboard'
WHERE id = 'basic';

UPDATE public.plans SET features = features || jsonb_build_object(
  'recipes', true, 'gift_cards', false, 'feedback', false, 'kds', false, 'accounting', false),
  tagline = 'Adds purchases, vendors, recipe costing, loyalty and reservations'
WHERE id = 'pro_lite';

UPDATE public.plans SET features = features || jsonb_build_object(
  'recipes', true, 'gift_cards', true, 'feedback', true, 'kds', false, 'accounting', false),
  tagline = 'Adds Waiter Pro, QR ordering, gift cards, guest feedback and marketing'
WHERE id = 'pro';

UPDATE public.plans SET features = features || jsonb_build_object(
  'recipes', true, 'gift_cards', true, 'feedback', true, 'kds', false, 'accounting', true),
  tagline = 'Everything in Pro, unlimited counters and waiters, accounting and audit logs'
WHERE id = 'enterprise';

-- XTSY's own owner plan has everything, kitchen screen included.
UPDATE public.plans SET features = features || jsonb_build_object(
  'recipes', true, 'gift_cards', true, 'feedback', true, 'kds', true, 'accounting', true)
WHERE id = 'owner';

-- Older catalogue entries, kept switched off so nothing turns on by surprise.
UPDATE public.plans SET features = features || jsonb_build_object(
  'recipes', false, 'gift_cards', false, 'feedback', false, 'kds', false, 'accounting', false)
WHERE id IN ('trial', 'starter', 'growth', 'chain');

-- The entitlements each device reads list the feature keys one by one, so the new ones have to be
-- named here too or they never reach the apps.
CREATE OR REPLACE FUNCTION public.restaurant_entitlements(_restaurant uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE a accounts; p plans; feats jsonb;
BEGIN
  IF NOT (is_member(_restaurant, auth.uid()) OR is_platform_admin()) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT * INTO a FROM accounts WHERE id = (SELECT account_id FROM restaurants WHERE id = _restaurant);
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM plans WHERE id = a.plan_id;
  SELECT jsonb_object_agg(k, account_feature(a.id, k)) INTO feats FROM unnest(ARRAY[
    'billing','menu','gst_reports','manager_app','insights',
    'purchases','vendors','recipes','loyalty','bookings','admin_approval',
    'waiter_app','qr_ordering','online_ordering','marketing','gift_cards','feedback',
    'kds','accounting','audit_log','multi_outlet']) k;
  RETURN jsonb_build_object('plan', p.id, 'planName', p.name, 'price', p.monthly_price, 'quote', p.quote,
    'status', a.status, 'paidUntil', a.paid_until, 'trialEndsAt', a.trial_ends_at, 'live', account_is_live(a.id), 'complimentary', a.complimentary, 'features', feats,
    'seats', jsonb_build_object(
      'manager', jsonb_build_object('limit', plan_seats(_restaurant, 'manager'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'manager' AND status = 'active')),
      'pos', jsonb_build_object('limit', plan_seats(_restaurant, 'pos'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'pos' AND status = 'active')),
      'waiter', jsonb_build_object('limit', plan_seats(_restaurant, 'waiter'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'waiter' AND status = 'active'))),
    'waiting', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND status = 'over_plan'));
END $function$;
