-- XTSY POS as software: plans, per-restaurant subscriptions, feature switches,
-- device seat limits per app, and the super admin console's data.
-- Builds on the existing accounts / plans / platform_admins tables. Safe to run more than once.
-- No payments are taken anywhere: the super admin records plan, status and paid-until by hand.

-- 1. Plans (prices per outlet per month): seats per app and a "call for quote" flag -----------------------------------------
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS billdesk_seats integer;  -- POS Billdesk devices (NULL = as agreed)
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS waiter_seats integer;    -- Waiter Pro devices
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS admin_seats integer;     -- POS Manager devices (owner/manager)
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS quote boolean NOT NULL DEFAULT false;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS tagline text NOT NULL DEFAULT '';

-- Per-restaurant adjustments made by the super admin.
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS complimentary boolean NOT NULL DEFAULT false;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS seat_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;    -- {"pos":3,"waiter":2,"manager":1}
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS feature_overrides jsonb NOT NULL DEFAULT '{}'::jsonb; -- {"marketing":true}

INSERT INTO public.plans (id, name, monthly_price, yearly_price, max_outlets, max_staff, features, sort, active, billdesk_seats, waiter_seats, admin_seats, quote, tagline) VALUES
 ('basic', 'Basic', 149, 0, 1, 2,
  '{"billing":true,"menu":true,"gst_reports":true,"manager_app":true,"insights":false,"purchases":false,"vendors":false,"loyalty":false,"bookings":false,"admin_approval":false,"waiter_app":false,"qr_ordering":false,"online_ordering":false,"marketing":false,"audit_log":false,"multi_outlet":false}',
  10, true, 1, 0, 1, false, 'Billing, menu and GST reports for one counter'),
 ('pro_lite', 'Pro Lite', 299, 0, 1, 5,
  '{"billing":true,"menu":true,"gst_reports":true,"manager_app":true,"insights":true,"purchases":true,"vendors":true,"loyalty":true,"bookings":true,"admin_approval":true,"waiter_app":false,"qr_ordering":false,"online_ordering":false,"marketing":false,"audit_log":false,"multi_outlet":false}',
  20, true, 4, 0, 1, false, 'Adds purchases, vendors, loyalty and table reservations'),
 ('pro', 'Pro', 499, 0, 1, 11,
  '{"billing":true,"menu":true,"gst_reports":true,"manager_app":true,"insights":true,"purchases":true,"vendors":true,"loyalty":true,"bookings":true,"admin_approval":true,"waiter_app":true,"qr_ordering":true,"online_ordering":true,"marketing":true,"audit_log":false,"multi_outlet":false}',
  30, true, 6, 3, 2, false, 'Adds Waiter Pro, QR ordering and marketing tools'),
 ('enterprise', 'Enterprise / Brand', 999, 0, 50, 500,
  '{"billing":true,"menu":true,"gst_reports":true,"manager_app":true,"insights":true,"purchases":true,"vendors":true,"loyalty":true,"bookings":true,"admin_approval":true,"waiter_app":true,"qr_ordering":true,"online_ordering":true,"marketing":true,"audit_log":true,"multi_outlet":true}',
  40, true, NULL, NULL, 5, false, 'Everything in Pro, unlimited counters and waiters, audit logs')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, monthly_price = EXCLUDED.monthly_price, max_outlets = EXCLUDED.max_outlets,
  max_staff = EXCLUDED.max_staff, features = EXCLUDED.features, sort = EXCLUDED.sort, active = EXCLUDED.active,
  billdesk_seats = EXCLUDED.billdesk_seats, waiter_seats = EXCLUDED.waiter_seats, admin_seats = EXCLUDED.admin_seats,
  quote = EXCLUDED.quote, tagline = EXCLUDED.tagline;
-- The old catalogue stays for history but is no longer offered.
UPDATE public.plans SET active = false WHERE id IN ('trial', 'starter', 'growth', 'chain', 'owner');

-- TAB Bistro by XTSY: the first onboarded restaurant cum hotel, on Pro (₹499/month per outlet), paid until 13 Dec 2026.
UPDATE public.accounts SET plan_id = 'pro', status = 'active', paid_until = '2026-12-13 23:59:59+05:30', trial_ends_at = NULL, complimentary = false,
  notes = 'First onboarded restaurant cum hotel. Pro plan, ₹499/month.'
