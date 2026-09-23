create table if not exists public.incident_assistance_requests (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incident_reports(id) on delete cascade,
  request_type text not null check (request_type in ('personenabfrage','zmr','fahrzeugabfrage','sonstiges')),
  status text not null default 'offen' check (status in ('offen','in_bearbeitung','erledigt','storniert')),
  request_text text,
  subject_data jsonb not null default '{}'::jsonb,
  source_document_id uuid references public.einsatz_dokumente(id) on delete set null,
  result_text text,
  result_document_id uuid references public.einsatz_dokumente(id) on delete set null,
  response_channel text check (response_channel is null or response_channel in ('funk','telefon','portal')),
  requested_by uuid not null references public.profiles(id),
  requested_vehicle_id uuid references public.fleet_vehicles(id) on delete set null,
  requested_at timestamptz not null default now(),
  handled_by uuid references public.profiles(id),
  handled_at timestamptz,
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists incident_assistance_requests_incident_status_idx
  on public.incident_assistance_requests(incident_id,status,requested_at desc);
create index if not exists incident_assistance_requests_status_requested_idx
  on public.incident_assistance_requests(status,requested_at desc);

alter table public.incident_assistance_requests enable row level security;

drop policy if exists "Unterstützungsanfragen lesen" on public.incident_assistance_requests;
create policy "Unterstützungsanfragen lesen"
on public.incident_assistance_requests for select
to authenticated
using (has_portal_area_access('zentrale') or is_operative_duty_today());

drop policy if exists "Streife stellt Unterstützungsanfrage" on public.incident_assistance_requests;
create policy "Streife stellt Unterstützungsanfrage"
on public.incident_assistance_requests for insert
to authenticated
with check (
  (is_operative_duty_today() or has_portal_area_access('zentrale'))
  and requested_by = (select auth.uid())
);

drop policy if exists "Zentrale bearbeitet Unterstützungsanfragen" on public.incident_assistance_requests;
create policy "Zentrale bearbeitet Unterstützungsanfragen"
on public.incident_assistance_requests for update
to authenticated
using (can_manage_zentrale() or is_zentralist_on_duty())
with check (can_manage_zentrale() or is_zentralist_on_duty());

grant select, insert, update on public.incident_assistance_requests to authenticated;
revoke all on public.incident_assistance_requests from anon;
