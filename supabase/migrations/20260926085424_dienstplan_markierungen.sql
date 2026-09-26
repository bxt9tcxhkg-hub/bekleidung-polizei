-- Dienstplan-Planung im Portal: freie, vom Planer selbst definierbare
-- Farbmarkierungen für einzelne Diensteinträge (z. B. "Überstunden" blau) -
-- eine rein visuelle Zusatzinformation, unabhängig vom Dienst-Kürzel/der
-- Kategorie (kategorie bleibt weiterhin dienst/krank/urlaub/...). Die
-- Farbe ist auf eine feste Palette beschränkt (siehe
-- lib/dienstplanMarkierungen.ts), damit die Darstellung zu den bereits
-- verwendeten Abwesenheits-/Warnfarben passt und lesbar bleibt - Name und
-- Zuordnung der Farbe kann der Planer selbst anlegen/ändern/löschen.
create table public.dienstplan_markierungen (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  farbe text not null check (farbe in ('blau', 'lila', 'orange', 'tuerkis', 'grau')),
  reihenfolge integer not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index dienstplan_markierungen_name_key on public.dienstplan_markierungen (lower(name));

create trigger dienstplan_markierungen_updated_at before update on public.dienstplan_markierungen
for each row execute function public.update_updated_at();

alter table public.dienstplan_markierungen enable row level security;
revoke all on public.dienstplan_markierungen from anon, authenticated;
grant select, insert, update, delete on public.dienstplan_markierungen to authenticated;

create policy "Dienstplan-Markierungen lesen" on public.dienstplan_markierungen
for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
);
create policy "Dienstplan-Markierungen nur Planer anlegen" on public.dienstplan_markierungen
for insert to authenticated with check (public.has_role('admin') or public.has_role('genehmiger'));
create policy "Dienstplan-Markierungen nur Planer ändern" on public.dienstplan_markierungen
for update to authenticated using (public.has_role('admin') or public.has_role('genehmiger'))
with check (public.has_role('admin') or public.has_role('genehmiger'));
create policy "Dienstplan-Markierungen nur Planer löschen" on public.dienstplan_markierungen
for delete to authenticated using (public.has_role('admin') or public.has_role('genehmiger'));

-- Diensteinträge können optional einer Markierung zugeordnet werden - beim
-- Löschen der Markierung wird die Zuordnung nur entfernt (die Zeile selbst
-- bleibt bestehen).
alter table public.dienstplan_dienste add column markierung_id uuid references public.dienstplan_markierungen(id) on delete set null;

create or replace function public.dienstplan_dienst_setzen(
  p_monat_id uuid, p_beamter_id uuid, p_datum date, p_zeile smallint,
  p_rohtext text, p_von_zeit text, p_bis_zeit text, p_kategorie text, p_markierung_id uuid default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role('admin') or public.has_role('genehmiger')) then
    raise exception 'Keine Berechtigung, den Dienstplan zu bearbeiten.';
  end if;

  insert into public.dienstplan_dienste (dienstplan_monat_id, beamter_id, datum, zeile, rohtext, von_zeit, bis_zeit, kategorie, markierung_id)
  values (p_monat_id, p_beamter_id, p_datum, p_zeile, p_rohtext, nullif(p_von_zeit, '')::time, nullif(p_bis_zeit, '')::time, p_kategorie, p_markierung_id)
  on conflict (dienstplan_monat_id, beamter_id, datum, zeile)
  do update set rohtext = excluded.rohtext, von_zeit = excluded.von_zeit, bis_zeit = excluded.bis_zeit, kategorie = excluded.kategorie, markierung_id = excluded.markierung_id;
end;
$$;

-- create or replace mit geänderter Parameterliste erzeugt eine zusätzliche
-- Überladung statt die bestehende Funktion zu ersetzen (siehe bereits
-- 20260926083136_dienstplan_termin_wuensche.sql) - die alte
-- 8-Parameter-Signatur (ohne markierung_id) explizit entfernen.
drop function if exists public.dienstplan_dienst_setzen(uuid, uuid, date, smallint, text, text, text, text);

revoke all on function public.dienstplan_dienst_setzen(uuid, uuid, date, smallint, text, text, text, text, uuid) from public, anon;
grant execute on function public.dienstplan_dienst_setzen(uuid, uuid, date, smallint, text, text, text, text, uuid) to authenticated;
