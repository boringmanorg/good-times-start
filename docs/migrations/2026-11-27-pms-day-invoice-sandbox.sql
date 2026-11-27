-- Hostel POS: night audits, strict stay invoices, and the integration sandbox (owner, 27 Nov 2026).

-- 1. Night audits are their own record kind: one closed day each, written once, never deleted.
ALTER TABLE public.restaurant_records DROP CONSTRAINT IF EXISTS restaurant_records_kind_check;
ALTER TABLE public.restaurant_records ADD CONSTRAINT restaurant_records_kind_check CHECK (kind = ANY (ARRAY[
  'settings', 'menu', 'table', 'order', 'kot', 'inventory', 'material', 'supplier', 'stock_entry',
  'customer', 'day_close', 'ledger', 'unit_type', 'unit', 'stay', 'night_audit']));

CREATE OR REPLACE FUNCTION public.guard_night_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.account_feature((SELECT account_id FROM restaurants WHERE id = NEW.restaurant_id), 'pms') THEN
      RAISE EXCEPTION 'The front desk isn''t switched on for this property.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_restaurant_role(NEW.restaurant_id, auth.uid(), ARRAY['owner', 'manager', 'cashier']::public.restaurant_role[]) THEN
      RAISE EXCEPTION 'Only the front desk can close the day.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.deleted THEN RAISE EXCEPTION 'A closed day is kept; it can''t be deleted.' USING ERRCODE = '42501'; END IF;
  IF coalesce(NEW.payload ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' OR NEW.record_id <> NEW.payload ->> 'date' THEN
    RAISE EXCEPTION 'A night audit is kept under its date.' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.payload - 'version' - 'updatedAt') IS DISTINCT FROM (OLD.payload - 'version' - 'updatedAt') THEN
    RAISE EXCEPTION 'This day is already closed.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS restaurant_records_night_audit_guard ON public.restaurant_records;
CREATE TRIGGER restaurant_records_night_audit_guard BEFORE INSERT OR UPDATE ON public.restaurant_records
  FOR EACH ROW WHEN (NEW.kind = 'night_audit') EXECUTE FUNCTION public.guard_night_audit();

-- 2. Strict GST stay invoices: series STAY (STAY/0001) from the same allocator as POS and KOT.
ALTER TABLE public.restaurant_number_sequences DROP CONSTRAINT IF EXISTS restaurant_number_sequences_series_check;
ALTER TABLE public.restaurant_number_sequences ADD CONSTRAINT restaurant_number_sequences_series_check CHECK (series = ANY (ARRAY['POS', 'KOT', 'STAY']));
ALTER TABLE public.restaurant_number_allocations DROP CONSTRAINT IF EXISTS restaurant_number_allocations_series_check;
ALTER TABLE public.restaurant_number_allocations ADD CONSTRAINT restaurant_number_allocations_series_check CHECK (series = ANY (ARRAY['POS', 'KOT', 'STAY']));
CREATE OR REPLACE FUNCTION public.allocate_restaurant_number(_restaurant_id uuid, _series text, _request_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  allocated bigint;
  current_max bigint := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_restaurant_member(_restaurant_id) THEN
    RAISE EXCEPTION 'Restaurant membership required to allocate a number.' USING ERRCODE = '42501';
  END IF;
  IF _series IS NULL OR _series NOT IN ('POS', 'KOT', 'STAY') OR _request_id IS NULL THEN
    RAISE EXCEPTION 'Invalid numbering request.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_restaurant_id::text || ':' || _series || ':' || _request_id::text, 0)
  );

  SELECT sequence_number INTO allocated
  FROM public.restaurant_number_allocations
  WHERE restaurant_id = _restaurant_id AND series = _series AND request_id = _request_id;
  IF allocated IS NOT NULL THEN
    RETURN _series || '/' || lpad(allocated::text, greatest(4, length(allocated::text)), '0');
  END IF;

  IF _series = 'POS' THEN
    SELECT coalesce(max((regexp_match(payload->>'billNo', '([0-9]+)$'))[1]::bigint), 0)
      INTO current_max
    FROM public.restaurant_records
    WHERE restaurant_id = _restaurant_id AND kind = 'order' AND NOT deleted
      AND coalesce(payload->>'billNo', '') ~ '[0-9]+$'
      AND coalesce(payload->>'tableLabel', '') <> 'QAF1'
      AND coalesce(payload->>'tableId', '') <> 'QAF1'
      AND lower(coalesce(payload->>'tableSection', '')) <> 'floor verification';
  ELSIF _series = 'STAY' THEN
    IF NOT public.account_feature((SELECT account_id FROM restaurants WHERE id = _restaurant_id), 'pms') THEN
      RAISE EXCEPTION 'The front desk isn''t switched on for this property.' USING ERRCODE = '42501';
    END IF;
    SELECT coalesce(max((regexp_match(payload #>> '{invoice,no}', '([0-9]+)$'))[1]::bigint), 0)
      INTO current_max
    FROM public.restaurant_records
    WHERE restaurant_id = _restaurant_id AND kind = 'stay' AND NOT deleted
      AND coalesce(payload #>> '{invoice,no}', '') ~ '[0-9]+$';
  ELSE
    SELECT greatest(
      coalesce(max((regexp_match(payload->>'kotNo', '([0-9]+)$'))[1]::bigint), 0),
      count(DISTINCT coalesce(payload->>'submissionId',
        'legacy:' || coalesce(payload->>'orderUid', '') || ':' || coalesce(payload->>'createdAt', '')))
    )
      INTO current_max
    FROM public.restaurant_records
    WHERE restaurant_id = _restaurant_id AND kind = 'kot' AND NOT deleted
      AND coalesce(payload->>'tableLabel', '') <> 'QAF1'
      AND coalesce(payload->>'tableId', '') <> 'QAF1'
      AND lower(coalesce(payload->>'tableSection', '')) <> 'floor verification';
  END IF;

  INSERT INTO public.restaurant_number_sequences AS seq
    (restaurant_id, series, last_sequence)
  VALUES (_restaurant_id, _series, current_max + 1)
  ON CONFLICT (restaurant_id, series)
  DO UPDATE SET
    last_sequence = greatest(seq.last_sequence, current_max) + 1,
    updated_at = clock_timestamp()
  RETURNING last_sequence INTO allocated;

  INSERT INTO public.restaurant_number_allocations
    (restaurant_id, series, request_id, sequence_number)
  VALUES (_restaurant_id, _series, _request_id, allocated);

  RETURN _series || '/' || lpad(allocated::text, greatest(4, length(allocated::text)), '0');
END;
$function$;

-- 3. Integration sandbox: partner API keys for sandbox properties only. Read and written only by
--    the server (service role); no client policies, so RLS denies everyone else.
CREATE TABLE IF NOT EXISTS public.sandbox_partner_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  webhook_url text CHECK (webhook_url IS NULL OR webhook_url ~ '^https://'),
  webhook_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  last_used_at timestamptz,
  revoked_at timestamptz
);
ALTER TABLE public.sandbox_partner_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sandbox_partner_keys FROM anon, authenticated;

-- What the sandbox did (simulator and partner API), newest first in the console.
CREATE TABLE IF NOT EXISTS public.sandbox_events (
  id bigserial PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS sandbox_events_restaurant_at ON public.sandbox_events (restaurant_id, at DESC);
ALTER TABLE public.sandbox_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sandbox_events FROM anon, authenticated;
