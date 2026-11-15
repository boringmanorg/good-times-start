DO $mig$
DECLARE
 d text := pg_get_functiondef('public.protect_purchase_ledger()'::regprocedure);
 old_clock text := $old$purchase_at := (purchase.payload->>'at')::numeric;$old$;
 new_clock text := $new$purchase_at := coalesce((purchase.payload #>> '{approval,decidedAt}')::numeric, (purchase.payload->>'approvedAt')::numeric, (purchase.payload->>'at')::numeric);$new$;
 old_access text := $old$IF NOT (NEW.kind = 'stock_entry' AND public.has_restaurant_role(NEW.restaurant_id, auth.uid(), ARRAY['cashier']::public.restaurant_role[])
            AND NEW.payload->'approval'->>'status' = 'pending' AND NEW.payload->'approval'->>'decidedBy' IS NULL) THEN$old$;
 new_access text := $new$IF NOT (public.has_restaurant_role(NEW.restaurant_id, auth.uid(), ARRAY['cashier']::public.restaurant_role[])
            AND (NEW.kind = 'material' OR (NEW.kind = 'stock_entry' AND NEW.payload->'approval'->>'status' = 'pending'
            AND NEW.payload->'approval'->>'decidedBy' IS NULL AND NEW.payload->'approval'->>'decidedAt' IS NULL))) THEN$new$;
 old_edit text := $old$      IF NEW.deleted THEN RETURN NEW; END IF;
      IF NEW.payload->>'type' IS DISTINCT FROM 'purchase'$old$;
 new_edit text := $new$      IF NEW.deleted THEN RETURN NEW; END IF;
      IF coalesce(prior.payload #>> '{approval,status}', 'approved') = 'approved'
         AND (NEW.payload->'approval' IS DISTINCT FROM prior.payload->'approval' OR NEW.payload->'approvedAt' IS DISTINCT FROM prior.payload->'approvedAt') THEN
        RAISE EXCEPTION 'The approval time of an approved purchase cannot be changed.' USING ERRCODE = '42501';
      END IF;
      IF NEW.payload->>'type' IS DISTINCT FROM 'purchase'$new$;
BEGIN
 IF position(old_clock IN d) = 0 OR position(old_access IN d) = 0 OR position(old_edit IN d) = 0 THEN RAISE EXCEPTION 'Purchase guard changed; inspect before applying'; END IF;
 d := replace(replace(replace(d, old_clock, new_clock), old_access, new_access), old_edit, new_edit);
 d := replace(d, 'Supplier returns must be recorded and synced within 48 hours of purchase.', 'Supplier returns must be recorded and synced within 48 hours of admin approval.');
 EXECUTE d;
END $mig$;