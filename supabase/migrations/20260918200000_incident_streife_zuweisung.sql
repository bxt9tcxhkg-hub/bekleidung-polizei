-- Eine Meldung kannte bisher nur die grobe Disposition (JD/VD/BP/keine
-- Anfahrt) - keine Zuweisung an eine konkrete Streife (Fahrzeug/Funkruf-
-- name) und keine Möglichkeit für die Streife selbst, sich eine offene
-- Meldung aktiv zuzuteilen ("Übernehmen"). Beides ergänzend zur Disposition,
-- die weiter bestehen bleibt.

alter table public.incident_reports add column assigned_vehicle_id uuid references public.fleet_vehicles(id) on delete set null;
alter table public.incident_reports add column taken_over_by uuid references public.profiles(id) on delete set null;
alter table public.incident_reports add column taken_over_at timestamptz;
create index incident_reports_assigned_vehicle_id_idx on public.incident_reports (assigned_vehicle_id);
comment on column public.incident_reports.assigned_vehicle_id is 'Von der Zentrale zugewiesene Streife (Fahrzeug), zusätzlich zur groben Disposition (JD/VD/BP).';
comment on column public.incident_reports.taken_over_by is 'Beamter/in, der/die die Meldung im Außendienst selbst übernommen hat (über take_over_incident/release_incident_takeover).';

-- assigned_vehicle_id wird von der Zentrale über das normale UPDATE (bestehende
-- Policy "Zentralist bearbeitet Einsatzmeldungen") gesetzt. taken_over_by/-at
-- muss dagegen auch von einer einfachen Streife (nur has_portal_area_access,
-- nicht can_manage_zentrale()/is_zentralist_on_duty()) gesetzt werden können -
-- dafür SECURITY DEFINER-RPCs statt einer Aufweichung der UPDATE-Policy.
create or replace function public.take_over_incident(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_portal_area_access('zentrale') then
    raise exception 'Keine Berechtigung';
  end if;
  update public.incident_reports
  set taken_over_by = (select auth.uid()), taken_over_at = now()
  where id = p_id;
  if not found then
    raise exception 'Meldung nicht gefunden';
  end if;
end;
$$;
revoke all on function public.take_over_incident(uuid) from public, anon;
grant execute on function public.take_over_incident(uuid) to authenticated;

-- Rücknahme: die Person, die übernommen hat, oder die Zentrale selbst.
create or replace function public.release_incident_takeover(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (
    public.can_manage_zentrale()
    or exists (select 1 from public.incident_reports where id = p_id and taken_over_by = (select auth.uid()))
  ) then
    raise exception 'Keine Berechtigung';
  end if;
  update public.incident_reports set taken_over_by = null, taken_over_at = null where id = p_id;
  if not found then
    raise exception 'Meldung nicht gefunden';
  end if;
end;
$$;
revoke all on function public.release_incident_takeover(uuid) from public, anon;
grant execute on function public.release_incident_takeover(uuid) to authenticated;
