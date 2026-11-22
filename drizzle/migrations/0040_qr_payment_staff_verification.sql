ALTER TABLE public.guest_orders DROP CONSTRAINT IF EXISTS guest_orders_pay_state_check;
ALTER TABLE public.guest_orders ADD CONSTRAINT guest_orders_pay_state_check
  CHECK (pay_state = ANY (ARRAY['none', 'awaiting_confirm', 'awaiting_payment', 'proof_sent', 'paid']));

CREATE OR REPLACE FUNCTION public.verify_guest_order_payment(_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g guest_orders;
BEGIN
  SELECT * INTO g FROM guest_orders WHERE id = _id FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() IS NULL OR NOT is_member(g.restaurant_id, auth.uid()) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF g.status <> 'new' THEN RAISE EXCEPTION 'This order has already been handled.'; END IF;
  IF g.pay_state <> 'proof_sent' THEN RETURN g.pay_state; END IF;
  UPDATE guest_orders SET pay_state = 'paid', paid_at = now() WHERE id = g.id;
  RETURN 'paid';
END $$;
REVOKE ALL ON FUNCTION public.verify_guest_order_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_guest_order_payment(uuid) TO authenticated;