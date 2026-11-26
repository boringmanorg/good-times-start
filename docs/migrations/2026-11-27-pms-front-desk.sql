-- PMS by XTSY (Hotel / Hostel / Resort POS), first release: the front desk (27 Nov 2026).
--
-- * Three new record kinds in restaurant_records, synced like every POS record (offline first):
--   `unit_type` (room/bed types), `unit` (each bed or room) and `stay` (a booking and its folio).
-- * Plan feature `pms`: no plan carries it yet; XTSY switches it on per property with the
--   console's feature override (as with `kds`). Devices treat it as OFF when unknown (DEFAULT_OFF).
-- * Who may write: owners and managers set up rooms and rates; owners, managers and the desk
--   (cashier) handle stays and housekeeping. Captains and kitchen staff can't.
-- * Stays are never deleted (cancel with a reason instead); a checked-out, cancelled or no-show
--   stay is closed: only its Form-III note may still be added.

ALTER TABLE public.restaurant_records DROP CONSTRAINT IF EXISTS restaurant_records_kind_check;
ALTER TABLE public.restaurant_records ADD CONSTRAINT restaurant_records_kind_check CHECK (kind = ANY (ARRAY[
  'settings', 'menu', 'table', 'order', 'kot', 'inventory', 'material', 'supplier', 'stock_entry', 'customer', 'day_close', 'ledger',
  'unit_type', 'unit', 'stay']));

