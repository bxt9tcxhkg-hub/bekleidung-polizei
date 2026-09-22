revoke all on public.einsatz_dokumente from anon;
revoke all on public.einsatz_dokumente from authenticated;
grant select,insert,delete on public.einsatz_dokumente to authenticated;
