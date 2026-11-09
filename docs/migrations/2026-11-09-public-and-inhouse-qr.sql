-- Two QR codes: an in-house QR (hotel guests pick their room) and a public QR (book a table,
-- dine-in order, takeaway, delivery). Guests never see tables, rooms or their live status;
-- staff allot the table. Self-checking: each rewrite refuses to run if the function it
-- builds on has changed.

-- 1. Guest orders remember what kind of order a public guest placed, and where to deliver.
ALTER TABLE public.guest_orders
  ADD COLUMN IF NOT EXISTS order_type text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_landmark text;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guest_orders_order_type_check') THEN
    ALTER TABLE public.guest_orders ADD CONSTRAINT guest_orders_order_type_check
      CHECK (order_type IS NULL OR order_type IN ('dine-in', 'takeaway', 'delivery'));
  END IF;
END $c$;

-- 2. place_guest_order_v2: the same rules as place_guest_order (server prices, availability,
-- limits, room switches) plus public orders for dine-in (no table; staff seat the guest),
-- takeaway and delivery (address required). The original function stays for older apps.
DO $mig$
DECLARE d text := pg_get_functiondef('public.place_guest_order(text,text,text,text,text,text,jsonb,text,timestamp with time zone)'::regprocedure);
  pairs text[][] := ARRAY[
    [$o$FUNCTION public.place_guest_order(_slug text, _channel text, _table_id text, _name text, _phone text, _note text, _lines jsonb, _payment text DEFAULT 'counter'::text, _pickup_at timestamp with time zone DEFAULT NULL::timestamp with time zone)$o$,
     $n$FUNCTION public.place_guest_order_v2(_slug text, _channel text, _table_id text, _name text, _phone text, _note text, _lines jsonb, _payment text DEFAULT 'counter'::text, _pickup_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _order_type text DEFAULT NULL::text, _address text DEFAULT NULL::text, _landmark text DEFAULT NULL::text)$n$],
    [$o$  addon_names text; addon_ids jsonb;$o$,
     $n$  addon_names text; addon_ids jsonb; address text := left(trim(coalesce(_address, '')), 240); landmark text := left(trim(coalesce(_landmark, '')), 120);$n$],
    [$o$    order_type := 'takeaway';$o$,
     $n$    -- Public QR: dine-in without a table (staff seat the guest), takeaway or delivery.
    order_type := coalesce(nullif(_order_type, ''), 'takeaway');
    IF order_type NOT IN ('dine-in', 'takeaway', 'delivery') THEN RAISE EXCEPTION 'Unknown order type'; END IF;
    IF order_type = 'delivery' AND length(address) < 10 THEN RAISE EXCEPTION 'Please enter your full delivery address'; END IF;$n$],
    [$o$  IF _channel = 'online' AND subtotal < min_order THEN RAISE EXCEPTION 'The minimum order for pickup is Rs %', min_order; END IF;$o$,
     $n$  IF _channel = 'online' AND order_type <> 'dine-in' AND subtotal < min_order THEN RAISE EXCEPTION 'The minimum order for pickup or delivery is Rs %', min_order; END IF;$n$],
    [$o$  INSERT INTO guest_orders (restaurant_id, code, channel, table_id, table_label, customer_name, customer_phone, note, pickup_at, lines, subtotal, payment)$o$,
     $n$  INSERT INTO guest_orders (restaurant_id, code, channel, table_id, table_label, customer_name, customer_phone, note, pickup_at, lines, subtotal, payment, order_type, delivery_address, delivery_landmark)$n$],
    [$o$          CASE WHEN _channel = 'online' THEN _pickup_at END, out_lines, subtotal, _payment)$o$,
     $n$          CASE WHEN _channel = 'online' AND order_type = 'takeaway' THEN _pickup_at END, out_lines, subtotal, _payment, order_type,
          CASE WHEN order_type = 'delivery' THEN address END, CASE WHEN order_type = 'delivery' THEN nullif(landmark, '') END)$n$]
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(pairs, 1) LOOP
    IF position(pairs[i][1] IN d) = 0 THEN RAISE EXCEPTION 'place_guest_order changed; step % not found', i; END IF;
    d := replace(d, pairs[i][1], pairs[i][2]);
  END LOOP;
  EXECUTE d;
