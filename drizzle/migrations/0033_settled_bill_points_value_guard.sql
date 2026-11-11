CREATE OR REPLACE FUNCTION public.guard_settled_bill_points_value()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _total numeric; _taxable numeric; _sub numeric; _disc numeric;
BEGIN
  IF NEW.kind <> 'order' OR NEW.deleted OR NEW.payload->>'status' IS DISTINCT FROM 'settled' THEN RETURN NEW; END IF;
  IF coalesce(NEW.payload->>'billNo', '') = '' THEN
    RAISE EXCEPTION 'A settled bill needs an official bill number' USING ERRCODE = '23514';
  END IF;
  _total := (NEW.payload->>'total')::numeric;
  IF coalesce(NEW.payload->>'taxable', '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    _taxable := (NEW.payload->>'taxable')::numeric;
    IF _taxable > _total + 0.01 THEN
      RAISE EXCEPTION 'Bill value cannot exceed the settled total' USING ERRCODE = '23514';
    END IF;
  ELSIF coalesce(NEW.payload->>'subtotal', '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    _sub := (NEW.payload->>'subtotal')::numeric;
    _disc := CASE WHEN coalesce(NEW.payload->>'discountAmt', '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (NEW.payload->>'discountAmt')::numeric ELSE 0 END;
    IF _sub - _disc > _total + 1 THEN
      RAISE EXCEPTION 'Bill value cannot exceed the settled total' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.guard_settled_bill_points_value() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS restaurant_records_points_value ON public.restaurant_records;
CREATE TRIGGER restaurant_records_points_value BEFORE INSERT OR UPDATE ON public.restaurant_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_settled_bill_points_value();