-- APPLIED 14 Nov 2026.
-- Central kitchen / inter-outlet stock transfers.
--
-- Sending stock between outlets is two stock entries, one each side, written together so a
-- transfer can never exist on only one side:
--   sender   type 'transfer_out', negative quantities
--   receiver type 'transfer_in',  positive quantities
-- Both carry the same transferId, so each outlet's purchase history can show the other end.
--
-- They are written as ordinary restaurant_records, so every device picks them up through the
-- normal sync with no new table and no new offline path.
--
-- Cost: each line carries the sender's unitCost, so the receiving outlet's stock is valued at
-- what the brand actually paid, and the brand P&L is not double-counted — a transfer moves
-- value between outlets, it is not a new purchase. outlet_purchases therefore ignores both
-- transfer types (it filters on 'purchase' and 'return' only).

CREATE OR REPLACE FUNCTION public.transfer_stock(
  _from uuid, _to uuid, _items jsonb, _note text DEFAULT ''
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  acc uuid;
  transfer uuid := gen_random_uuid();
  now_ms bigint := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  sender_name text;
  receiver_name text;
  out_items jsonb;
  who text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF _from = _to THEN RAISE EXCEPTION 'Choose a different outlet to send to.'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one item to the transfer.';
  END IF;
  IF jsonb_array_length(_items) > 200 THEN RAISE EXCEPTION 'Send at most 200 items at a time.'; END IF;

  -- Only an owner or manager of BOTH ends may move stock, and both must be the same brand.
  IF NOT has_restaurant_role(_from, uid, ARRAY['owner','manager']::restaurant_role[])
     OR NOT has_restaurant_role(_to, uid, ARRAY['owner','manager']::restaurant_role[]) THEN
    RAISE EXCEPTION 'You can only move stock between outlets you manage.';
  END IF;
  SELECT account_id INTO acc FROM restaurants WHERE id = _from;
  IF acc IS NULL OR NOT EXISTS (SELECT 1 FROM restaurants WHERE id = _to AND account_id = acc) THEN
    RAISE EXCEPTION 'Both outlets must belong to the same brand.';
  END IF;
  IF NOT account_is_live(acc) THEN RAISE EXCEPTION 'Your plan has ended. Renew it to move stock.'; END IF;

  -- Every quantity must be a real positive number; the sender's copy is the negative of it.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) i
    WHERE coalesce((i ->> 'qty')::numeric, 0) <= 0 OR (i ->> 'materialId') IS NULL
  ) THEN RAISE EXCEPTION 'Every item needs an item and a quantity above zero.'; END IF;

  SELECT name INTO sender_name FROM restaurants WHERE id = _from;
  SELECT name INTO receiver_name FROM restaurants WHERE id = _to;
  who := coalesce((SELECT display_name FROM profiles WHERE id = uid), '');

  SELECT jsonb_agg(jsonb_build_object(
           'materialId', i ->> 'materialId',
           'qty', -((i ->> 'qty')::numeric),
           'unitCost', coalesce((i ->> 'unitCost')::numeric, 0),
           'name', i ->> 'name',
           'unit', i ->> 'unit'))
  INTO out_items FROM jsonb_array_elements(_items) i;

  INSERT INTO restaurant_records (restaurant_id, kind, record_id, payload, deleted) VALUES
    (_from, 'stock_entry', 'transfer-out:' || transfer, jsonb_build_object(
       'id', 'transfer-out:' || transfer, 'type', 'transfer_out', 'at', now_ms, 'by', who,
       'transferId', transfer, 'otherOutlet', _to, 'otherOutletName', receiver_name,
       'reference', 'To ' || receiver_name, 'note', left(coalesce(_note, ''), 200),
       'items', out_items), false),
    (_to, 'stock_entry', 'transfer-in:' || transfer, jsonb_build_object(
       'id', 'transfer-in:' || transfer, 'type', 'transfer_in', 'at', now_ms, 'by', who,
       'transferId', transfer, 'otherOutlet', _from, 'otherOutletName', sender_name,
       'reference', 'From ' || sender_name, 'note', left(coalesce(_note, ''), 200),
       'items', _items), false);

  INSERT INTO account_events (account_id, kind, detail, by_user) VALUES (acc, 'stock_transferred',
    jsonb_build_object('transfer', transfer, 'from', _from, 'to', _to, 'lines', jsonb_array_length(_items)), uid);

  RETURN transfer;
END $$;

REVOKE ALL ON FUNCTION public.transfer_stock(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_stock(uuid, uuid, jsonb, text) TO authenticated;
