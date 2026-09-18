-- Zweiter Anlauf nach 20260918210000 (Rückbau des automatischen Triggers):
-- diesmal keine Automatik mehr, sondern eine bewusste Entscheidung beim
-- Anlegen eines Schutzfalls ("Kontrolle erforderlich?" in ZentraleAvBv.tsx),
-- die genau einmal einen echten, für den Genehmiger bearbeitbaren
-- Kontrollauftrag erzeugt - kein Trigger, der bei jedem Bearbeiten erneut
-- feuert.
--
-- "Kontrollaufträge anlegen" ist per RLS bewusst auf is_genehmiger()
-- beschränkt (20260912021540) - wer einen Schutzfall anlegen darf
-- (can_manage_zentrale()/is_zentralist_on_duty(), siehe schutzfaelle_insert),
-- ist aber nicht zwingend Genehmiger. Daher wieder ein SECURITY DEFINER-RPC
-- statt einer Aufweichung der Insert-Policy - diesmal explizit vom Frontend
-- aufgerufen (nicht über einen Trigger), also nur genau dann, wenn die Person
-- die Checkbox tatsächlich gesetzt hat.
alter table public.zentrale_entries add column schutzfall_id uuid references public.schutzfaelle(id) on delete cascade;
create index zentrale_entries_schutzfall_id_idx on public.zentrale_entries (schutzfall_id);
comment on column public.zentrale_entries.schutzfall_id is
  'Nur für aus einem Schutzfall (BV/AV, EV) erzeugte Kontrollaufträge gesetzt - Erzeugung ist eine bewusste Entscheidung beim Anlegen, kein Trigger.';

create or replace function public.create_schutzfall_kontrollauftrag(p_schutzfall_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_schutzfall public.schutzfaelle%rowtype;
  v_gefaehrder_name text;
  v_massnahme_label text;
  v_location text;
  v_id uuid;
begin
  if not (public.can_manage_zentrale() or public.is_zentralist_on_duty()) then
    raise exception 'Keine Berechtigung';
  end if;

  select * into v_schutzfall from public.schutzfaelle where id = p_schutzfall_id;
  if not found then
    raise exception 'Schutzfall nicht gefunden';
  end if;

  -- Idempotent statt Fehler: ein zweiter Aufruf für denselben Schutzfall
  -- (z. B. erneutes Speichern) soll keinen doppelten Kontrollauftrag anlegen.
  if exists (select 1 from public.zentrale_entries where schutzfall_id = p_schutzfall_id) then
    return null;
  end if;

  select nullif(trim(coalesce(vorname, '') || ' ' || coalesce(nachname, '')), '')
    into v_gefaehrder_name
    from public.operational_persons where id = v_schutzfall.gefaehrder_id;
  select bezeichnung into v_location from public.schutzbereiche where schutzfall_id = p_schutzfall_id order by sort_order limit 1;

  v_massnahme_label := case v_schutzfall.massnahme when 'bv_av' then 'BV/AV' else 'Einstweilige Verfügung' end;

  insert into public.zentrale_entries (
    category, title, description, priority, status,
    valid_from, valid_until, location, target_function, due_at,
    schutzfall_id, created_by
  ) values (
    'kontrollauftrag',
    v_massnahme_label || ' kontrollieren · PAD ' || v_schutzfall.pad_aktenzahl,
    'Erstkontrolle innerhalb von 72 Stunden nach Beginn erforderlich. Gefährder: ' || coalesce(v_gefaehrder_name, '–') || '.',
    'hoch', 'offen',
    v_schutzfall.beginn::date, v_schutzfall.ende::date, v_location, 'beide',
    v_schutzfall.beginn + interval '72 hours',
    p_schutzfall_id, (select auth.uid())
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_schutzfall_kontrollauftrag(uuid) from public, anon;
grant execute on function public.create_schutzfall_kontrollauftrag(uuid) to authenticated;
