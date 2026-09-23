revoke all on function public._create_marked_test_user(text,text,text,text,text[],text,text[]) from public, anon, authenticated;
grant execute on function public._create_marked_test_user(text,text,text,text,text[],text,text[]) to service_role;

revoke all on function public.wipe_test_data() from public, anon;
grant execute on function public.wipe_test_data() to authenticated, service_role;

revoke all on function public.genehmiger_kette() from public, anon;
grant execute on function public.genehmiger_kette() to authenticated, service_role;
