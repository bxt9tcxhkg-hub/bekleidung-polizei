-- Neuer Portalbereich "Datenpflege" (Schlüssel/Kontakte/Telefonnummern/
-- Fahndungen/Objekte/RSa-RSb) - bisher hingen diese Register technisch am
-- Bereich "zentrale", obwohl ihre Pflege inhaltlich eine eigene,
-- dauerhafte Administrationsrolle ist (nicht an eine Tagesfunktion
-- gebunden wie Zentrale/Innendienst/Außendienst). Stufe 1 dieses Umbaus:
-- neuer Bereich + Sachbearbeiter-Fähigkeit für die eindeutig zugeordneten
-- Register. Die tagesfunktionsbasierte Zugriffssteuerung für Zentrale/
-- Innendienst/Außendienst selbst (inkl. Sidebar-Umbau) folgt in einer
-- eigenen, weiteren Migration.

alter table public.portal_area_roles drop constraint portal_area_roles_area_check;
alter table public.portal_area_roles add constraint portal_area_roles_area_check
  check (area = any (array['bekleidung', 'einsatz_mt', 'schulungen', 'fuhrpark', 'zentrale', 'datenpflege']));

alter table public.portal_area_roles drop constraint portal_area_roles_roles_valid;
alter table public.portal_area_roles add constraint portal_area_roles_roles_valid
  check (
    ((area = 'bekleidung') and (roles <@ array['user', 'sachbearbeiter', 'genehmiger', 'admin']))
    or ((area = any (array['einsatz_mt', 'schulungen', 'fuhrpark', 'zentrale', 'datenpflege'])) and (roles <@ array['user', 'sachbearbeiter', 'admin']))
  );

-- Übergabe: wer heute schon Zentrale-Sachbearbeiter/Admin ist, bekommt
-- automatisch auch Datenpflege-Sachbearbeiter, damit die Register am Tag
-- der Umstellung nicht verwaist sind. Der Nutzer entscheidet danach, wer
-- das dauerhaft behält.
insert into public.portal_area_roles (user_id, area, roles)
select user_id, 'datenpflege', array['sachbearbeiter']
from public.portal_area_roles
where area = 'zentrale' and roles && array['sachbearbeiter', 'admin']::text[]
on conflict (user_id, area) do nothing;

create or replace function public.can_manage_datenpflege()
returns boolean
language sql
stable
set search_path to ''
as $$
  select public.has_role('admin') or public.has_role('genehmiger') or public.has_role('approver') or exists (
    select 1 from public.profiles p join public.portal_area_roles r on r.user_id = p.id
    where p.id = (select auth.uid()) and p.active and r.area = 'datenpflege'
      and r.roles && array['sachbearbeiter', 'admin']::text[]
  );
$$;

-- Lesen: zusätzlich zu "zentrale" (Bestandsverhalten, bis die Tagesfunktions-
-- Migration das ersetzt) jetzt auch mit reinem Datenpflege-Recht möglich.
drop policy "zentrale_schluessel lesen" on public.zentrale_schluessel;
create policy "zentrale_schluessel lesen" on public.zentrale_schluessel for select using (
  (has_portal_area_access('zentrale') or has_portal_area_access('datenpflege'))
  and ((not restricted) or can_manage_zentrale() or can_manage_datenpflege() or is_zentralist_on_duty())
);
drop policy "zentrale_schluessel anlegen" on public.zentrale_schluessel;
create policy "zentrale_schluessel anlegen" on public.zentrale_schluessel for insert with check ((has_role('admin') or can_manage_datenpflege()) and created_by = (select auth.uid()));
drop policy "zentrale_schluessel ändern" on public.zentrale_schluessel;
create policy "zentrale_schluessel ändern" on public.zentrale_schluessel for update using (has_role('admin') or can_manage_datenpflege()) with check (has_role('admin') or can_manage_datenpflege());
drop policy "zentrale_schluessel löschen" on public.zentrale_schluessel;
create policy "zentrale_schluessel löschen" on public.zentrale_schluessel for delete using (has_role('admin') or can_manage_datenpflege());

drop policy "zentrale_kontakte lesen" on public.zentrale_kontakte;
create policy "zentrale_kontakte lesen" on public.zentrale_kontakte for select using (
  (has_portal_area_access('zentrale') or has_portal_area_access('datenpflege'))
  and ((not restricted) or can_manage_zentrale() or can_manage_datenpflege() or is_zentralist_on_duty())
);
drop policy "zentrale_kontakte anlegen" on public.zentrale_kontakte;
create policy "zentrale_kontakte anlegen" on public.zentrale_kontakte for insert with check ((has_role('admin') or can_manage_datenpflege()) and created_by = (select auth.uid()));
drop policy "zentrale_kontakte ändern" on public.zentrale_kontakte;
create policy "zentrale_kontakte ändern" on public.zentrale_kontakte for update using (has_role('admin') or can_manage_datenpflege()) with check (has_role('admin') or can_manage_datenpflege());
drop policy "zentrale_kontakte löschen" on public.zentrale_kontakte;
create policy "zentrale_kontakte löschen" on public.zentrale_kontakte for delete using (has_role('admin') or can_manage_datenpflege());

