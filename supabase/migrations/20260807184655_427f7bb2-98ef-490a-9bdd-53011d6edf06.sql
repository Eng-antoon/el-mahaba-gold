REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_audit_log() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merchant_balances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_balances() TO authenticated;
REVOKE ALL ON FUNCTION public.merchant_purity_breakdown(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_purity_breakdown(UUID) TO authenticated;