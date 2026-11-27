-- Security (Lovable findings, 27 Nov 2026): staff could change a guest order's payment state,
-- phone number or WhatsApp consent directly through the table's UPDATE policy — marking an
-- unpaid prepaid order paid, or pointing "order ready" WhatsApp messages at any number.
--
-- Staff screens only ever change status, handled_by, reason, bill_no, order_uid (and table) on a
-- guest order; payment moves through confirm_guest_order_payment / verify_guest_order_payment and
-- the guest's screenshot through the server. So for a signed-in caller who isn't a super admin:
--   * every field the guest or the platform set is locked;
--   * pay_state may only move awaiting_confirm -> awaiting_payment (with confirmed_at) or
--     proof_sent -> paid (with paid_at) — exactly the two steps the functions take;
--   * ready_notified_at (new) may only be set once, so "order ready" goes out once per order.
-- Guests (anonymous, token-checked functions) and the server (service role) are unaffected.

ALTER TABLE public.guest_orders ADD COLUMN IF NOT EXISTS ready_notified_at timestamptz;

CREATE OR REPLACE FUNCTION public.guard_guest_order_origin() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() THEN RETURN NEW; END IF;

  IF NEW.platform IS DISTINCT FROM OLD.platform OR NEW.external_id IS DISTINCT FROM OLD.external_id
     OR NEW.is_test IS DISTINCT FROM OLD.is_test OR NEW.payment IS DISTINCT FROM OLD.payment THEN
    RAISE EXCEPTION 'Where an order came from and how it was paid can''t be changed' USING ERRCODE = '42501';
  END IF;

  IF NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.channel IS DISTINCT FROM OLD.channel OR NEW.token IS DISTINCT FROM OLD.token
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.qr_no IS DISTINCT FROM OLD.qr_no
     OR NEW.source IS DISTINCT FROM OLD.source OR NEW.order_type IS DISTINCT FROM OLD.order_type
     OR NEW.lines IS DISTINCT FROM OLD.lines OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.note IS DISTINCT FROM OLD.note OR NEW.pickup_at IS DISTINCT FROM OLD.pickup_at
     OR NEW.customer_name IS DISTINCT FROM OLD.customer_name OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
     OR NEW.whatsapp_opt_in IS DISTINCT FROM OLD.whatsapp_opt_in OR NEW.opt_in_at IS DISTINCT FROM OLD.opt_in_at
     OR NEW.delivery_address IS DISTINCT FROM OLD.delivery_address OR NEW.delivery_landmark IS DISTINCT FROM OLD.delivery_landmark
     OR NEW.upi_ref IS DISTINCT FROM OLD.upi_ref OR NEW.pay_proof IS DISTINCT FROM OLD.pay_proof THEN
    RAISE EXCEPTION 'What the guest sent with this order can''t be changed' USING ERRCODE = '42501';
  END IF;

  IF NEW.pay_state IS DISTINCT FROM OLD.pay_state AND NOT (
       (OLD.pay_state = 'awaiting_confirm' AND NEW.pay_state = 'awaiting_payment')
    OR (OLD.pay_state = 'proof_sent' AND NEW.pay_state = 'paid')) THEN
    RAISE EXCEPTION 'Payment on a guest order only moves by confirming the order or checking the guest''s payment' USING ERRCODE = '42501';
  END IF;
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at AND NOT (OLD.pay_state = 'proof_sent' AND NEW.pay_state = 'paid') THEN
    RAISE EXCEPTION 'The payment time is set only when the payment is checked' USING ERRCODE = '42501';
  END IF;
  IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at AND NOT (OLD.pay_state = 'awaiting_confirm' AND NEW.pay_state = 'awaiting_payment') THEN
    RAISE EXCEPTION 'The confirmation time is set only when the order is confirmed' USING ERRCODE = '42501';
  END IF;
  IF NEW.ready_notified_at IS DISTINCT FROM OLD.ready_notified_at AND (OLD.ready_notified_at IS NOT NULL OR NEW.ready_notified_at IS NULL) THEN
    RAISE EXCEPTION 'The ready message has already been sent for this order' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guest_orders_origin ON public.guest_orders;
CREATE TRIGGER guest_orders_origin BEFORE UPDATE ON public.guest_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_guest_order_origin();