END $mig$;
GRANT EXECUTE ON FUNCTION public.place_guest_order_v2(text,text,text,text,text,text,jsonb,text,timestamp with time zone,text,text,text) TO anon, authenticated;

-- 3. Bookings are for a party, not a table: staff allot the table when confirming.
ALTER TABLE public.guest_reservations
  ALTER COLUMN table_id DROP NOT NULL,
  ALTER COLUMN table_label DROP NOT NULL,
  ALTER COLUMN section DROP NOT NULL;
ALTER TABLE public.guest_reservations ADD COLUMN IF NOT EXISTS note text;

CREATE OR REPLACE FUNCTION public.request_guest_booking(_slug text, _request uuid, _name text, _phone text, _party integer, _arrival timestamp with time zone, _hours integer DEFAULT 2, _note text DEFAULT '')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.restaurants; g public.guest_reservations; digits text := regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g');
BEGIN
  SELECT * INTO r FROM public.restaurants WHERE slug = lower(trim(_slug));
  IF r.id IS NULL THEN RAISE EXCEPTION 'Restaurant not found'; END IF;
  IF NOT (public.account_is_live(r.account_id) AND (coalesce((r.ordering->>'table')::boolean, false) OR coalesce((r.ordering->>'online')::boolean, false))) THEN
    RAISE EXCEPTION 'Table booking is off right now. Please call the restaurant.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(r.id::text, 0));
  SELECT * INTO g FROM public.guest_reservations WHERE restaurant_id = r.id AND request_id = _request;
  IF g.id IS NOT NULL THEN
    IF g.guest_phone <> digits OR g.arrival_at <> _arrival THEN RAISE EXCEPTION 'Request identity mismatch'; END IF;
    RETURN jsonb_build_object('id', g.id, 'token', g.token, 'status', g.status);
  END IF;
  IF _arrival IS NULL OR _arrival <= now() OR _arrival > now() + interval '60 days' OR _hours NOT BETWEEN 1 AND 6 THEN
    RAISE EXCEPTION 'Choose a future time within 60 days, for 1 to 6 hours';
  END IF;
  IF length(trim(coalesce(_name, ''))) NOT BETWEEN 2 AND 80 OR digits !~ '^[0-9]{10,13}$' THEN RAISE EXCEPTION 'Enter your name and a valid mobile number'; END IF;
  IF _party IS NULL OR _party < 1 OR _party > 15 THEN RAISE EXCEPTION 'Bookings are for 1 to 15 guests. For larger groups, please call us.'; END IF;
  IF (SELECT count(*) FROM public.guest_reservations WHERE restaurant_id = r.id AND guest_phone = digits AND status = 'pending') >= 3 THEN
    RAISE EXCEPTION 'You already have bookings waiting. We will confirm them shortly.';
  END IF;
  INSERT INTO public.guest_reservations (restaurant_id, request_id, guest_name, guest_phone, party_size, arrival_at, end_at, note)
  VALUES (r.id, _request, trim(_name), digits, _party, _arrival, _arrival + make_interval(hours => _hours), nullif(left(trim(coalesce(_note, '')), 240), ''))
  RETURNING * INTO g;
  RETURN jsonb_build_object('id', g.id, 'token', g.token, 'status', g.status);
END $function$;
GRANT EXECUTE ON FUNCTION public.request_guest_booking(text,uuid,text,text,integer,timestamp with time zone,integer,text) TO anon, authenticated;

