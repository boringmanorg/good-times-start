CREATE TABLE public.gift_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  initial_amount numeric(12,2) NOT NULL CHECK (initial_amount > 0),
  balance numeric(12,2) NOT NULL CHECK (balance >= 0),
  issued_restaurant_id uuid NOT NULL,
  guest_name text,
  guest_phone text,
  expires_on date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','void')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gift_cards_account_idx ON public.gift_cards(account_id, created_at DESC);

CREATE TABLE public.gift_card_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.gift_cards(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('issue','redeem','void')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  bill_no text,
  by_user uuid,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gift_card_events_card_idx ON public.gift_card_events(card_id, at DESC);
CREATE INDEX gift_card_events_account_idx ON public.gift_card_events(account_id, at DESC);

GRANT SELECT ON public.gift_cards TO authenticated;
GRANT SELECT ON public.gift_card_events TO authenticated;
GRANT ALL ON public.gift_cards TO service_role;
GRANT ALL ON public.gift_card_events TO service_role;
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_card_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_account_member(_account uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM restaurants r JOIN restaurant_members m ON m.restaurant_id = r.id
                 WHERE r.account_id = _account AND m.user_id = auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.is_account_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_member(uuid) TO authenticated;

CREATE POLICY "Brand members read gift cards" ON public.gift_cards FOR SELECT TO authenticated USING (public.is_account_member(account_id));
CREATE POLICY "Brand members read gift card history" ON public.gift_card_events FOR SELECT TO authenticated USING (public.is_account_member(account_id));

CREATE OR REPLACE FUNCTION public.issue_gift_card(_restaurant uuid, _amount numeric, _guest_name text DEFAULT NULL, _guest_phone text DEFAULT NULL, _expires_on date DEFAULT NULL)
RETURNS public.gift_cards LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _acc uuid; _code text; _card gift_cards;
BEGIN
  IF NOT public.is_restaurant_admin(_restaurant) THEN RAISE EXCEPTION 'Only the owner or a manager can issue gift cards'; END IF;
  SELECT account_id INTO _acc FROM restaurants WHERE id = _restaurant;
  IF _acc IS NULL THEN RAISE EXCEPTION 'Outlet not found'; END IF;
  IF NOT public.account_feature(_acc, 'gift_cards') THEN RAISE EXCEPTION 'Gift cards are not part of this plan'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 100000 THEN RAISE EXCEPTION 'Amount must be between 1 and 100000'; END IF;
  IF _expires_on IS NOT NULL AND _expires_on < current_date THEN RAISE EXCEPTION 'Expiry date is in the past'; END IF;
  LOOP
    _code := 'GC' || upper(substr(translate(encode(gen_random_bytes(8), 'base64'), '+/=0O1Il', ''), 1, 8));
    EXIT WHEN length(_code) = 10 AND NOT EXISTS (SELECT 1 FROM gift_cards WHERE code = _code);
  END LOOP;
  INSERT INTO gift_cards(account_id, code, initial_amount, balance, issued_restaurant_id, guest_name, guest_phone, expires_on, created_by)
  VALUES (_acc, _code, round(_amount, 2), round(_amount, 2), _restaurant, nullif(trim(_guest_name), ''), nullif(trim(_guest_phone), ''), _expires_on, auth.uid())
  RETURNING * INTO _card;
  INSERT INTO gift_card_events(card_id, account_id, restaurant_id, kind, amount, by_user) VALUES (_card.id, _acc, _restaurant, 'issue', _card.initial_amount, auth.uid());
  RETURN _card;
END $$;

CREATE OR REPLACE FUNCTION public.redeem_gift_card(_restaurant uuid, _code text, _amount numeric, _bill_no text DEFAULT NULL)
RETURNS public.gift_cards LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _acc uuid; _card gift_cards;
BEGIN
  IF NOT public.is_member(_restaurant, auth.uid()) THEN RAISE EXCEPTION 'Not a member of this outlet'; END IF;
  SELECT account_id INTO _acc FROM restaurants WHERE id = _restaurant;
  SELECT * INTO _card FROM gift_cards WHERE code = upper(trim(_code)) AND account_id = _acc FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No gift card with that code in this brand'; END IF;
  IF _card.status <> 'active' THEN RAISE EXCEPTION 'This gift card has been cancelled'; END IF;
  IF _card.expires_on IS NOT NULL AND _card.expires_on < current_date THEN RAISE EXCEPTION 'This gift card expired on %', _card.expires_on; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Enter an amount above 0'; END IF;
  IF round(_amount, 2) > _card.balance THEN RAISE EXCEPTION 'Only % left on this card', _card.balance; END IF;
  UPDATE gift_cards SET balance = balance - round(_amount, 2) WHERE id = _card.id RETURNING * INTO _card;
  INSERT INTO gift_card_events(card_id, account_id, restaurant_id, kind, amount, bill_no, by_user)
  VALUES (_card.id, _acc, _restaurant, 'redeem', round(_amount, 2), nullif(trim(_bill_no), ''), auth.uid());
  RETURN _card;
END $$;

CREATE OR REPLACE FUNCTION public.void_gift_card(_restaurant uuid, _card uuid)
RETURNS public.gift_cards LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _acc uuid; _row gift_cards;
BEGIN
  IF NOT public.is_restaurant_admin(_restaurant) THEN RAISE EXCEPTION 'Only the owner or a manager can cancel gift cards'; END IF;
  SELECT account_id INTO _acc FROM restaurants WHERE id = _restaurant;
  UPDATE gift_cards SET status = 'void' WHERE id = _card AND account_id = _acc AND status = 'active' RETURNING * INTO _row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gift card not found or already cancelled'; END IF;
  INSERT INTO gift_card_events(card_id, account_id, restaurant_id, kind, amount, by_user) VALUES (_row.id, _acc, _restaurant, 'void', _row.balance, auth.uid());
  RETURN _row;
END $$;

REVOKE EXECUTE ON FUNCTION public.issue_gift_card(uuid, numeric, text, text, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.redeem_gift_card(uuid, text, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.void_gift_card(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_gift_card(uuid, numeric, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_gift_card(uuid, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_gift_card(uuid, uuid) TO authenticated;