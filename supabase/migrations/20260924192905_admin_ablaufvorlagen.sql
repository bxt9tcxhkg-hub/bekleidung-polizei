-- Bearbeitbare Vorlagen und eingefrorene Ablaufpunkte pro Einsatz/Ereignis.
create table public.ablaufvorlagen (
 id uuid primary key default gen_random_uuid(),
 typ text not null check (typ in ('erstmeldung','notunterkunft','entscheidung')),
 schluessel text not null check (length(trim(schluessel)) between 1 and 120),
 bezeichnung text not null check (length(trim(bezeichnung)) between 1 and 500),
 sortierung integer not null default 0,
 aktiv boolean not null default true,
 unique (typ, schluessel)
);
insert into public.ablaufvorlagen (typ, schluessel, bezeichnung, sortierung) values
  ('erstmeldung', 'anweisungen_abwarten', 'Anweisungen abwarten (Sofortmaßnahmen, Ort der Einsatzleitung, Einberufung Einsatzleitung)', 80),
  ('erstmeldung', 'in_lage_einfuehren', 'Personen der Stadteinsatzleitung in Lage einführen, nach Anweisung', 100),
  ('erstmeldung', 'erkundung', 'Erkundung anweisen (mit Einsatzleitung, KatSchutz) und Lageinformation an Stadteinsatzleitung weitergeben, nach Anweisung', 110),
  ('erstmeldung', 'sofortmassnahmen', 'Sofortmaßnahmen setzen, nach Anweisung', 120),
  ('erstmeldung', 'fuehrung_uebernommen', 'Lage und Führung wird durch Stadteinsatzleitung übernommen', 130),
  ('erstmeldung', 'verbindungsoffizier', 'Verbindungsoffizier in Stadteinsatzleitung entsenden', 140),
  ('erstmeldung', 'meldungszettel_uebergeben', 'Meldungszettel an Stadteinsatzleitung übergeben', 150),
  ('notunterkunft', 'sammelstelle', 'Sammelstelle einrichten vor Ort (Einsatzleiter, KatSchutz, RK)', 10),
  ('notunterkunft', 'pls_besprechung', 'PLS durch RK, kurze Besprechung vor Ort Polizei/FW/RK zur Koordinierung Sammelraum', 20),
  ('notunterkunft', 'alarmgruppe_info', 'Alarmgruppe Dornbirn / Stadteinsatzleitung informieren (WhatsApp und Telefon, Bgm!)', 30),
  ('notunterkunft', 'betroffenheit_klaeren', 'Betroffenheit klären: Anzahl Personen, ab wann Unterkunft benötigt, voraussichtliche Dauer', 40),
  ('notunterkunft', 'meldeverzeichnis', 'Abfrage Meldeverzeichnis durch Stadtpolizei: Anzahl, Namen Bewohner (ZMR-Auszug → Namensliste übernehmen)', 50),
  ('notunterkunft', 'stadteinsatzleitung_noetig', 'Abklärung ob Stadteinsatzleitung benötigt wird (KatSchutz)', 60),
  ('notunterkunft', 'transport_sammelraum', 'Transport zum Sammelraum (Feuerwehr, RK, KatSchutz)', 70),
  ('notunterkunft', 'namensliste_erfassen', 'Erfassung Personen mittels Namensliste (und RK PLS), (KatSchutz)', 80),
  ('notunterkunft', 'betreuung_rk', 'Betreuung Personen durch RK', 90),
  ('notunterkunft', 'akutbetreuung', 'Weitere Akutbetreuung: KIT, Familienkrisendienst, CARITAS, IFS, RK? (KatSchutz, RK)', 100),
  ('notunterkunft', 'alarmierung_personal', 'Alarmierung notwendiges Personal als Unterstützung KatSchutz', 110),
  ('notunterkunft', 'kuechenmannschaft', 'Benachrichtigung Küchenmannschaft Feuerwehr: Versorgung sicherstellen (mit RK)', 120),
  ('notunterkunft', 'kurzfristige_quartiere', 'Abklärung kurzfristig möglicher Quartiere mit Betroffenen? Nachbarn, Verwandte? (KatSchutz)', 130),
  ('notunterkunft', 'folder_brand', 'Übergabe Folder „Was tun nach einem Brand" bei Brandereignis', 140),
  ('notunterkunft', 'besprechung_vorgehen', 'Einberufung Besprechung weitere Vorgehensweise mit allen notwendigen Personen (FW, RK, Polizei, Vertreter Stadt Dornbirn, Vermieter etc.) (KatSchutz)', 150),
  ('notunterkunft', 'information_stellen', 'Information an Bgm., SAD, Abt. Recht, Abt. Soziales, Wohnungsamt, Stadtpolizei, Abt. Vermögen', 160),
  ('notunterkunft', 'mittelfristige_unterbringung', 'Abklärung mittelfristige Unterbringung (Vertreter Stadt Dornbirn, Vermieter)', 170),
  ('notunterkunft', 'medienmitteilung', 'Anschließend Medienmitteilung (S5)', 180),
  ('notunterkunft', 'ueberfuehrung_notquartier', 'Überführung der Personen in kurzfristige Notquartiere / Beherbergungsbetriebe (FW, RK, Polizei)', 190),
  ('notunterkunft', 'uebergabe_soziales', 'Am nächsten Werktag / nach Akutphase: Organisation der sozialen Betreuung und Übergabe der Koordinierung an Abt. Soziales (Übergabe durch KatSchutz)', 200),
  ('entscheidung', 'sofortmanahmen_festlegen', 'Sofortmaßnahmen festlegen', 10),
  ('entscheidung', 'ort_der_einsatzleitung', 'Ort der Einsatzleitung', 20),
  ('entscheidung', 'einberufung_stadteinsatzleitung', 'Einberufung Stadteinsatzleitung', 30),
  ('entscheidung', 'zivilschutzalarm', 'Zivilschutzalarm', 40);

