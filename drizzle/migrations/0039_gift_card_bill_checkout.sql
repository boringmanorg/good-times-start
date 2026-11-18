ALTER TABLE public.gift_card_events ADD COLUMN order_uid text;
CREATE UNIQUE INDEX gift_card_bill_redemption_unique ON public.gift_card_events(restaurant_id, order_uid) WHERE order_uid IS NOT NULL AND kind = 'redeem';
ALTER TABLE public.bill_payments DROP CONSTRAINT bill_payments_mode_valid;
ALTER TABLE public.bill_payments ADD CONSTRAINT bill_payments_mode_valid CHECK (mode IN ('cash','upi','card','wallet','credit','points','gift_card')) NOT VALID;
CREATE OR REPLACE FUNCTION public.validate_settled_order_payload()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _payment jsonb; _mode text; _amount numeric; _total numeric; _paid numeric := 0; _count integer := 0;
BEGIN
 IF NEW.kind <> 'order' OR NEW.deleted OR NEW.payload->>'status' IS DISTINCT FROM 'settled' THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.payload->'payments') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'A settled bill must contain a payment array' USING ERRCODE = '23514'; END IF;
 IF coalesce(NEW.payload->>'total','') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN RAISE EXCEPTION 'A settled bill must contain a valid total' USING ERRCODE = '23514'; END IF;
 _total := round((NEW.payload->>'total')::numeric,2);
 IF _total < 0 THEN RAISE EXCEPTION 'A settled bill cannot have a negative total' USING ERRCODE = '23514'; END IF;
 FOR _payment IN SELECT value FROM jsonb_array_elements(NEW.payload->'payments') LOOP
  _mode := _payment->>'mode';
  IF _mode IS NULL OR _mode NOT IN ('cash','upi','card','wallet','credit','points','gift_card') THEN RAISE EXCEPTION 'Unsupported payment mode on settled bill' USING ERRCODE = '23514'; END IF;
  IF coalesce(_payment->>'amount','') !~ '^[0-9]+(\.[0-9]+)?$' THEN RAISE EXCEPTION 'Every payment must have a valid positive amount' USING ERRCODE = '23514'; END IF;
  _amount := round((_payment->>'amount')::numeric,2);
  IF _amount <= 0 THEN RAISE EXCEPTION 'Every payment must have a positive amount' USING ERRCODE = '23514'; END IF;
  _paid := _paid + _amount; _count := _count + 1;
 END LOOP;
 IF (_total = 0 AND _count <> 0) OR (_total > 0 AND _count = 0) OR abs(round(_paid,2) - _total) > 0.01 THEN RAISE EXCEPTION 'Recorded payments must equal the settled bill total' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.link_bill_gift_card()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _gift jsonb; _n integer; _acc uuid; _card public.gift_cards; _event public.gift_card_events; _amount numeric; _code text;
BEGIN
 IF NEW.kind <> 'order' THEN RETURN NEW; END IF;
 SELECT * INTO _event FROM public.gift_card_events WHERE restaurant_id=NEW.restaurant_id AND order_uid=NEW.record_id AND kind='redeem';
 SELECT count(*) INTO _n FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.payload->'payments')='array' THEN NEW.payload->'payments' ELSE '[]'::jsonb END) p WHERE p->>'mode'='gift_card';
 IF _event.id IS NOT NULL AND (NEW.deleted OR NEW.payload->>'status' IS DISTINCT FROM 'settled' OR _n<>1) THEN RAISE EXCEPTION 'A redeemed gift-card bill cannot be removed or reopened'; END IF;
 IF NEW.deleted OR NEW.payload->>'status' IS DISTINCT FROM 'settled' OR _n=0 THEN RETURN NEW; END IF;
 IF _n<>1 THEN RAISE EXCEPTION 'Use one gift card per bill'; END IF;
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.restaurant_members WHERE restaurant_id=NEW.restaurant_id AND user_id=auth.uid() AND role IN ('owner','manager','cashier')) THEN RAISE EXCEPTION 'Only billing staff can settle gift cards' USING ERRCODE='42501'; END IF;
 SELECT p INTO _gift FROM jsonb_array_elements(NEW.payload->'payments') p WHERE p->>'mode'='gift_card';
 _amount:=round((_gift->>'amount')::numeric,2); _code:=upper(regexp_replace(coalesce(_gift->>'giftCardCode',''),'\s','','g'));
 SELECT account_id INTO _acc FROM public.restaurants WHERE id=NEW.restaurant_id;
 SELECT * INTO _card FROM public.gift_cards WHERE account_id=_acc AND code=_code FOR UPDATE;
 IF _card.id IS NULL THEN RAISE EXCEPTION 'No gift card with that code in this brand'; END IF;
 IF _event.id IS NOT NULL THEN
  IF _event.card_id<>_card.id OR _event.amount<>_amount THEN RAISE EXCEPTION 'Gift-card payment cannot be changed after redemption'; END IF;
  RETURN NEW;
 END IF;
 IF NOT public.account_feature(_acc,'gift_cards') THEN RAISE EXCEPTION 'Gift cards are not part of this plan'; END IF;
 IF _card.status<>'active' THEN RAISE EXCEPTION 'This gift card has been cancelled'; END IF;
 IF _card.expires_on IS NOT NULL AND _card.expires_on<current_date THEN RAISE EXCEPTION 'This gift card has expired'; END IF;
 IF _amount<=0 OR _amount>_card.balance THEN RAISE EXCEPTION 'Insufficient gift card balance'; END IF;
 UPDATE public.gift_cards SET balance=balance-_amount WHERE id=_card.id;
 INSERT INTO public.gift_card_events(card_id,account_id,restaurant_id,kind,amount,bill_no,order_uid,by_user) VALUES(_card.id,_acc,NEW.restaurant_id,'redeem',_amount,NEW.payload->>'billNo',NEW.record_id,auth.uid());
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.link_bill_gift_card() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER restaurant_records_link_gift_card AFTER INSERT OR UPDATE ON public.restaurant_records FOR EACH ROW EXECUTE FUNCTION public.link_bill_gift_card();