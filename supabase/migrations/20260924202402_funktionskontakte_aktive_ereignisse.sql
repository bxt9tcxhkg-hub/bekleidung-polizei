-- Die Verständigungsschritte bleiben je Ereignis fest, aber die zuständige
-- Person und ihre Rufnummer müssen bei aktiven Ereignissen aktuell bleiben.
-- Abgeschlossene Ereignisse behalten ihren bisherigen Stand.
create or replace function public.aktualisiere_aktive_ereignis_funktionskontakte()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.ereignis_verstaendigungsschritte s
  set kontakt_id = coalesce(case when new.aktiv then new.kontakt_id end, r.kontakt_id),
      telefon_art = coalesce(case when new.aktiv then new.telefon_art end, r.telefon_art),
      vertretung_id = coalesce(case when new.aktiv then new.vertretung_id end, r.vertretung_id)
  from public.ereignisse e, public.verstaendigungsregeln r
  where s.ereignis_id = e.id
    and e.status = 'aktiv'
    and r.dimension = e.dimension
    and r.schluessel = s.schluessel
    and r.funktionskontakt_key = new.schluessel
    and (s.kontakt_id, s.telefon_art, s.vertretung_id) is distinct from
        (coalesce(case when new.aktiv then new.kontakt_id end, r.kontakt_id),
         coalesce(case when new.aktiv then new.telefon_art end, r.telefon_art),
         coalesce(case when new.aktiv then new.vertretung_id end, r.vertretung_id));
  return new;
end;
$$;
revoke all on function public.aktualisiere_aktive_ereignis_funktionskontakte() from public, anon, authenticated;

create trigger portal_funktionskontakte_aktive_ereignisse
after update of kontakt_id, telefon_art, vertretung_id, aktiv on public.portal_funktionskontakte
for each row execute function public.aktualisiere_aktive_ereignis_funktionskontakte();

-- Ein Entfernen darf Verständigungsregeln nicht still von der Funktion lösen.
create or replace function public.pruefe_funktionskontakt_loeschung()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.verstaendigungsregeln where funktionskontakt_key = old.schluessel) then
    raise exception 'Funktion wird in einem Verständigungsschema verwendet';
  end if;
  return old;
end;
$$;
revoke all on function public.pruefe_funktionskontakt_loeschung() from public, anon, authenticated;

create trigger portal_funktionskontakte_loeschung_pruefen
before delete on public.portal_funktionskontakte
for each row execute function public.pruefe_funktionskontakt_loeschung();

-- Bestehende aktive Ereignisse bekommen ihre aktuell zugeordneten Kontakte.
update public.ereignis_verstaendigungsschritte s
set kontakt_id = coalesce(f.kontakt_id, r.kontakt_id),
    telefon_art = coalesce(f.telefon_art, r.telefon_art),
    vertretung_id = coalesce(f.vertretung_id, r.vertretung_id)
from public.ereignisse e
join public.verstaendigungsregeln r on r.dimension = e.dimension
left join public.portal_funktionskontakte f on f.schluessel = r.funktionskontakt_key and f.aktiv
where s.ereignis_id = e.id
  and e.status = 'aktiv'
  and s.schluessel = r.schluessel
  and (s.kontakt_id, s.telefon_art, s.vertretung_id) is distinct from
      (coalesce(f.kontakt_id, r.kontakt_id), coalesce(f.telefon_art, r.telefon_art), coalesce(f.vertretung_id, r.vertretung_id));