CREATE OR REPLACE FUNCTION public.guard_pms_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prior restaurant_records; st text; prior_st text;
BEGIN
  IF NEW.kind NOT IN ('unit_type', 'unit', 'stay') THEN RETURN NEW; END IF;
  -- Maintenance with no signed-in user passes (as in the other guards).
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.account_feature((SELECT account_id FROM restaurants WHERE id = NEW.restaurant_id), 'pms') THEN
      RAISE EXCEPTION 'The front desk isn''t switched on for this property.' USING ERRCODE = '42501';
    END IF;
    IF NEW.kind = 'unit_type' AND NOT public.has_restaurant_role(NEW.restaurant_id, auth.uid(), ARRAY['owner', 'manager']::public.restaurant_role[]) THEN
      RAISE EXCEPTION 'Only the owner or a manager can change room types and rates.' USING ERRCODE = '42501';
    END IF;
    IF NEW.kind IN ('unit', 'stay') AND NOT public.has_restaurant_role(NEW.restaurant_id, auth.uid(), ARRAY['owner', 'manager', 'cashier']::public.restaurant_role[]) THEN
      RAISE EXCEPTION 'Only the front desk can change rooms and stays.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.kind <> 'stay' THEN RETURN NEW; END IF;

  SELECT * INTO prior FROM restaurant_records WHERE restaurant_id = NEW.restaurant_id AND kind = 'stay' AND record_id = NEW.record_id;
  IF NEW.deleted THEN RAISE EXCEPTION 'Stays are never deleted; cancel the booking with a reason.' USING ERRCODE = '42501'; END IF;

  st := coalesce(NEW.payload ->> 'status', '');
  IF st NOT IN ('booked', 'checked_in', 'checked_out', 'cancelled', 'no_show') THEN RAISE EXCEPTION 'Unknown stay status.' USING ERRCODE = '22023'; END IF;
  IF coalesce(NEW.payload ->> 'checkIn', '') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(NEW.payload ->> 'checkOut', '') !~ '^\d{4}-\d{2}-\d{2}$'
     OR (NEW.payload ->> 'checkOut')::date <= (NEW.payload ->> 'checkIn')::date
     OR (NEW.payload ->> 'checkOut')::date - (NEW.payload ->> 'checkIn')::date > 60 THEN
    RAISE EXCEPTION 'Check the stay''s dates.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(NEW.payload -> 'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.payload -> 'lines') = 0 THEN
    RAISE EXCEPTION 'A stay needs at least one bed or room.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(NEW.payload #>> '{guest,name}', ''))) < 2 THEN RAISE EXCEPTION 'Enter the guest''s name.' USING ERRCODE = '22023'; END IF;
  IF st = 'cancelled' AND length(btrim(coalesce(NEW.payload #>> '{cancelled,reason}', ''))) < 4 THEN
    RAISE EXCEPTION 'Say why the booking is cancelled.' USING ERRCODE = '22023';
  END IF;

  IF NOT FOUND THEN
    IF st <> 'booked' THEN RAISE EXCEPTION 'A new stay starts as booked.' USING ERRCODE = '22023'; END IF;
    RETURN NEW;
  END IF;

  prior_st := coalesce(prior.payload ->> 'status', '');
  -- Allowed moves: booked → checked_in / cancelled / no_show; checked_in → checked_out; no change.
  IF st <> prior_st AND NOT (
       (prior_st = 'booked' AND st IN ('checked_in', 'cancelled', 'no_show'))
    OR (prior_st = 'checked_in' AND st = 'checked_out')) THEN
    RAISE EXCEPTION 'A stay can''t go from % to %.', prior_st, st USING ERRCODE = '22023';
  END IF;
  -- A closed stay keeps its folio as it was; only the Form-III note may still be added.
  IF prior_st IN ('checked_out', 'cancelled', 'no_show')
     AND (NEW.payload - 'formIII' - 'version' - 'updatedAt') IS DISTINCT FROM (prior.payload - 'formIII' - 'version' - 'updatedAt') THEN
    RAISE EXCEPTION 'This stay is closed and can''t be changed.' USING ERRCODE = '42501';
  END IF;
  -- Payments and charges are added, never rewritten or removed: the old list must be the start of the new one.
  IF EXISTS (
       SELECT 1 FROM generate_series(0, jsonb_array_length(coalesce(prior.payload -> 'payments', '[]')) - 1) i
       WHERE (NEW.payload -> 'payments' -> i) IS DISTINCT FROM (prior.payload -> 'payments' -> i))
     OR EXISTS (
       SELECT 1 FROM generate_series(0, jsonb_array_length(coalesce(prior.payload -> 'charges', '[]')) - 1) i
       WHERE (NEW.payload -> 'charges' -> i) IS DISTINCT FROM (prior.payload -> 'charges' -> i)) THEN
    RAISE EXCEPTION 'Payments and charges are added, never changed or removed. Record a refund instead.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS restaurant_records_pms_guard ON public.restaurant_records;
CREATE TRIGGER restaurant_records_pms_guard BEFORE INSERT OR UPDATE ON public.restaurant_records
  FOR EACH ROW WHEN (NEW.kind IN ('unit_type', 'unit', 'stay')) EXECUTE FUNCTION public.guard_pms_record();

-- The devices only see features named here.
CREATE OR REPLACE FUNCTION public.restaurant_entitlements(_restaurant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
    'kds','accounting','audit_log','multi_outlet','pms']) k;
  RETURN jsonb_build_object('plan', p.id, 'planName', p.name, 'price', p.monthly_price, 'quote', p.quote,
    'status', a.status, 'paidUntil', a.paid_until, 'trialEndsAt', a.trial_ends_at, 'live', account_is_live(a.id), 'complimentary', a.complimentary, 'features', feats,
    'seats', jsonb_build_object(
      'manager', jsonb_build_object('limit', plan_seats(_restaurant, 'manager'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'manager' AND status = 'active')),
      'pos', jsonb_build_object('limit', plan_seats(_restaurant, 'pos'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'pos' AND status = 'active')),
      'waiter', jsonb_build_object('limit', plan_seats(_restaurant, 'waiter'), 'used', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND app = 'waiter' AND status = 'active'))),
    'waiting', (SELECT count(*) FROM terminals WHERE restaurant_id = _restaurant AND status = 'over_plan'));
END $function$;
