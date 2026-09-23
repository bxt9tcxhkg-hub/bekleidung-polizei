drop policy if exists "Organisation stellt Unterstützungsanfrage" on public.incident_assistance_requests;
create policy "Zentrale oder Streife legt Unterstützungsbedarf an"
on public.incident_assistance_requests for insert
to authenticated
with check (
  requested_by = (select auth.uid())
  and target_organisation = 'Stadtpolizei'
  and (
    (
      requester_organisation = 'Stadtpolizei'
      and (is_operative_duty_today() or has_portal_area_access('zentrale'))
    )
    or (
      requester_organisation in ('Feuerwehr','Krisenstab')
      and (can_manage_zentrale() or is_zentralist_on_duty())
    )
  )
);

drop policy if exists "Unterstützungsanfragen lesen" on public.incident_assistance_requests;
create policy "Unterstützungsanfragen lesen"
on public.incident_assistance_requests for select
to authenticated
using (
  has_portal_area_access('zentrale')
  or is_operative_duty_today()
  or requested_by = (select auth.uid())
);
