-- Operative Fahrzeuglogik und streifenbasierte Einsatzaktionen.
-- Ziel: möglichst wenig Klicks. Fahrzeug wird bei JD/VD automatisch sinnvoll
-- vorgeschlagen, bleibt aber pro Dienst manuell änderbar. Einsatzaktionen
-- werden streifen-/fahrzeugbezogen nachvollziehbar.

alter table public.fleet_vehicles
  add column if not exists operational_status text not null default 'verfuegbar'
    check (operational_status in ('verfuegbar','werkstatt','ausser_dienst')),
  add column if not exists operational_status_note text
    check (operational_status_note is null or length(operational_status_note) <= 500);

comment on column public.fleet_vehicles.operational_status is
  'Operative Verfügbarkeit für die Diensteinteilung: verfuegbar, werkstatt oder ausser_dienst.';

create table if not exists public.duty_vehicle_defaults (
  function_code text not null references public.duty_functions(code) on delete cascade,
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
  priority integer not null default 100 check (priority between 1 and 999),
  created_at timestamptz not null default now(),
  primary key (function_code, vehicle_id)
);

alter table public.duty_vehicle_defaults enable row level security;
revoke all on table public.duty_vehicle_defaults from public, anon;
grant select, insert, update, delete on table public.duty_vehicle_defaults to authenticated;

drop policy if exists "Dienstfahrzeug-Standards lesen" on public.duty_vehicle_defaults;
create policy "Dienstfahrzeug-Standards lesen"
on public.duty_vehicle_defaults for select to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.active));

drop policy if exists "Dienstfahrzeug-Standards verwalten" on public.duty_vehicle_defaults;
create policy "Dienstfahrzeug-Standards verwalten"
on public.duty_vehicle_defaults for all to authenticated
using (public.can_manage_fuhrpark() or public.can_manage_zentrale())
with check (public.can_manage_fuhrpark() or public.can_manage_zentrale());

-- Initiale JD-Reihenfolge nach den bestehenden Funkrufnamen. Wenn die
-- Fahrzeuge noch anders benannt sind, bleibt die Tabelle einfach leer und
-- kann später im Fuhrpark gepflegt werden.
insert into public.duty_vehicle_defaults(function_code, vehicle_id, priority)
select 'jd', v.id,
       case
         when lower(coalesce(v.call_sign,'')) like '%peter 1%' or lower(v.name) like '%vito%' then 10
         when lower(coalesce(v.call_sign,'')) like '%peter 2%' or lower(v.name) like '%tiguan%' then 20
         else 100
       end
from public.fleet_vehicles v
where v.active
  and (
    lower(coalesce(v.call_sign,'')) like '%peter 1%'
    or lower(v.call_sign) like '%peter 2%'
    or lower(v.name) like '%vito%'
    or lower(v.name) like '%tiguan%'
  )
on conflict (function_code, vehicle_id) do update set priority=excluded.priority;

create or replace function public.suggest_duty_vehicle(p_function text)
returns uuid
language sql
stable
security definer
set search_path=public
as $$
  select v.id
  from public.duty_vehicle_defaults d
  join public.fleet_vehicles v on v.id=d.vehicle_id
  where d.function_code=p_function
    and v.active
    and v.operational_status='verfuegbar'
  order by d.priority, v.name
  limit 1;
$$;
revoke all on function public.suggest_duty_vehicle(text) from public, anon;
grant execute on function public.suggest_duty_vehicle(text) to authenticated;

alter table public.incident_reports
  add column if not exists taken_over_vehicle_id uuid references public.fleet_vehicles(id) on delete set null,
  add column if not exists completed_by uuid references public.profiles(id) on delete set null,
  add column if not exists completed_at timestamptz;

create index if not exists incident_reports_taken_over_vehicle_idx
  on public.incident_reports(taken_over_vehicle_id);

create table if not exists public.incident_supports (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incident_reports(id) on delete cascade,
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
  started_by uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_by uuid references public.profiles(id) on delete set null,
  ended_at timestamptz
);
create unique index if not exists incident_supports_one_active_vehicle
  on public.incident_supports(incident_id, vehicle_id) where ended_at is null;
create index if not exists incident_supports_incident_idx on public.incident_supports(incident_id, started_at);

alter table public.incident_supports enable row level security;
revoke all on table public.incident_supports from public, anon;
grant select on table public.incident_supports to authenticated;

drop policy if exists "Einsatzunterstützung lesen" on public.incident_supports;
create policy "Einsatzunterstützung lesen"
on public.incident_supports for select to authenticated
using (public.has_portal_area_access('zentrale') or public.is_operative_duty_today());

create or replace function public.current_patrol_vehicle()
returns uuid
language sql
stable
security definer
set search_path=public
as $$
  select d.vehicle_id
  from public.duty_assignments d
  where d.user_id=(select auth.uid())
    and d.duty_date=public.operational_today()
    and d.function in ('jd','vd')
    and d.vehicle_id is not null
  order by case when d.shift='nacht' then 0 else 1 end
  limit 1;
