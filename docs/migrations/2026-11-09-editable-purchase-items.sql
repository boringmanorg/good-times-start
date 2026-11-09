-- Purchase items become editable by owners and managers: name, standard price, low-stock level and
-- hidden/shown (archived). The unit is fixed once any purchase or return uses the item. Purchase bills,
-- returns and deletions stay refused exactly as before.
DO $mig$
DECLARE d text := pg_get_functiondef('public.protect_purchase_ledger()'::regprocedure);
  old1 text := $o$  IF FOUND THEN
    IF NEW.deleted IS DISTINCT FROM prior.deleted OR NEW.payload IS DISTINCT FROM prior.payload THEN$o$;
  new1 text := $n$  IF FOUND THEN
    IF NEW.kind = 'material' AND NOT NEW.deleted AND NOT prior.deleted AND NEW.payload IS DISTINCT FROM prior.payload THEN
      IF NOT public.has_restaurant_role(NEW.restaurant_id, auth.uid(), ARRAY['owner','manager']::public.restaurant_role[]) THEN
        RAISE EXCEPTION 'Only restaurant administrators can edit purchase items.' USING ERRCODE = '42501';
      END IF;
      IF coalesce(trim(NEW.payload->>'name'),'') = '' OR jsonb_typeof(NEW.payload->'costPerUnit') IS DISTINCT FROM 'number' OR (NEW.payload->>'costPerUnit')::numeric < 0 THEN
        RAISE EXCEPTION 'Purchase items require a name and a nonnegative standard price.' USING ERRCODE = '22023';
      END IF;
      IF NEW.payload->>'unit' IS DISTINCT FROM prior.payload->>'unit' AND EXISTS (
        SELECT 1 FROM public.restaurant_records r CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.payload->'items', '[]'::jsonb)) i
        WHERE r.restaurant_id = NEW.restaurant_id AND r.kind = 'stock_entry' AND NOT r.deleted AND i.value->>'materialId' = NEW.record_id) THEN
        RAISE EXCEPTION 'The unit of a purchased item cannot change.' USING ERRCODE = '22023';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.deleted IS DISTINCT FROM prior.deleted OR NEW.payload IS DISTINCT FROM prior.payload THEN$n$;
BEGIN
  IF position(old1 IN d) = 0 THEN RAISE EXCEPTION 'protect_purchase_ledger changed'; END IF;
  EXECUTE replace(d, old1, new1);
END $mig$;
