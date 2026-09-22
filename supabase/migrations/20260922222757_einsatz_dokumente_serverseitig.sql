create table public.einsatz_dokumente (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incident_reports(id) on delete cascade,
  art text not null check (art in ('ausweis','zmr','abfrage','sonstiges')),
  title text not null,
  file_key text not null unique,
  file_name text not null,
  source text not null check (source in ('zentrale','streife')),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index einsatz_dokumente_incident_idx on public.einsatz_dokumente(incident_id, created_at);
create index einsatz_dokumente_uploaded_by_idx on public.einsatz_dokumente(uploaded_by);

alter table public.einsatz_dokumente enable row level security;

create policy "Einsatzdokumente lesen" on public.einsatz_dokumente
for select to authenticated
using (public.has_portal_area_access('zentrale') or public.is_operative_duty_today());

create policy "Einsatzdokumente anlegen" on public.einsatz_dokumente
for insert to authenticated
with check ((public.has_portal_area_access('zentrale') or public.is_operative_duty_today()) and uploaded_by=(select auth.uid()));

create policy "Einsatzdokumente löschen" on public.einsatz_dokumente
for delete to authenticated
using (public.has_portal_area_access('zentrale') or public.is_operative_duty_today());

revoke all on public.einsatz_dokumente from anon;
grant select,insert,delete on public.einsatz_dokumente to authenticated;
