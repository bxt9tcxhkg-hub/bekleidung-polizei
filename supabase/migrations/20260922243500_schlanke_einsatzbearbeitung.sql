-- Schlanke Zentrale-Bearbeitung:
-- neue Meldungen können offen bleiben oder durch Zentrale / eigene Streife / BP bearbeitet werden.

alter table public.incident_reports drop constraint if exists incident_reports_disposition_check;
alter table public.incident_reports add constraint incident_reports_disposition_check
  check (disposition in ('offen','zentrale','jd','vd','bp','keine_anfahrt'));

alter table public.incident_reports alter column disposition set default 'offen';

create or replace function public.take_over_incident(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_vehicle uuid;
  v_assigned uuid;
  v_function text;
begin
  if not public.is_operative_duty_today() then raise exception 'Keine operative Tagesfunktion'; end if;
  v_vehicle := public.current_patrol_vehicle();
  if v_vehicle is null then raise exception 'Kein Streifenfahrzeug für den heutigen Dienst zugewiesen'; end if;

  select d.function into v_function
  from public.duty_assignments d
  where d.user_id=(select auth.uid())
    and d.duty_date=public.operational_today()
    and d.function in ('jd','vd')
    and d.vehicle_id=v_vehicle
  order by case when d.shift='nacht' then 0 else 1 end
  limit 1;

  select assigned_vehicle_id into v_assigned
  from public.incident_reports
  where id=p_id and status='offen';

  if not found then raise exception 'Meldung nicht gefunden oder nicht offen'; end if;
  if v_assigned is not null and v_assigned<>v_vehicle then
    raise exception 'Einsatz ist einer anderen Streife zugeteilt; bitte Unterstützen verwenden';
  end if;

  update public.incident_reports
  set taken_over_by=(select auth.uid()),
      taken_over_at=now(),
      taken_over_vehicle_id=v_vehicle,
      disposition=case
        when assigned_vehicle_id is null and disposition='offen' and v_function in ('jd','vd') then v_function
        else disposition
      end
  where id=p_id;
end;
$$;
revoke all on function public.take_over_incident(uuid) from public, anon;
grant execute on function public.take_over_incident(uuid) to authenticated;

create or replace function public.release_incident_takeover(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_vehicle uuid;
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
  set taken_over_by=null,
      taken_over_at=null,
      taken_over_vehicle_id=null,
      disposition=case
        when assigned_vehicle_id is null and disposition in ('jd','vd') then 'offen'
        else disposition
      end
  where id=p_id;
  if not found then raise exception 'Meldung nicht gefunden'; end if;
end;
$$;
revoke all on function public.release_incident_takeover(uuid) from public, anon;
grant execute on function public.release_incident_takeover(uuid) to authenticated;
