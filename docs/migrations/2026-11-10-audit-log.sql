-- Audit log: every change to restaurant records (bills, KOTs, menu, purchase items and bills, vendors,
-- tables, customers, settings, day closes) is written by the database itself, with the signed-in user,
-- the terminal (device id sent with each sync) and the fields that changed. Append-only; readable by
-- owners and managers only.
CREATE TABLE IF NOT EXISTS public.restaurant_audit_log (
  id bigserial PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  user_email text,
  device_id text,
  kind text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'changed', 'deleted', 'restored')),
  label text,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS restaurant_audit_log_at ON public.restaurant_audit_log (restaurant_id, at DESC);
CREATE INDEX IF NOT EXISTS restaurant_audit_log_device ON public.restaurant_audit_log (restaurant_id, device_id, at DESC);
ALTER TABLE public.restaurant_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read the audit log" ON public.restaurant_audit_log;
CREATE POLICY "Admins read the audit log" ON public.restaurant_audit_log FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, auth.uid(), ARRAY['owner','manager']::public.restaurant_role[]));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.restaurant_audit_log FROM anon, authenticated;
GRANT SELECT ON public.restaurant_audit_log TO authenticated;

CREATE OR REPLACE FUNCTION public.write_record_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE act text; diff jsonb := '[]'::jsonb; k text; p jsonb := NEW.payload; email text;
  noise text[] := ARRAY['updatedAt', 'syncedAt', 'synced', 'version', 'dirty'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    act := CASE WHEN NEW.deleted THEN 'deleted' ELSE 'created' END;
  ELSE
    IF NEW.deleted IS NOT DISTINCT FROM OLD.deleted AND NEW.payload IS NOT DISTINCT FROM OLD.payload THEN RETURN NEW; END IF;
    act := CASE WHEN NEW.deleted AND NOT OLD.deleted THEN 'deleted' WHEN OLD.deleted AND NOT NEW.deleted THEN 'restored' ELSE 'changed' END;
    IF act = 'changed' THEN
      FOR k IN SELECT key FROM jsonb_object_keys(coalesce(OLD.payload, '{}'::jsonb) || coalesce(NEW.payload, '{}'::jsonb)) AS t(key) ORDER BY 1 LOOP
        IF k = ANY (noise) THEN CONTINUE; END IF;
        IF (OLD.payload -> k) IS DISTINCT FROM (NEW.payload -> k) THEN
          diff := diff || jsonb_build_array(jsonb_build_object('field', k, 'from', OLD.payload -> k, 'to', NEW.payload -> k));
        END IF;
      END LOOP;
      IF jsonb_array_length(diff) = 0 THEN RETURN NEW; END IF;
    END IF;
    IF act = 'deleted' THEN p := OLD.payload; END IF;
  END IF;
  BEGIN email := auth.jwt() ->> 'email'; EXCEPTION WHEN OTHERS THEN email := NULL; END;
  INSERT INTO public.restaurant_audit_log (restaurant_id, user_id, user_email, device_id, kind, record_id, action, label, changes)
  VALUES (NEW.restaurant_id, auth.uid(), email, nullif(current_setting('xtsy.device', true), ''), NEW.kind, NEW.record_id, act,
    left(coalesce(p ->> 'billNo', p ->> 'kotNo', p ->> 'name', p ->> 'label', p ->> 'reference', p ->> 'tableLabel', p ->> 'phone', NEW.record_id), 120),
    CASE WHEN act = 'created' THEN jsonb_build_array(jsonb_build_object('field', '*', 'to', NEW.payload)) ELSE diff END);
  RETURN NEW;
END $function$;
REVOKE EXECUTE ON FUNCTION public.write_record_audit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS restaurant_records_audit ON public.restaurant_records;
CREATE TRIGGER restaurant_records_audit AFTER INSERT OR UPDATE ON public.restaurant_records
  FOR EACH ROW EXECUTE FUNCTION public.write_record_audit();

-- Sync with the terminal's device id, so each logged change names the device it came from.
CREATE OR REPLACE FUNCTION public.push_restaurant_records_from(_restaurant_id uuid, _units jsonb, _device text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _device IS NOT NULL AND _device ~ '^[a-z0-9-]{8,64}$' THEN PERFORM set_config('xtsy.device', _device, true); END IF;
  RETURN public.push_restaurant_records(_restaurant_id, _units);
END $function$;
REVOKE EXECUTE ON FUNCTION public.push_restaurant_records_from(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_restaurant_records_from(uuid, jsonb, text) TO authenticated;
