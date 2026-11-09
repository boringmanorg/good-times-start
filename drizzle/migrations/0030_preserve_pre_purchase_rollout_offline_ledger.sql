CREATE OR REPLACE FUNCTION public.preserve_historical_purchase_sync()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.kind = 'stock_entry' AND NEW.payload->>'type' IN ('sale', 'count', 'wastage', 'return')
     AND coalesce(NEW.payload->>'purchaseId','') = ''
     AND jsonb_typeof(NEW.payload->'at') = 'number'
     AND (NEW.payload->>'at')::numeric <= 1794204123000
     AND NOT EXISTS (SELECT 1 FROM public.restaurant_records r WHERE r.restaurant_id = NEW.restaurant_id AND r.kind = NEW.kind AND r.record_id = NEW.record_id) THEN
    RETURN NEW;
  END IF;
  RETURN public.protect_purchase_ledger();
END;
$$;