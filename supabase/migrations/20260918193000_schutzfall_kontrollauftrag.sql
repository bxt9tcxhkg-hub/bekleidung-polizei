-- Ein neu erfasster Schutzfall (BV/AV oder EV) soll automatisch einen
-- Kontrollauftrag für die Streife erzeugen (siehe due_at-Kommentar auf
-- zentrale_entries, der genau das schon vorsah, aber nie verdrahtet wurde).
-- "Kontrollaufträge anlegen" ist per RLS bewusst auf is_genehmiger()
-- beschränkt (20260912021540) - ein automatisch erzeugter Auftrag ist aber
-- kein Genehmiger-Entscheid, sondern eine reine Systemfolge aus einer bereits
-- berechtigt gespeicherten Schutzmaßnahme, daher ein SECURITY DEFINER-Trigger
-- statt einer Erweiterung der Insert-Policy.

alter table public.zentrale_entries add column schutzfall_id uuid references public.schutzfaelle(id) on delete cascade;
create index zentrale_entries_schutzfall_id_idx on public.zentrale_entries (schutzfall_id);
comment on column public.zentrale_entries.schutzfall_id is
  'Nur für automatisch aus einem Schutzfall (BV/AV, EV) erzeugte Kontrollaufträge gesetzt.';

-- Feuert je Schutzbereich-Zeile, legt den Kontrollauftrag aber nur beim
-- jeweils ersten Schutzbereich eines Schutzfalls an (Idempotenz-Check über
-- schutzfall_id) - ein Schutzfall kann mehrere Bereiche haben (EV), beim
-- Bearbeiten werden alle Bereiche gelöscht und neu eingefügt, ohne dass
-- dadurch ein zweiter Kontrollauftrag entstehen soll.
create or replace function public.schutzbereich_ensure_kontrollauftrag()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_schutzfall public.schutzfaelle%rowtype;
  v_gefaehrder_name text;
  v_massnahme_label text;
begin
  if exists (select 1 from public.zentrale_entries where schutzfall_id = new.schutzfall_id) then
    return new;
  end if;

  select * into v_schutzfall from public.schutzfaelle where id = new.schutzfall_id;
  if not found then
    return new;
  end if;

  select nullif(trim(coalesce(vorname, '') || ' ' || coalesce(nachname, '')), '')
    into v_gefaehrder_name
    from public.operational_persons where id = v_schutzfall.gefaehrder_id;

  v_massnahme_label := case v_schutzfall.massnahme when 'bv_av' then 'BV/AV' else 'Einstweilige Verfügung' end;

  insert into public.zentrale_entries (
    category, title, description, priority, status,
    valid_from, valid_until, location, target_function, due_at,
    schutzfall_id, created_by
  ) values (
    'kontrollauftrag',
    v_massnahme_label || ' kontrollieren · PAD ' || v_schutzfall.pad_aktenzahl,
    'Automatisch aus Schutzmaßnahme erzeugt. Gefährder: ' || coalesce(v_gefaehrder_name, '–') || '. Erstkontrolle innerhalb von 72 Stunden nach Beginn erforderlich.',
    'hoch', 'offen',
    v_schutzfall.beginn, v_schutzfall.ende, new.bezeichnung, 'beide',
    v_schutzfall.beginn + interval '72 hours',
    v_schutzfall.id, v_schutzfall.created_by
  );
  return new;
end;
$$;

create trigger schutzbereiche_ensure_kontrollauftrag
  after insert on public.schutzbereiche
  for each row execute function public.schutzbereich_ensure_kontrollauftrag();
