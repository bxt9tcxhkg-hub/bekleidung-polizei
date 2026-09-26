-- Dienstplan-Planung im Portal, Phase 5: Diensttausch. Ein Beamter kann
-- direkt aus "Meine Dienste" heraus vorschlagen, einen eigenen Dienst
-- (Datum+Zeile) gegen den Dienst einer Kollegin/eines Kollegen am selben
-- Monat zu tauschen - der Antrag geht ohne Zwischenschritt direkt als
-- "offen" an den Genehmiger (kein Zustimmungsschritt der Zielperson).
-- Genehmigung tauscht die beamter_id der beiden betroffenen
-- dienstplan_dienste-Zeilen (der Diensteintrag selbst - Kürzel/Uhrzeit -
-- bleibt am jeweiligen Kalendertag unverändert, nur wer ihn leistet ändert
-- sich).
create table public.dienstplan_tauschantraege (
  id uuid primary key default gen_random_uuid(),
  dienstplan_monat_id uuid not null references public.dienstplan_monate(id) on delete cascade,
  ursprung_beamter_id uuid not null references public.profiles(id) on delete cascade,
  ursprung_datum date not null,
  ursprung_zeile smallint not null check (ursprung_zeile in (1, 2)),
  ziel_beamter_id uuid not null references public.profiles(id) on delete cascade,
  ziel_datum date not null,
  ziel_zeile smallint not null check (ziel_zeile in (1, 2)),
  status text not null default 'offen' check (status in ('offen', 'genehmigt', 'abgelehnt', 'zurueckgezogen')),
  notiz text check (notiz is null or length(notiz) <= 300),
  beantragt_von uuid not null references public.profiles(id),
  beantragt_at timestamptz not null default now(),
  entschieden_von uuid references public.profiles(id),
  entschieden_at timestamptz,
  entscheidung_notiz text check (entscheidung_notiz is null or length(entscheidung_notiz) <= 300)
);
create index dienstplan_tauschantraege_monat_idx on public.dienstplan_tauschantraege (dienstplan_monat_id);
create index dienstplan_tauschantraege_status_idx on public.dienstplan_tauschantraege (status);

alter table public.dienstplan_tauschantraege enable row level security;
revoke all on public.dienstplan_tauschantraege from anon, authenticated;
grant select on public.dienstplan_tauschantraege to authenticated;

create policy "Diensttausch lesen" on public.dienstplan_tauschantraege
for select to authenticated using (
  beantragt_von = (select auth.uid())
  or ursprung_beamter_id = (select auth.uid())
  or ziel_beamter_id = (select auth.uid())
  or public.has_role('admin') or public.has_role('genehmiger')
);

