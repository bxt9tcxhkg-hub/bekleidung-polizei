-- Funktionskontakte trennen die dauerhaft benötigte Funktion (z. B.
-- Bürgermeister oder Rechtsabteilung) von der jeweils aktuellen Person.
-- Dadurch bleiben Checklisten und Verständigungsregeln stabil, während der
-- Admin die konkrete Person und Rufnummer an einer Stelle austauschen kann.
create table public.zentrale_kontakt_institutionen (
  name text primary key check (length(trim(name)) between 1 and 200),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

update public.zentrale_kontakte
set institution = nullif(trim(institution), '')
where institution is distinct from nullif(trim(institution), '');

insert into public.zentrale_kontakt_institutionen (name)
select distinct trim(institution)
from public.zentrale_kontakte
where nullif(trim(institution), '') is not null;

alter table public.zentrale_kontakte
  add constraint zentrale_kontakte_institution_fkey
  foreign key (institution) references public.zentrale_kontakt_institutionen(name)
  on update cascade on delete restrict;

create table public.portal_funktionskontakte (
  schluessel text primary key check (length(trim(schluessel)) between 1 and 120),
  bezeichnung text not null unique check (length(trim(bezeichnung)) between 1 and 200),
  gruppe text not null check (gruppe in ('stadtfuehrung','einsatzorganisation','fachabteilung')),
  sortierung integer not null default 0,
  kontakt_id uuid references public.zentrale_kontakte(id) on delete set null,
  telefon_art text check (telefon_art is null or telefon_art in ('buero','diensthandy','privathandy','weitere')),
  vertretung_id uuid references public.zentrale_kontakte(id) on delete set null,
  aktiv boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (telefon_art is null or kontakt_id is not null),
  check (vertretung_id is null or vertretung_id is distinct from kontakt_id)
);

create index portal_funktionskontakte_kontakt_id_idx
  on public.portal_funktionskontakte (kontakt_id) where kontakt_id is not null;
create index portal_funktionskontakte_vertretung_id_idx
  on public.portal_funktionskontakte (vertretung_id) where vertretung_id is not null;
create index portal_funktionskontakte_updated_by_idx
  on public.portal_funktionskontakte (updated_by) where updated_by is not null;

insert into public.portal_funktionskontakte (schluessel, bezeichnung, gruppe, sortierung) values
  ('buergermeister','Bürgermeister','stadtfuehrung',10),
  ('vizebuergermeister','Vizebürgermeister/in','stadtfuehrung',20),
  ('stadtamtsdirektor','Stadtamtsdirektor','stadtfuehrung',30),
  ('leitung_gruppe_2','Leitung Gruppe 2','stadtfuehrung',40),
  ('notfallkoordinator','Notfallkoordinator','einsatzorganisation',50),
  ('katastrophenschutz','Katastrophenschutz','einsatzorganisation',60),
  ('kdo_stadtpolizei','Kommando Stadtpolizei','einsatzorganisation',70),
  ('feuerwehr','Feuerwehr','einsatzorganisation',80),
  ('rotes_kreuz','Rotes Kreuz','einsatzorganisation',90),
  ('kuechenmannschaft_feuerwehr','Küchenmannschaft Feuerwehr','einsatzorganisation',100),
  ('kit','Kriseninterventionsteam (KIT)','einsatzorganisation',110),
  ('familienkrisendienst','Familienkrisendienst','einsatzorganisation',120),
  ('caritas','Caritas','einsatzorganisation',130),
  ('ifs','Institut für Sozialdienste (ifs)','einsatzorganisation',140),
  ('rechtsabteilung','Leiterin der Rechtsabteilung','fachabteilung',150),
  ('oeffentlichkeitsarbeit','Öffentlichkeitsarbeit','fachabteilung',160),
  ('soziales','Leitung Soziales','fachabteilung',170),
  ('wohnungsamt','Wohnungsamt','fachabteilung',180),
  ('vermoegen','Leitung Vermögen','fachabteilung',190);

-- Eindeutige vorhandene Kontakte sicher zuordnen. Bei mehreren Treffern
-- (aktuell z. B. Notfallkoordinatoren) entscheidet der Admin bewusst.
with kandidaten as (
  select f.schluessel, (array_agg(k.id))[1] as kontakt_id
  from public.portal_funktionskontakte f
  join public.zentrale_kontakte k
    on lower(trim(k.funktion)) = lower(trim(f.bezeichnung))
    or lower(trim(k.name)) = lower(trim(f.bezeichnung))
  group by f.schluessel
  having count(*) = 1
)
update public.portal_funktionskontakte f
set kontakt_id = k.kontakt_id
from kandidaten k
where f.schluessel = k.schluessel;

alter table public.verstaendigungsregeln
  add column funktionskontakt_key text references public.portal_funktionskontakte(schluessel) on update cascade on delete set null;

create index verstaendigungsregeln_funktionskontakt_key_idx
  on public.verstaendigungsregeln (funktionskontakt_key) where funktionskontakt_key is not null;

update public.verstaendigungsregeln
set funktionskontakt_key = case schluessel
  when 'burgermeisterin' then 'buergermeister'
  when 'offentlichkeitsarbeit' then 'oeffentlichkeitsarbeit'
  else schluessel
end
where (case schluessel
  when 'burgermeisterin' then 'buergermeister'
  when 'offentlichkeitsarbeit' then 'oeffentlichkeitsarbeit'
  else schluessel
end) in (select schluessel from public.portal_funktionskontakte);

create or replace function public.erstelle_ereignis_verstaendigungsschritte()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.dimension = old.dimension then return new; end if;
  delete from public.ereignis_verstaendigungsschritte where ereignis_id = new.id;
  insert into public.ereignis_verstaendigungsschritte
    (ereignis_id, schluessel, bezeichnung, sortierung, pflicht, kontakt_id, telefon_art, vertretung_id)
  select new.id, r.schluessel, r.bezeichnung, r.sortierung, r.pflicht,
    coalesce(f.kontakt_id, r.kontakt_id), coalesce(f.telefon_art, r.telefon_art),
    coalesce(f.vertretung_id, r.vertretung_id)
  from public.verstaendigungsregeln r
  left join public.portal_funktionskontakte f on f.schluessel = r.funktionskontakt_key and f.aktiv
  where r.dimension = new.dimension;
  return new;
end;
$$;
revoke all on function public.erstelle_ereignis_verstaendigungsschritte() from public, anon, authenticated;

create trigger portal_funktionskontakte_updated_at before update on public.portal_funktionskontakte
for each row execute function public.update_updated_at();

alter table public.portal_funktionskontakte enable row level security;
alter table public.zentrale_kontakt_institutionen enable row level security;
revoke all on public.portal_funktionskontakte, public.zentrale_kontakt_institutionen from anon, authenticated;
grant select, insert, update, delete on public.portal_funktionskontakte, public.zentrale_kontakt_institutionen to authenticated;

create policy "Funktionskontakte dienstlich lesen" on public.portal_funktionskontakte
for select to authenticated using (
  public.has_role('admin') or public.has_portal_area_access('zentrale')
  or public.has_portal_area_access('datenpflege') or public.is_operative_duty_today()
);
create policy "Funktionskontakte nur Admin anlegen" on public.portal_funktionskontakte
for insert to authenticated with check (public.has_role('admin'));
create policy "Funktionskontakte nur Admin aendern" on public.portal_funktionskontakte
for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "Funktionskontakte nur Admin loeschen" on public.portal_funktionskontakte
for delete to authenticated using (public.has_role('admin'));

create policy "Kontaktinstitutionen dienstlich lesen" on public.zentrale_kontakt_institutionen
for select to authenticated using (
  public.has_role('admin') or public.has_portal_area_access('zentrale')
  or public.has_portal_area_access('datenpflege') or public.is_operative_duty_today()
);
create policy "Kontaktinstitutionen verwalten" on public.zentrale_kontakt_institutionen
for insert to authenticated with check (
  (public.has_role('admin') or public.can_manage_datenpflege())
  and created_by = (select auth.uid())
);
