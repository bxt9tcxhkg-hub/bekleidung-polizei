create or replace function public.link_incident_to_event(p_incident_id uuid, p_event_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
begin
  if v_user is null then raise exception 'Nicht angemeldet'; end if;

  select e.status into v_status
  from public.ereignisse e
  where e.id = p_event_id;

  if v_status is null then raise exception 'Ereignis nicht gefunden'; end if;
  if v_status <> 'aktiv' then raise exception 'Nur aktive Ereignisse können weitere Einsätze aufnehmen'; end if;

  insert into public.ereignis_einsaetze(ereignis_id, incident_id, linked_by)
  values (p_event_id, p_incident_id, v_user);

  insert into public.ereignis_verlauf(ereignis_id, aktion, bemerkung, changed_by)
  values (p_event_id, 'einsatz_zugeordnet', p_incident_id::text, v_user);

  return p_event_id;
end;
$$;

revoke all on function public.link_incident_to_event(uuid, uuid) from public, anon;
grant execute on function public.link_incident_to_event(uuid, uuid) to authenticated;

create or replace function public.unlink_incident_from_event(p_incident_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_event uuid;
begin
  if v_user is null then raise exception 'Nicht angemeldet'; end if;

  select ee.ereignis_id into v_event
  from public.ereignis_einsaetze ee
  where ee.incident_id = p_incident_id;

  if v_event is null then raise exception 'Einsatz ist keinem Ereignis zugeordnet'; end if;

  delete from public.ereignis_einsaetze
  where incident_id = p_incident_id;

  insert into public.ereignis_verlauf(ereignis_id, aktion, bemerkung, changed_by)
  values (v_event, 'einsatz_entfernt', p_incident_id::text, v_user);

  return v_event;
end;
$$;

revoke all on function public.unlink_incident_from_event(uuid) from public, anon;
grant execute on function public.unlink_incident_from_event(uuid) to authenticated;

create or replace function public.set_event_status(p_event_id uuid, p_status text)
returns public.ereignisse
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_event public.ereignisse;
begin
  if v_user is null then raise exception 'Nicht angemeldet'; end if;
  if p_status not in ('aktiv', 'abgeschlossen') then raise exception 'Ungültiger Ereignisstatus'; end if;

  update public.ereignisse
  set status = p_status,
      updated_by = v_user,
      updated_at = now()
  where id = p_event_id
  returning * into v_event;

  if v_event.id is null then raise exception 'Ereignis nicht gefunden oder keine Berechtigung'; end if;

  insert into public.ereignis_verlauf(ereignis_id, aktion, bemerkung, changed_by)
  values (
    p_event_id,
    case when p_status = 'abgeschlossen' then 'abgeschlossen' else 'wieder_geoeffnet' end,
    null,
    v_user
  );

  return v_event;
end;
$$;

revoke all on function public.set_event_status(uuid, text) from public, anon;
grant execute on function public.set_event_status(uuid, text) to authenticated;
