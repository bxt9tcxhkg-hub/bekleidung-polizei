create table if not exists public.ereignis_dokumente (
  id uuid primary key default gen_random_uuid(),
  ereignis_id uuid not null references public.ereignisse(id) on delete cascade,
  art text not null check (art in ('zmr','abfrage','sonstiges')),
  title text not null,
  file_key text not null unique,
  file_name text not null,
  source_organisation text not null default 'Stadtpolizei'
    check (source_organisation in ('Stadtpolizei','Feuerwehr','Krisenstab')),
  target_organisation text
    check (target_organisation is null or target_organisation in ('Stadtpolizei','Feuerwehr','Krisenstab')),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists ereignis_dokumente_ereignis_created_idx
  on public.ereignis_dokumente(ereignis_id, created_at);
create index if not exists ereignis_dokumente_target_idx
  on public.ereignis_dokumente(target_organisation, created_at desc);
create index if not exists ereignis_dokumente_uploaded_by_idx
  on public.ereignis_dokumente(uploaded_by);

alter table public.ereignis_dokumente enable row level security;

drop policy if exists "Ereignisdokumente lesen" on public.ereignis_dokumente;
create policy "Ereignisdokumente lesen"
on public.ereignis_dokumente for select
to authenticated
using (
  has_portal_area_access('zentrale')
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active = true
      and p.organisation in ('Feuerwehr','Krisenstab')
      and (target_organisation is null or target_organisation = p.organisation or source_organisation = p.organisation)
  )
);

drop policy if exists "Zentrale erstellt Ereignisdokumente" on public.ereignis_dokumente;
create policy "Zentrale erstellt Ereignisdokumente"
on public.ereignis_dokumente for insert
to authenticated
with check (
  (can_manage_zentrale() or is_zentralist_on_duty())
  and source_organisation = 'Stadtpolizei'
  and uploaded_by = (select auth.uid())
);

drop policy if exists "Zentrale löscht Ereignisdokumente" on public.ereignis_dokumente;
create policy "Zentrale löscht Ereignisdokumente"
on public.ereignis_dokumente for delete
to authenticated
using (can_manage_zentrale() or is_zentralist_on_duty());

revoke all on public.ereignis_dokumente from anon;
revoke all on public.ereignis_dokumente from authenticated;
grant select, insert, delete on public.ereignis_dokumente to authenticated;

alter table public.incident_assistance_requests
  add column if not exists result_event_document_id uuid references public.ereignis_dokumente(id) on delete set null;

create index if not exists incident_assistance_requests_result_event_document_idx
  on public.incident_assistance_requests(result_event_document_id)
  where result_event_document_id is not null;
