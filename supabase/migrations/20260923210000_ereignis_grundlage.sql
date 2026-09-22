create table public.ereignisse (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  dimension text not null default 'klein' check (dimension in ('klein','mittel','gross','katastrophe')),
  status text not null default 'aktiv' check (status in ('aktiv','abgeschlossen')),
  lage text,
  started_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ereignis_einsaetze (
  ereignis_id uuid not null references public.ereignisse(id) on delete cascade,
  incident_id uuid not null references public.incident_reports(id) on delete cascade,
  linked_by uuid not null references public.profiles(id),
  linked_at timestamptz not null default now(),
  primary key (ereignis_id, incident_id),
  unique (incident_id)
);
create index ereignis_einsaetze_ereignis_idx on public.ereignis_einsaetze(ereignis_id);

create table public.ereignis_verlauf (
  id uuid primary key default gen_random_uuid(),
  ereignis_id uuid not null references public.ereignisse(id) on delete cascade,
  aktion text not null,
  alte_dimension text check (alte_dimension is null or alte_dimension in ('klein','mittel','gross','katastrophe')),
  neue_dimension text check (neue_dimension is null or neue_dimension in ('klein','mittel','gross','katastrophe')),
  bemerkung text,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now()
);
create index ereignis_verlauf_ereignis_zeit_idx on public.ereignis_verlauf(ereignis_id, changed_at desc);

create table public.ereignis_verstaendigungen (
  id uuid primary key default gen_random_uuid(),
  ereignis_id uuid not null references public.ereignisse(id) on delete cascade,
  empfaenger_key text not null,
  empfaenger_label text not null,
  versucht_at timestamptz,
  erreicht_at timestamptz,
  bemerkung text,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (ereignis_id, empfaenger_key),
  check (erreicht_at is null or versucht_at is not null)
);
create index ereignis_verstaendigungen_ereignis_idx on public.ereignis_verstaendigungen(ereignis_id);

alter table public.ereignisse enable row level security;
alter table public.ereignis_einsaetze enable row level security;
alter table public.ereignis_verlauf enable row level security;
alter table public.ereignis_verstaendigungen enable row level security;

create policy "Ereignisse lesen" on public.ereignisse for select to authenticated
using (public.has_portal_area_access('zentrale') or public.is_operative_duty_today());
create policy "Ereignisse anlegen" on public.ereignisse for insert to authenticated
with check ((public.can_manage_zentrale() or public.is_zentralist_on_duty()) and created_by=(select auth.uid()));
create policy "Ereignisse ändern" on public.ereignisse for update to authenticated
using (public.can_manage_zentrale() or public.is_zentralist_on_duty())
with check (public.can_manage_zentrale() or public.is_zentralist_on_duty());
create policy "Ereignisse löschen" on public.ereignisse for delete to authenticated
using (public.can_manage_zentrale() or public.is_zentralist_on_duty());

create policy "Ereigniszuordnung lesen" on public.ereignis_einsaetze for select to authenticated
using (public.has_portal_area_access('zentrale') or public.is_operative_duty_today());
create policy "Ereigniszuordnung anlegen" on public.ereignis_einsaetze for insert to authenticated
with check ((public.can_manage_zentrale() or public.is_zentralist_on_duty()) and linked_by=(select auth.uid()));
create policy "Ereigniszuordnung löschen" on public.ereignis_einsaetze for delete to authenticated
using (public.can_manage_zentrale() or public.is_zentralist_on_duty());

create policy "Ereignisverlauf lesen" on public.ereignis_verlauf for select to authenticated
using (public.has_portal_area_access('zentrale') or public.is_operative_duty_today());
create policy "Ereignisverlauf anlegen" on public.ereignis_verlauf for insert to authenticated
with check ((public.can_manage_zentrale() or public.is_zentralist_on_duty()) and changed_by=(select auth.uid()));

create policy "Verstaendigungen lesen" on public.ereignis_verstaendigungen for select to authenticated
using (public.has_portal_area_access('zentrale') or public.is_operative_duty_today());
create policy "Verstaendigungen anlegen" on public.ereignis_verstaendigungen for insert to authenticated
with check ((public.can_manage_zentrale() or public.is_zentralist_on_duty()) and updated_by=(select auth.uid()));
create policy "Verstaendigungen ändern" on public.ereignis_verstaendigungen for update to authenticated
using (public.can_manage_zentrale() or public.is_zentralist_on_duty())
with check ((public.can_manage_zentrale() or public.is_zentralist_on_duty()) and updated_by=(select auth.uid()));

revoke all on public.ereignisse, public.ereignis_einsaetze, public.ereignis_verlauf, public.ereignis_verstaendigungen from anon;
grant select,insert,update,delete on public.ereignisse to authenticated;
grant select,insert,delete on public.ereignis_einsaetze to authenticated;
grant select,insert on public.ereignis_verlauf to authenticated;
grant select,insert,update on public.ereignis_verstaendigungen to authenticated;

create temporary table _ereignis_migration on commit drop as
select
  r.id as incident_id,
  gen_random_uuid() as ereignis_id,
  case
    when r.note ~ '^STUFE:mittel' then 'mittel'
    when r.note ~ '^STUFE:gross' then 'gross'
    when r.note ~ '^STUFE:katastrophe' then 'katastrophe'
  end as dimension,
  r.created_by,
  r.reported_at,
  coalesce(nullif(trim(r.location),''), left(r.summary, 120)) as titel
from public.incident_reports r
where r.note ~ '^STUFE:(mittel|gross|katastrophe)(\n|$)';

insert into public.ereignisse(id,titel,dimension,started_at,created_by,created_at,updated_at)
select ereignis_id,titel,dimension,reported_at,created_by,now(),now() from _ereignis_migration;

insert into public.ereignis_einsaetze(ereignis_id,incident_id,linked_by,linked_at)
select ereignis_id,incident_id,created_by,now() from _ereignis_migration;

insert into public.ereignis_verlauf(ereignis_id,aktion,neue_dimension,bemerkung,changed_by,changed_at)
select ereignis_id,'migration',dimension,'Aus bisherigem STUFE-Marker der Einsatznotiz migriert.',created_by,now()
from _ereignis_migration;

update public.incident_reports
set note = nullif(regexp_replace(note, '^STUFE:(mittel|gross|katastrophe)\n?', ''), '')
where note ~ '^STUFE:(mittel|gross|katastrophe)(\n|$)';
