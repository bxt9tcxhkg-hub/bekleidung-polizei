revoke all on table public.einsatz_namensliste from anon;
revoke truncate, references, trigger on table public.einsatz_namensliste from authenticated;

drop policy if exists "Namensliste lesen" on public.einsatz_namensliste;
create policy "Namensliste lesen"
on public.einsatz_namensliste
for select
to authenticated
using (public.has_portal_area_access('zentrale') or public.is_operative_duty_today());

revoke truncate, references, trigger on table public.incident_reports from authenticated;
revoke truncate, references, trigger, delete on table public.incident_assistance_requests from authenticated;
revoke truncate, references, trigger, update on table public.ereignis_einsaetze from authenticated;
revoke truncate, references, trigger, delete on table public.ereignis_verstaendigungen from authenticated;
revoke truncate, references, trigger on table public.ereignisse from authenticated;