-- 4. Staff allot a table to a booking (and confirm it). Table must exist; no overlap with another booking.
CREATE OR REPLACE FUNCTION public.allot_guest_reservation(_id uuid, _table text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE g public.guest_reservations; t record;
BEGIN
  SELECT * INTO g FROM public.guest_reservations WHERE id = _id;
  IF g.id IS NULL OR NOT public.has_restaurant_role(g.restaurant_id, auth.uid(), ARRAY['owner','manager','cashier','captain']::public.restaurant_role[]) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(g.restaurant_id::text, 0));
  SELECT * INTO g FROM public.guest_reservations WHERE id = _id FOR UPDATE;
  IF g.status NOT IN ('pending', 'confirmed') THEN RAISE EXCEPTION 'This booking has changed. Refresh before continuing.'; END IF;
  SELECT record_id, payload->>'label' AS label, coalesce(payload->>'section', '') AS section INTO t
    FROM public.restaurant_records WHERE restaurant_id = g.restaurant_id AND kind = 'table' AND record_id = _table AND NOT deleted;
  IF t.record_id IS NULL THEN RAISE EXCEPTION 'That table no longer exists'; END IF;
  IF EXISTS (SELECT 1 FROM public.guest_reservations x WHERE x.restaurant_id = g.restaurant_id AND x.table_id = _table AND x.id <> g.id
             AND x.status IN ('pending', 'confirmed', 'arrived') AND x.arrival_at < g.end_at AND x.end_at > g.arrival_at) THEN
    RAISE EXCEPTION 'Another booking already has that table at this time';
  END IF;
  UPDATE public.guest_reservations SET table_id = t.record_id, table_label = t.label, section = t.section, status = 'confirmed', updated_at = now() WHERE id = _id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.allot_guest_reservation(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.allot_guest_reservation(uuid,text) TO authenticated;

-- 5. A booking can't be confirmed or seated until it has a table.
DO $mig$
DECLARE d text := pg_get_functiondef('public.manage_guest_reservation(uuid,text)'::regprocedure);
  old1 text := $o$ IF _status IN ('confirmed','arrived') AND g.end_at<=now() THEN RAISE EXCEPTION 'This arrival slot has ended'; END IF;$o$;
BEGIN
  IF position(old1 IN d) = 0 THEN RAISE EXCEPTION 'manage_guest_reservation changed'; END IF;
  EXECUTE replace(d, old1, old1 || E'\n IF _status IN (''confirmed'',''arrived'') AND g.table_id IS NULL THEN RAISE EXCEPTION ''Allot a table first''; END IF;');
END $mig$;

-- 6. Guests never see which tables or rooms are busy: the old per-table availability now says only
-- whether booking is open. (request_guest_reservation, which needed it, is replaced by request_guest_booking.)
CREATE OR REPLACE FUNCTION public.public_booking_availability(_slug text, _arrival timestamp with time zone, _hours integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.restaurants;
BEGIN
  SELECT * INTO r FROM public.restaurants WHERE slug = _slug;
  IF r.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('name', r.name, 'slug', r.slug,
    'enabled', public.account_is_live(r.account_id) AND (coalesce((r.ordering->>'table')::boolean, false) OR coalesce((r.ordering->>'online')::boolean, false)),
    'maxParty', 15, 'places', '[]'::jsonb);
END $function$;

-- 7. Public ordering (dine-in, takeaway, delivery) is on for this restaurant.
UPDATE public.restaurants SET ordering = ordering || '{"online": true}'::jsonb WHERE slug = 'tab-bistro-qr';

-- 8. The guest's order page shows what kind of order it is.
CREATE OR REPLACE FUNCTION public.guest_order_status(_id uuid, _token uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('id', g.id, 'code', g.code, 'channel', g.channel, 'status', g.status, 'reason', g.reason,
    'tableLabel', g.table_label, 'lines', g.lines, 'subtotal', g.subtotal, 'payment', g.payment, 'billNo', g.bill_no,
    'createdAt', g.created_at, 'updatedAt', g.updated_at, 'pickupAt', g.pickup_at, 'orderType', g.order_type)
  FROM guest_orders g WHERE g.id = _id AND g.token = _token
$function$;
