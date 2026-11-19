-- Bills rounded DOWN to the rupee were refused by sync.
--
-- guard_settled_bill_points_value (drizzle 0033) refused any settled bill whose
-- taxable value was more than 1 paisa above its total. On a no-GST bill the
-- taxable value IS the pre-rounding amount, so ₹1163.40 rounded to ₹1163 looked
-- "₹0.40 over" and was rejected. Rounding up passed, which is why only some
-- bills failed. Every rounded-down bill since 11 Nov was held on the device.
--
-- Now: the bill's own round-off is allowed, and a round-off of more than ₹100
-- either way is refused. The rule that payments equal the settled (rounded)
-- total is unchanged.
CREATE OR REPLACE FUNCTION public.guard_settled_bill_points_value()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _total numeric; _taxable numeric; _sub numeric; _disc numeric; _round numeric := 0; _allow numeric;
BEGIN
  IF NEW.kind <> 'order' OR NEW.deleted OR NEW.payload->>'status' IS DISTINCT FROM 'settled' THEN RETURN NEW; END IF;
  IF coalesce(NEW.payload->>'billNo', '') = '' THEN
    RAISE EXCEPTION 'A settled bill needs an official bill number' USING ERRCODE = '23514';
  END IF;
  _total := (NEW.payload->>'total')::numeric;
  IF coalesce(NEW.payload->>'roundOff', '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    _round := (NEW.payload->>'roundOff')::numeric;
  END IF;
  IF abs(_round) > 100 THEN
    RAISE EXCEPTION 'Round-off on a bill cannot be more than ₹100 either way' USING ERRCODE = '23514';
  END IF;
  _allow := abs(_round) + 0.01;
  IF coalesce(NEW.payload->>'taxable', '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    _taxable := (NEW.payload->>'taxable')::numeric;
    IF _taxable > _total + _allow THEN
      RAISE EXCEPTION 'Bill value cannot exceed the settled total' USING ERRCODE = '23514';
    END IF;
  ELSIF coalesce(NEW.payload->>'subtotal', '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    _sub := (NEW.payload->>'subtotal')::numeric;
    _disc := CASE WHEN coalesce(NEW.payload->>'discountAmt', '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (NEW.payload->>'discountAmt')::numeric ELSE 0 END;
    IF _sub - _disc > _total + greatest(1, _allow) THEN
      RAISE EXCEPTION 'Bill value cannot exceed the settled total' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.guard_settled_bill_points_value() FROM PUBLIC, anon, authenticated;
