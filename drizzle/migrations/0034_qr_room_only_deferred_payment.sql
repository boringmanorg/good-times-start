CREATE OR REPLACE FUNCTION public.guest_order_pay_state_default() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  outlet public.restaurants;
  settings jsonb;
  room_service boolean := false;
BEGIN
  SELECT * INTO outlet FROM public.restaurants WHERE id = NEW.restaurant_id;
  IF outlet.id IS NULL THEN RAISE EXCEPTION 'Restaurant not found'; END IF;
  IF NEW.channel = 'table' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.restaurant_records
      WHERE restaurant_id = NEW.restaurant_id AND kind = 'table' AND record_id = NEW.table_id AND NOT deleted
        AND trim(coalesce(payload ->> 'section', '')) ~* '^rooms?$'
        AND (coalesce(outlet.ordering #> '{rooms,on}', '[]'::jsonb) ? NEW.table_id
          OR coalesce(outlet.ordering #> '{rooms,priority}', '[]'::jsonb) ? NEW.table_id)
    ) INTO room_service;
  END IF;
  IF NEW.payment = 'counter' THEN
    IF NOT room_service THEN
      RAISE EXCEPTION 'Pay at counter is only available for in-house room service. Please choose UPI.';
    END IF;
    NEW.pay_state := 'none';
  ELSIF NEW.payment = 'upi' THEN
    SELECT payload INTO settings FROM public.restaurant_records
      WHERE restaurant_id = NEW.restaurant_id AND kind = 'settings' AND NOT deleted LIMIT 1;
    IF NOT coalesce((outlet.ordering ->> 'upi')::boolean, false)
       OR length(trim(coalesce(settings ->> 'upiVpa', ''))) = 0 THEN
      RAISE EXCEPTION 'UPI ordering is unavailable right now. Please contact the restaurant.';
    END IF;
    NEW.pay_state := 'awaiting_confirm';
  ELSE
    RAISE EXCEPTION 'Unknown payment option';
  END IF;
  NEW.pay_proof := NULL;
  NEW.paid_at := NULL;
  NEW.confirmed_at := NULL;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guest_order_pay_state_default() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_order_pay_state_default() TO service_role;
DROP TRIGGER IF EXISTS guest_orders_pay_state ON public.guest_orders;
CREATE TRIGGER guest_orders_pay_state BEFORE INSERT ON public.guest_orders
  FOR EACH ROW EXECUTE FUNCTION public.guest_order_pay_state_default();