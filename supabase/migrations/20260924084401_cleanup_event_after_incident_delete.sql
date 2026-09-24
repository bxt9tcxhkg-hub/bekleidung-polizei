-- Ereignisse ohne verbleibenden Einsatz nach dem Löschen einer Einsatzmeldung
-- in derselben Transaktion entfernen. Die abhängigen Verständigungen,
-- Entscheidungen und Verlaufsdaten folgen dem bestehenden ON DELETE CASCADE.
create or replace function public.cleanup_event_after_incident_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Beim manuellen Lösen einer Zuordnung oder beim Löschen des Ereignisses
  -- selbst darf das Ereignis nicht automatisch verschwinden.
  if exists (
    select 1 from public.incident_reports
    where id = old.incident_id
  ) then
    return old;
  end if;

  -- Die Zeilensperre serialisiert gleichzeitige Löschungen mehrerer Einsätze
  -- desselben Ereignisses. Andere verknüpfte Einsätze behalten ihr Ereignis.
  perform 1 from public.ereignisse
  where id = old.ereignis_id
  for update;

  if found and not exists (
    select 1 from public.ereignis_einsaetze
    where ereignis_id = old.ereignis_id
  ) then
    delete from public.ereignisse
    where id = old.ereignis_id;
  end if;

  return old;
end;
$$;

revoke all on function public.cleanup_event_after_incident_delete() from public, anon, authenticated;

create trigger cleanup_event_after_incident_delete
after delete on public.ereignis_einsaetze
for each row execute function public.cleanup_event_after_incident_delete();
