-- Admin correction of a settled bill (owner/manager, reason, within 48 hours).
--
-- protect_closed_bills already lets an owner/manager change a settled bill in any way,
-- at any time, with no reason. This narrows that to what the app offers
-- (src/lib/bill-amend-logic.ts):
--   * only the payments, discount, round-off and the totals that follow from them;
--   * items, bill number, opening and settlement time stay as they were;
--   * within 48 hours of the FIRST settlement (originalSettledAt), by the cloud's clock;
--   * each correction appends exactly one entry to payload.amendments with a reason
--     (3-500 characters); earlier entries can't be edited;
--   * never on a bill paid by gift card or loyalty points (those are linked to card and
--     points balances elsewhere), and neither can be added.
-- Staff are still stopped by protect_closed_bills. Maintenance edits with no signed-in
-- user (service role) are not affected.

CREATE OR REPLACE FUNCTION public.guard_settled_bill_amendment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _o jsonb := OLD.payload; _n jsonb := NEW.payload;
  _first bigint; _old_n int; _new_n int; _reason text;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.kind <> 'order' OR NEW.deleted
     OR _o->>'status' IS DISTINCT FROM 'settled' OR _n->>'status' IS DISTINCT FROM 'settled' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;  -- maintenance

  -- Not a money change (feedback, guest name, a re-push of the same bill): nothing to check.
  IF (_n->'payments') IS NOT DISTINCT FROM (_o->'payments')
     AND (_n->'total') IS NOT DISTINCT FROM (_o->'total')
     AND (_n->'discountPct') IS NOT DISTINCT FROM (_o->'discountPct')
     AND (_n->'discountAmt') IS NOT DISTINCT FROM (_o->'discountAmt')
     AND (_n->'roundOff') IS NOT DISTINCT FROM (_o->'roundOff')
     AND (_n->'taxable') IS NOT DISTINCT FROM (_o->'taxable')
     AND (_n->'amendments') IS NOT DISTINCT FROM (_o->'amendments') THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_restaurant_admin_of(NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Only the owner or a manager can correct a settled bill' USING ERRCODE = '42501';
  END IF;

  IF (_n->'lines') IS DISTINCT FROM (_o->'lines')
     OR (_n->>'billNo') IS DISTINCT FROM (_o->>'billNo')
     OR (_n->'createdAt') IS DISTINCT FROM (_o->'createdAt')
     OR (_n->'settledAt') IS DISTINCT FROM (_o->'settledAt') THEN
    RAISE EXCEPTION 'A correction can change only the payments, discount and round-off' USING ERRCODE = '23514';
  END IF;

  _old_n := CASE WHEN jsonb_typeof(_o->'amendments') = 'array' THEN jsonb_array_length(_o->'amendments') ELSE 0 END;
  _new_n := CASE WHEN jsonb_typeof(_n->'amendments') = 'array' THEN jsonb_array_length(_n->'amendments') ELSE 0 END;
  IF _new_n <> _old_n + 1
     OR (_n->'amendments') - (_new_n - 1) IS DISTINCT FROM coalesce(_o->'amendments', '[]'::jsonb) THEN
    RAISE EXCEPTION 'Each correction must add one entry and keep the earlier ones' USING ERRCODE = '23514';
  END IF;
  _reason := btrim(coalesce(_n->'amendments'->(_new_n - 1)->>'reason', ''));
  IF length(_reason) < 3 OR length(_reason) > 500 THEN
    RAISE EXCEPTION 'A correction needs a reason' USING ERRCODE = '23514';
  END IF;

  IF coalesce(_o->>'originalSettledAt', _o->>'settledAt', '') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'This bill has no settlement time' USING ERRCODE = '23514';
  END IF;
  _first := coalesce(_o->>'originalSettledAt', _o->>'settledAt')::bigint;
  IF (_n->>'originalSettledAt') IS DISTINCT FROM _first::text THEN
    RAISE EXCEPTION 'The first settlement time must be kept' USING ERRCODE = '23514';
  END IF;
  IF clock_timestamp() > to_timestamp(_first / 1000.0) + interval '48 hours' THEN
    RAISE EXCEPTION 'Settled bills can be corrected only within 48 hours' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_o->'payments', '[]') || coalesce(_n->'payments', '[]')) p
             WHERE p->>'mode' IN ('gift_card', 'points')) THEN
    RAISE EXCEPTION 'Bills paid by gift card or loyalty points can''t be corrected here' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS restaurant_records_settled_amendment ON public.restaurant_records;
CREATE TRIGGER restaurant_records_settled_amendment
  BEFORE UPDATE ON public.restaurant_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_settled_bill_amendment();

-- Keep the payment ledger in step. push_restaurant_records inserts one bill_payments
-- row per payment with ON CONFLICT DO NOTHING, so a corrected bill would otherwise keep
-- its old rows (and the old amount on a key that stays the same). After a correction,
-- drop the rows that no longer match; the push inserts the new ones straight after.
CREATE OR REPLACE FUNCTION public.resync_bill_payments_after_amendment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kind <> 'order' OR NEW.deleted OR NEW.payload->>'status' IS DISTINCT FROM 'settled'
     OR (NEW.payload->'payments') IS NOT DISTINCT FROM (OLD.payload->'payments') THEN
    RETURN NULL;
  END IF;
  DELETE FROM public.bill_payments b
   WHERE b.restaurant_id = NEW.restaurant_id AND b.order_uid = NEW.record_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(NEW.payload->'payments') WITH ORDINALITY AS p(value, ord)
        WHERE b.payment_key = (p.ord - 1)::text || ':' || coalesce(p.value->>'mode', '')
          AND b.amount = round(coalesce((p.value->>'amount')::numeric, 0), 2));
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.resync_bill_payments_after_amendment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_settled_bill_amendment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS restaurant_records_resync_payments ON public.restaurant_records;
CREATE TRIGGER restaurant_records_resync_payments
  AFTER UPDATE ON public.restaurant_records
  FOR EACH ROW EXECUTE FUNCTION public.resync_bill_payments_after_amendment();
