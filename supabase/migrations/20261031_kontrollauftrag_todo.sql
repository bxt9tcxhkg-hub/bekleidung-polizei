-- Kontrollaufträge sollen für die Streife eine To-do-Liste sein: mit einem
-- Klick erledigt markierbar. Die dabei gespeicherte Uhrzeit ist keine
-- Nachweis-Uhrzeit, sondern nur eine Gedankenstütze für die spätere
-- Protokollierung im PAD.
--
-- Bisher durfte ausschließlich der Genehmiger einen Kontrollauftrag
-- überhaupt ändern (siehe Policy "Zentrale Einträge ändern"). Jetzt darf
-- zusätzlich jeder mit Außendienst-Zugriff den Erledigt-Status umschalten -
-- aber ausschließlich diesen, nicht Titel/Beschreibung/Zielfunktion etc.,
-- die weiterhin Sache des Genehmigers bleiben, der den Auftrag erteilt hat.
-- Das erzwingt der Trigger unten, weil RLS selbst keine Spalten einschränken kann.

alter table public.zentrale_entries add column erledigt_at timestamptz;

drop policy "Zentrale Einträge ändern" on public.zentrale_entries;
create policy "Zentrale Einträge ändern" on public.zentrale_entries for update
  using (
    (category = 'kontrollauftrag' and (is_genehmiger() or has_portal_area_access('aussendienst')))
    or (category <> 'kontrollauftrag' and can_manage_zentrale())
  )
  with check (
    (category = 'kontrollauftrag' and (is_genehmiger() or has_portal_area_access('aussendienst')))
    or (category <> 'kontrollauftrag' and can_manage_zentrale())
  );

create or replace function public.enforce_kontrollauftrag_todo_only()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.category = 'kontrollauftrag' and not public.is_genehmiger() then
    if new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.location is distinct from old.location
      or new.responsible is distinct from old.responsible
      or new.reference is distinct from old.reference
      or new.valid_from is distinct from old.valid_from
      or new.valid_until is distinct from old.valid_until
      or new.target_function is distinct from old.target_function
      or new.priority is distinct from old.priority
      or new.restricted is distinct from old.restricted
      or new.due_at is distinct from old.due_at
      or new.incident_id is distinct from old.incident_id
      or new.created_by is distinct from old.created_by
    then
      raise exception 'Ohne Genehmiger-Rolle kann an einem Kontrollauftrag nur der Erledigt-Status geändert werden.';
    end if;
  end if;
  return new;
end;
$$;

create trigger zentrale_entries_kontrollauftrag_todo_only
  before update on public.zentrale_entries
  for each row execute function public.enforce_kontrollauftrag_todo_only();
