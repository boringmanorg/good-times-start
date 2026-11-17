DROP POLICY IF EXISTS "members write records" ON public.restaurant_records;
CREATE POLICY "members write records" ON public.restaurant_records FOR INSERT TO authenticated
WITH CHECK (
  public.is_member(restaurant_id, auth.uid()) AND (
    kind <> ALL (ARRAY['settings','menu','material','supplier'])
    OR public.is_restaurant_admin_of(restaurant_id)
    OR (kind = 'material' AND public.has_restaurant_role(restaurant_id, auth.uid(), ARRAY['cashier']::public.restaurant_role[]))
  )
);