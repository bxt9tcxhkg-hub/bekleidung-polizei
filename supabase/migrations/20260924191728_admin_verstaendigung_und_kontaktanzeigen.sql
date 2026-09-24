-- Regeln werden nur von Admins gepflegt. Bei Ereignisanlage/-umstufung
-- entsteht ein eigener Stand, damit spätere Regeländerungen laufende Einsätze
-- nicht rückwirkend verändern.
create table public.verstaendigungsregeln (
  id uuid primary key default gen_random_uuid(),
  dimension text not null check (dimension in ('mittel','gross','katastrophe')),
  schluessel text not null check (length(trim(schluessel)) between 1 and 120),
  bezeichnung text not null check (length(trim(bezeichnung)) between 1 and 200),
  sortierung integer not null default 0,
  pflicht boolean not null default true,
  kontakt_id uuid references public.zentrale_kontakte(id) on delete set null,
  telefon_art text check (telefon_art is null or telefon_art in ('buero','diensthandy','privathandy','weitere')),
  vertretung_id uuid references public.zentrale_kontakte(id) on delete set null,
  unique (dimension, schluessel),
  unique (dimension, bezeichnung),
  check (telefon_art is null or kontakt_id is not null)
);

create table public.ereignis_verstaendigungsschritte (
  ereignis_id uuid not null references public.ereignisse(id) on delete cascade,
  schluessel text not null,
  bezeichnung text not null,
  sortierung integer not null,
  pflicht boolean not null,
  kontakt_id uuid references public.zentrale_kontakte(id) on delete set null,
  telefon_art text,
  vertretung_id uuid references public.zentrale_kontakte(id) on delete set null,
  primary key (ereignis_id, schluessel)
);

alter table public.wichtige_telefonnummern
  add column kontakt_id uuid references public.zentrale_kontakte(id) on delete cascade,
  add column telefon_art text check (telefon_art is null or telefon_art in ('buero','diensthandy','privathandy','weitere')),
  add constraint wichtige_nummer_kontakt_art check ((kontakt_id is null and telefon_art is null) or (kontakt_id is not null and telefon_art is not null));

insert into public.verstaendigungsregeln (dimension, schluessel, bezeichnung, sortierung)
select d.dimension, r.schluessel, r.bezeichnung, r.sortierung
from (values ('mittel'),('gross'),('katastrophe')) d(dimension)
cross join (values
  ('burgermeisterin','Bürgermeister',10),
  ('notfallkoordinator','Notfallkoordinator',20),
  ('stadtamtsdirektor','Stadtamtsdirektor',30),
  ('leitung_gruppe_2','Leitung Gruppe 2',40),
  ('offentlichkeitsarbeit','Öffentlichkeitsarbeit',50),
  ('kdo_stadtpolizei','Kdo Stadtpolizei',60)
) r(schluessel,bezeichnung,sortierung)
where d.dimension <> 'mittel' or r.schluessel <> 'offentlichkeitsarbeit';

create or replace function public.erstelle_ereignis_verstaendigungsschritte()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.dimension = old.dimension then return new; end if;
  delete from public.ereignis_verstaendigungsschritte where ereignis_id = new.id;
  insert into public.ereignis_verstaendigungsschritte
    (ereignis_id, schluessel, bezeichnung, sortierung, pflicht, kontakt_id, telefon_art, vertretung_id)
  select new.id, schluessel, bezeichnung, sortierung, pflicht, kontakt_id, telefon_art, vertretung_id
  from public.verstaendigungsregeln where dimension = new.dimension;
  return new;
end;
$$;
revoke all on function public.erstelle_ereignis_verstaendigungsschritte() from public, anon, authenticated;
create trigger ereignis_verstaendigungsschritte_anlegen
  after insert or update of dimension on public.ereignisse
  for each row execute function public.erstelle_ereignis_verstaendigungsschritte();

insert into public.ereignis_verstaendigungsschritte
  (ereignis_id, schluessel, bezeichnung, sortierung, pflicht, kontakt_id, telefon_art, vertretung_id)
select e.id, r.schluessel, r.bezeichnung, r.sortierung, r.pflicht, r.kontakt_id, r.telefon_art, r.vertretung_id
from public.ereignisse e join public.verstaendigungsregeln r on r.dimension = e.dimension;

alter table public.verstaendigungsregeln enable row level security;
alter table public.ereignis_verstaendigungsschritte enable row level security;
create policy "Verstaendigungsregeln lesen" on public.verstaendigungsregeln for select to authenticated
  using (public.has_portal_area_access('zentrale'));
create policy "Verstaendigungsregeln anlegen" on public.verstaendigungsregeln for insert to authenticated
  with check (public.has_role('admin'));
create policy "Verstaendigungsregeln aendern" on public.verstaendigungsregeln for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "Verstaendigungsregeln loeschen" on public.verstaendigungsregeln for delete to authenticated
  using (public.has_role('admin'));
create policy "Ereignisschritte lesen" on public.ereignis_verstaendigungsschritte for select to authenticated
  using (public.has_portal_area_access('zentrale') or public.is_operative_duty_today());
revoke all on public.verstaendigungsregeln, public.ereignis_verstaendigungsschritte from anon;
grant select, insert, update, delete on public.verstaendigungsregeln to authenticated;
grant select on public.ereignis_verstaendigungsschritte to authenticated;
