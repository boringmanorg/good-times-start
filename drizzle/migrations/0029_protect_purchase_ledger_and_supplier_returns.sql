CREATE OR REPLACE FUNCTION public.protect_purchase_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  prior public.restaurant_records;
  purchase public.restaurant_records;
  line jsonb;
  purchased_qty numeric;
  returned_qty numeric;
  return_qty numeric;
  purchase_at numeric;
  return_at numeric;
  current_ms numeric := extract(epoch from clock_timestamp()) * 1000;
BEGIN
  IF NEW.kind NOT IN ('material', 'stock_entry') THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.restaurant_id::text || ':purchase-ledger', 0));
  SELECT * INTO prior FROM public.restaurant_records WHERE restaurant_id = NEW.restaurant_id AND kind = NEW.kind AND record_id = NEW.record_id;
  IF FOUND THEN
    IF NEW.deleted IS DISTINCT FROM prior.deleted OR NEW.payload IS DISTINCT FROM prior.payload THEN
      RAISE EXCEPTION 'Purchase items and recorded entries cannot be modified or deleted.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.deleted THEN RAISE EXCEPTION 'Purchase records cannot be deleted.' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_restaurant_role(NEW.restaurant_id, auth.uid(), ARRAY['owner','manager']::public.restaurant_role[]) THEN
    RAISE EXCEPTION 'Only restaurant administrators can record purchase items, bills and returns.' USING ERRCODE = '42501';
  END IF;
  IF NEW.kind = 'material' THEN
    IF coalesce(trim(NEW.payload->>'name'),'') = '' OR jsonb_typeof(NEW.payload->'costPerUnit') IS DISTINCT FROM 'number' OR (NEW.payload->>'costPerUnit')::numeric < 0 THEN
      RAISE EXCEPTION 'Purchase items require a name and a nonnegative standard price.' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.payload->'items') = 0 OR jsonb_typeof(NEW.payload->'at') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Invalid purchase entry.' USING ERRCODE = '22023';
  END IF;
  IF NEW.payload->>'type' = 'purchase' THEN
    FOR line IN SELECT value FROM jsonb_array_elements(NEW.payload->'items') LOOP
      IF jsonb_typeof(line->'qty') IS DISTINCT FROM 'number' OR (line->>'qty')::numeric <= 0 OR jsonb_typeof(line->'unitCost') IS DISTINCT FROM 'number' OR (line->>'unitCost')::numeric < 0 OR coalesce(line->>'materialId','') = '' THEN
        RAISE EXCEPTION 'Each purchase item needs a positive quantity and nonnegative unit price.' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;
  IF NEW.payload->>'type' IS DISTINCT FROM 'return' OR coalesce(NEW.payload->>'purchaseId','') = '' THEN
    RAISE EXCEPTION 'Recipe deductions are disabled; only purchases and linked supplier returns are allowed.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO purchase FROM public.restaurant_records WHERE restaurant_id = NEW.restaurant_id AND kind = 'stock_entry' AND record_id = NEW.payload->>'purchaseId' AND NOT deleted;
  IF NOT FOUND OR purchase.payload->>'type' IS DISTINCT FROM 'purchase' THEN
    RAISE EXCEPTION 'Original supplier purchase not found.' USING ERRCODE = '22023';
  END IF;
  purchase_at := (purchase.payload->>'at')::numeric;
  return_at := (NEW.payload->>'at')::numeric;
  IF current_ms < purchase_at OR current_ms > purchase_at + 172800000 OR return_at < purchase_at OR return_at > purchase_at + 172800000 OR return_at > current_ms + 60000 THEN
    RAISE EXCEPTION 'Supplier returns must be recorded and synced within 48 hours of purchase.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(NEW.payload->'items')) <> (SELECT count(DISTINCT value->>'materialId') FROM jsonb_array_elements(NEW.payload->'items')) THEN
    RAISE EXCEPTION 'Duplicate return items are not allowed.' USING ERRCODE = '22023';
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(NEW.payload->'items') LOOP
    IF jsonb_typeof(line->'qty') IS DISTINCT FROM 'number' OR (line->>'qty')::numeric >= 0 THEN
      RAISE EXCEPTION 'Return quantities must be negative.' USING ERRCODE = '22023';
    END IF;
    return_qty := abs((line->>'qty')::numeric);
    SELECT coalesce(sum((value->>'qty')::numeric),0) INTO purchased_qty FROM jsonb_array_elements(purchase.payload->'items') WHERE value->>'materialId' = line->>'materialId';
    SELECT coalesce(sum(abs((i.value->>'qty')::numeric)),0) INTO returned_qty FROM public.restaurant_records r CROSS JOIN LATERAL jsonb_array_elements(r.payload->'items') i WHERE r.restaurant_id = NEW.restaurant_id AND r.kind = 'stock_entry' AND NOT r.deleted AND r.payload->>'purchaseId' = purchase.record_id AND i.value->>'materialId' = line->>'materialId';
    IF return_qty > purchased_qty - returned_qty THEN
      RAISE EXCEPTION 'Return exceeds remaining purchased quantity.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(purchase.payload->'items') i WHERE i->>'materialId' = line->>'materialId' AND coalesce((i->>'unitCost')::numeric,0) = coalesce((line->>'unitCost')::numeric,-1)) THEN
      RAISE EXCEPTION 'Return unit price must match the original purchase.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER restaurant_records_purchase_guard BEFORE INSERT OR UPDATE ON public.restaurant_records FOR EACH ROW EXECUTE FUNCTION public.protect_purchase_ledger();