$$;
revoke all on function public.current_patrol_vehicle() from public, anon;
grant execute on function public.current_patrol_vehicle() to authenticated;

create or replace function public.take_over_incident(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_vehicle uuid;
begin
  if not public.is_operative_duty_today() then raise exception 'Keine operative Tagesfunktion'; end if;
  v_vehicle := public.current_patrol_vehicle();
  if v_vehicle is null then raise exception 'Kein Streifenfahrzeug für den heutigen Dienst zugewiesen'; end if;

  update public.incident_reports
  set taken_over_by=(select auth.uid()), taken_over_at=now(), taken_over_vehicle_id=v_vehicle
  where id=p_id and status<>'erledigt';
  if not found then raise exception 'Meldung nicht gefunden oder bereits erledigt'; end if;
end;
$$;
revoke all on function public.take_over_incident(uuid) from public, anon;
grant execute on function public.take_over_incident(uuid) to authenticated;

create or replace function public.release_incident_takeover(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_vehicle uuid;
begin
  v_vehicle := public.current_patrol_vehicle();
  if not (
    public.can_manage_zentrale()
    or exists (
      select 1 from public.incident_reports
      where id=p_id
        and (taken_over_by=(select auth.uid()) or taken_over_vehicle_id=v_vehicle)
    )
  ) then raise exception 'Keine Berechtigung'; end if;

  update public.incident_reports
  set taken_over_by=null, taken_over_at=null, taken_over_vehicle_id=null
  where id=p_id;
  if not found then raise exception 'Meldung nicht gefunden'; end if;
end;
$$;
revoke all on function public.release_incident_takeover(uuid) from public, anon;
grant execute on function public.release_incident_takeover(uuid) to authenticated;

create or replace function public.support_incident(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_vehicle uuid;
begin
  if not public.is_operative_duty_today() then raise exception 'Keine operative Tagesfunktion'; end if;
  v_vehicle := public.current_patrol_vehicle();
  if v_vehicle is null then raise exception 'Kein Streifenfahrzeug zugewiesen'; end if;
  if exists(select 1 from public.incident_reports where id=p_id and assigned_vehicle_id=v_vehicle) then
    raise exception 'Eigene Streife ist bereits Hauptstreife';
  end if;
  insert into public.incident_supports(incident_id, vehicle_id, started_by)
  values(p_id, v_vehicle, (select auth.uid()))
  on conflict (incident_id, vehicle_id) where ended_at is null do nothing;
end;
$$;
revoke all on function public.support_incident(uuid) from public, anon;
grant execute on function public.support_incident(uuid) to authenticated;

create or replace function public.stop_supporting_incident(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_vehicle uuid;
begin
  v_vehicle := public.current_patrol_vehicle();
  update public.incident_supports
  set ended_at=now(), ended_by=(select auth.uid())
  where incident_id=p_id and vehicle_id=v_vehicle and ended_at is null;
  if not found then raise exception 'Keine aktive Unterstützung gefunden'; end if;
end;
$$;
revoke all on function public.stop_supporting_incident(uuid) from public, anon;
grant execute on function public.stop_supporting_incident(uuid) to authenticated;

create or replace function public.complete_incident(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_vehicle uuid;
begin
  v_vehicle := public.current_patrol_vehicle();
  if not (
    public.can_manage_zentrale()
    or exists (
      select 1 from public.incident_reports
      where id=p_id
        and (
          assigned_vehicle_id=v_vehicle
          or taken_over_vehicle_id=v_vehicle
          or taken_over_by=(select auth.uid())
        )
    )
  ) then raise exception 'Nur die Hauptstreife oder Zentrale kann den Einsatz erledigen'; end if;

  update public.incident_reports
  set status='erledigt', completed_at=now(), completed_by=(select auth.uid())
  where id=p_id;
  if not found then raise exception 'Meldung nicht gefunden'; end if;
end;
$$;
revoke all on function public.complete_incident(uuid) from public, anon;
grant execute on function public.complete_incident(uuid) to authenticated;

create or replace function public.reopen_incident(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_vehicle uuid;
begin
  v_vehicle := public.current_patrol_vehicle();
  if not (
    public.can_manage_zentrale()
    or exists (
      select 1 from public.incident_reports
      where id=p_id
        and (
          assigned_vehicle_id=v_vehicle
          or taken_over_vehicle_id=v_vehicle
          or completed_by=(select auth.uid())
        )
    )
  ) then raise exception 'Keine Berechtigung'; end if;

  update public.incident_reports
  set status='offen', completed_at=null, completed_by=null
  where id=p_id;
  if not found then raise exception 'Meldung nicht gefunden'; end if;
end;
$$;
revoke all on function public.reopen_incident(uuid) from public, anon;
grant execute on function public.reopen_incident(uuid) to authenticated;
