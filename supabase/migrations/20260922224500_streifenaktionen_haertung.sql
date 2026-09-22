-- Härtung der schlanken Einsatzaktionen:
-- fremd zugeteilte Einsätze können unterstützt, aber nicht wegübernommen werden.

create or replace function public.take_over_incident(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_vehicle uuid;
  v_assigned uuid;
begin
  if not public.is_operative_duty_today() then raise exception 'Keine operative Tagesfunktion'; end if;
  v_vehicle := public.current_patrol_vehicle();
  if v_vehicle is null then raise exception 'Kein Streifenfahrzeug für den heutigen Dienst zugewiesen'; end if;

  select assigned_vehicle_id into v_assigned
  from public.incident_reports
  where id=p_id and status<>'erledigt';

  if not found then raise exception 'Meldung nicht gefunden oder bereits erledigt'; end if;
  if v_assigned is not null and v_assigned<>v_vehicle then
    raise exception 'Einsatz ist einer anderen Streife zugeteilt; bitte Unterstützen verwenden';
  end if;

  update public.incident_reports
  set taken_over_by=(select auth.uid()), taken_over_at=now(), taken_over_vehicle_id=v_vehicle
  where id=p_id;
end;
$$;

create or replace function public.support_incident(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_vehicle uuid;
begin
  if not public.is_operative_duty_today() then raise exception 'Keine operative Tagesfunktion'; end if;
  v_vehicle := public.current_patrol_vehicle();
  if v_vehicle is null then raise exception 'Kein Streifenfahrzeug zugewiesen'; end if;
  if not exists(select 1 from public.incident_reports where id=p_id and status='offen') then
    raise exception 'Einsatz ist nicht offen';
  end if;
  if exists(select 1 from public.incident_reports where id=p_id and coalesce(taken_over_vehicle_id, assigned_vehicle_id)=v_vehicle) then
    raise exception 'Eigene Streife ist bereits Hauptstreife';
  end if;

  insert into public.incident_supports(incident_id, vehicle_id, started_by)
  values(p_id, v_vehicle, (select auth.uid()))
  on conflict (incident_id, vehicle_id) where ended_at is null do nothing;
end;
$$;

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

  update public.incident_supports
  set ended_at=coalesce(ended_at, now()),
      ended_by=case when ended_at is null then (select auth.uid()) else ended_by end
  where incident_id=p_id and ended_at is null;
end;
$$;
