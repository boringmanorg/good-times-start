-- "Allot table" on a guest booking is an admin-only action (owner or manager).
-- Also: nobody signed out can call it at all.
DO $$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.allot_guest_reservation(uuid,text)'::regprocedure);
  IF position($s$ARRAY['owner','manager','cashier','captain']::public.restaurant_role[]$s$ IN def) = 0 THEN
    RAISE EXCEPTION 'allot_guest_reservation role check not found';
  END IF;
  def := replace(def, $s$ARRAY['owner','manager','cashier','captain']::public.restaurant_role[]$s$, $s$ARRAY['owner','manager']::public.restaurant_role[]$s$);
  EXECUTE def;
END $$;
REVOKE EXECUTE ON FUNCTION public.allot_guest_reservation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allot_guest_reservation(uuid, text) TO authenticated, service_role;
