-- QR / pickup order limits that grow with the floor (place_guest_order).
-- Per table: up to 8 waiting (not yet accepted) orders in 10 minutes (was 3 in 3 minutes), so a group
-- ordering from several phones isn't blocked. Pickup phones stay at 3 waiting in 3 minutes.
-- Whole restaurant: 3 orders a minute per table or room, at least 60 (was a fixed 40), so tables
-- added later raise the limit automatically.
-- Self-checking: refuses to run unless both original rules are found exactly as expected.
do $mig$
declare d text := pg_get_functiondef('public.place_guest_order(text,text,text,text,text,text,jsonb,text,timestamp with time zone)'::regprocedure);
  old1 text := $o$  IF (SELECT count(*) FROM guest_orders WHERE restaurant_id = rr.id AND status = 'new' AND created_at > now() - interval '3 minutes'
        AND ((_channel = 'table' AND table_id = _table_id) OR (_channel = 'online' AND customer_phone = digits))) >= 3 THEN$o$;
  new1 text := $n$  -- Waiting (not yet accepted) orders: a busy table may send several in a row from different phones;
  -- a pickup phone stays tightly limited. Accepted orders never count.
  IF (SELECT count(*) FROM guest_orders WHERE restaurant_id = rr.id AND status = 'new'
        AND ((_channel = 'table' AND table_id = _table_id AND created_at > now() - interval '10 minutes')
          OR (_channel = 'online' AND customer_phone = digits AND created_at > now() - interval '3 minutes')))
     >= (CASE WHEN _channel = 'table' THEN 8 ELSE 3 END) THEN$n$;
  old2 text := $o$  IF (SELECT count(*) FROM guest_orders WHERE restaurant_id = rr.id AND created_at > now() - interval '1 minute') >= 40 THEN$o$;
  new2 text := $n$  -- Whole-restaurant flood guard grows with the floor: 3 orders a minute per table or room (at least 60),
  -- so tables added later raise it automatically.
  IF (SELECT count(*) FROM guest_orders WHERE restaurant_id = rr.id AND created_at > now() - interval '1 minute')
     >= greatest(60, 3 * (SELECT count(*) FROM restaurant_records WHERE restaurant_id = rr.id AND kind = 'table' AND NOT deleted)) THEN$n$;
begin
  if position(old1 in d) = 0 then raise exception 'per-table rule not found as expected'; end if;
  if position(old2 in d) = 0 then raise exception 'restaurant-wide rule not found as expected'; end if;
  execute replace(replace(d, old1, new1), old2, new2);
end $mig$;
