-- Schwebendes Notiz-Widget über der Arbeitsfläche in Zentrale und
-- Innendienst (Ersatz für Klebezettel am Bildschirm, siehe
-- wichtige_telefonnummern für dasselbe Motiv). Zwei Sichtbarkeiten in einer
-- Tabelle: privat (nur die eigene, unabhängig vom Bereichszugriff der
-- anderen) und geteilt (Schicht-Pinnwand, z. B. Übergabe-Hinweise). Lesen
-- folgt dem Muster aus tagesfunktion_zugriff.sql
-- (has_portal_area_access('zentrale') or is_operative_duty_today()),
-- Schreiben bewusst enger auf zentrale+innendienst beschränkt
-- (is_zentralist_on_duty()), analog zur dortigen Begründung.

create table public.zentrale_notizen (
  id uuid primary key default gen_random_uuid(),
  bereich text not null check (bereich in ('zentrale', 'innendienst')),
  sichtbarkeit text not null default 'privat' check (sichtbarkeit in ('privat', 'geteilt')),
  text text not null check (length(trim(text)) between 1 and 2000),
  erledigt boolean not null default false,
  autor_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index zentrale_notizen_bereich_idx on public.zentrale_notizen (bereich, sichtbarkeit, erledigt);
create index zentrale_notizen_autor_idx on public.zentrale_notizen (autor_id);

create trigger zentrale_notizen_updated_at before update on public.zentrale_notizen
  for each row execute function public.update_updated_at();

alter table public.zentrale_notizen enable row level security;

create policy "zentrale_notizen lesen" on public.zentrale_notizen
  for select to authenticated
  using (
    autor_id = (select auth.uid())
    or (sichtbarkeit = 'geteilt' and (public.has_portal_area_access('zentrale') or public.is_operative_duty_today()))
  );

create policy "zentrale_notizen anlegen" on public.zentrale_notizen
  for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and (public.has_portal_area_access('zentrale') or public.is_zentralist_on_duty())
  );

create policy "zentrale_notizen ändern" on public.zentrale_notizen
  for update to authenticated
  using (
    autor_id = (select auth.uid())
    or (sichtbarkeit = 'geteilt' and (public.has_portal_area_access('zentrale') or public.is_zentralist_on_duty()))
  )
  with check (
    autor_id = (select auth.uid())
    or (sichtbarkeit = 'geteilt' and (public.has_portal_area_access('zentrale') or public.is_zentralist_on_duty()))
  );

create policy "zentrale_notizen löschen" on public.zentrale_notizen
  for delete to authenticated
  using (
    autor_id = (select auth.uid())
    or (sichtbarkeit = 'geteilt' and (public.has_portal_area_access('zentrale') or public.is_zentralist_on_duty()))
  );
