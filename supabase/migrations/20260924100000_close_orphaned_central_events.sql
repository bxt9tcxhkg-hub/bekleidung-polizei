-- Ältere Ereignisse können ohne Einsatzzuordnung aktiv geblieben sein,
-- wenn die Einsatzmeldung vor Einführung der automatischen Bereinigung
-- gelöscht oder die letzte Zuordnung manuell gelöst wurde.
-- Historie und Dokumente bleiben erhalten; nur offene Arbeit wird beendet.
with verwaiste_ereignisse as (
  update public.ereignisse e
  set status = 'abgeschlossen',
      updated_at = now()
  where e.status = 'aktiv'
    and not exists (
      select 1
      from public.ereignis_einsaetze ee
      where ee.ereignis_id = e.id
    )
  returning e.id, e.created_by
)
insert into public.ereignis_verlauf
  (ereignis_id, aktion, bemerkung, changed_by)
select
  id,
  'abgeschlossen',
  'Automatisch abgeschlossen: Kein Einsatz mehr zugeordnet.',
  created_by
from verwaiste_ereignisse;