drop policy "wichtige_telefonnummern lesen" on public.wichtige_telefonnummern;
create policy "wichtige_telefonnummern lesen" on public.wichtige_telefonnummern for select using (has_portal_area_access('zentrale') or has_portal_area_access('datenpflege'));
drop policy "wichtige_telefonnummern anlegen" on public.wichtige_telefonnummern;
create policy "wichtige_telefonnummern anlegen" on public.wichtige_telefonnummern for insert with check ((has_role('admin') or is_genehmiger() or can_manage_datenpflege()) and created_by = (select auth.uid()));
drop policy "wichtige_telefonnummern ändern" on public.wichtige_telefonnummern;
create policy "wichtige_telefonnummern ändern" on public.wichtige_telefonnummern for update using (has_role('admin') or is_genehmiger() or can_manage_datenpflege()) with check (has_role('admin') or is_genehmiger() or can_manage_datenpflege());
drop policy "wichtige_telefonnummern löschen" on public.wichtige_telefonnummern;
create policy "wichtige_telefonnummern löschen" on public.wichtige_telefonnummern for delete using (has_role('admin') or is_genehmiger() or can_manage_datenpflege());

drop policy "zentrale_fahndungen lesen" on public.zentrale_fahndungen;
create policy "zentrale_fahndungen lesen" on public.zentrale_fahndungen for select using (
  (has_portal_area_access('zentrale') or has_portal_area_access('datenpflege'))
  and ((not restricted) or can_manage_zentrale() or can_manage_datenpflege() or is_zentralist_on_duty())
);
drop policy "zentrale_fahndungen anlegen" on public.zentrale_fahndungen;
create policy "zentrale_fahndungen anlegen" on public.zentrale_fahndungen for insert with check ((can_manage_zentrale() or can_manage_datenpflege() or is_zentralist_on_duty()) and created_by = (select auth.uid()));
drop policy "zentrale_fahndungen ändern" on public.zentrale_fahndungen;
create policy "zentrale_fahndungen ändern" on public.zentrale_fahndungen for update using (can_manage_zentrale() or can_manage_datenpflege() or is_zentralist_on_duty()) with check (can_manage_zentrale() or can_manage_datenpflege() or is_zentralist_on_duty());
drop policy "zentrale_fahndungen löschen" on public.zentrale_fahndungen;
create policy "zentrale_fahndungen löschen" on public.zentrale_fahndungen for delete using (can_manage_zentrale() or can_manage_datenpflege() or is_zentralist_on_duty());

-- Objekte: gemeinsames Register (siehe Diskussion) - sowohl operativ (aus
-- Einsätzen) als auch von der Datenpflege eigenständig angelegt, deshalb
-- beide Zugriffswege gleichberechtigt statt nur "zentrale".
drop policy "Objekte lesen" on public.operational_objects;
create policy "Objekte lesen" on public.operational_objects for select using (has_portal_area_access('zentrale') or has_portal_area_access('datenpflege'));
drop policy "Objekte anlegen" on public.operational_objects;
create policy "Objekte anlegen" on public.operational_objects for insert with check ((has_portal_area_access('zentrale') or has_portal_area_access('datenpflege')) and created_by = (select auth.uid()));
drop policy "Objekte ändern" on public.operational_objects;
create policy "Objekte ändern" on public.operational_objects for update using (has_role('admin') or can_manage_datenpflege()) with check (has_role('admin') or can_manage_datenpflege());
drop policy "Objekte löschen" on public.operational_objects;
create policy "Objekte löschen" on public.operational_objects for delete using (has_role('admin') or can_manage_datenpflege());

-- RSa/RSb: für jeden aktiven Benutzer der Stadtpolizei offen (unabhängig von
-- jedem Portalbereich) - schwer erreichbare Personen können in jeder
-- Funktion auftauchen, das Anlegen/Bearbeiten darf nicht an eine
-- Bereichsberechtigung gebunden sein. Löschen bleibt bei den Verwaltern.
drop policy "RSa/RSb lesen" on public.mail_deliveries;
create policy "RSa/RSb lesen" on public.mail_deliveries for select using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active));
drop policy "RSa/RSb anlegen" on public.mail_deliveries;
create policy "RSa/RSb anlegen" on public.mail_deliveries for insert with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active) and created_by = (select auth.uid()));
drop policy "RSa/RSb bearbeiten" on public.mail_deliveries;
create policy "RSa/RSb bearbeiten" on public.mail_deliveries for update using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)) with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active));
drop policy "RSa/RSb löschen" on public.mail_deliveries;
create policy "RSa/RSb löschen" on public.mail_deliveries for delete using (can_manage_zentrale() or can_manage_datenpflege());

grant execute on function public.can_manage_datenpflege() to authenticated;
