-- Accounts ledger (20 Nov 2026): vendor payments for "Pay later" bills, expenses, other income.
--
-- * New record kind `ledger` in restaurant_records, synced like every other record (offline first).
-- * Owners and managers only. Entries are append-only: once saved, the only change allowed is
--   voiding it once, with a reason. No deletes. The audit log records both.

ALTER TABLE public.restaurant_records DROP CONSTRAINT IF EXISTS restaurant_records_kind_check;
ALTER TABLE public.restaurant_records ADD CONSTRAINT restaurant_records_kind_check CHECK (kind = ANY (ARRAY[
  'settings', 'menu', 'table', 'order', 'kot', 'inventory', 'material', 'supplier', 'stock_entry', 'customer', 'day_close', 'ledger']));

CREATE OR REPLACE FUNCTION public.guard_ledger_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prior restaurant_records; amt numeric;
BEGIN
  IF NEW.kind <> 'ledger' THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_restaurant_role(NEW.restaurant_id, auth.uid(), ARRAY['owner', 'manager']::public.restaurant_role[]) THEN
    RAISE EXCEPTION 'Only the owner or a manager can record accounts entries.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO prior FROM restaurant_records WHERE restaurant_id = NEW.restaurant_id AND kind = 'ledger' AND record_id = NEW.record_id;
  IF FOUND THEN
    IF NEW.deleted AND NOT prior.deleted THEN RAISE EXCEPTION 'Accounts entries are never deleted; void it with a reason.' USING ERRCODE = '42501'; END IF;
    IF (NEW.payload - 'void' - 'version' - 'updatedAt') IS DISTINCT FROM (prior.payload - 'void' - 'version' - 'updatedAt') THEN
      RAISE EXCEPTION 'A saved accounts entry can''t be changed; void it and record it again.' USING ERRCODE = '42501';
    END IF;
    IF prior.payload ? 'void' AND NEW.payload -> 'void' IS DISTINCT FROM prior.payload -> 'void' THEN
      RAISE EXCEPTION 'This entry is already voided.' USING ERRCODE = '42501';
    END IF;
    IF NEW.payload ? 'void' AND length(btrim(coalesce(NEW.payload #>> '{void,reason}', ''))) < 4 THEN
      RAISE EXCEPTION 'Say why the entry is voided.' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.deleted THEN RAISE EXCEPTION 'Accounts entries are never deleted.' USING ERRCODE = '42501'; END IF;
  IF coalesce(NEW.payload ->> 'type', '') NOT IN ('vendor_payment', 'expense', 'income') THEN RAISE EXCEPTION 'Unknown accounts entry.' USING ERRCODE = '22023'; END IF;
  IF coalesce(NEW.payload ->> 'mode', '') NOT IN ('cash', 'upi', 'card', 'bank') THEN RAISE EXCEPTION 'Choose how it was paid.' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(NEW.payload -> 'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Enter an amount.' USING ERRCODE = '22023'; END IF;
  amt := (NEW.payload ->> 'amount')::numeric;
  IF amt <= 0 OR amt > 10000000 THEN RAISE EXCEPTION 'Enter an amount above ₹0.' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(NEW.payload -> 'at') IS DISTINCT FROM 'number' OR (NEW.payload ->> 'at')::numeric > extract(epoch from now()) * 1000 + 600000 THEN
    RAISE EXCEPTION 'The date can''t be in the future.' USING ERRCODE = '22023';
  END IF;
  IF NEW.payload ->> 'type' = 'vendor_payment' AND coalesce(NEW.payload ->> 'supplierId', '') = '' THEN RAISE EXCEPTION 'Choose the vendor.' USING ERRCODE = '22023'; END IF;
  IF NEW.payload ? 'void' THEN RAISE EXCEPTION 'A new entry can''t start voided.' USING ERRCODE = '22023'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS restaurant_records_ledger_guard ON public.restaurant_records;
CREATE TRIGGER restaurant_records_ledger_guard BEFORE INSERT OR UPDATE ON public.restaurant_records
  FOR EACH ROW WHEN (NEW.kind = 'ledger') EXECUTE FUNCTION public.guard_ledger_entry();
