-- Dienstplan-Planung im Portal, Phase 0: Grundrechte für die Genehmiger-
-- Rolle (bisher war der komplette Dienstplan admin-only) sowie granulare
-- RPCs für einzelne Diensteinträge - die bestehende
-- dienstplan_monat_ersetzen ersetzt immer den kompletten Monat (Delete+
-- Insert) und ist damit für einzelne manuelle Zelländerungen ungeeignet.
--
-- has_role('genehmiger') wird überall zusätzlich zu has_role('admin')
-- zugelassen, nie anstelle davon - Admin behält weiterhin Vollzugriff.

-- Lese-Policies: Genehmiger müssen auch Entwürfe (status = 'entwurf')
-- sehen können, um sie zu planen - bisher nur für Admin sichtbar.
drop policy "Dienstplan-Monate lesen" on public.dienstplan_monate;
create policy "Dienstplan-Monate lesen" on public.dienstplan_monate
for select to authenticated using (
  status = 'veroeffentlicht' or public.has_role('admin') or public.has_role('genehmiger')
);

drop policy "Dienstplan-Dienste dienststellenweit lesen" on public.dienstplan_dienste;
create policy "Dienstplan-Dienste dienststellenweit lesen" on public.dienstplan_dienste
for select to authenticated using (
  public.has_role('admin')
  or public.has_role('genehmiger')
  or (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
    and exists (select 1 from public.dienstplan_monate m where m.id = dienstplan_monat_id and m.status = 'veroeffentlicht')
  )
);

-- Bestehende RPCs: Berechtigungsprüfung von admin-only auf admin-oder-
-- genehmiger erweitern (Rest der Funktionen unverändert, siehe
-- 20260925021129_dienstplan_import.sql für die ursprüngliche Fassung).
create or replace function public.dienstplan_monat_ersetzen(p_monat date, p_dateiname text, p_dienste jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_monat_id uuid;
begin
  if not (public.has_role('admin') or public.has_role('genehmiger')) then
    raise exception 'Keine Berechtigung, den Dienstplan zu importieren.';
  end if;
  if extract(day from p_monat) <> 1 then
    raise exception 'p_monat muss der erste Tag eines Monats sein.';
  end if;

  insert into public.dienstplan_monate (monat, dateiname, status, hochgeladen_von, hochgeladen_at)
  values (p_monat, p_dateiname, 'entwurf', auth.uid(), now())
  on conflict (monat) do update set dateiname = excluded.dateiname, hochgeladen_von = excluded.hochgeladen_von, hochgeladen_at = now(), status = 'entwurf', veroeffentlicht_von = null, veroeffentlicht_at = null
  returning id into v_monat_id;

  delete from public.dienstplan_dienste where dienstplan_monat_id = v_monat_id;

  insert into public.dienstplan_dienste (dienstplan_monat_id, beamter_id, datum, zeile, rohtext, von_zeit, bis_zeit, kategorie)
  select
    v_monat_id,
    (eintrag->>'beamter_id')::uuid,
    (eintrag->>'datum')::date,
    (eintrag->>'zeile')::smallint,
    eintrag->>'rohtext',
    nullif(eintrag->>'von_zeit', '')::time,
    nullif(eintrag->>'bis_zeit', '')::time,
    eintrag->>'kategorie'
  from jsonb_array_elements(p_dienste) as eintrag;

  return v_monat_id;
end;
$$;

create or replace function public.dienstplan_monat_veroeffentlichen(p_monat_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role('admin') or public.has_role('genehmiger')) then
    raise exception 'Keine Berechtigung, den Dienstplan zu veröffentlichen.';
  end if;
  update public.dienstplan_monate set status = 'veroeffentlicht', veroeffentlicht_von = auth.uid(), veroeffentlicht_at = now()
  where id = p_monat_id;
end;
$$;

-- Legt einen Monat als Entwurf an, falls er noch nicht existiert - im
-- Gegensatz zu dienstplan_monat_ersetzen werden dabei KEINE bestehenden
-- Diensteinträge gelöscht (für die manuelle Planung eines neuen Monats
-- ohne Excel-Import).
create or replace function public.dienstplan_monat_anlegen(p_monat date, p_dateiname text default 'Manuell geplant')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_monat_id uuid;
begin
  if not (public.has_role('admin') or public.has_role('genehmiger')) then
    raise exception 'Keine Berechtigung, den Dienstplan zu planen.';
  end if;
  if extract(day from p_monat) <> 1 then
    raise exception 'p_monat muss der erste Tag eines Monats sein.';
  end if;

  insert into public.dienstplan_monate (monat, dateiname, status, hochgeladen_von, hochgeladen_at)
  values (p_monat, p_dateiname, 'entwurf', auth.uid(), now())
  on conflict (monat) do nothing;

  select id into v_monat_id from public.dienstplan_monate where monat = p_monat;
  return v_monat_id;
end;
$$;

-- Upsert einer einzelnen Diensteintrag-Zeile (Grid-Zelle) für die manuelle
-- Planung - nutzt denselben Unique-Index wie dienstplan_monat_ersetzen.
create or replace function public.dienstplan_dienst_setzen(
  p_monat_id uuid, p_beamter_id uuid, p_datum date, p_zeile smallint,
  p_rohtext text, p_von_zeit text, p_bis_zeit text, p_kategorie text
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role('admin') or public.has_role('genehmiger')) then
    raise exception 'Keine Berechtigung, den Dienstplan zu bearbeiten.';
  end if;

  insert into public.dienstplan_dienste (dienstplan_monat_id, beamter_id, datum, zeile, rohtext, von_zeit, bis_zeit, kategorie)
  values (p_monat_id, p_beamter_id, p_datum, p_zeile, p_rohtext, nullif(p_von_zeit, '')::time, nullif(p_bis_zeit, '')::time, p_kategorie)
  on conflict (dienstplan_monat_id, beamter_id, datum, zeile)
  do update set rohtext = excluded.rohtext, von_zeit = excluded.von_zeit, bis_zeit = excluded.bis_zeit, kategorie = excluded.kategorie;
end;
$$;

-- Löscht eine einzelne Diensteintrag-Zeile (z. B. Zelle im Grid geleert).
create or replace function public.dienstplan_dienst_loeschen(p_monat_id uuid, p_beamter_id uuid, p_datum date, p_zeile smallint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role('admin') or public.has_role('genehmiger')) then
    raise exception 'Keine Berechtigung, den Dienstplan zu bearbeiten.';
  end if;

  delete from public.dienstplan_dienste
  where dienstplan_monat_id = p_monat_id and beamter_id = p_beamter_id and datum = p_datum and zeile = p_zeile;
end;
$$;

revoke all on function public.dienstplan_monat_anlegen(date, text) from public, anon;
grant execute on function public.dienstplan_monat_anlegen(date, text) to authenticated;
revoke all on function public.dienstplan_dienst_setzen(uuid, uuid, date, smallint, text, text, text, text) from public, anon;
grant execute on function public.dienstplan_dienst_setzen(uuid, uuid, date, smallint, text, text, text, text) to authenticated;
revoke all on function public.dienstplan_dienst_loeschen(uuid, uuid, date, smallint) from public, anon;
grant execute on function public.dienstplan_dienst_loeschen(uuid, uuid, date, smallint) to authenticated;
