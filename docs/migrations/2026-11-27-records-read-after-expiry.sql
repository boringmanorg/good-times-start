-- Security (Lovable finding, 27 Nov 2026): members of an expired account could still pull every
-- restaurant record. Owner's decision: after expiry only the owner or a manager may read the
-- records (so the outlet can still recover and export its own data, as the website promises);
-- other staff logins can't. While the plan is live, every member reads as before.
--
-- The check runs once per request (a set-returning helper in an IN), not once per row, so
-- counter syncs stay as fast as before. Super admins read through their own functions.

CREATE OR REPLACE FUNCTION public.readable_restaurant_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT m.restaurant_id
  FROM public.restaurant_members m JOIN public.restaurants r ON r.id = m.restaurant_id
  WHERE m.user_id = auth.uid()
    AND (public.account_is_live(r.account_id) OR m.role IN ('owner', 'manager'))
$$;
REVOKE ALL ON FUNCTION public.readable_restaurant_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.readable_restaurant_ids() TO authenticated;

DROP POLICY IF EXISTS "Members can read shared records" ON public.restaurant_records;
DROP POLICY IF EXISTS "members read records" ON public.restaurant_records;
CREATE POLICY "members read records while live; owners after expiry" ON public.restaurant_records
  FOR SELECT TO authenticated
  USING (restaurant_id IN (SELECT public.readable_restaurant_ids()));
