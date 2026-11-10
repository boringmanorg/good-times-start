REVOKE EXECUTE ON FUNCTION public.account_is_live(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_feature(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_is_live(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_feature(uuid, text) TO service_role;