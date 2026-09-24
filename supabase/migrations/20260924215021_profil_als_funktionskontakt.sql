-- Ein Funktionskontakt kann einen Registerkontakt oder einen aktiven
-- Portalbenutzer referenzieren. Profildaten werden nicht dupliziert.
alter table public.portal_funktionskontakte
  add column if not exists profil_id uuid references public.profiles(id) on delete set null,
  add column if not exists vertretung_profil_id uuid references public.profiles(id) on delete set null;
alter table public.portal_funktionskontakte
  drop constraint if exists funktionskontakt_eine_person,
  drop constraint if exists funktionskontakt_eine_vertretung,
  drop constraint if exists funktionskontakt_profil_telefon,
  drop constraint if exists funktionskontakt_profil_nicht_vertretung;
alter table public.portal_funktionskontakte
  add constraint funktionskontakt_eine_person check (num_nonnulls(kontakt_id, profil_id) <= 1),
  add constraint funktionskontakt_eine_vertretung check (num_nonnulls(vertretung_id, vertretung_profil_id) <= 1),
  add constraint funktionskontakt_profil_telefon check (profil_id is null or telefon_art is null or telefon_art in ('diensthandy','privathandy')),
  add constraint funktionskontakt_profil_nicht_vertretung check (profil_id is null or vertretung_profil_id is distinct from profil_id);
create index if not exists portal_funktionskontakte_profil_idx on public.portal_funktionskontakte (profil_id) where profil_id is not null;
create index if not exists portal_funktionskontakte_vertretung_profil_idx on public.portal_funktionskontakte (vertretung_profil_id) where vertretung_profil_id is not null;

alter table public.ereignis_verstaendigungsschritte
  add column if not exists profil_id uuid references public.profiles(id) on delete set null,
  add column if not exists vertretung_profil_id uuid references public.profiles(id) on delete set null;
create index if not exists ereignis_verstaendigungsschritte_profil_idx on public.ereignis_verstaendigungsschritte (profil_id) where profil_id is not null;
create index if not exists ereignis_verstaendigungsschritte_vertretung_profil_idx on public.ereignis_verstaendigungsschritte (vertretung_profil_id) where vertretung_profil_id is not null;

create or replace function public.erstelle_ereignis_verstaendigungsschritte()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.dimension = old.dimension then return new; end if;
  delete from public.ereignis_verstaendigungsschritte where ereignis_id = new.id;
  insert into public.ereignis_verstaendigungsschritte
    (ereignis_id, schluessel, bezeichnung, sortierung, pflicht, kontakt_id, telefon_art, vertretung_id, profil_id, vertretung_profil_id)
  select new.id, r.schluessel, r.bezeichnung, r.sortierung, r.pflicht,
    case when f.profil_id is not null then null else coalesce(f.kontakt_id, r.kontakt_id) end,
    case when f.profil_id is not null then f.telefon_art else coalesce(f.telefon_art, r.telefon_art) end,
    case when f.vertretung_profil_id is not null then null else coalesce(f.vertretung_id, r.vertretung_id) end,
    f.profil_id, f.vertretung_profil_id
  from public.verstaendigungsregeln r
  left join public.portal_funktionskontakte f on f.schluessel = r.funktionskontakt_key and f.aktiv
  where r.dimension = new.dimension;
  return new;
end;
$$;
revoke all on function public.erstelle_ereignis_verstaendigungsschritte() from public, anon, authenticated;

create or replace function public.aktualisiere_aktive_ereignis_funktionskontakte()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.ereignis_verstaendigungsschritte s
  set kontakt_id = case when new.aktiv and new.profil_id is not null then null else coalesce(case when new.aktiv then new.kontakt_id end, r.kontakt_id) end,
      profil_id = case when new.aktiv then new.profil_id end,
      telefon_art = case when new.aktiv and new.profil_id is not null then new.telefon_art else coalesce(case when new.aktiv then new.telefon_art end, r.telefon_art) end,
      vertretung_id = case when new.aktiv and new.vertretung_profil_id is not null then null else coalesce(case when new.aktiv then new.vertretung_id end, r.vertretung_id) end,
      vertretung_profil_id = case when new.aktiv then new.vertretung_profil_id end
  from public.ereignisse e, public.verstaendigungsregeln r
  where s.ereignis_id = e.id and e.status = 'aktiv'
    and r.dimension = e.dimension and r.schluessel = s.schluessel
    and r.funktionskontakt_key = new.schluessel;
  return new;
end;
$$;
revoke all on function public.aktualisiere_aktive_ereignis_funktionskontakte() from public, anon, authenticated;
drop trigger if exists portal_funktionskontakte_aktive_ereignisse on public.portal_funktionskontakte;
create trigger portal_funktionskontakte_aktive_ereignisse
after update of kontakt_id, profil_id, telefon_art, vertretung_id, vertretung_profil_id, aktiv on public.portal_funktionskontakte
for each row execute function public.aktualisiere_aktive_ereignis_funktionskontakte();
