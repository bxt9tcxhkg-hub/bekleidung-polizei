-- Ein Ereignis blieb bisher "aktiv", selbst wenn alle zugeordneten Einsätze
-- längst erledigt waren - der manuelle "Ereignis abschließen"-Schritt wurde
-- leicht vergessen, sodass alte Ereignisse dauerhaft als "aktiv" im
-- Arbeitsstand der Zentrale gezählt wurden (z. B. Ereignis Flachsweg 4,
-- obwohl sein einziger Einsatz bereits abgeschlossen war). Sobald der
-- letzte noch offene Einsatz eines aktiven Ereignisses auf "erledigt" oder
-- "weitergegeben" gesetzt wird, schließt dieser Trigger das Ereignis
-- automatisch mit ab. "Ereignis wieder öffnen" bleibt weiterhin manuell
-- möglich, falls doch noch ein Einsatz nachgetragen werden muss.
create or replace function public.close_event_when_incidents_done()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_event_status text;
  v_user uuid := auth.uid();
begin
  if new.status = 'offen' or v_user is null then
    return new;
  end if;

  select ereignis_id into v_event_id
  from public.ereignis_einsaetze
  where incident_id = new.id;

  if v_event_id is null then
    return new;
  end if;

  -- Zeilensperre serialisiert gleichzeitiges Abschließen mehrerer Einsätze
  -- desselben Ereignisses.
  select status into v_event_status
  from public.ereignisse
  where id = v_event_id
  for update;

  if v_event_status is distinct from 'aktiv' then
    return new;
  end if;

  if exists (
    select 1
    from public.ereignis_einsaetze ee
    join public.incident_reports ir on ir.id = ee.incident_id
    where ee.ereignis_id = v_event_id
      and ir.status = 'offen'
  ) then
    return new;
  end if;

  update public.ereignisse
  set status = 'abgeschlossen', updated_at = now()
  where id = v_event_id;

  insert into public.ereignis_verlauf(ereignis_id, aktion, bemerkung, changed_by)
  values (v_event_id, 'abgeschlossen', 'Automatisch abgeschlossen: Letzter zugeordneter Einsatz wurde erledigt.', v_user);

  return new;
end;
$$;

revoke all on function public.close_event_when_incidents_done() from public, anon, authenticated;

drop trigger if exists close_event_when_incidents_done on public.incident_reports;
create trigger close_event_when_incidents_done
after update of status on public.incident_reports
for each row
when (old.status is distinct from new.status)
execute function public.close_event_when_incidents_done();

-- Bereits jetzt "aktive" Ereignisse, deren Einsätze schon vollständig
-- erledigt sind, einmalig nachziehen (z. B. das Flachsweg-4-Ereignis).
with abzuschliessende_ereignisse as (
  update public.ereignisse e
  set status = 'abgeschlossen',
      updated_at = now()
  where e.status = 'aktiv'
    and exists (
      select 1 from public.ereignis_einsaetze ee where ee.ereignis_id = e.id
    )
    and not exists (
      select 1
      from public.ereignis_einsaetze ee
      join public.incident_reports ir on ir.id = ee.incident_id
      where ee.ereignis_id = e.id
        and ir.status = 'offen'
    )
  returning e.id, e.created_by
)
insert into public.ereignis_verlauf(ereignis_id, aktion, bemerkung, changed_by)
select id, 'abgeschlossen', 'Automatisch abgeschlossen: Alle zugeordneten Einsätze waren bereits erledigt.', created_by
from abzuschliessende_ereignisse;
