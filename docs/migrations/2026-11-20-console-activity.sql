-- Console activity log (20 Nov 2026).
--
-- * Every change to the plan catalogue is logged with who made it and exactly which fields
--   changed (prices, seats, each feature switch) — from the console, from SQL, from anywhere.
--   The catalogue drifted twice (14 and 19 Nov) with no record; this is the record.
-- * Device activate / block / release from the console is logged too.
-- * platform_activity: one readable feed for the console (whole platform or one outlet), with
--   the outlet name and the email of whoever acted.

ALTER TABLE public.account_events ALTER COLUMN account_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS account_events_recent ON public.account_events (id DESC);

CREATE OR REPLACE FUNCTION public.log_plan_catalogue_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o jsonb := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  n jsonb := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  changes jsonb := '[]'::jsonb;
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['name', 'monthly_price', 'billdesk_seats', 'waiter_seats', 'admin_seats', 'max_outlets', 'active', 'quote', 'tagline'] LOOP
    IF (o -> f) IS DISTINCT FROM (n -> f) THEN
      changes := changes || jsonb_build_object('field', f, 'from', o -> f, 'to', n -> f);
    END IF;
  END LOOP;
  FOR f IN SELECT DISTINCT k FROM (
      SELECT jsonb_object_keys(coalesce(o -> 'features', '{}'::jsonb)) k
      UNION SELECT jsonb_object_keys(coalesce(n -> 'features', '{}'::jsonb))) keys LOOP
    IF coalesce((o #>> ARRAY['features', f])::boolean, false) IS DISTINCT FROM coalesce((n #>> ARRAY['features', f])::boolean, false) THEN
      changes := changes || jsonb_build_object('field', 'feature:' || f,
        'from', coalesce((o #>> ARRAY['features', f])::boolean, false), 'to', coalesce((n #>> ARRAY['features', f])::boolean, false));
    END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' AND jsonb_array_length(changes) = 0 THEN RETURN NULL; END IF;
  INSERT INTO account_events (account_id, kind, detail, by_user)
  VALUES (NULL, 'catalogue_changed', jsonb_build_object(
    'plan', coalesce(n ->> 'id', o ->> 'id'), 'planName', coalesce(n ->> 'name', o ->> 'name'),
    'op', lower(TG_OP), 'changes', changes), auth.uid());
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS plans_log_changes ON public.plans;
CREATE TRIGGER plans_log_changes AFTER INSERT OR UPDATE OR DELETE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.log_plan_catalogue_change();

CREATE OR REPLACE FUNCTION public.platform_set_terminal(_restaurant uuid, _device text, _action text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result text; t terminals; _account uuid;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'Super admin only'; END IF;
  IF _action NOT IN ('active', 'blocked', 'release') THEN RAISE EXCEPTION 'Unknown action'; END IF;
  SELECT * INTO t FROM terminals WHERE restaurant_id = _restaurant AND device_id = _device;
  SELECT account_id INTO _account FROM restaurants WHERE id = _restaurant;
  IF _action = 'release' THEN
    DELETE FROM terminals WHERE restaurant_id = _restaurant AND device_id = _device;
    result := 'released';
  ELSE
    UPDATE terminals SET status = _action WHERE restaurant_id = _restaurant AND device_id = _device RETURNING status INTO result;
    result := coalesce(result, 'missing');
  END IF;
  IF t.device_id IS NOT NULL AND _account IS NOT NULL THEN
    INSERT INTO account_events (account_id, kind, detail, by_user)
    VALUES (_account, 'device_changed', jsonb_build_object('restaurant', _restaurant, 'action', _action,
      'device', coalesce(nullif(t.description, ''), nullif(t.series, ''), left(t.device_id, 8)), 'app', t.app, 'from', t.status), auth.uid());
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.platform_activity(_restaurant uuid DEFAULT NULL, _before bigint DEFAULT NULL, _limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE _account uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Super admin only' USING ERRCODE = '42501'; END IF;
  IF _restaurant IS NOT NULL THEN SELECT account_id INTO _account FROM restaurants WHERE id = _restaurant; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', e.id, 'at', e.created_at, 'kind', e.kind, 'detail', e.detail, 'amount', e.amount,
      'outlet', coalesce(rd.name, ra.name), 'actor', u.email) ORDER BY e.id DESC)
    FROM (
      SELECT * FROM account_events ev
       WHERE (_before IS NULL OR ev.id < _before)
         AND (_restaurant IS NULL
              OR ev.detail ->> 'restaurant' = _restaurant::text
              OR (ev.account_id = _account AND NOT (ev.detail ? 'restaurant')))
       ORDER BY ev.id DESC LIMIT least(greatest(coalesce(_limit, 100), 1), 200)
    ) e
    LEFT JOIN restaurants rd ON rd.id::text = e.detail ->> 'restaurant'
    LEFT JOIN LATERAL (SELECT r.name FROM restaurants r WHERE r.account_id = e.account_id ORDER BY r.created_at LIMIT 1) ra ON true
    LEFT JOIN auth.users u ON u.id = e.by_user), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.platform_activity(uuid, bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_activity(uuid, bigint, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.log_plan_catalogue_change() FROM PUBLIC, anon, authenticated;