-- Anlegen ausschließlich über RPC (SECURITY DEFINER) - der antragstellende
-- Beamte tauscht immer den eigenen Dienst (ursprung) gegen den einer
-- anderen aktiven Person (ziel), beide Diensteinträge müssen existieren
-- und im selben Monat liegen.
create or replace function public.dienstplan_tauschantrag_erstellen(
  p_ursprung_datum date, p_ursprung_zeile smallint,
  p_ziel_beamter_id uuid, p_ziel_datum date, p_ziel_zeile smallint,
  p_notiz text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_monat_id uuid;
  v_ziel_monat_id uuid;
  v_id uuid;
begin
  if p_ziel_beamter_id = auth.uid() then
    raise exception 'Ein Tausch mit sich selbst ist nicht möglich.';
  end if;

  select dienstplan_monat_id into v_monat_id from public.dienstplan_dienste
    where beamter_id = auth.uid() and datum = p_ursprung_datum and zeile = p_ursprung_zeile and kategorie = 'dienst';
  if v_monat_id is null then
    raise exception 'Kein eigener Dienst an diesem Tag gefunden.';
  end if;

  select dienstplan_monat_id into v_ziel_monat_id from public.dienstplan_dienste
    where beamter_id = p_ziel_beamter_id and datum = p_ziel_datum and zeile = p_ziel_zeile and kategorie = 'dienst';
  if v_ziel_monat_id is null then
    raise exception 'Kein Dienst der Zielperson an diesem Tag gefunden.';
  end if;
  if v_ziel_monat_id <> v_monat_id then
    raise exception 'Ein Tausch ist nur innerhalb desselben Monats möglich.';
  end if;

  insert into public.dienstplan_tauschantraege
    (dienstplan_monat_id, ursprung_beamter_id, ursprung_datum, ursprung_zeile, ziel_beamter_id, ziel_datum, ziel_zeile, notiz, beantragt_von)
  values (v_monat_id, auth.uid(), p_ursprung_datum, p_ursprung_zeile, p_ziel_beamter_id, p_ziel_datum, p_ziel_zeile, nullif(p_notiz, ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- Zurückziehen: nur die antragstellende Person, nur solange noch "offen".
create or replace function public.dienstplan_tauschantrag_zurueckziehen(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.dienstplan_tauschantraege
  set status = 'zurueckgezogen', entschieden_von = auth.uid(), entschieden_at = now()
  where id = p_id and beantragt_von = auth.uid() and status = 'offen';
  if not found then
    raise exception 'Antrag kann nicht zurückgezogen werden.';
  end if;
end;
$$;

-- Entscheiden: nur Admin/Genehmiger. Bei Genehmigung werden die beiden
-- betroffenen dienstplan_dienste-Zeilen per UPDATE der beamter_id
-- getauscht (der Rohtext/Uhrzeit-Inhalt bleibt am Kalendertag stehen) -
-- schlägt fehl, wenn sich einer der beiden Einträge seit dem Antrag
-- geändert hat (kein automatischer Tausch auf Basis veralteter Daten).
create or replace function public.dienstplan_tauschantrag_entscheiden(p_id uuid, p_genehmigt boolean, p_notiz text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_antrag record;
begin
  if not (public.has_role('admin') or public.has_role('genehmiger')) then
    raise exception 'Keine Berechtigung.';
  end if;

  select * into v_antrag from public.dienstplan_tauschantraege where id = p_id for update;
  if not found then
    raise exception 'Antrag nicht gefunden.';
  end if;
  if v_antrag.status <> 'offen' then
    raise exception 'Über diesen Antrag wurde bereits entschieden.';
  end if;

  if p_genehmigt then
    update public.dienstplan_dienste set beamter_id = v_antrag.ziel_beamter_id
      where dienstplan_monat_id = v_antrag.dienstplan_monat_id and beamter_id = v_antrag.ursprung_beamter_id
        and datum = v_antrag.ursprung_datum and zeile = v_antrag.ursprung_zeile;
    if not found then
      raise exception 'Der ursprüngliche Diensteintrag wurde inzwischen verändert oder gelöscht - Tausch kann nicht durchgeführt werden.';
    end if;

    update public.dienstplan_dienste set beamter_id = v_antrag.ursprung_beamter_id
      where dienstplan_monat_id = v_antrag.dienstplan_monat_id and beamter_id = v_antrag.ziel_beamter_id
        and datum = v_antrag.ziel_datum and zeile = v_antrag.ziel_zeile;
    if not found then
      raise exception 'Der Ziel-Diensteintrag wurde inzwischen verändert oder gelöscht - Tausch kann nicht durchgeführt werden.';
    end if;
  end if;

  update public.dienstplan_tauschantraege
  set status = case when p_genehmigt then 'genehmigt' else 'abgelehnt' end,
      entschieden_von = auth.uid(), entschieden_at = now(), entscheidung_notiz = nullif(p_notiz, '')
  where id = p_id;
end;
$$;

revoke all on function public.dienstplan_tauschantrag_erstellen(date, smallint, uuid, date, smallint, text) from public, anon;
grant execute on function public.dienstplan_tauschantrag_erstellen(date, smallint, uuid, date, smallint, text) to authenticated;
revoke all on function public.dienstplan_tauschantrag_zurueckziehen(uuid) from public, anon;
grant execute on function public.dienstplan_tauschantrag_zurueckziehen(uuid) to authenticated;
revoke all on function public.dienstplan_tauschantrag_entscheiden(uuid, boolean, text) from public, anon;
grant execute on function public.dienstplan_tauschantrag_entscheiden(uuid, boolean, text) to authenticated;
