-- Guest discount and priority are the owner's or a manager's to set.
--
-- A guest's `discountPct` is applied to their bill automatically at the counter, so a cashier
-- who could edit it could give any discount without the Roles approval. The existing
-- guard_customer_points_adjustment already quietly keeps a non-admin's points change from
-- landing; this extends the same treatment to `discountPct` and `priority`. Everything else
-- on the guest (name, note, bill messages, WhatsApp consent) stays editable by staff.

CREATE OR REPLACE FUNCTION public.guard_customer_points_adjustment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _key text;
BEGIN
  IF NEW.kind <> 'customer' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.has_restaurant_role(NEW.restaurant_id, auth.uid(), ARRAY['owner','manager']::public.restaurant_role[]) THEN
    RETURN NEW;
  END IF;
  FOREACH _key IN ARRAY ARRAY['pointsAdjustment', 'discountPct', 'priority'] LOOP
    IF TG_OP = 'UPDATE' AND (NEW.payload -> _key) IS DISTINCT FROM (OLD.payload -> _key) THEN
      NEW.payload := CASE WHEN OLD.payload ? _key THEN jsonb_set(NEW.payload, ARRAY[_key], OLD.payload -> _key) ELSE NEW.payload - _key END;
    ELSIF TG_OP = 'INSERT' AND NEW.payload ? _key THEN
      NEW.payload := NEW.payload - _key;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
