-- Bescheid & Verstoß über das Personen-Register verknüpft (statt Namens-
-- Freitext), damit die Anzahl der Verstöße je Person eindeutig zählbar ist -
-- Grundlage für die Entscheidung des Genehmigers, ab wie vielen Verstößen
-- einer Person kein Bescheid mehr ausgestellt wird. Ein Verstoß entzieht den
-- zugehörigen Bescheid automatisch (neuer Status "entzogen").

alter table public.innendienst_records add column person_id uuid references public.operational_persons(id) on delete set null;
create index innendienst_records_person_id_idx on public.innendienst_records (person_id);

alter table public.innendienst_records drop constraint innendienst_records_status_check;
alter table public.innendienst_records add constraint innendienst_records_status_check
  check (status = any (array['offen', 'erledigt', 'entzogen']));

create or replace function public.revoke_bescheid_on_verstoss()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.kind = 'verstoss' and new.related_bescheid_id is not null then
    update public.innendienst_records set status = 'entzogen' where id = new.related_bescheid_id;
  end if;
  return new;
end;
$$;

create trigger innendienst_records_revoke_bescheid
  after insert on public.innendienst_records
  for each row execute function public.revoke_bescheid_on_verstoss();