WHERE id = '1b981853-bc72-43e6-93f6-3aaf810761b4' AND plan_id = 'owner';

-- Super admin: admin@xtsy.one, a real XTSY address and never a restaurant login. Listed by email;
-- only a confirmed account with that email gets in.
CREATE TABLE IF NOT EXISTS public.platform_admin_emails (email text PRIMARY KEY CHECK (email = lower(email)), added_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.platform_admin_emails ENABLE ROW LEVEL SECURITY; -- no policies: nobody reads it directly
INSERT INTO public.platform_admin_emails (email) VALUES ('admin@xtsy.one') ON CONFLICT DO NOTHING;
DELETE FROM public.platform_admin_emails WHERE email <> 'admin@xtsy.one';
CREATE OR REPLACE FUNCTION public.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM auth.users u JOIN platform_admin_emails e ON e.email = lower(u.email)
               WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL))
$$;
-- A super admin row whose sign-in no longer exists can never be used; tidy it.
DELETE FROM public.platform_admins pa WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = pa.user_id);

-- 2. What a restaurant is entitled to ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.account_of(_restaurant uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT account_id FROM restaurants WHERE id = _restaurant $$;

-- Feature on/off for an account: the plan's switch, unless the super admin overrode it.
CREATE OR REPLACE FUNCTION public.account_feature(_account uuid, _feature text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _account IS NULL THEN true
    ELSE account_is_live(_account) AND coalesce((
      SELECT coalesce((a.feature_overrides ->> _feature)::boolean, (p.features ->> _feature)::boolean)
      FROM accounts a JOIN plans p ON p.id = a.plan_id WHERE a.id = _account), false) END
$$;

-- Device seats for one app ('manager' | 'pos' | 'waiter'); NULL = no limit.
CREATE OR REPLACE FUNCTION public.plan_seats(_restaurant uuid, _app text) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a accounts; p plans; o text;
BEGIN
  SELECT * INTO a FROM accounts WHERE id = (SELECT account_id FROM restaurants WHERE id = _restaurant);
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM plans WHERE id = a.plan_id;
  IF _app = 'waiter' AND NOT coalesce((a.feature_overrides ->> 'waiter_app')::boolean, (p.features ->> 'waiter_app')::boolean, false) THEN RETURN 0; END IF;
  o := a.seat_overrides ->> _app;
  IF o IS NOT NULL AND o ~ '^[0-9]{1,4}$' THEN RETURN o::integer; END IF;
  RETURN CASE _app WHEN 'pos' THEN p.billdesk_seats WHEN 'waiter' THEN p.waiter_seats WHEN 'manager' THEN p.admin_seats ELSE NULL END;
END $$;

-- 3. Seat limits on devices -------------------------------------------------------------------
-- A device beyond the plan's seats for its app is kept as 'over_plan': it can't sync until a seat
-- frees up (the admin releases a device) or the plan grows. Devices already active stay active.
-- The owner's own devices are never locked out, so the restaurant can always be fixed.
ALTER TABLE public.terminals DROP CONSTRAINT IF EXISTS terminals_status_check;
ALTER TABLE public.terminals ADD CONSTRAINT terminals_status_check CHECK (status = ANY (ARRAY['active', 'blocked', 'over_plan']));

CREATE OR REPLACE FUNCTION public.enforce_terminal_seats() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE seats integer; used integer;
BEGIN
  IF NEW.status <> 'active' OR NEW.app = '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND OLD.app IS NOT DISTINCT FROM NEW.app THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM restaurant_members m WHERE m.restaurant_id = NEW.restaurant_id AND m.user_id = NEW.user_id AND m.role = 'owner') THEN RETURN NEW; END IF;
  seats := plan_seats(NEW.restaurant_id, NEW.app);
  IF seats IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO used FROM terminals t
   WHERE t.restaurant_id = NEW.restaurant_id AND t.app = NEW.app AND t.status = 'active' AND t.device_id <> NEW.device_id;
  IF used >= seats THEN NEW.status := 'over_plan'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS terminals_enforce_seats ON public.terminals;
CREATE TRIGGER terminals_enforce_seats BEFORE INSERT OR UPDATE OF status, app ON public.terminals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_terminal_seats();

-- Check-in: a device waiting for a seat tries again each time it checks in.
CREATE OR REPLACE FUNCTION public.touch_terminal(_restaurant uuid, _device text, _series text, _app text, _kind text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE result text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_member(_restaurant, auth.uid()) THEN RETURN 'unknown'; END IF;
  INSERT INTO terminals (restaurant_id, device_id, series, app, device_kind, login_email, user_id)
  VALUES (_restaurant, lower(_device), left(coalesce(_series, ''), 12),
          CASE WHEN _app IN ('manager', 'pos', 'waiter') THEN _app ELSE '' END,
          CASE WHEN _kind IN ('android', 'ios', 'desktop') THEN _kind ELSE '' END,
          coalesce(auth.jwt() ->> 'email', ''), auth.uid())
  ON CONFLICT (restaurant_id, device_id) DO UPDATE SET
    series = EXCLUDED.series, app = EXCLUDED.app, device_kind = EXCLUDED.device_kind,
    login_email = EXCLUDED.login_email, user_id = EXCLUDED.user_id, last_seen = now(),
    status = CASE WHEN terminals.status = 'over_plan' THEN 'active' ELSE terminals.status END
  RETURNING status INTO result;
  RETURN result;
END $function$;

-- Over-plan devices can't push records, like blocked ones.
CREATE OR REPLACE FUNCTION public.terminal_is_blocked(_restaurant_id uuid, _device text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.terminals t WHERE t.restaurant_id = _restaurant_id AND t.device_id = _device AND t.status IN ('blocked', 'over_plan'))
$$;

-- 4. The restaurant's own view of its plan (members) ------------------------------------------
CREATE OR REPLACE FUNCTION public.restaurant_entitlements(_restaurant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a accounts; p plans; feats jsonb;
BEGIN
  IF NOT (is_member(_restaurant, auth.uid()) OR is_platform_admin()) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT * INTO a FROM accounts WHERE id = (SELECT account_id FROM restaurants WHERE id = _restaurant);
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM plans WHERE id = a.plan_id;
  SELECT jsonb_object_agg(k, account_feature(a.id, k)) INTO feats
    FROM unnest(ARRAY['billing','menu','gst_reports','manager_app','insights','purchases','vendors','loyalty','bookings','admin_approval','waiter_app','qr_ordering','online_ordering','marketing','audit_log','multi_outlet']) k;
  RETURN jsonb_build_object(
    'plan', p.id, 'planName', p.name, 'price', p.monthly_price, 'quote', p.quote,
    'status', a.status, 'paidUntil', a.paid_until, 'trialEndsAt', a.trial_ends_at, 'live', account_is_live(a.id), 'complimentary', a.complimentary,
    'features', feats,
    'seats', jsonb_build_object(
      'manager', jsonb_build_object('limit', plan_seats(_restaurant, 'manager'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'manager' AND status = 'active')),
      'pos', jsonb_build_object('limit', plan_seats(_restaurant, 'pos'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'pos' AND status = 'active')),
      'waiter', jsonb_build_object('limit', plan_seats(_restaurant, 'waiter'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'waiter' AND status = 'active'))),
    'waiting', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND status = 'over_plan'));
END $$;

-- 5. Super admin console --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_whoami() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('userId', auth.uid(), 'email', auth.jwt() ->> 'email', 'superAdmin', is_platform_admin())
$$;

CREATE OR REPLACE FUNCTION public.platform_restaurants() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Super admin only'; END IF;
  RETURN coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'createdAt') FROM (
    SELECT jsonb_build_object(
      'id', r.id, 'name', r.name, 'slug', r.slug, 'city', r.city, 'createdAt', r.created_at, 'launchedAt', r.launched_at,
      'account', jsonb_build_object('id', a.id, 'name', a.name, 'planId', a.plan_id, 'status', a.status, 'paidUntil', a.paid_until,
        'trialEndsAt', a.trial_ends_at, 'notes', a.notes, 'complimentary', a.complimentary, 'seatOverrides', a.seat_overrides,
        'featureOverrides', a.feature_overrides, 'live', account_is_live(a.id), 'billingPhone', a.billing_phone, 'billingEmail', a.billing_email),
      'seats', jsonb_build_object(
        'manager', jsonb_build_object('limit', plan_seats(r.id, 'manager'), 'used', (SELECT count(*) FROM terminals t WHERE t.restaurant_id = r.id AND t.app = 'manager' AND t.status = 'active')),
        'pos', jsonb_build_object('limit', plan_seats(r.id, 'pos'), 'used', (SELECT count(*) FROM terminals t WHERE t.restaurant_id = r.id AND t.app = 'pos' AND t.status = 'active')),
        'waiter', jsonb_build_object('limit', plan_seats(r.id, 'waiter'), 'used', (SELECT count(*) FROM terminals t WHERE t.restaurant_id = r.id AND t.app = 'waiter' AND t.status = 'active'))),
      'logins', (SELECT coalesce(jsonb_agg(jsonb_build_object('login', s.login, 'email', s.email, 'role', s.role, 'active', s.active) ORDER BY s.login), '[]'::jsonb) FROM staff_logins s WHERE s.restaurant_id = r.id),
      'devices', (SELECT coalesce(jsonb_agg(jsonb_build_object('deviceId', t.device_id, 'series', t.series, 'description', t.description, 'app', t.app, 'kind', t.device_kind,
                    'login', t.login_email, 'status', t.status, 'lastSeen', t.last_seen, 'firstSeen', t.first_seen, 'location', t.last_location) ORDER BY t.last_seen DESC), '[]'::jsonb)
                  FROM terminals t WHERE t.restaurant_id = r.id),
      'lastActivity', (SELECT max(updated_at) FROM restaurant_records WHERE restaurant_id = r.id),
      'records', (SELECT count(*) FROM restaurant_records WHERE restaurant_id = r.id),
      'bills30d', (SELECT count(*) FROM restaurant_records WHERE restaurant_id = r.id AND kind = 'order' AND updated_at > now() - interval '30 days'),
      'changes24h', (SELECT count(*) FROM restaurant_records WHERE restaurant_id = r.id AND updated_at > now() - interval '24 hours'),
      'guestOrders7d', (SELECT count(*) FROM guest_orders g WHERE g.restaurant_id = r.id AND g.created_at > now() - interval '7 days'),
      'auditEvents24h', (SELECT count(*) FROM restaurant_audit_log l WHERE l.restaurant_id = r.id AND l.at > now() - interval '24 hours')
    ) AS x
    FROM restaurants r LEFT JOIN accounts a ON a.id = r.account_id) s), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.platform_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Super admin only'; END IF;
  SELECT jsonb_build_object(
    'restaurants', (SELECT count(*) FROM restaurants),
    'accounts', (SELECT count(*) FROM accounts),
    'liveAccounts', (SELECT count(*) FROM accounts a WHERE account_is_live(a.id)),
    'byPlan', (SELECT coalesce(jsonb_object_agg(plan_id, n), '{}'::jsonb) FROM (SELECT plan_id, count(*) n FROM accounts GROUP BY plan_id) q),
    'mrr', (SELECT coalesce(sum(p.monthly_price), 0) FROM accounts a JOIN plans p ON p.id = a.plan_id
            WHERE account_is_live(a.id) AND NOT a.complimentary AND NOT p.quote AND a.status IN ('active', 'past_due')),
    'complimentary', (SELECT count(*) FROM accounts WHERE complimentary),
    'devices', (SELECT count(*) FROM terminals),
    'devicesOnline', (SELECT count(*) FROM terminals WHERE last_seen > now() - interval '5 minutes' AND status = 'active'),
    'devicesToday', (SELECT count(*) FROM terminals WHERE last_seen > now() - interval '24 hours'),
    'devicesOverPlan', (SELECT count(*) FROM terminals WHERE status = 'over_plan'),
    'devicesBlocked', (SELECT count(*) FROM terminals WHERE status = 'blocked'),
    'staffUsers', (SELECT count(DISTINCT user_id) FROM restaurant_members),
    'records', (SELECT count(*) FROM restaurant_records),
    'changes1h', (SELECT count(*) FROM restaurant_records WHERE updated_at > now() - interval '1 hour'),
    'changes24h', (SELECT count(*) FROM restaurant_records WHERE updated_at > now() - interval '24 hours'),
    'bills24h', (SELECT count(*) FROM restaurant_records WHERE kind = 'order' AND updated_at > now() - interval '24 hours'),
    'kots24h', (SELECT count(*) FROM restaurant_records WHERE kind = 'kot' AND updated_at > now() - interval '24 hours'),
    'guestOrders24h', (SELECT count(*) FROM guest_orders WHERE created_at > now() - interval '24 hours'),
    'bookings7d', (SELECT count(*) FROM guest_reservations WHERE created_at > now() - interval '7 days'),
    'auditEvents24h', (SELECT count(*) FROM restaurant_audit_log WHERE at > now() - interval '24 hours'),
    'changesByHour', (SELECT coalesce(jsonb_agg(jsonb_build_object('hour', h, 'n', n) ORDER BY h), '[]'::jsonb) FROM (
        SELECT date_trunc('hour', updated_at) h, count(*) n FROM restaurant_records WHERE updated_at > now() - interval '24 hours' GROUP BY 1) q),
    'database', jsonb_build_object(
      'sizeBytes', pg_database_size(current_database()),
      'connections', (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()),
      'activeQueries', (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'active'),
      'longestQuerySeconds', (SELECT coalesce(max(extract(epoch FROM now() - query_start)), 0) FROM pg_stat_activity WHERE datname = current_database() AND state = 'active'),
      'cacheHitRatio', (SELECT round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2) FROM pg_stat_database WHERE datname = current_database()),
      'commits', (SELECT xact_commit FROM pg_stat_database WHERE datname = current_database()),
      'rollbacks', (SELECT xact_rollback FROM pg_stat_database WHERE datname = current_database()),
      'deadlocks', (SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()),
      'statsSince', (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()),
      'tables', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', relname, 'bytes', bytes, 'rows', n_live_tup, 'dead', n_dead_tup) ORDER BY bytes DESC), '[]'::jsonb) FROM (
          SELECT s.relname, pg_total_relation_size(s.relid) bytes, s.n_live_tup, s.n_dead_tup FROM pg_stat_user_tables s WHERE s.schemaname = 'public'
          ORDER BY pg_total_relation_size(s.relid) DESC LIMIT 12) q)),
    'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('at', e.created_at, 'kind', e.kind, 'account', a.name, 'detail', e.detail) ORDER BY e.created_at DESC), '[]'::jsonb)
               FROM (SELECT * FROM account_events ORDER BY created_at DESC LIMIT 20) e LEFT JOIN accounts a ON a.id = e.account_id),
    'at', now()
  ) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.platform_update_account(_id uuid, _plan text, _status text, _paid_until timestamptz, _complimentary boolean,
  _seat_overrides jsonb, _feature_overrides jsonb, _notes text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE before accounts;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Super admin only'; END IF;
  SELECT * INTO before FROM accounts WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF jsonb_typeof(coalesce(_seat_overrides, '{}')) <> 'object' OR jsonb_typeof(coalesce(_feature_overrides, '{}')) <> 'object' THEN RAISE EXCEPTION 'Overrides must be objects'; END IF;
  UPDATE accounts SET plan_id = _plan, status = _status, paid_until = _paid_until, complimentary = coalesce(_complimentary, false),
    seat_overrides = coalesce(_seat_overrides, '{}'), feature_overrides = coalesce(_feature_overrides, '{}'), notes = left(coalesce(_notes, ''), 500)
  WHERE id = _id;
  INSERT INTO account_events (account_id, kind, detail, by_user) VALUES (_id, 'plan_changed', jsonb_build_object(
    'from', jsonb_build_object('plan', before.plan_id, 'status', before.status, 'paidUntil', before.paid_until, 'complimentary', before.complimentary, 'seats', before.seat_overrides, 'features', before.feature_overrides),
    'to', jsonb_build_object('plan', _plan, 'status', _status, 'paidUntil', _paid_until, 'complimentary', _complimentary, 'seats', _seat_overrides, 'features', _feature_overrides)), auth.uid());
  -- Devices waiting for a seat get one now if the new plan has room.
  UPDATE terminals SET status = 'active' WHERE status = 'over_plan' AND restaurant_id IN (SELECT id FROM restaurants WHERE account_id = _id);
END $$;

CREATE OR REPLACE FUNCTION public.platform_save_plan(_id text, _name text, _monthly integer, _billdesk integer, _waiter integer, _admin integer,
  _features jsonb, _active boolean, _quote boolean, _tagline text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Super admin only'; END IF;
  IF _id !~ '^[a-z0-9_]{2,24}$' THEN RAISE EXCEPTION 'Plan id: 2-24 lower-case letters, digits or _'; END IF;
  INSERT INTO plans (id, name, monthly_price, yearly_price, max_outlets, max_staff, features, active, sort, billdesk_seats, waiter_seats, admin_seats, quote, tagline)
  VALUES (_id, _name, coalesce(_monthly, 0), 0, 1, coalesce(_billdesk, 50) + coalesce(_waiter, 50) + coalesce(_admin, 50), coalesce(_features, '{}'), coalesce(_active, true),
          (SELECT coalesce(max(sort), 0) + 10 FROM plans WHERE sort < 99), _billdesk, _waiter, _admin, coalesce(_quote, false), left(coalesce(_tagline, ''), 120))
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, monthly_price = EXCLUDED.monthly_price, features = EXCLUDED.features, active = EXCLUDED.active,
    billdesk_seats = EXCLUDED.billdesk_seats, waiter_seats = EXCLUDED.waiter_seats, admin_seats = EXCLUDED.admin_seats, quote = EXCLUDED.quote,
    tagline = EXCLUDED.tagline, max_staff = EXCLUDED.max_staff;
END $$;

-- Activate (if a seat is free), block or release any device, for support.
CREATE OR REPLACE FUNCTION public.platform_set_terminal(_restaurant uuid, _device text, _action text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result text;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Super admin only'; END IF;
  IF _action = 'release' THEN DELETE FROM terminals WHERE restaurant_id = _restaurant AND device_id = _device; RETURN 'released'; END IF;
  IF _action NOT IN ('active', 'blocked') THEN RAISE EXCEPTION 'Unknown action'; END IF;
  UPDATE terminals SET status = _action WHERE restaurant_id = _restaurant AND device_id = _device RETURNING status INTO result;
  RETURN coalesce(result, 'missing');
END $$;

-- Every login of one restaurant, with its real sign-in address and state (super admin only).
CREATE OR REPLACE FUNCTION public.platform_staff(_restaurant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Super admin only'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'userId', m.user_id, 'email', coalesce(u.email, m.email), 'role', m.role, 'displayName', coalesce(nullif(m.display_name, ''), split_part(coalesce(u.email, m.email), '@', 1)),
      'internal', s.login, 'lastSignIn', u.last_sign_in_at, 'createdAt', u.created_at,
      'signInOff', coalesce(u.banned_until > now(), false),
      'devices', (SELECT count(*) FROM terminals t WHERE t.restaurant_id = _restaurant AND t.user_id = m.user_id))
    ORDER BY array_position(ARRAY['owner','manager','cashier','captain','kitchen']::text[], m.role::text), coalesce(u.email, m.email))
    FROM restaurant_members m LEFT JOIN auth.users u ON u.id = m.user_id LEFT JOIN staff_logins s ON s.user_id = m.user_id
    WHERE m.restaurant_id = _restaurant), '[]'::jsonb);
