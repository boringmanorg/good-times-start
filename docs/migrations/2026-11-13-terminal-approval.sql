-- Every terminal names itself on first login. The first sign-in on a device registers it as 'pending'
-- (it can't sync or be used) until it is named and approved: on the device with the 60-second admin
-- code, or from POS Manager → Settings → Terminals. An owner / manager device needs only the name —
-- they are the approver — so a brand-new restaurant can never deadlock waiting for a code.
-- The last statement resets every existing terminal so they all go through this once.

ALTER TABLE public.terminals DROP CONSTRAINT IF EXISTS terminals_status_check;
ALTER TABLE public.terminals ADD CONSTRAINT terminals_status_check CHECK (status = ANY (ARRAY['active', 'blocked', 'over_plan', 'pending']));
ALTER TABLE public.terminals ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.terminals ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE public.terminals ADD COLUMN IF NOT EXISTS approved_via text;

-- Admin codes already used for approvals (a code works once).
CREATE TABLE IF NOT EXISTS public.admin_code_uses (restaurant_id uuid NOT NULL, step bigint NOT NULL, used_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (restaurant_id, step));
ALTER TABLE public.admin_code_uses ENABLE ROW LEVEL SECURITY; -- no policies: only the functions below touch it

-- The restaurant's 60-second admin code, checked in the cloud exactly as the devices check it
-- (HMAC-SHA256 time-based code, 6 digits, ±1 step, never before the key was made, once each).
CREATE OR REPLACE FUNCTION public.admin_code_step(_restaurant uuid, _code text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE k jsonb; secret bytea; here bigint := floor(extract(epoch FROM clock_timestamp()) * 1000 / 60000); s bigint; mac bytea; o int; bin bigint;
BEGIN
  IF _code !~ '^[0-9]{6}$' THEN RETURN NULL; END IF;
  SELECT payload->'adminCode' INTO k FROM restaurant_records WHERE restaurant_id = _restaurant AND kind = 'settings' AND NOT deleted ORDER BY updated_at DESC LIMIT 1;
  IF k IS NULL OR coalesce(k->>'secret', '') !~ '^[0-9a-f]{40}$' THEN RETURN NULL; END IF;
  secret := decode(k->>'secret', 'hex');
  FOR s IN here - 1 .. here + 1 LOOP
    CONTINUE WHEN s < floor(coalesce((k->>'createdAt')::numeric, 0) / 60000);
    CONTINUE WHEN EXISTS (SELECT 1 FROM admin_code_uses u WHERE u.restaurant_id = _restaurant AND u.step >= s);
    mac := hmac(int8send(s), secret, 'sha256');
    o := get_byte(mac, 31) & 15;
    bin := ((get_byte(mac, o) & 127)::bigint << 24) | (get_byte(mac, o + 1)::bigint << 16) | (get_byte(mac, o + 2)::bigint << 8) | get_byte(mac, o + 3)::bigint;
    IF lpad((bin % 1000000)::text, 6, '0') = _code THEN
      INSERT INTO admin_code_uses (restaurant_id, step) VALUES (_restaurant, s) ON CONFLICT DO NOTHING;
      RETURN s;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

-- Check-in: a device seen for the first time waits for approval, unless an owner / manager signed in on it.
CREATE OR REPLACE FUNCTION public.touch_terminal(_restaurant uuid, _device text, _series text, _app text, _kind text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE result text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_member(_restaurant, auth.uid()) THEN RETURN 'unknown'; END IF;
  -- Every device seen for the first time waits to be named and approved, the admin's own included;
  -- an owner / manager names theirs without needing a code (see approve_this_terminal).
  INSERT INTO terminals (restaurant_id, device_id, series, app, device_kind, login_email, user_id, status)
  VALUES (_restaurant, lower(_device), left(coalesce(_series, ''), 12),
          CASE WHEN _app IN ('manager', 'pos', 'waiter') THEN _app ELSE '' END,
          CASE WHEN _kind IN ('android', 'ios', 'desktop') THEN _kind ELSE '' END,
          coalesce(auth.jwt() ->> 'email', ''), auth.uid(), 'pending')
  ON CONFLICT (restaurant_id, device_id) DO UPDATE SET
    series = EXCLUDED.series, app = EXCLUDED.app, device_kind = EXCLUDED.device_kind,
    login_email = EXCLUDED.login_email, user_id = EXCLUDED.user_id, last_seen = now(),
    status = CASE WHEN terminals.status = 'over_plan' THEN 'active' ELSE terminals.status END
  RETURNING status INTO result;
  RETURN result;
END $function$;

-- Waiting devices can't push, like blocked ones.
CREATE OR REPLACE FUNCTION public.terminal_is_blocked(_restaurant_id uuid, _device text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.terminals t WHERE t.restaurant_id = _restaurant_id AND t.device_id = _device AND t.status IN ('blocked', 'over_plan', 'pending'))
$$;

-- On the waiting device: the admin types the 60-second code there and the terminal gets its name.
CREATE OR REPLACE FUNCTION public.approve_this_terminal(_restaurant uuid, _device text, _name text, _code text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t terminals; s bigint; result text;
BEGIN
  IF auth.uid() IS NULL OR NOT is_member(_restaurant, auth.uid()) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT * INTO t FROM terminals WHERE restaurant_id = _restaurant AND device_id = lower(_device);
  IF NOT FOUND OR t.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'This device isn''t registered to you yet. Close and open the app again.'; END IF;
  IF length(trim(coalesce(_name, ''))) < 2 THEN RAISE EXCEPTION 'Give this terminal a name, e.g. Counter 2.'; END IF;
  IF t.status = 'blocked' THEN RAISE EXCEPTION 'This terminal is blocked by the admin.'; END IF;
  IF t.status <> 'pending' THEN
    UPDATE terminals SET description = left(trim(_name), 60) WHERE restaurant_id = _restaurant AND device_id = t.device_id RETURNING status INTO result;
    RETURN result;
  END IF;
  -- The admin is the authority: on their own device a name is enough, no code to chase.
  IF has_restaurant_role(_restaurant, auth.uid(), ARRAY['owner','manager']::restaurant_role[]) THEN
    UPDATE terminals SET status = 'active', description = left(trim(_name), 60), approved_at = now(), approved_by = auth.uid(), approved_via = 'admin sign-in'
    WHERE restaurant_id = _restaurant AND device_id = t.device_id RETURNING status INTO result;
    RETURN result;
  END IF;
  s := admin_code_step(_restaurant, _code);
  IF s IS NULL THEN RAISE EXCEPTION 'That admin code isn''t right or has expired. Ask the admin for the code showing now, or have them approve this terminal in POS Manager -> Settings -> Terminals.'; END IF;
  UPDATE terminals SET status = 'active', description = left(trim(_name), 60), approved_at = now(), approved_by = auth.uid(), approved_via = 'admin code'
  WHERE restaurant_id = _restaurant AND device_id = t.device_id RETURNING status INTO result; -- seat limits apply (may become over_plan)
  RETURN result;
END $$;

-- From POS Manager: the admin approves (with a name) or turns away a waiting terminal.
CREATE OR REPLACE FUNCTION public.decide_terminal(_restaurant uuid, _device text, _name text, _approve boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result text;
BEGIN
  IF NOT has_restaurant_role(_restaurant, auth.uid(), ARRAY['owner','manager']::restaurant_role[]) THEN RAISE EXCEPTION 'Only the admin can approve terminals.'; END IF;
  IF _approve AND length(trim(coalesce(_name, ''))) < 2 THEN RAISE EXCEPTION 'Give the terminal a name, e.g. Counter 2.'; END IF;
  UPDATE terminals SET status = CASE WHEN _approve THEN 'active' ELSE 'blocked' END,
    description = CASE WHEN _approve THEN left(trim(_name), 60) ELSE description END,
    approved_at = CASE WHEN _approve THEN now() ELSE approved_at END,
    approved_by = CASE WHEN _approve THEN auth.uid() ELSE approved_by END,
    approved_via = CASE WHEN _approve THEN 'POS Manager' ELSE approved_via END
  WHERE restaurant_id = _restaurant AND device_id = lower(_device) AND status IN ('pending', 'blocked', 'over_plan')
  RETURNING status INTO result;
  RETURN coalesce(result, 'missing');
END $$;

REVOKE ALL ON FUNCTION public.admin_code_step(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_this_terminal(uuid, text, text, text), public.decide_terminal(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_this_terminal(uuid, text, text, text), public.decide_terminal(uuid, text, text, boolean) TO authenticated;

-- One-time reset (owner's instruction, 13 Nov 2026): every already-registered terminal goes through
-- first-login naming again. Staff devices need a name and the admin code (or approval from POS
-- Manager → Settings → Terminals); an owner / manager device needs only a name, so open POS Manager
-- and name it first — that is where the code is shown. Blocked devices stay blocked.
UPDATE public.terminals SET status = 'pending' WHERE status IN ('active', 'over_plan');
