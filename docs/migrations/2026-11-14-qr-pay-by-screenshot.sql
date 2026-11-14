-- Prepaid QR orders: the guest pays only after the restaurant confirms it can make the order,
-- then uploads the payment screenshot. The order's own `status` is untouched — payment runs
-- alongside it on `pay_state`, so a pay-at-counter order behaves exactly as it always has.
--
--   none              pay at the counter / on delivery / on the room bill
--   awaiting_confirm  placed; the restaurant hasn't looked at it yet
--   awaiting_payment  the restaurant confirmed; the guest can pay now
--   paid              the guest sent the screenshot and confirmed
--
-- There is no payment gateway: the guest pays into the restaurant's own UPI and sends proof.

ALTER TABLE public.guest_orders ADD COLUMN IF NOT EXISTS pay_state text NOT NULL DEFAULT 'none';
ALTER TABLE public.guest_orders ADD COLUMN IF NOT EXISTS pay_proof text;
ALTER TABLE public.guest_orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.guest_orders ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

ALTER TABLE public.guest_orders DROP CONSTRAINT IF EXISTS guest_orders_pay_state_check;
ALTER TABLE public.guest_orders ADD CONSTRAINT guest_orders_pay_state_check
  CHECK (pay_state = ANY (ARRAY['none', 'awaiting_confirm', 'awaiting_payment', 'paid']));

-- Screenshots live in a private bucket, one folder per order. Nothing reads it directly:
-- the guest uploads through a server function that checks the order token, and staff get a
-- short-lived signed link after a membership check. So no anon policy is granted here.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('guest-payments', 'guest-payments', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO UPDATE SET
  public = false, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

-- New prepaid orders start at awaiting_confirm. Older rows keep 'none' so nothing already
-- in flight suddenly waits for a payment step that didn't exist when it was placed.
CREATE OR REPLACE FUNCTION public.guest_order_pay_state_default() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.pay_state = 'none' AND NEW.payment = 'upi' THEN NEW.pay_state := 'awaiting_confirm'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guest_orders_pay_state ON public.guest_orders;
CREATE TRIGGER guest_orders_pay_state BEFORE INSERT ON public.guest_orders
  FOR EACH ROW EXECUTE FUNCTION public.guest_order_pay_state_default();

-- Staff: "we can make this — ask the guest to pay". Members only, same rights as handling
-- any other QR order.
CREATE OR REPLACE FUNCTION public.confirm_guest_order_payment(_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g guest_orders;
BEGIN
  SELECT * INTO g FROM guest_orders WHERE id = _id FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT is_member(g.restaurant_id, auth.uid()) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF g.status <> 'new' THEN RAISE EXCEPTION 'This order has already been handled.'; END IF;
  IF g.pay_state <> 'awaiting_confirm' THEN RETURN g.pay_state; END IF;
  UPDATE guest_orders SET pay_state = 'awaiting_payment', confirmed_at = now(), handled_by = ''
  WHERE id = g.id;
  RETURN 'awaiting_payment';
END $$;

REVOKE ALL ON FUNCTION public.confirm_guest_order_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_guest_order_payment(uuid) TO authenticated;

-- The guest page needs to know where it stands, so the status read carries the payment too.
CREATE OR REPLACE FUNCTION public.guest_order_status(_id uuid, _token uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT jsonb_build_object('id', g.id, 'code', g.code, 'channel', g.channel, 'status', g.status, 'reason', g.reason,
    'tableLabel', g.table_label, 'lines', g.lines, 'subtotal', g.subtotal, 'payment', g.payment, 'billNo', g.bill_no,
    'createdAt', g.created_at, 'updatedAt', g.updated_at, 'pickupAt', g.pickup_at, 'orderType', g.order_type,
    'payState', g.pay_state, 'upiRef', g.upi_ref, 'paidAt', g.paid_at)
  FROM guest_orders g WHERE g.id = _id AND g.token = _token
$function$;

-- Staff reading the QR order list need the payment columns as well; guest_orders is already
-- readable by members through RLS, so the new columns come along with SELECT *.
