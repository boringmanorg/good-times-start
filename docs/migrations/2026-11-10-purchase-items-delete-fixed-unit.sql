-- Purchase items: owners/managers may edit the name and standard price, or delete the item.
-- The unit is fixed from creation. Purchase bills and returns stay immutable and undeletable;
-- they carry their own copy of each item's name and unit.
DO $mig$
DECLARE d text := pg_get_functiondef('public.protect_purchase_ledger()'::regprocedure);
  a1 text := $o$    IF NEW.kind = 'material' AND NOT NEW.deleted AND NOT prior.deleted AND NEW.payload IS DISTINCT FROM prior.payload THEN$o$;
  b1 text := $n$    IF NEW.kind = 'material' AND NOT prior.deleted AND NEW.deleted THEN
      IF NOT public.has_restaurant_role(NEW.restaurant_id, auth.uid(), ARRAY['owner','manager']::public.restaurant_role[]) THEN
        RAISE EXCEPTION 'Only restaurant administrators can delete purchase items.' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.kind = 'material' AND NOT NEW.deleted AND NOT prior.deleted AND NEW.payload IS DISTINCT FROM prior.payload THEN$n$;
  a2 text := $o$      IF NEW.payload->>'unit' IS DISTINCT FROM prior.payload->>'unit' AND EXISTS (
        SELECT 1 FROM public.restaurant_records r CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.payload->'items', '[]'::jsonb)) i
        WHERE r.restaurant_id = NEW.restaurant_id AND r.kind = 'stock_entry' AND NOT r.deleted AND i.value->>'materialId' = NEW.record_id) THEN
        RAISE EXCEPTION 'The unit of a purchased item cannot change.' USING ERRCODE = '22023';$o$;
  b2 text := $n$      IF NEW.payload->>'unit' IS DISTINCT FROM prior.payload->>'unit' THEN
        RAISE EXCEPTION 'The unit of a purchase item is fixed when it is added.' USING ERRCODE = '22023';$n$;
BEGIN
  IF position(a1 IN d) = 0 OR position(a2 IN d) = 0 THEN RAISE EXCEPTION 'protect_purchase_ledger changed'; END IF;
  EXECUTE replace(replace(d, a1, b1), a2, b2);
END $mig$;
