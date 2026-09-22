-- Testdaten-Kennzeichnung + Wipe (eine DB, kein Supabase-Branching).
--
-- Konvention (siehe docs/TESTDATEN.md):
--   1) Test-Benutzer (profiles): username beginnt mit 'test_', name mit '[TEST] ',
--      profiles.is_test = true.
--   2) Fachdaten, die ein Test-Benutzer über die üblichen Eigentümer-Spalten
--      (created_by / user_id / officer_id / beamter_id / requester_id / requested_by)
--      angelegt hat bzw. deren Subjekt ein Test-Benutzer ist, gelten als Testdaten.
--   3) Fachdaten mit freitextlichem Titel/Namen, der mit '[TEST] ' beginnt, gelten
--      unabhängig vom Ersteller als Testdaten (falls Tester Daten für echte Profile
--      anlegen, z.B. Demo-Produkte).
--   4) Dateien in R2 mit Präfix 'test/' oder Dateiname '[TEST]…' sind ebenfalls
--      Testdaten (werden von wipe_test_data() NICHT angefasst — R2 ist kein Postgres,
--      das Aufräumen dort erfolgt separat, siehe docs/TESTDATEN.md).
--
-- 1) profiles.is_test
alter table public.profiles
  add column if not exists is_test boolean not null default false;

comment on column public.profiles.is_test is
  'Kennzeichnet Test-/Demo-Accounts. Wird von wipe_test_data() verwendet, um alle davon '
  'abhängigen Fachdaten und den Account selbst gefahrlos zu löschen. Niemals bei echten '
  'Bediensteten setzen.';

create index if not exists idx_profiles_is_test
  on public.profiles (is_test)
  where is_test;

-- 2) wipe_test_data()
--
-- Löscht alle Testdaten in zwei Schritten:
--   a) Fachdaten-Zeilen, deren primäre "Eigentümer"-Spalte (siehe Whitelist unten) auf
--      einen Test-Account zeigt, ODER deren freitextlicher Titel/Name mit '[TEST] '
--      beginnt.
--   b) Danach werden alle noch verbliebenen (nullbaren) Fremdschlüssel-Spalten, die
--      irgendwo im public-Schema auf profiles(id) zeigen (z.B. Zweit-Rollen wie
--      reviewed_by/approved_by/checked_by auf ECHTEN Datensätzen, die zufällig von
--      einem Tester bearbeitet wurden), automatisch auf NULL gesetzt — generisch über
--      pg_constraint ermittelt, damit neue Spalten/Tabellen künftiger Migrationen
--      automatisch mit abgedeckt sind, ohne diese Funktion anpassen zu müssen.
--   c) Erst danach werden die Test-Profile (und wenn möglich die zugehörigen
--      auth.users) gelöscht. profiles selbst steht deshalb konsequent am Ende der
--      FK-sicheren Löschreihenfolge.
--
-- Tabellen mit ON DELETE CASCADE auf profiles/übergeordnete Fachdaten (z.B.
-- orders.user_id, user_budgets.user_id, schutzbereiche.schutzfall_id,
-- zentrale_entries.incident_id, …) müssen hier NICHT explizit aufgeführt werden —
-- sie werden automatisch mitgelöscht, sobald die jeweilige Elternzeile fällt.
--
-- WHITELIST der explizit geprüften Tabellen (Eigentümer-Spalte laut Konvention
-- created_by / user_id / officer_id / beamter_id / requester_id / requested_by,
-- optional zusätzlich ein Titel-/Namensfeld für die '[TEST] '-Regel):
--   audit_log(user_id), duty_assignments(user_id),
--   einsatz_materials(created_by, title), einsatz_namensliste(created_by),
--   einsatz_parteien(created_by), einsatz_training_assignments(officer_id),
--   einsatz_training_attendance(officer_id), einsatz_training_completions(officer_id),
--   einsatz_training_registrations(officer_id), fleet_appointments(created_by, subject),
--   fleet_care_tasks(created_by, subject), grundausstattung(created_by),
--   innendienst_records(created_by, subject), innendienst_shift_tasks(user_id),
--   mail_deliveries(created_by), operational_person_notes(created_by),
--   operational_phone_numbers(created_by), orders(user_id),
--   personal_einsatzmittel(officer_id), personal_einsatzmittel_requests(requester_id),
--   pool_einsatzmittel_requests(requested_by), portal_area_roles(user_id),
--   schulungen_assignments(officer_id), schulungen_completions(officer_id),
--   schulungen_registrations(officer_id), schutzkontrollen(created_by),
--   shoe_refund_caps(created_by), shoe_refunds(user_id), stock_orders(requested_by),
--   ueberstunden_meldungen(beamter_id), user_budgets(user_id),
--   wichtige_telefonnummern(created_by, bezeichnung),
--   zentrale_alarmierung(created_by, anlass), zentrale_av_bv(created_by, grund),
--   zentrale_baustellen(created_by, titel), zentrale_fahndungen(created_by, beschreibung),
--   zentrale_kontakte(created_by, name), zentrale_schluessel(created_by, schluessel_nummer),
--   zentrale_unterlagen(created_by, titel), einsatz_material_tabs(created_by, name),
--   einsatz_training_participations(officer_id), fleet_check_items(created_by, name),
--   fleet_equipment_items(created_by, name), innendienst_gebuehrenpositionen(created_by, name),
--   innendienst_gebuehrensaetze(created_by, name), deliveries(created_by, vorrechnung_name),
--   schulungen_sessions(created_by), products(name), strassenzustand_auftraggeber(name),
--   strassenzustand_berichte(nummer), strassenzustand_melder(name),
--   strassenzustand_strassen(name), support_tickets(user_id), zentrale_entries(created_by, title),
--   einsatz_training_sessions(created_by), quarters(name), schulungen_module(created_by, name),
--   incident_reports(created_by), schutzfaelle(created_by), einsatz_training_modules(created_by, name),
--   pool_einsatzmittel(created_by), fleet_vehicles(created_by, name),
--   operational_persons(created_by), operational_objects(created_by, label)
--
-- Bewusst NICHT in der Whitelist (kein created_by/user_id/officer_id-Pendant, reine
-- Statuszeilen oder sekundäre Bearbeiter-Spalten wie checked_by/reviewed_by/bearbeiter):
-- inventory, tailor_jobs, duty_functions, vehicle_checks, fleet_check_item_status,
-- fleet_equipment_status, strassenzustand_berichtzeilen, support_messages,
-- innendienst_gebuehrensatz_positionen, schutzbereiche, schutzfall_personen.
-- Diese hängen entweder per ON DELETE CASCADE an einer oben gelisteten Tabelle (werden
-- also automatisch mitgelöscht) oder ihre einzige profiles-Referenz ist eine sekundäre
-- Bearbeiter-Spalte, die im generischen NULL-Schritt (b) bereinigt wird.
create or replace function public.wipe_test_data()
returns table(tabelle text, geloescht bigint)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_test_ids uuid[];
  v_n bigint;
  v_fk record;
