-- The website's anonymous read of the price catalogue fails: the plans policy calls
-- is_platform_admin(), which anon may no longer execute, so every visitor gets
-- "permission denied" and the site falls back to its compiled prices.
-- Split the policy: anyone reads active plans; super admins (signed in) also read inactive ones.
DROP POLICY IF EXISTS "anyone reads plans" ON public.plans;
CREATE POLICY "anyone reads active plans" ON public.plans FOR SELECT TO anon, authenticated USING (active);
CREATE POLICY "platform admins read all plans" ON public.plans FOR SELECT TO authenticated USING (is_platform_admin());
