-- Dienstplan-Planung im Portal, Phase 1: Planungsregeln (Sollstunden-
-- Formel-Parameter, Mindestruhezeit, Wunschfrist) als einstellbare
-- Singleton-Zeile statt hart codierter Werte, sowie persönliche
-- Einstellungen je Beamten (Beschäftigungsgrad; weitere künftige
-- Personal-Einstellungen landen im jsonb-Feld "zusatz" statt jedes Mal
-- eine neue Spalte/Migration zu brauchen).
--
-- Sollstunden werden bewusst NICHT (mehr) als ein einzelner Wert pro Monat
-- gespeichert (siehe dienstplan_monate.sollstunden, bleibt für bereits
-- importierte Monate als Altwert bestehen) - die Formel
-- (Werktage × Stunden pro Werktag × Beschäftigungsgrad/100, siehe
-- lib/dienstplanSollstunden.ts) ergibt je nach Beschäftigungsgrad einen
-- ANDEREN Wert pro Person, ein einzelner Monatswert könnte das nicht
-- abbilden. Wird clientseitig berechnet, nicht in der DB gespiegelt.

create table public.dienstplan_regeln (
  id smallint primary key default 1 check (id = 1),
  stunden_pro_werktag numeric not null default 8.75 check (stunden_pro_werktag > 0 and stunden_pro_werktag <= 24),
  mindestruhezeit_stunden numeric not null default 11 check (mindestruhezeit_stunden >= 0 and mindestruhezeit_stunden <= 48),
  wunschfrist_tage integer not null default 14 check (wunschfrist_tage >= 0 and wunschfrist_tage <= 90),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.dienstplan_regeln (id) values (1);

create trigger dienstplan_regeln_updated_at before update on public.dienstplan_regeln
for each row execute function public.update_updated_at();

alter table public.dienstplan_regeln enable row level security;
revoke all on public.dienstplan_regeln from anon, authenticated;
grant select, update on public.dienstplan_regeln to authenticated;

create policy "Dienstplan-Regeln lesen" on public.dienstplan_regeln
for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
);
create policy "Dienstplan-Regeln nur Planer ändern" on public.dienstplan_regeln
for update to authenticated using (public.has_role('admin') or public.has_role('genehmiger'))
with check (public.has_role('admin') or public.has_role('genehmiger'));

create table public.dienstplan_person_einstellungen (
  beamter_id uuid primary key references public.profiles(id) on delete cascade,
  beschaeftigungsgrad numeric not null default 100 check (beschaeftigungsgrad > 0 and beschaeftigungsgrad <= 100),
  zusatz jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger dienstplan_person_einstellungen_updated_at before update on public.dienstplan_person_einstellungen
for each row execute function public.update_updated_at();

alter table public.dienstplan_person_einstellungen enable row level security;
revoke all on public.dienstplan_person_einstellungen from anon, authenticated;
grant select, insert, update on public.dienstplan_person_einstellungen to authenticated;

create policy "Dienstplan-Personaleinstellungen lesen" on public.dienstplan_person_einstellungen
for select to authenticated using (
  beamter_id = (select auth.uid()) or public.has_role('admin') or public.has_role('genehmiger')
);
create policy "Dienstplan-Personaleinstellungen nur Planer anlegen" on public.dienstplan_person_einstellungen
for insert to authenticated with check (public.has_role('admin') or public.has_role('genehmiger'));
create policy "Dienstplan-Personaleinstellungen nur Planer ändern" on public.dienstplan_person_einstellungen
for update to authenticated using (public.has_role('admin') or public.has_role('genehmiger'))
with check (public.has_role('admin') or public.has_role('genehmiger'));
