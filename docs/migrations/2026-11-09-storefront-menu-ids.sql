-- Guest menu: every dish carries its record id. Eight menu records saved on 6 Nov have only
-- name/price/category in their payload (no id), so the guest page counted them all as one dish.
DO $mig$
DECLARE d text := pg_get_functiondef('public.public_storefront(text)'::regprocedure);
  old1 text := $o$(m.payload - 'recipe' - 'stockTracked' - 'prices') || jsonb_build_object(
        'takeawayPrice',$o$;
BEGIN
  IF position(old1 IN d) = 0 THEN RAISE EXCEPTION 'public_storefront changed'; END IF;
  EXECUTE replace(d, old1, $n$(m.payload - 'recipe' - 'stockTracked' - 'prices') || jsonb_build_object(
        'id', m.record_id,
        'takeawayPrice',$n$);
END $mig$;