END $$;

-- Guest table bookings come with Pro Lite and up (account_feature also checks the plan is live).
DO $bk$
DECLARE f text; def text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.request_guest_booking(text,uuid,text,text,integer,timestamptz,integer,text)', 'public.public_booking_availability(text,timestamptz,integer)'] LOOP
    def := pg_get_functiondef(f::regprocedure);
    IF position('public.account_feature(r.account_id, ''bookings'')' IN def) > 0 THEN CONTINUE; END IF;
    IF position('public.account_is_live(r.account_id) AND (' IN def) = 0 THEN RAISE EXCEPTION 'booking check not found in %', f; END IF;
    EXECUTE replace(def, 'public.account_is_live(r.account_id) AND (', 'public.account_feature(r.account_id, ''bookings'') AND (');
  END LOOP;
END $bk$;

REVOKE ALL ON FUNCTION public.account_of(uuid), public.account_feature(uuid, text), public.plan_seats(uuid, text), public.enforce_terminal_seats() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restaurant_entitlements(uuid), public.platform_whoami(), public.platform_restaurants(), public.platform_overview(),
  public.platform_update_account(uuid, text, text, timestamptz, boolean, jsonb, jsonb, text),
  public.platform_save_plan(text, text, integer, integer, integer, integer, jsonb, boolean, boolean, text),
  public.platform_set_terminal(uuid, text, text), public.platform_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_entitlements(uuid), public.platform_whoami(), public.platform_restaurants(), public.platform_overview(),
  public.platform_update_account(uuid, text, text, timestamptz, boolean, jsonb, jsonb, text),
  public.platform_save_plan(text, text, integer, integer, integer, integer, jsonb, boolean, boolean, text),
  public.platform_set_terminal(uuid, text, text), public.platform_staff(uuid) TO authenticated;
