-- Digitale Abbildung der offiziellen "Checkliste Notfall/Katastrophe" (Erst-
-- meldung) und "Checkliste Notunterkunft" (Stadt Dornbirn) - bisher lief die
-- Stufen-/Telefonketten-Checkliste rein über localStorage (readKette/
-- readStoredStufe in einsatzSchema.ts), was für einen einzelnen Zentralisten
-- am selben Gerät ausreichte. Die neuen Checklisten-Punkte und die Namens-
-- liste (Notunterkunft) sollen aber sowohl von der Zentrale als auch von der
-- Streife vor Ort bearbeitet werden können - dafür braucht es echten,
-- geteilten Server-Zustand statt geräte-lokalem Speicher.

create table public.einsatz_checklist_punkte (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incident_reports(id) on delete cascade,
  checkliste text not null check (checkliste in ('erstmeldung', 'notunterkunft')),
  punkt_key text not null,
  erledigt boolean not null default false,
  wer text,
  erledigt_at timestamptz,
  erledigt_von uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (incident_id, checkliste, punkt_key)
);

alter table public.einsatz_checklist_punkte enable row level security;

-- Wie bei incident_reports selbst: has_portal_area_access('zentrale') deckt
-- laut bestehendem Berechtigungsmodell sowohl Zentrale als auch Außendienst/
-- Streife ab (alle operativen Portalbereiche hängen aktuell an diesem einen
-- Flag) - anders als z. B. einsatz_parteien (nur Zentralist/Admin) sollen
-- hier bewusst auch Streifenbeamte selbst Punkte abhaken können.
create policy "Checklisten-Punkte lesen" on public.einsatz_checklist_punkte for select using (has_portal_area_access('zentrale'));
create policy "Checklisten-Punkte anlegen" on public.einsatz_checklist_punkte for insert with check (has_portal_area_access('zentrale'));
create policy "Checklisten-Punkte ändern" on public.einsatz_checklist_punkte for update using (has_portal_area_access('zentrale')) with check (has_portal_area_access('zentrale'));

-- Namensliste: ersetzt/erweitert die bisher rein lokale Personenliste
-- (localStorage, lib/zmrPersonen.ts) um eine "Unterbringung"-Listenart mit
-- den Spalten der offiziellen Namensliste-Vorlage (Nr/Nachname/Vorname/
-- Alter/m-f/Sprache/Familie/Telefonnummer/Ort Unterkunft/Anmerkungen) -
-- Name bewusst als ein Feld (nicht Vor-/Nachname getrennt), da eine
-- verlässliche automatische Trennung aus dem ZMR-Fließtext nicht möglich ist.
create table public.einsatz_namensliste (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incident_reports(id) on delete cascade,
  listenart text not null check (listenart in ('haus', 'kontrolle', 'evakuierung', 'befragung', 'unterbringung')),
  name text not null,
  geboren text,
  wohnung text,
  alter smallint,
  geschlecht text check (geschlecht in ('m', 'w', 'd')),
  sprache text,
  familie text,
  telefon text,
  ort_unterkunft text,
  anmerkungen text,
  status text not null default 'offen' check (status in ('offen', 'erledigt', 'im_haus', 'draussen', 'unbekannt')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index einsatz_namensliste_incident_idx on public.einsatz_namensliste (incident_id, listenart);

alter table public.einsatz_namensliste enable row level security;

create policy "Namensliste lesen" on public.einsatz_namensliste for select using (has_portal_area_access('zentrale'));
create policy "Namensliste anlegen" on public.einsatz_namensliste for insert with check (has_portal_area_access('zentrale'));
create policy "Namensliste ändern" on public.einsatz_namensliste for update using (has_portal_area_access('zentrale')) with check (has_portal_area_access('zentrale'));
create policy "Namensliste löschen" on public.einsatz_namensliste for delete using (has_portal_area_access('zentrale'));
