-- Dienstplan-Import (Schritt 1-3): monatliche Dienstplan-Datei (.xlsm/.xlsx)
-- wird von einem Admin hochgeladen, im Browser geparst (siehe
-- lib/dienstplanImport.ts) und hier abgelegt - Grundlage für einen späteren
-- Dienststellenkalender und eine persönliche Stunden-Übersicht (noch nicht
-- Teil dieser Migration, bewusst getrennt vom Überstunden-Meldeworkflow).
--
-- dienstplan_spalten: merkt sich einmalig, welche Namensspalte der Excel-
-- Vorlage (nur Nachname, siehe Analyse) zu welchem Profil gehört - wird über
-- Monate hinweg wiederverwendet, damit nicht jeden Monat neu zugeordnet
-- werden muss. immer_aktiv deckt Sonderfälle wie Kommandant/Stellvertreter
-- ab, deren Spalte auch ganz ohne Diensteintrag in einem Monat trotzdem
-- berücksichtigt werden soll (frei markierbar, keine Namen im Code).
create table public.dienstplan_spalten (
  id uuid primary key default gen_random_uuid(),
  spaltenname text not null unique check (length(trim(spaltenname)) between 1 and 100),
  beamter_id uuid references public.profiles(id) on delete set null,
  immer_aktiv boolean not null default false,
  notiz text check (notiz is null or length(notiz) <= 500),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger dienstplan_spalten_updated_at before update on public.dienstplan_spalten
for each row execute function public.update_updated_at();

alter table public.dienstplan_spalten enable row level security;
revoke all on public.dienstplan_spalten from anon, authenticated;
grant select, insert, update, delete on public.dienstplan_spalten to authenticated;

create policy "Dienstplan-Spaltenzuordnung nur Admin" on public.dienstplan_spalten
for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

-- dienstplan_monate: ein Eintrag je hochgeladenem Monat, unique auf monat -
-- ein erneuter Upload desselben Monats (Korrektur) ersetzt den bestehenden
-- Eintrag statt einen zweiten anzulegen (siehe RPC unten).
create table public.dienstplan_monate (
  id uuid primary key default gen_random_uuid(),
  monat date not null unique check (extract(day from monat) = 1),
  dateiname text not null check (length(trim(dateiname)) between 1 and 255),
  status text not null default 'entwurf' check (status in ('entwurf', 'veroeffentlicht')),
  hochgeladen_von uuid references public.profiles(id) on delete set null,
  hochgeladen_at timestamptz not null default now(),
  veroeffentlicht_von uuid references public.profiles(id) on delete set null,
  veroeffentlicht_at timestamptz
);

alter table public.dienstplan_monate enable row level security;
revoke all on public.dienstplan_monate from anon, authenticated;
grant select on public.dienstplan_monate to authenticated;
grant insert, update, delete on public.dienstplan_monate to authenticated;

create policy "Dienstplan-Monate lesen" on public.dienstplan_monate
for select to authenticated using (status = 'veroeffentlicht' or public.has_role('admin'));
create policy "Dienstplan-Monate nur Admin verwalten" on public.dienstplan_monate
for insert to authenticated with check (public.has_role('admin'));
create policy "Dienstplan-Monate nur Admin ändern" on public.dienstplan_monate
for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "Dienstplan-Monate nur Admin löschen" on public.dienstplan_monate
for delete to authenticated using (public.has_role('admin'));

-- dienstplan_dienste: je Bediensteter/Tag die (bis zu zwei) Rohzeilen aus der
-- Vorlage (siehe Analyse: pro Tag zwei Zeilen in der Excel-Datei, Bedeutung
-- des Zusammenspiels noch nicht abschließend geklärt - deshalb werden beide
-- Zeilen unverändert gespeichert statt sie zu einer zu verschmelzen).
create table public.dienstplan_dienste (
  id uuid primary key default gen_random_uuid(),
  dienstplan_monat_id uuid not null references public.dienstplan_monate(id) on delete cascade,
  beamter_id uuid not null references public.profiles(id) on delete cascade,
  datum date not null,
  zeile smallint not null check (zeile in (1, 2)),
  rohtext text not null check (length(trim(rohtext)) between 1 and 200),
  von_zeit time,
  bis_zeit time,
  kategorie text not null check (kategorie in ('dienst', 'krank', 'urlaub', 'sonderurlaub', 'karenz', 'sonstiges')),
  created_at timestamptz not null default now(),
  unique (dienstplan_monat_id, beamter_id, datum, zeile)
);

create index dienstplan_dienste_monat_idx on public.dienstplan_dienste (dienstplan_monat_id);
create index dienstplan_dienste_beamter_datum_idx on public.dienstplan_dienste (beamter_id, datum);

alter table public.dienstplan_dienste enable row level security;
revoke all on public.dienstplan_dienste from anon, authenticated;
grant select on public.dienstplan_dienste to authenticated;

create policy "Dienstplan-Dienste lesen" on public.dienstplan_dienste
for select to authenticated using (
  public.has_role('admin')
  or (
    beamter_id = (select auth.uid())
    and exists (select 1 from public.dienstplan_monate m where m.id = dienstplan_monat_id and m.status = 'veroeffentlicht')
  )
);

-- Ersetzt (Upload = Korrektur desselben Monats) alle Diensteinträge eines
-- Monats atomar - ein reines Delete+Insert vom Client aus könnte bei einem
-- Netzwerkabbruch mittendrin einen Monat halb leer zurücklassen.
-- SECURITY DEFINER, weil der Client sonst zusätzliche DELETE/INSERT-Rechte
-- bräuchte, die Prüfung (has_role('admin')) erfolgt explizit in der Funktion.
create or replace function public.dienstplan_monat_ersetzen(p_monat date, p_dateiname text, p_dienste jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_monat_id uuid;
begin
  if not public.has_role('admin') then
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

revoke all on function public.dienstplan_monat_ersetzen(date, text, jsonb) from public, anon;
grant execute on function public.dienstplan_monat_ersetzen(date, text, jsonb) to authenticated;

-- Einen entworfenen Monat sichtbar schalten (siehe Lese-Policy oben) - dass
-- ein Admin zunächst die Spaltenzuordnung/Vorschau prüft, bevor der Monat für
-- alle Bediensteten (spätere persönliche Stunden-Übersicht) sichtbar wird.
create or replace function public.dienstplan_monat_veroeffentlichen(p_monat_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('admin') then
    raise exception 'Keine Berechtigung, den Dienstplan zu veröffentlichen.';
  end if;
  update public.dienstplan_monate set status = 'veroeffentlicht', veroeffentlicht_von = auth.uid(), veroeffentlicht_at = now()
  where id = p_monat_id;
end;
$$;

revoke all on function public.dienstplan_monat_veroeffentlichen(uuid) from public, anon;
grant execute on function public.dienstplan_monat_veroeffentlichen(uuid) to authenticated;