create table public.einsatz_ablauf_schritte (
 incident_id uuid not null references public.incident_reports(id) on delete cascade,
 typ text not null check (typ in ('erstmeldung','notunterkunft')),
 schluessel text not null,
 bezeichnung text not null,
 sortierung integer not null,
 primary key (incident_id, typ, schluessel)
);
create table public.ereignis_entscheidungsschritte (
 ereignis_id uuid not null references public.ereignisse(id) on delete cascade,
 schluessel text not null,
 bezeichnung text not null,
 sortierung integer not null,
 primary key (ereignis_id, schluessel)
);

create or replace function public.snapshot_einsatz_ablauf() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.einsatz_ablauf_schritte (incident_id,typ,schluessel,bezeichnung,sortierung)
 select new.id,typ,schluessel,bezeichnung,sortierung from public.ablaufvorlagen
 where aktiv and typ in ('erstmeldung','notunterkunft');
 return new;
end; $$;
revoke all on function public.snapshot_einsatz_ablauf() from public,anon,authenticated;
create trigger einsatz_ablauf_anlegen after insert on public.incident_reports
for each row execute function public.snapshot_einsatz_ablauf();

create or replace function public.snapshot_ereignis_entscheidungen() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.ereignis_entscheidungsschritte (ereignis_id,schluessel,bezeichnung,sortierung)
 select new.id,schluessel,bezeichnung,sortierung from public.ablaufvorlagen
 where aktiv and typ = 'entscheidung';
 return new;
end; $$;
revoke all on function public.snapshot_ereignis_entscheidungen() from public,anon,authenticated;
create trigger ereignis_entscheidungen_anlegen after insert on public.ereignisse
for each row execute function public.snapshot_ereignis_entscheidungen();

insert into public.einsatz_ablauf_schritte (incident_id,typ,schluessel,bezeichnung,sortierung)
select r.id,v.typ,v.schluessel,v.bezeichnung,v.sortierung from public.incident_reports r
cross join public.ablaufvorlagen v where v.aktiv and v.typ in ('erstmeldung','notunterkunft');
insert into public.ereignis_entscheidungsschritte (ereignis_id,schluessel,bezeichnung,sortierung)
select e.id,v.schluessel,v.bezeichnung,v.sortierung from public.ereignisse e
cross join public.ablaufvorlagen v where v.aktiv and v.typ='entscheidung';

alter table public.ablaufvorlagen enable row level security;
alter table public.einsatz_ablauf_schritte enable row level security;
alter table public.ereignis_entscheidungsschritte enable row level security;
create policy "Ablaufvorlagen lesen" on public.ablaufvorlagen for select to authenticated
 using (public.has_portal_area_access('zentrale'));
create policy "Ablaufvorlagen verwalten" on public.ablaufvorlagen for all to authenticated
 using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "Einsatzablauf lesen" on public.einsatz_ablauf_schritte for select to authenticated
 using (public.has_portal_area_access('zentrale') or public.is_operative_duty_today());
create policy "Ereignisentscheidungen lesen" on public.ereignis_entscheidungsschritte for select to authenticated
 using (public.has_portal_area_access('zentrale') or public.is_operative_duty_today());
revoke all on public.ablaufvorlagen,public.einsatz_ablauf_schritte,public.ereignis_entscheidungsschritte from anon;
grant select,insert,update,delete on public.ablaufvorlagen to authenticated;
grant select on public.einsatz_ablauf_schritte,public.ereignis_entscheidungsschritte to authenticated;
