-- Explizite Genehmiger-Kette für Überstundenmeldungen (Vorgabe: Hans-Peter
-- Schwendinger als Kommandant primär, Andreas Gisinger und Martin Feurstein
-- als Kommandant-Stellvertreter, falls der jeweils Vorherige nicht da ist).
-- Ersetzt die bisherige "gibt es genau einen Genehmiger"-Heuristik
-- (sole_genehmiger_name, Migration 20260919030000) - die traf in der Praxis
-- nicht zu (mehrere Accounts halten admin/genehmiger/approver-Rollen), und
-- der Nutzer hat stattdessen eine feste, geordnete Auswahlliste vorgegeben,
-- aus der beim Anlegen einer Meldung explizit gewählt wird.

alter table public.profiles add column if not exists genehmiger_rang smallint;
create unique index if not exists profiles_genehmiger_rang_key on public.profiles (genehmiger_rang) where genehmiger_rang is not null;

-- Andreas Gisinger und Martin Feurstein müssen auch tatsächlich entscheiden
-- können, sobald sie als Genehmiger ausgewählt wurden (is_genehmiger()
-- prüft admin/genehmiger/approver-Rollen).
update public.profiles set roles = array(select distinct unnest(roles || array['genehmiger'])), genehmiger_rang = 2 where name = 'Andreas Gisinger';
update public.profiles set roles = array(select distinct unnest(roles || array['genehmiger'])), genehmiger_rang = 3 where name = 'Martin Feurstein';
update public.profiles set genehmiger_rang = 1 where name = 'Hans-Peter Schwendinger';

drop function if exists public.sole_genehmiger_name();

-- Liefert die aktive Genehmiger-Kette in Rangfolge (id, name, rang) - jeder
-- Bedienstete darf beim Anlegen einer Meldung daraus wählen, auch wenn er
-- laut RLS die Rollen/Namen anderer Profile sonst nicht sehen darf.
create or replace function public.genehmiger_kette()
returns table (id uuid, name text, rang smallint)
language sql
stable
security definer
set search_path to ''
as $$
  select p.id, p.name, p.genehmiger_rang
  from public.profiles p
  where p.active = true and p.genehmiger_rang is not null
  order by p.genehmiger_rang;
$$;

grant execute on function public.genehmiger_kette() to authenticated;

-- Vom Ersteller einer Meldung gewählter, voraussichtlicher Genehmiger - rein
-- informativ (wer tatsächlich entscheidet, bestimmt weiterhin genehmiger_id
-- erst bei der echten Entscheidung). Darf jederzeit vom Ersteller geändert
-- werden, daher kein Bezug zur bestehenden INSERT-Policy nötig (die erlaubt
-- bereits jedes Feld außer den Entscheidungsfeldern selbst).
alter table public.ueberstunden_meldungen add column if not exists genehmiger_wahl_id uuid references public.profiles(id) on delete set null;
