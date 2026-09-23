alter table public.incident_assistance_requests
  add column if not exists ereignis_id uuid references public.ereignisse(id) on delete cascade,
  add column if not exists requester_organisation text not null default 'Stadtpolizei',
  add column if not exists target_organisation text not null default 'Stadtpolizei';

alter table public.incident_assistance_requests
  alter column incident_id drop not null;

update public.incident_assistance_requests
set requester_organisation = 'Stadtpolizei',
    target_organisation = 'Stadtpolizei'
where requester_organisation is distinct from 'Stadtpolizei'
   or target_organisation is distinct from 'Stadtpolizei';

alter table public.incident_assistance_requests
  drop constraint if exists incident_assistance_requests_requester_organisation_check,
  add constraint incident_assistance_requests_requester_organisation_check
    check (requester_organisation in ('Stadtpolizei','Feuerwehr','Krisenstab')),
  drop constraint if exists incident_assistance_requests_target_organisation_check,
  add constraint incident_assistance_requests_target_organisation_check
    check (target_organisation = 'Stadtpolizei'),
  drop constraint if exists incident_assistance_requests_context_check,
  add constraint incident_assistance_requests_context_check
    check (incident_id is not null or ereignis_id is not null);

create index if not exists incident_assistance_requests_ereignis_status_idx
  on public.incident_assistance_requests(ereignis_id,status,requested_at desc)
  where ereignis_id is not null;

create index if not exists incident_assistance_requests_requester_org_status_idx
  on public.incident_assistance_requests(requester_organisation,status,requested_at desc);

drop policy if exists "Unterstützungsanfragen lesen" on public.incident_assistance_requests;
create policy "Unterstützungsanfragen lesen"
on public.incident_assistance_requests for select
to authenticated
using (
  has_portal_area_access('zentrale')
  or is_operative_duty_today()
  or requested_by = (select auth.uid())
  or (
    requester_organisation in ('Feuerwehr','Krisenstab')
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.active = true
        and p.organisation = requester_organisation
    )
  )
);

drop policy if exists "Streife stellt Unterstützungsanfrage" on public.incident_assistance_requests;
drop policy if exists "Organisation stellt Unterstützungsanfrage" on public.incident_assistance_requests;
create policy "Organisation stellt Unterstützungsanfrage"
on public.incident_assistance_requests for insert
to authenticated
with check (
  requested_by = (select auth.uid())
  and target_organisation = 'Stadtpolizei'
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active = true
      and (
        (p.organisation = 'Stadtpolizei' and requester_organisation = 'Stadtpolizei' and (is_operative_duty_today() or has_portal_area_access('zentrale')))
        or (p.organisation = 'Feuerwehr' and requester_organisation = 'Feuerwehr')
        or (p.organisation = 'Krisenstab' and requester_organisation = 'Krisenstab')
      )
  )
);

drop policy if exists "Zentrale bearbeitet Unterstützungsanfragen" on public.incident_assistance_requests;
create policy "Zentrale bearbeitet Unterstützungsanfragen"
on public.incident_assistance_requests for update
to authenticated
using (can_manage_zentrale() or is_zentralist_on_duty())
with check (
  (can_manage_zentrale() or is_zentralist_on_duty())
  and target_organisation = 'Stadtpolizei'
);