begin
  -- Nur Admins (wie bei den übrigen privilegierten RPCs im Projekt: public.has_role('admin'))
  -- oder Aufrufe mit dem Service-Role-Key (PostgREST verbindet dann als Postgres-Rolle
  -- 'service_role') dürfen wipen.
  if not (public.has_role('admin') or session_user = 'service_role') then
    raise exception 'wipe_test_data: nicht autorisiert (nur Admin oder Service-Role)'
      using errcode = '42501';
  end if;

  create temporary table if not exists _wipe_report (tabelle text, geloescht bigint)
    on commit drop;
  delete from _wipe_report;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_test_ids
  from public.profiles where is_test = true;

  if array_length(v_test_ids, 1) is null then
    return query select t.tabelle, t.geloescht from _wipe_report t;
    return;
  end if;

  -- Schritt a) Fachdaten in FK-sicherer Reihenfolge (Kinder vor Eltern) löschen.
  DELETE FROM public.audit_log WHERE user_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('audit_log', v_n); END IF;

  DELETE FROM public.duty_assignments WHERE user_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('duty_assignments', v_n); END IF;

  DELETE FROM public.einsatz_materials WHERE created_by = ANY(v_test_ids) OR title LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('einsatz_materials', v_n); END IF;

  DELETE FROM public.einsatz_namensliste WHERE created_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('einsatz_namensliste', v_n); END IF;

  DELETE FROM public.einsatz_parteien WHERE created_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('einsatz_parteien', v_n); END IF;

  DELETE FROM public.einsatz_training_assignments WHERE officer_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('einsatz_training_assignments', v_n); END IF;

  DELETE FROM public.einsatz_training_attendance WHERE officer_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('einsatz_training_attendance', v_n); END IF;

  DELETE FROM public.einsatz_training_completions WHERE officer_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('einsatz_training_completions', v_n); END IF;

  DELETE FROM public.einsatz_training_registrations WHERE officer_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('einsatz_training_registrations', v_n); END IF;

  DELETE FROM public.fleet_appointments WHERE created_by = ANY(v_test_ids) OR subject LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('fleet_appointments', v_n); END IF;

  DELETE FROM public.fleet_care_tasks WHERE created_by = ANY(v_test_ids) OR subject LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('fleet_care_tasks', v_n); END IF;

  DELETE FROM public.grundausstattung WHERE created_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('grundausstattung', v_n); END IF;

  DELETE FROM public.innendienst_records WHERE created_by = ANY(v_test_ids) OR subject LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('innendienst_records', v_n); END IF;

  DELETE FROM public.innendienst_shift_tasks WHERE user_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('innendienst_shift_tasks', v_n); END IF;

  DELETE FROM public.mail_deliveries WHERE created_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('mail_deliveries', v_n); END IF;

  DELETE FROM public.operational_person_notes WHERE created_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('operational_person_notes', v_n); END IF;

  DELETE FROM public.operational_phone_numbers WHERE created_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('operational_phone_numbers', v_n); END IF;

  DELETE FROM public.orders WHERE user_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('orders', v_n); END IF;

  DELETE FROM public.personal_einsatzmittel WHERE officer_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('personal_einsatzmittel', v_n); END IF;

  DELETE FROM public.personal_einsatzmittel_requests WHERE requester_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('personal_einsatzmittel_requests', v_n); END IF;

  DELETE FROM public.pool_einsatzmittel_requests WHERE requested_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('pool_einsatzmittel_requests', v_n); END IF;

  DELETE FROM public.portal_area_roles WHERE user_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('portal_area_roles', v_n); END IF;

  DELETE FROM public.schulungen_assignments WHERE officer_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('schulungen_assignments', v_n); END IF;

  DELETE FROM public.schulungen_completions WHERE officer_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('schulungen_completions', v_n); END IF;

  DELETE FROM public.schulungen_registrations WHERE officer_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('schulungen_registrations', v_n); END IF;

  DELETE FROM public.schutzkontrollen WHERE created_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('schutzkontrollen', v_n); END IF;

  DELETE FROM public.shoe_refund_caps WHERE created_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('shoe_refund_caps', v_n); END IF;

  DELETE FROM public.shoe_refunds WHERE user_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('shoe_refunds', v_n); END IF;

  DELETE FROM public.stock_orders WHERE requested_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('stock_orders', v_n); END IF;

  DELETE FROM public.ueberstunden_meldungen WHERE beamter_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('ueberstunden_meldungen', v_n); END IF;

  DELETE FROM public.user_budgets WHERE user_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('user_budgets', v_n); END IF;

  DELETE FROM public.wichtige_telefonnummern WHERE created_by = ANY(v_test_ids) OR bezeichnung LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('wichtige_telefonnummern', v_n); END IF;

  DELETE FROM public.zentrale_alarmierung WHERE created_by = ANY(v_test_ids) OR anlass LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('zentrale_alarmierung', v_n); END IF;

  DELETE FROM public.zentrale_av_bv WHERE created_by = ANY(v_test_ids) OR grund LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('zentrale_av_bv', v_n); END IF;

  DELETE FROM public.zentrale_baustellen WHERE created_by = ANY(v_test_ids) OR titel LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('zentrale_baustellen', v_n); END IF;

  DELETE FROM public.zentrale_fahndungen WHERE created_by = ANY(v_test_ids) OR beschreibung LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('zentrale_fahndungen', v_n); END IF;

  DELETE FROM public.zentrale_kontakte WHERE created_by = ANY(v_test_ids) OR name LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('zentrale_kontakte', v_n); END IF;

  DELETE FROM public.zentrale_schluessel WHERE created_by = ANY(v_test_ids) OR schluessel_nummer LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('zentrale_schluessel', v_n); END IF;

  DELETE FROM public.zentrale_unterlagen WHERE created_by = ANY(v_test_ids) OR titel LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('zentrale_unterlagen', v_n); END IF;

  DELETE FROM public.einsatz_material_tabs WHERE created_by = ANY(v_test_ids) OR name LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('einsatz_material_tabs', v_n); END IF;

  DELETE FROM public.einsatz_training_participations WHERE officer_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('einsatz_training_participations', v_n); END IF;

  DELETE FROM public.fleet_check_items WHERE created_by = ANY(v_test_ids) OR name LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('fleet_check_items', v_n); END IF;

  DELETE FROM public.fleet_equipment_items WHERE created_by = ANY(v_test_ids) OR name LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('fleet_equipment_items', v_n); END IF;

  DELETE FROM public.innendienst_gebuehrenpositionen WHERE created_by = ANY(v_test_ids) OR name LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('innendienst_gebuehrenpositionen', v_n); END IF;

  DELETE FROM public.innendienst_gebuehrensaetze WHERE created_by = ANY(v_test_ids) OR name LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('innendienst_gebuehrensaetze', v_n); END IF;

  DELETE FROM public.deliveries WHERE created_by = ANY(v_test_ids) OR vorrechnung_name LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('deliveries', v_n); END IF;

  DELETE FROM public.schulungen_sessions WHERE created_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('schulungen_sessions', v_n); END IF;

  DELETE FROM public.products WHERE name LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('products', v_n); END IF;

  DELETE FROM public.strassenzustand_auftraggeber WHERE name LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('strassenzustand_auftraggeber', v_n); END IF;

  DELETE FROM public.strassenzustand_berichte WHERE nummer LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('strassenzustand_berichte', v_n); END IF;

  DELETE FROM public.strassenzustand_melder WHERE name LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('strassenzustand_melder', v_n); END IF;

  DELETE FROM public.strassenzustand_strassen WHERE name LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('strassenzustand_strassen', v_n); END IF;

  DELETE FROM public.support_tickets WHERE user_id = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('support_tickets', v_n); END IF;

  DELETE FROM public.zentrale_entries WHERE created_by = ANY(v_test_ids) OR title LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('zentrale_entries', v_n); END IF;

  DELETE FROM public.einsatz_training_sessions WHERE created_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('einsatz_training_sessions', v_n); END IF;

  DELETE FROM public.quarters WHERE name LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('quarters', v_n); END IF;

  DELETE FROM public.schulungen_module WHERE created_by = ANY(v_test_ids) OR name LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('schulungen_module', v_n); END IF;

  DELETE FROM public.incident_reports WHERE created_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('incident_reports', v_n); END IF;

  DELETE FROM public.schutzfaelle WHERE created_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('schutzfaelle', v_n); END IF;

  DELETE FROM public.einsatz_training_modules WHERE created_by = ANY(v_test_ids) OR name LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('einsatz_training_modules', v_n); END IF;

  DELETE FROM public.pool_einsatzmittel WHERE created_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('pool_einsatzmittel', v_n); END IF;

  DELETE FROM public.fleet_vehicles WHERE created_by = ANY(v_test_ids) OR name LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('fleet_vehicles', v_n); END IF;

  DELETE FROM public.operational_persons WHERE created_by = ANY(v_test_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('operational_persons', v_n); END IF;

  DELETE FROM public.operational_objects WHERE created_by = ANY(v_test_ids) OR label LIKE '[TEST]%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN INSERT INTO _wipe_report(tabelle, geloescht) VALUES ('operational_objects', v_n); END IF;
  -- Schritt b) Alle übrigen (nullbaren) FK-Spalten im public-Schema, die auf
  -- profiles(id) zeigen, generisch auf NULL setzen. Deckt sekundäre Bearbeiter-Spalten
  -- ab (reviewed_by, approved_by, checked_by, genehmiger_id, decided_by, proposed_by,
  -- removed_by, munition_recorded_by, …), auch für künftig hinzukommende Spalten,
  -- ohne dass diese Funktion dafür angepasst werden muss. NOT NULL-Spalten werden
  -- bewusst übersprungen: zeigt eine solche noch auf einen Test-Account, bricht die
  -- Löschung am Ende kontrolliert mit einer FK-Verletzung ab (siehe docs/TESTDATEN.md
  -- "Bekannte Grenzfälle"), statt echte Daten stillschweigend zu verstümmeln.
  for v_fk in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join lateral unnest(c.conkey) as ck(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = ck.attnum
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and c.conrelid <> 'public.profiles'::regclass
      and not a.attnotnull
  loop
    execute format('update public.%I set %I = null where %I = any($1)', v_fk.tbl, v_fk.col, v_fk.col)
      using v_test_ids;
  end loop;

  -- Schritt c) Test-Profile löschen — bevorzugt über auth.users (kaskadiert auf
  -- profiles), sonst Profiles direkt (Auth-User bleibt bestehen, siehe Report/Doku).
  begin
    delete from auth.users where id = any(v_test_ids);
    get diagnostics v_n = row_count;
    if v_n > 0 then
      insert into _wipe_report(tabelle, geloescht) values ('auth.users (+ profiles kaskadiert)', v_n);
    end if;
  exception when insufficient_privilege then
    delete from public.profiles where id = any(v_test_ids);
    get diagnostics v_n = row_count;
    if v_n > 0 then
      insert into _wipe_report(tabelle, geloescht)
        values ('profiles (auth.users NICHT gelöscht — kein SQL-Zugriff, bitte manuell im Supabase-Dashboard entfernen)', v_n);
    end if;
  end;

  return query select t.tabelle, t.geloescht from _wipe_report t order by t.tabelle;
end;
$fn$;

revoke all on function public.wipe_test_data() from public;
grant execute on function public.wipe_test_data() to authenticated, service_role;

comment on function public.wipe_test_data() is
  'Löscht alle als is_test=true markierten Profile inkl. aller davon abhängigen '
  'Fachdaten (siehe Kommentar im Funktionskörper für die geprüfte Tabellen-Whitelist) '
  'sowie Fachdaten mit [TEST]-Titel-Präfix. Nur für Admins (profiles.roles enthält '
  '''admin'') oder den Service-Role-Key aufrufbar. Aufruf z.B. per '
  '''select * from wipe_test_data();'' — siehe docs/TESTDATEN.md.';
