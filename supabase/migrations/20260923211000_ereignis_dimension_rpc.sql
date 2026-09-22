create or replace function public.set_incident_event_dimension(p_incident_id uuid, p_dimension text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_event uuid;
  v_old text;
  v_title text;
  v_reported_at timestamptz;
begin
  if v_user is null then raise exception 'Nicht angemeldet'; end if;
  if p_dimension not in ('klein','mittel','gross','katastrophe') then raise exception 'Ungültige Ereignisdimension'; end if;

  select ee.ereignis_id into v_event
  from public.ereignis_einsaetze ee
  where ee.incident_id = p_incident_id;

  if v_event is null then
    if p_dimension = 'klein' then return null; end if;

    select coalesce(nullif(trim(r.location),''), left(r.summary,120)), r.reported_at
    into v_title, v_reported_at
    from public.incident_reports r
    where r.id = p_incident_id;

    if v_title is null then raise exception 'Einsatz nicht gefunden'; end if;

    insert into public.ereignisse(titel,dimension,started_at,created_by)
    values (v_title,p_dimension,v_reported_at,v_user)
    returning id into v_event;

    insert into public.ereignis_einsaetze(ereignis_id,incident_id,linked_by)
    values (v_event,p_incident_id,v_user);

    insert into public.ereignis_verlauf(ereignis_id,aktion,neue_dimension,bemerkung,changed_by)
    values (v_event,'angelegt',p_dimension,'Aus Einsatzmeldung als Ereignis aktiviert.',v_user);

    return v_event;
  end if;

  select e.dimension into v_old from public.ereignisse e where e.id=v_event;
  if v_old = p_dimension then return v_event; end if;

  update public.ereignisse
  set dimension=p_dimension, updated_at=now()
  where id=v_event;

  insert into public.ereignis_verlauf(ereignis_id,aktion,alte_dimension,neue_dimension,changed_by)
  values (v_event,'dimension_geaendert',v_old,p_dimension,v_user);

  return v_event;
end;
$$;

revoke all on function public.set_incident_event_dimension(uuid,text) from public, anon;
grant execute on function public.set_incident_event_dimension(uuid,text) to authenticated;
