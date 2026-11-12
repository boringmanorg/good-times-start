-- Purchase approval: the bill desk (cashier) may record purchases and supplier returns, but only as
-- approval.status = 'pending'; owners/managers approve (after checking the supplier bill) or reject.
-- Returns need an approved purchase; the bill desk returns only purchases it recorded; rejected returns don't count against the purchased quantity.
DO $mig$
DECLARE d text := pg_get_functiondef('public.protect_purchase_ledger()'::regprocedure);
  a1 text := $o$  IF NOT public.has_restaurant_role(NEW.restaurant_id, auth.uid(), ARRAY['owner','manager']::public.restaurant_role[]) THEN
    RAISE EXCEPTION 'Only restaurant administrators can record purchase items, bills and returns.' USING ERRCODE = '42501';
  END IF;$o$;
  b1 text := $n$  IF NOT public.has_restaurant_role(NEW.restaurant_id, auth.uid(), ARRAY['owner','manager']::public.restaurant_role[]) THEN
    -- The bill desk may send a purchase or return for the admin's approval, nothing else.
    IF NOT (NEW.kind = 'stock_entry' AND public.has_restaurant_role(NEW.restaurant_id, auth.uid(), ARRAY['cashier']::public.restaurant_role[])
            AND NEW.payload->'approval'->>'status' = 'pending' AND NEW.payload->'approval'->>'decidedBy' IS NULL) THEN
      RAISE EXCEPTION 'Only restaurant administrators can record purchase items, bills and returns; the bill desk sends purchases and returns for approval.' USING ERRCODE = '42501';
    END IF;
  END IF;$n$;
  a2 text := $o$  IF NOT FOUND OR purchase.payload->>'type' IS DISTINCT FROM 'purchase' THEN
    RAISE EXCEPTION 'Original supplier purchase not found.' USING ERRCODE = '22023';
  END IF;$o$;
  b2 text := $n$  IF NOT FOUND OR purchase.payload->>'type' IS DISTINCT FROM 'purchase' THEN
    RAISE EXCEPTION 'Original supplier purchase not found.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(purchase.payload->'approval'->>'status', 'approved') <> 'approved' THEN
    RAISE EXCEPTION 'Returns can only be made against an approved purchase.' USING ERRCODE = '22023';
  END IF;
  -- The bill desk returns only purchases it recorded itself (the audit log knows who created each one).
  IF NOT public.has_restaurant_role(NEW.restaurant_id, auth.uid(), ARRAY['owner','manager']::public.restaurant_role[])
     AND NOT EXISTS (SELECT 1 FROM public.restaurant_audit_log l WHERE l.restaurant_id = NEW.restaurant_id AND l.kind = 'stock_entry'
                     AND l.record_id = purchase.record_id AND l.action = 'created' AND l.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'The bill desk can return only purchases it recorded.' USING ERRCODE = '42501';
  END IF;$n$;
  a3 text := $o$WHERE r.restaurant_id = NEW.restaurant_id AND r.kind = 'stock_entry' AND NOT r.deleted AND r.payload->>'purchaseId' = purchase.record_id AND i.value->>'materialId' = line->>'materialId';$o$;
  b3 text := $n$WHERE r.restaurant_id = NEW.restaurant_id AND r.kind = 'stock_entry' AND NOT r.deleted AND r.payload->>'purchaseId' = purchase.record_id AND i.value->>'materialId' = line->>'materialId' AND r.record_id <> NEW.record_id AND coalesce(r.payload->'approval'->>'status', 'approved') <> 'rejected';$n$;
  a4 text := $o$    IF NEW.deleted IS DISTINCT FROM prior.deleted OR NEW.payload IS DISTINCT FROM prior.payload THEN
      RAISE EXCEPTION 'Purchase items and recorded entries cannot be modified or deleted.' USING ERRCODE = '42501';$o$;
  b4 text := $n$    -- An admin approves or rejects a supplier return the bill desk sent; nothing else about it changes.
    IF NEW.kind = 'stock_entry' AND NOT prior.deleted AND NOT NEW.deleted AND prior.payload->>'type' = 'return'
       AND (NEW.payload - 'approval') = (prior.payload - 'approval') AND NEW.payload->'approval' IS DISTINCT FROM prior.payload->'approval' THEN
      IF NOT public.has_restaurant_role(NEW.restaurant_id, auth.uid(), ARRAY['owner','manager']::public.restaurant_role[]) THEN
        RAISE EXCEPTION 'Only restaurant administrators can approve or reject supplier returns.' USING ERRCODE = '42501';
      END IF;
      IF prior.payload->'approval'->>'status' IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'This return was already approved or rejected.' USING ERRCODE = '22023';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.deleted IS DISTINCT FROM prior.deleted OR NEW.payload IS DISTINCT FROM prior.payload THEN
      RAISE EXCEPTION 'Purchase items and recorded entries cannot be modified or deleted.' USING ERRCODE = '42501';$n$;
BEGIN
  IF position(a1 IN d) = 0 THEN RAISE EXCEPTION 'step 1 not found'; END IF;
  IF position(a2 IN d) = 0 THEN RAISE EXCEPTION 'step 2 not found'; END IF;
  IF position(a3 IN d) = 0 THEN RAISE EXCEPTION 'step 3 not found'; END IF;
  IF position(a4 IN d) = 0 THEN RAISE EXCEPTION 'step 4 not found'; END IF;
  EXECUTE replace(replace(replace(replace(d, a1, b1), a2, b2), a3, b3), a4, b4);
END $mig$;
