# Bekleidungsverwaltung Stadtpolizei Dornbirn

Interne Web-App zur Verwaltung von Dienstbekleidung: Bestellungen, Genehmigungen,
Budget, Lager, Schneider-Aufträge und Schuherstattungen. Support bleibt intern in Supabase.

Stadtwappen (Birnbaum): Wikimedia Commons, [File:Wappendornbirn.svg](https://commons.wikimedia.org/wiki/File:Wappendornbirn.svg).

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL mit Row Level Security, Auth, Edge Functions)
- **Hosting**: Cloudflare Pages (Auto-Deploy vom `master`-Branch)
- **Dateien**: Cloudflare R2 (Vorrechnungen), optionale PDF-Analyse via Gemini
- **PWA**: `vite-plugin-pwa` (Installierbarkeit, Offline-Cache der App-Hülle)

## Rollen

| Rolle | Bereich |
|---|---|
| Benutzer | Bekleidung bestellen, eigene Bestellungen |
| Sachbearbeiter | Bestellungen abwickeln, Lager, Produkte, Quartale, Analyse |
| Genehmiger | Freigaben, Budgetverwaltung, Schuherstattungen; Benutzerverwaltung im Portal |
| Admin | Alle Bereiche |

Die Rolle `approver` wird weiterhin als Synonym für `Genehmiger` akzeptiert.

Benutzerverwaltung liegt ausschließlich im **Portal** (`/portal/benutzer`) und ist für
**Admin oder Genehmiger** (Bekleidung) bedienbar. In der Bekleidungs-App gibt es keine
Benutzerseite und keinen Querverweis. «Mein Profil» (`/profil`) und «Hilfe» (`/hilfe`)
liegen auf der Portal-Startseite und in der Portal-Kopfzeile, nicht in der
Bekleidungs-Navigation. Das Audit-Log (`/auditlog`) liegt ebenfalls im Portal
und ist nur für Admin sichtbar, nicht für Sachbearbeiter oder Genehmiger.
Dual-Write `profiles.roles` ↔ `portal_area_roles`
(area=`bekleidung`) bleibt; `einsatz_mt`-Rechte bleiben Admin-only.
Deaktivieren bleibt Genehmiger/Admin (bestehende Shop-Regel).
Pro Benutzer sind Bereichsrechte in `portal_area_roles` hinterlegt:

| Bereich | Erlaubte Rollen |
|---|---|
| `bekleidung` | Benutzer, Sachbearbeiter, Genehmiger, Admin (wie bisher; Dual-Write nach `profiles.roles`) |
| `einsatz_mt` | Benutzer, Sachbearbeiter, Admin (Benutzer = Leserecht; kein Genehmiger) |

`profiles.roles` bleibt Quelle für bestehende Bekleidungs-RLS/`has_role`. Die Portal-Kachel
«Einsatzmittel & Training» führt auf `/einsatz`. Unterbereich Einsatzmittel: persönliche
Zuweisungen (Polizist oder Verwahrungsort, z. B. Lager nach Austritt; mehrere Stücke
derselben Kategorie mit unterschiedlicher Waffennummer), Pool-Einsatzmittel und
Lagerbestand (Pool-Zahlen plus eingelagerte persönliche Stücke). Unterbereich Einsatztraining:
Internes Einsatztraining (2 Module pro Jahr), Externes Einsatztraining (4 Module pro Jahr)
und Zusatzmodule (Combat/Erste Hilfe COMBAT/Fahrsicherheit = extern; Stockschulung/Szenarien
= Zusatz). UI-Art aus `module_type` + `kind`. Geltung je Modul (`applies_to`: Polizei,
Parkaufsicht, Alle). Schießen-Flag `schiesst`, UI «Mit Schießen». Offene Liste nach Geltung,
Ausschreibung mit Selbstanmeldung (nur ohne Abschluss und bei passender Geltung), Protokoll
(Modul am Tag, Anwesenheit, Munition aus dem Pool). Lesen: `user` (eigener Status + Anmeldung).
Verwalten: Sachbearbeiter/Admin. Abgeschlossenes Modul: keine erneute Zuweisung/Anmeldung.

## Bestell-Workflow

```
Warenkorb (pending)
  → eingereicht (approved | pending_approval wenn Budget überschritten)
  → Genehmiger gibt frei (approved)
  → beim Lieferanten bestellt (ordered_supplier)  ODER  aus Lager bereit zur Ausgabe,
    nur wenn Bestand reicht und der Artikel nicht Schneider-pflichtig ist
  → Wareneingang Massa: normale Artikel erhöhen den Lagerbestand und sind bereit zur Ausgabe;
    Schneider-pflichtige Artikel (needs_tailoring) gehen in einen Schneider-Auftrag, nicht ins freie Lager
  → nach Schneider: bereit zur Ausgabe (ready_for_issue)
  → Ausgabe senkt den Bestand der Größe, auch wenn eine Nachbestellung bei Massa noch unterwegs ist
  → optional teilweise ausgegeben (partially_issued)
  → ausgegeben (issued) | storniert (cancelled, mit Grund)
```

Zusätzlich im Code:

- **Sammelbestellung / Lieferungen**: `approved` → `ordered_supplier` mit `deliveries`-Datensatz, Vorrechnung (R2), Wareneingang.
- **Massa Wien**: Sachbearbeiter löst Export/Mail bewusst aus (CSV + Vorschau). Standard und Tests senden keine E-Mail; mit `VITE_MASSA_MAILTO` nur ein mailto-Entwurf.
- **Lager-Shortcut**: `approved` → `ready_for_issue` nur bei verfügbarem Bestand und ohne Schneiderpflicht.
- **Standardbudget**: 350 €/Jahr, falls kein `user_budgets`-Eintrag existiert.
- **Verbrauch**: Bestellsumme des Kalenderjahres plus `used_adjustment` (Korrektur in der Budgetverwaltung). Rückstellung zum 01.01. — Vorjahr gilt nicht für das neue Jahr.
- **Schuherstattungs-Cap**: Fallback 120 €, falls kein `shoe_refund_caps`-Eintrag existiert. Genehmiger setzt den Betrag unter Budgetverwaltung (nicht fest 80 €).

## Entwicklung

```bash
npm install
npm run dev        # Dev-Server
npm run lint       # ESLint (blockiert CI)
npm test           # Unit-Tests (vitest)
npm run build      # Typecheck + Produktions-Build
```

### Umgebungsvariablen

Siehe `.env.example`. Frontend (Vite, Build-Zeit):

```
VITE_SUPABASE_URL=https://<projekt>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_MASSA_MAILTO=            # optional, mailto-Entwurf Massa Wien; leer = nur Simulation
```

Cloudflare Pages Functions (Runtime, **nicht** `VITE_`):

```
SUPABASE_URL=https://<projekt>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
GEMINI_API_KEY=            # optional, PDF-Analyse der Vorrechnungen
```

Ohne `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` bleibt der Client fail-closed
(`https://unavailable.invalid` als Platzhalter, damit die UI den Hinweis zeigen
kann — kein stiller Fallback auf Produktionsdaten).

Ohne `SUPABASE_URL` / `SUPABASE_ANON_KEY` liefern `/upload` und `/files/*` HTTP 503.

### Cloudflare Pages Functions

- `functions/upload.ts` — Datei-Upload nach R2 (nur angemeldete Benutzer, max. 20 MB),
  optionale PDF-Analyse wenn `GEMINI_API_KEY` gesetzt ist
- `functions/files/[[path]].ts` — Auslieferung der R2-Dateien (Authorization-Header, kein Token in der URL)
- `functions/_middleware.ts` — SPA-Fallback auf index.html

### Supabase Edge Function `create-user`

Benutzeranlage (inkl. Import) und Startpasswort-Reset rufen
`POST /functions/v1/create-user` auf.
Quellcode: `supabase/functions/create-user/`.

```bash
supabase functions deploy create-user
```

**Anlegen / Import:** Body wie bisher (`name`, `initial_password`, optional
`username` / `vorname` / `nachname` …). Import und «Neuer Benutzer» vorbelegen
das gemeinsame **Startpasswort `123456`** (Owner-Vorgabe, bewusst schwach und
nur bis zum Erstlogin; 6 Zeichen wegen der Hosted-Auth-Mindestlänge). Die UI
prüft Startpasswörter nur auf «nicht leer» — keine 8-Zeichen-/Großbuchstaben-Regel.
Zufällige Einzelpasswörter nur nach explizitem Schalter «Zufällig pro Person».

**Persönliches Passwort** (ChangePasswordModal nach Erstlogin) bleibt streng:
mindestens 8 Zeichen, eine Zahl und einen Großbuchstaben.

**Reset Startpasswort** (Admin/Genehmiger, nicht Sachbearbeiter allein):

```json
{
  "action": "reset_password",
  "user_id": "<profiles.id>",
  "initial_password": "123456"
}
```

Setzt das Auth-Passwort, `force_password_change: true`. `force_username_set`
bleibt `true`, wenn `profiles.username` fehlt oder noch `dn{N}` ist. Die UI
zeigt das neue Passwort einmal zum Kopieren. Das gebundene Admin-Konto
(`admin` / `admin@stadtpolizei-dornbirn.local`) wird nicht zurückgesetzt.

**Auth-Mindestlänge:** GoTrue/Supabase default und Hosted sind 6 Zeichen.
`123456` erfüllt das. Lokal: `supabase/config.toml`
`[auth] minimum_password_length = 6`. Das Admin-Passwort bleibt unverändert.

**Passwort ändern (Mein Profil):** Jede angemeldete Person kann unter `/profil`
das eigene Passwort ändern. Formular: aktuelles Passwort (Bestätigung, nie als
Klartext aus Auth), neues Passwort, Bestätigung. Mindestlänge 6 wie Auth.
Ablauf wie Erstlogin: vorhandene Session, dann `signInWithPassword` mit der
Session-E-Mail und `updateUser({ password })`. Kein Admin-Reset auf dieser Seite.

Login-E-Mail (Auth-Identität, nicht `profiles.username`):

`vorname.nachname@dornbirn.at` (Local-Part und Domain klein)

Umlaute im Local-Part werden ASCII-gefaltet (`Ä→Ae`, `Ö→Oe`, `Ü→Ue`, `ß→ss`),
danach kleingeschrieben. Bindestriche bleiben (`hans-peter.schwendinger@dornbirn.at`).
**Eine Ausnahme:** Feurstein Martin / DN 3 → `martin.feurstein2@dornbirn.at`.

`profiles.username` ist der **Windows-/PC-Anmeldename** (sAMAccountName, ohne
Domäne, Kleinbuchstaben, `USERNAME_RE`). Beim Anlegen bleibt er **leer**
(`NULL`) — nicht die Dienstnummer, nicht `dn{N}`, nicht der E-Mail-Local-Part.
`create-user` setzt `force_password_change` und `force_username_set`. Der
Erstlogin fordert neues Passwort und PC-Benutzername.

Migration `20260917` (zuerst `ALTER COLUMN username DROP NOT NULL`, dann
Datenfix): vorhandene `profiles.username` / Auth-Metadata die
`^dn[0-9]+$` entsprechen werden auf NULL gesetzt (idempotent). Live war
`username` NOT NULL — ohne `DROP NOT NULL` schlägt der Wipe fehl.

Login akzeptiert:

1. volle Stadt-E-Mail `vorname.nachname@dornbirn.at` (klein), oder
2. PC-/Portal-Benutzername (`profiles.username`, sAMAccountName ohne Domäne).
   Ohne Session ist `profiles` per RLS nicht lesbar. Die App ruft daher die
   RPC `lookup_login_email` auf (SECURITY DEFINER, Grant an `anon` +
   `authenticated`): exakter Username → `auth.users.email`. Unbekannter
   Name: deutsche Fehlermeldung. `dn{N}` gilt nicht als Login.
3. **Gebundener Admin:** Benutzername `admin` →
   `admin@stadtpolizei-dornbirn.local` (kein Lookup, Passwort unverändert).

Kein Anhängen von `@dornbirn.at` an Local-Parts — der PC-Name ist nicht
der E-Mail-Local-Part.

Die Function braucht die Service-Role (von Supabase automatisch als
`SUPABASE_SERVICE_ROLE_KEY` bereitgestellt). Anlegen: aktive Sachbearbeiter,
Genehmiger und Admins. Deaktivieren (`active = false`, kein Löschen): nur
Genehmiger und Admins. Rollenvergabe entspricht der UI (`admin` nur durch Admins).

CORS: `Access-Control-Allow-Origin` ist nicht `*`. Erlaubt sind localhost (Vite),
`https://bekleidung-polizei.pages.dev` und Preview-Hosts `*.bekleidung-polizei.pages.dev`.
Weitere Origins über Edge-Function-Secret `ALLOWED_ORIGINS` (kommagetrennt).

### Datenbank

Migrationsdateien liegen in `supabase/migrations/`.

| Datei | Inhalt |
|---|---|
| `20260511210803_add_approved_status_and_proc_listed.sql` | `orders.status` um `approved` erweitert, `proc_listed`-Spalte ergänzt |
| `20260511231627_add_budget_system.sql` | `user_budgets` (Budget je Nutzer/Jahr), `orders.unit_price` (Preis zum Bestellzeitpunkt) |
| `20260512120501_add_gender_to_products_and_profiles.sql` | Geschlecht an Produkten und Profilen |
| `20260512121710_budget_valid_from_and_shoe_cap.sql` | `user_budgets.valid_from` (planbare Budgetänderungen), `shoe_refund_caps` (Historie Erstattungs-Höchstbetrag) |
| `20260512124620_add_organisation_to_profiles.sql` | `profiles.organisation` |
| `20260512131037_products_unique_article_number_per_organisation.sql` | Artikelnummer eindeutig je Organisation statt global |
| `20260513200950_add_stock_orders.sql` | `stock_orders` (Lagerbestellungen) inkl. RLS |
| `20260514081937_add_sub_category_to_products.sql` | `products.sub_category` |
| `20260514112133_add_shoe_refund_status.sql` | Status-Spalte für Schuherstattungen |
| `20260514120301_add_product_min_quantity.sql` | `products.min_quantity` (Mindestbestand) |
| `20260514122845_create_grundausstattung.sql` | `grundausstattung`-Tabelle |
| `20260514124055_grundausstattung_drop_size.sql` | Größe aus `grundausstattung` entfernt |
| `20260517122218_create_vending_schema.sql` | Fremdprojekt (Kaffee-/Verkaufsautomaten): Kategorien, Artikel, Transaktionen, Pulverautomat, Bohnenkaffee-Logs — vollständig entfernt durch `20260702191625_drop_foreign_project_tables.sql` |
| `20260517123034_allow_anon_access.sql` | Fremdprojekt Verkaufsautomaten: Allow-All-Policies |
| `20260517190329_add_mhd_to_articles.sql` | Fremdprojekt Verkaufsautomaten: Mindesthaltbarkeitsdatum an Artikeln |
| `20260517213435_add_machine_slots_table.sql` | Fremdprojekt Verkaufsautomaten: `machine_slots` |
| `20260517213442_add_machine_slots_to_allowed.sql` | Fremdprojekt Verkaufsautomaten: Allow-All-Policy für `machine_slots` |
| `20260518105843_add_type_and_note_to_transactions.sql` | Fremdprojekt Verkaufsautomaten: Typ/Notiz an Transaktionen |
| `20260518165019_add_machines_table.sql` | Fremdprojekt Verkaufsautomaten: `machines`-Tabelle |
| `20260519102541_add_pfand_to_articles.sql` | Fremdprojekt Verkaufsautomaten: Pfand an Artikeln |
| `20260519160249_add_powders_column.sql` | Fremdprojekt Verkaufsautomaten: `powder_settings.powders` |
| `20260519193040_add_powder_id_to_measurements.sql` | Fremdprojekt Verkaufsautomaten: Pulver-Zuordnung an Messungen |
| `20260519213453_create_vending_kontrollen.sql` | Fremdprojekt Verkaufsautomaten: `vending_kontrollen` |
| `20260519234855_add_vk_aufschlag_to_powder_settings.sql` | Fremdprojekt Verkaufsautomaten: Verkaufsaufschlag |
| `20260520021847_add_puffer_columns.sql` | Fremdprojekt Verkaufsautomaten: Pfand-/Strichpuffer |
| `20260520095029_add_pfand_wert.sql` | Fremdprojekt Verkaufsautomaten: Pfandwert |
| `20260520130506_add_deliveries_table.sql` | `deliveries` (Sammellieferung an Massa/Lieferant) + `orders.delivery_id` |
| `20260520131210_remove_lieferschein_columns.sql` | Alte Lieferschein-Spalten entfernt (abgelöst durch `deliveries`) |
| `20260520165525_add_payment_and_analysis_to_deliveries.sql` | Zahlungs- und Analysefelder an `deliveries` |
| `20260630105513_add_orders_delete_and_user_update_policy.sql` | Nutzer dürfen eigene offene Bestellungen (Warenkorb) löschen/ändern |
| `20260630145104_add_size_preferences_to_profiles.sql` | `profiles.size_preferences` (gemerkte Größen) |
| `20260702190139_security_hardening_rls_views_functions.sql` | Security-Hardening: RLS auf `shoe_refund_caps`/`grundausstattung`, Allow-All bei `stock_orders` durch Rollenprüfung ersetzt, SECURITY-DEFINER-Views auf Invoker-Rechte umgestellt, Funktionen gehärtet (`search_path`, Ausführungsrechte) |
| `20260702191116_revoke_public_execute_on_functions.sql` | EXECUTE-Grant an `PUBLIC` entfernt (Postgres-Default), `has_role` bleibt für `authenticated` ausführbar |
| `20260702191625_drop_foreign_project_tables.sql` | Fremdprojekt-Tabellen (Kaffee-/Verkaufsautomaten) entfernt — gehören nicht zur Bekleidungsverwaltung |
| `20260707191338_fix_pack_rpcs_and_indexes.sql` | Atomare Bestandsbuchung (`adjust_inventory`), serverseitiges `submit_cart` (Budget-Entscheidung atomar in der DB statt mit veralteten Client-Daten), fehlende FK-Indizes |
| `20260708080817_rls_role_coverage_fix.sql` | Rollenabdeckung der RLS-Policies repariert: Sachbearbeiter konnte nichts verwalten (nur admin), Rolle `genehmiger` fehlte überall, Nutzer konnten eigenes Profil nicht ändern |
| `20260908200808_user_edit_orders_until_ordered.sql` | Nutzer dürfen Größe/Menge einer eingereichten Bestellung per eng begrenzter RPC (`update_editable_order`) ändern, solange der Sachbearbeiter sie noch nicht beim Lieferanten bestellt hat |
| `20260908220954_einsatz_workflow_materialien.sql` | `einsatz_material_tabs`/`einsatz_materials` (Unterlagen) + `personal_einsatzmittel_requests` |
| `20260908221103_einsatz_workflow_indexes.sql` | Fehlende Indizes für die neuen Einsatz-Workflow-Fremdschlüssel |
| `20260909115209_support_ticket_topics.sql` | Interner Support: Themenbereiche, `can_manage_support_topic`, Ticket-/Nachrichten-Policies |
| `20260909122751_einsatz_mt_multiple_roles.sql` | Mehrere Rollen gleichzeitig je Bereich `einsatz_mt` erlaubt |
| `20260909125508_add_police_rank_to_profiles.sql` | Dienstgrad an Profilen |
| `20260909134214_exclude_admin_from_police_rank.sql` | Admin-Konten von der Dienstgrad-Pflicht ausgenommen |
| `20260910131859_secure_admin_profile_role_updates.sql` | `save_portal_profile`-RPC + `protect_profile_fields`: Rollenvergabe nur über kontrollierte Funktion statt freiem UPDATE |
| `20260910131946_secure_user_order_workflow.sql` | `guard_cart_order`/`submit_cart`/`update_editable_order`, Policy „Benutzer erstellt Warenkorb" |
| `20260910132017_atomic_support_request_creation.sql` | `create_support_request` (atomare Ticket- + Erstnachricht-Erstellung) |
| `20260910132034_atomic_training_records_and_safe_delete.sql` | Übergeordnetes Löschen darf einzeln gepflegte Trainingsdatensätze nicht mehr stillschweigend mitreißen |
| `20260910132053_atomic_inventory_and_order_bookings.sql` | `book_order_inventory`/`receive_stock_order` atomar, FK-Löschschutz gegen mit der Löschung wettlaufende Inserts |
| `20260910132128_secure_audit_actor_identity.sql` | `audit_log.source`, Policy für ergänzende eigene Protokolleinträge |
| `20260910132207_restrict_training_session_cascade_deletes.sql` | Gleicher FK-Löschschutz wie zuvor bei Bestand/Bestellungen, jetzt auch für Trainingstermine |
| `20260910132509_lock_down_trigger_functions.sql` | Trigger-Funktionen gehärtet (Ausführungsrechte) |
| `20260910182519_move_einsatz_material_between_tabs.sql` | `move_einsatz_material` (Unterlage in anderen Ordner verschieben) |
| `20260910185624_create_schulungen_material_area.sql` | Unterlagen-Bereich `schulungen`, `can_manage_schulungen` |
| `20260910193124_activate_fleet_management.sql` | `fleet_vehicles` + `can_manage_fuhrpark` |
| `20260910201254_activate_operations_center.sql` | `zentrale_entries` (generische Zentrale-Einträge) + `can_manage_zentrale` |
| `20260911064418_zentrale_assistive_duty_and_incidents.sql` | `duty_assignments` (Diensteinteilung), `incident_reports` (Einsatzmeldungen), `operational_person_notes`, `is_zentralist_on_duty` |
| `20260911064531_index_zentrale_actor_foreign_keys.sql` | Fehlende Indizes für Zentrale-Fremdschlüssel |
| `20260911073153_configurable_duties_and_patrol_vehicles.sql` | `duty_functions` (konfigurierbare Diensttypen), `duty_assignments.vehicle_id` |
| `20260911081053_vehicle_responsibility_and_dynamic_zentralist.sql` | Fahrzeugverantwortlichkeit, `has_portal_area_access`/`can_manage_zentrale`/`can_manage_fuhrpark`/`can_manage_schulungen`/`can_manage_einsatzmittel` als zentrale Helferfunktionen eingeführt |
| `20260911172820_vehicle_checks_and_mail_deliveries.sql` | Fahrzeug-/Materialcheck vor Dienstbeginn (`vehicle_checks`) und strukturierte RSa/RSb-Übersicht (`mail_deliveries`) mit Schnellaktion `record_mail_delivery_action` |
| `20260911172837_innendienst_cockpit.sql` | `innendienst_shift_tasks` (Kassen-Bestätigung je Schicht) und `innendienst_records` (schlankes Protokoll für Bescheide Straßenmusik/-kunst und Verstöße) |
| `20260911172847_innendienst_verstoss_bescheid_bezug.sql` | Verstöße gegen Auflagen müssen sich auf einen konkreten Bescheid beziehen (per Trigger geprüft) |
| `20260911173441_innendienst_kassensturz.sql` | Kassensturz-Felder an `innendienst_shift_tasks` (erwarteter Erlös, Bargeld-Stückelung, Grundbestand 500 €) |
| `20260911181231_mail_deliveries_owner_vernehmung_close.sql` | `mail_deliveries`: Typ `vernehmung`, Akteneigentümer automatisch = Ersteller, zweistufiger Erledigt-Workflow, `close_mail_delivery` |
| `20260911185004_fuhrpark_vollstaendig.sql` | Fuhrpark komplett: `fleet_equipment_items`/`fleet_equipment_status` (Füllliste/Mängel), `fleet_care_tasks` (Pflege), `fleet_appointments` (Werkstatt/Termine/Fristen), `is_vehicle_responsible` |
| `20260911191817_fuhrpark_dokumente_pro_fahrzeug.sql` | Fuhrparkweiter Unterlagenbereich zurückgebaut, stattdessen `fleet_documents` direkt je Fahrzeug (Zulassung, Serviceheft) |
| `20260911212346_genehmiger_bereichsuebergreifend.sql` | Globale Rolle `genehmiger` bekommt in `has_portal_area_access`/`can_manage_zentrale`/`can_manage_fuhrpark`/`can_manage_einsatzmittel`/`can_manage_schulungen` dieselben Rechte wie ein Bereichs-Sachbearbeiter, unabhängig von einer eigenen `portal_area_roles`-Zeile |
| `20260911213443_fahrzeugverantwortlicher_lesen.sql` | Lese-Policies auf `fleet_vehicles`/`fleet_appointments`/`fleet_equipment_status`/`fleet_care_tasks` um `is_vehicle_responsible()` ergänzt |
| `20260911232855_training_zuteilung_vorschlag.sql` | `einsatz_training_assignments` (Trainingsvorschlag) + `is_genehmiger()` + `decide_training_assignment`: Anmeldung ist nur noch ein Vorschlag, der Genehmiger entscheidet |
| `20260911235731_pool_einsatzmittel_beschaffung.sql` | `pool_einsatzmittel_requests` (Beschaffungsantrag) + `decide_pool_einsatzmittel_request`: Neuanlage von Pool-Einsatzmitteln ist Genehmiger-Entscheidung, Sachbearbeiter meldet nur Bedarf |
| `20260912001612_innendienst_gebuehrenordnung.sql` | Gebührenordnung als Referenztabelle: `innendienst_gebuehrenpositionen`/-`saetze`/-`satz_positionen`, Lesen für den ganzen operativen Bereich, Schreiben nur Genehmiger |
| `20260912003212_schulungen_tracking.sql` | Schulungen-Tracking analog zu Einsatztraining, aber einfacher (ad-hoc, keine Halbjahrespflicht): `schulungen_module`/`_sessions`/`_registrations`/`_completions`/`_assignments`, `decide_schulung_assignment` |
| `20260912003318_schulungen_registration_capacity_trigger.sql` | Kapazitätsprüfung für Schulungsanmeldungen gilt auch beim SECURITY-DEFINER-Insert der Entscheidungs-RPC |
| `20260912021540_kontrollauftrag_zielfunktion.sql` | `zentrale_entries.target_function` (JD/VD/beide), Anlegen/Ändern/Löschen von Kontrollaufträgen nur noch dem Genehmiger vorbehalten |
| `20260912113546_strassenzustand.sql` | Straßenzustand: digitale Abbildung des bisherigen Word-Formulars — `strassenzustand_berichte`/-`zeilen`/-`strassen`/-`melder`/-`auftraggeber`, automatische Ableitung Neuzugang/Änderung/Widerruf |
| `20260912113629_strassenzustand_fix_created_at_clock.sql` | `clock_timestamp()` statt transaktionskonstantem `now()` für die zeitlich korrekte Meldungsart-Ableitung mehrerer Zeilen derselben Transaktion |
| `20260912115450_strassenzustand_vereinfachen.sql` | Nur noch 3 Zustände (Frei befahrbar/Gesperrt/Sonstige) statt fünf, Zeitraum als `timestamptz` statt `date` |
| `20260912123244_incident_reports_geokoordinaten.sql` | `incident_reports.location_lat`/`location_lng` |
| `20260912135948_operational_person_notes_location.sql` | Standortbezug für Personenhinweise |
| `20260912140928_operational_person_notes_show_expired.sql` | Abgelaufene Personenhinweise bleiben sichtbar (mit „Abgelaufen"-Hinweis in der UI), statt automatisch aus der RLS-Sicht zu verschwinden |
| `20260912155928_strassenzustand_meldungsart_chronological.sql` | Vorbereitung „Bericht bearbeiten": Meldungsart-Ableitung vergleicht jetzt korrekt chronologisch statt gegen die global neueste Zeile |
| `20260912161416_strassenzustand_bericht_ersetzen_atomic.sql` | `strassenzustand_bericht_ersetzen`-RPC: Bearbeiten eines Berichts atomar in einer Transaktion statt Update+Delete+Insert einzeln |
| `20260913100316_operational_persons_and_objects_registers.sql` | Zentrales Personen- (`operational_persons`) und Objekte-Register (`operational_objects`), damit alle Kategorien auf dieselbe Person/dasselbe Objekt verweisen können |
| `20260913100325_link_person_notes_and_mail_deliveries_to_persons.sql` | Personenhinweise und RSa/RSb verweisen auf das Personen-Register statt Name/Geburtsdatum als Freitext zu duplizieren |
| `20260913100357_zentrale_register_category_tables.sql` | Ersetzt sechs generische `zentrale_entries`-Kategorien (AV/BV & EV, Fahndungen, Schlüssel, Kontakte, Alarmierung, Unterlagen) durch eigene Tabellen mit passenden Feldern |
| `20260913100406_zentrale_entries_drop_migrated_categories.sql` | Die in eigene Tabellen ausgelagerten Kategorien werden in `zentrale_entries` nicht mehr angelegt |
| `20260913103621_operational_persons_vorname_nachname.sql` | Vor-/Nachname statt kombiniertem Freitext-Namen (mindestens eines muss gesetzt sein) |
| `20260913104327_zentrale_entries_drop_uebergabe_category.sql` | Kategorie „Übergabe" entfernt — ergibt sich aus offenen Einsatzmeldungen statt manueller Erfassung |
| `20260913104536_zentrale_entries_restore_uebergabe_category.sql` | Korrektur: Innendienst nutzt „Übergabe" weiterhin als eigenen, manuell gepflegten Punkt |
| `20260913110625_zentrale_entries_lage_incident_link.sql` | Kategorie „Lage" erfordert zwingend eine verknüpfte Einsatzmeldung (`incident_id`) |
| `20260913110827_zentrale_alarmierung_lage_bereich_stadtfuehrung.sql` | Grundgerüst für Alarmierung: Verknüpfung zur Lage, Bereich (Polizei/Städtisch/Beide), Stadtführung-informiert-Feld |
| `20260913111338_operational_persons_allow_area_access_insert.sql` | Wer RSa/RSb anlegen darf (jede Zentrale-Rolle, nicht nur Sachbearbeiter/Admin), darf dafür auch eine noch nicht erfasste Person anlegen |
| `20260913113209_operational_person_notes_managers_see_archived.sql` | Verwaltungsrollen sehen auch archivierte Personenhinweise |
| `20260913120301_zentrale_register_tables_grants.sql` | Fehlende SQL-Grants für die neuen Zentrale-Registertabellen nachgetragen |
| `20260913143256_zentrale_baustellen.sql` | `zentrale_baustellen` (Baustellen-Register) |
| `20260913144949_zentrale_baustellen_strassenverlauf.sql` | `zentrale_baustellen.path` (Straßenverlauf für die Kartenansicht) |
| `20260913195014_adresse_telefon_kontrollauftrag_frist.sql` | Strukturierte Objekt-Adresse (Straße/Hausnummer/PLZ/Ort), `operational_phone_numbers`, Person-Objekt-Verknüpfung, `zentrale_entries.due_at` |
| `20260913201029_phone_numbers_erhoben_am.sql` | `operational_phone_numbers.erhoben_am` (Zeitpunkt der Erhebung, kann von „heute" abweichen) |
| `20260913202139_incident_reports_person_links.sql` | Melder und beteiligte Person über das Personen-Register verknüpft statt Namens-/Geburtsdatum-Freitext |
| `20260913205819_kontrollauftrag_todo.sql` | Kontrollaufträge als To-do für die Streife: `erledigt_at`, `enforce_kontrollauftrag_todo_only` |
| `20260913211633_bescheid_person_und_entzug.sql` | Bescheid/Verstoß über das Personen-Register verknüpft; ein Verstoß entzieht automatisch den zugehörigen Bescheid (`revoke_bescheid_on_verstoss`) |
| `20260913225959_fahrzeugcheck_checkliste.sql` | `fleet_check_items`/`fleet_check_item_status`: eigene Checkliste für den Fahrzeugzustand (unabhängig von der Füllliste) |
| `20260914123409_zentrale_baustellen_aussendienst_lesen.sql` | Außendienst darf Baustellen lesen |
| `20260914123411_strassenzustand_geometrie.sql` | Geometriedaten für Straßenzustand |
| `20260914212056_innendienst_bescheid_pdf_felder.sql` | Zusätzliche Felder für den Bescheid-PDF-Ausdruck |
| `20260914212829_ueberstundenmeldung.sql` | `ueberstunden_meldungen` (Überstunden-Meldeworkflow) |
| `20260914215952_ueberstunden_zeitraum_und_auto_aufschluesselung.sql` | `ueberstunden_meldungen.bis_datum` (Zeitraum statt Einzeltag) |
| `20260914222548_ueberstunden_serverseitige_berechnung.sql` | Lohnarten-Aufschlüsselung (50%/100%/Nacht-/Sonntagszuschlag) serverseitig statt im Frontend berechnet, inkl. österreichischer Feiertage |
| `20260914222716_ueberstunden_helper_funcs_search_path.sql` | `search_path` der Überstunden-Hilfsfunktionen fixiert |
| `20260914223023_ueberstunden_verguetung_rueckfrage.sql` | Vergütungsart und Rückfrage-Status bei Überstundenmeldungen |
| `20260914224120_innendienst_bescheid_planbeilage.sql` | Planbeilage (Luftbild/Kataster) ist jetzt ein explizites, je Bescheid gesetztes Feld statt automatisch immer angehängt |
| `20260914224408_ueberstunden_faire_reallokation.sql` | Nachträgliche Änderung einer Meldung verteilt Folgetage fair neu (`ueberstunden_reallocate_nachfolgende`) |
| `20260914224854_ueberstunden_review_runde3.sql` | Korrekturen an der Überstunden-Aufschlüsselung (Review-Runde 3) |
| `20260914225445_ueberstunden_review_runde4.sql` | Korrekturen an der Überstunden-Aufschlüsselung (Review-Runde 4) |
| `20260914230011_ueberstunden_review_runde5.sql` | Korrekturen an der Überstunden-Aufschlüsselung (Review-Runde 5) |
| `20260914230719_ueberstunden_review_runde6.sql` | Korrekturen an der Überstunden-Aufschlüsselung (Review-Runde 6) |
| `20260915081301_zentrale_on_duty_operative_write_access.sql` | Diensthabende Zentralisten dürfen auch bei Personen/Objekten, Personenhinweisen und den sechs Zentrale-Kategorietabellen operative Einträge erfassen (nicht nur bei Meldungen/Baustellen wie bisher) |
| `20260915081935_ueberstunden_review_runde11.sql` | Korrekturen an der Überstunden-Aufschlüsselung (Review-Runde 11) |
| `20260915082346_zentrale_on_duty_phone_numbers.sql` | Diensthabende Zentralisten dürfen auch Telefonnummern im Personen-Register pflegen |
| `20260915083328_zentrale_on_duty_restricted_visibility.sql` | Lese-Policies der Zentrale-Kategorietabellen an die neue Diensthabenden-Berechtigung angepasst |
| `20260915083706_ueberstunden_review_runde12.sql` | Korrekturen an der Überstunden-Aufschlüsselung (Review-Runde 12) |
| `20260915090411_ueberstunden_review_runde13.sql` | Korrekturen an der Überstunden-Aufschlüsselung (Review-Runde 13) |
| `20260915091611_ueberstunden_review_runde14.sql` | Korrekturen an der Überstunden-Aufschlüsselung (Review-Runde 14) |
| `20260915092805_zentrale_ueberstunden_review_runde15.sql` | `enforce_operational_person_notes_active` ergänzt |
| `20260915094331_ueberstunden_review_runde16.sql` | Reihenfolge von CHECK-Constraint und BEFORE-Trigger bei Überstundenmeldungen korrigiert (Review-Runde 16) |
| `20260915095417_ueberstunden_review_runde17.sql` | `ueberstunden_monatsanteile` bekommt deterministisches `ORDER BY` für die client-seitige Pagination (Review-Runde 17) |
| `20260915111845_zentralist_on_duty_includes_innendienst.sql` | Diensthabender Innendienst bekommt dieselben operativen Zentrale-Rechte wie ein diensthabender Zentralist |
| `20260915113331_zentralist_voller_operativer_zugriff.sql` | Diensthabende Zentralisten/Innendienst dürfen operative Daten (Einsätze, Straßenzustand, AV/BV & EV, Personenhinweise, Baustellen, Lagen, Fahndungen) auch bearbeiten und löschen, nicht nur anlegen |
| `20260915150115_admin_only_register_maintenance.sql` | Stammdaten-Register: Lesen für berechtigte Zentrale-Nutzer, Anlegen/Ändern/Löschen ausschließlich Admin |
| `20260915182823_create_schutzmassnahmen.sql` | `schutzfaelle`/`schutzbereiche`/`schutzfall_personen`/`schutzkontrollen` (AV/BV & EV) |
| `20260915183556_harden_schutzmassnahmen.sql` | `preserve_schutzfall_created_by`: Ersteller eines Schutzfalls bleibt beim Bearbeiten erhalten |
| `20260915185744_zentrale_can_create_persons.sql` | Behebt Admin-only-Bug aus `admin_only_register_maintenance`: Personen anlegen wieder für alle mit Zentrale-Zugriff |
| `20260917081000_einsatz_parteien.sql` | `einsatz_parteien`: beteiligte Parteien eines Einsatzes (Beschuldigter/Opfer/Zeuge/Sonstige), getrennt vom Melder |
| `20260917090000_merge_operational_persons.sql` | `merge_operational_persons`-RPC (Admin-only): führt zwei doppelt angelegte Personen inkl. aller Verweise zusammen |
| `20260917100000_zentrale_reads_profiles.sql` | Zusätzliche SELECT-Policy auf `profiles` über `has_portal_area_access('zentrale')`, damit das Kontakte-Register auch für Zentrale-Personal ohne eigene Bekleidungs-Rolle lesbar ist |
| `20260917110000_zentrale_can_create_objects.sql` | Behebt denselben Admin-only-Bug wie bei Personen: Objekte anlegen wieder für alle mit Zentrale-Zugriff |
| `20260918193000_schutzfall_kontrollauftrag.sql` | Trigger erzeugt automatisch einen Kontrollauftrag, sobald ein Schutzfall seinen ersten Schutzbereich bekommt |
| `20260918200000_incident_streife_zuweisung.sql` | `incident_reports.assigned_vehicle_id`, `taken_over_by`/`taken_over_at`, `take_over_incident`/`release_incident_takeover` |
| `20260918210000_revert_schutzfall_kontrollauftrag.sql` | Rückbau von `20260918193000`: automatisches Erzeugen war nicht gewünscht (feuerte auch beim bloßen Bearbeiten erneut) |
| `20260918220000_kontrollauftrag_zeitfenster_und_karte.sql` | `zentrale_entries.zeitfenster` (Freitext-Zeitfenster) sowie `location_lat`/`location_lng` für die Kartenansicht |
| `20260918230000_schutzfall_kontrollauftrag_optional.sql` | Zweiter Anlauf: Checkbox „Kontrolle erforderlich" beim Anlegen eines Schutzfalls erzeugt bewusst (nicht automatisch) einen Kontrollauftrag (`create_schutzfall_kontrollauftrag`) |
| `20260918240000_schutzfall_kontrolle_erforderlich_persistieren.sql` | `schutzfaelle.kontrolle_erforderlich` wird jetzt gespeichert, `remove_schutzfall_kontrollauftrag` als Gegenstück |
| `20260918250000_schutzfall_kontrolle_ohne_eigenes_flag.sql` | Eigenes Flag entfernt — einzige Wahrheit ist ab jetzt, ob ein verknüpfter Kontrollauftrag existiert |
| `20260918260000_wichtige_telefonnummern.sql` | `wichtige_telefonnummern` (interne/externe Rufnummern), ersetzt die bisherigen Klebezettel am Bildschirm |
| `20260919000000_operational_today_nachtdienst.sql` | `operational_today()`: Nachtdienst über Mitternacht bleibt dem Kalendertag seines Beginns zugeordnet (Europe/Vienna statt UTC) |
| `20260919010000_unterlagen_je_bereich.sql` | `zentrale_unterlagen.bereich`: getrennte Inhalte für Zentrale/Außendienst/Innendienst statt einer gemeinsam verlinkten Seite |
| `20260919020000_material_unterordner.sql` | `einsatz_material_tabs.parent_id`: beliebig tief verschachtelbare Unterordner für Unterlagen, Zyklen-Schutz per Trigger |
| `20260919030000_sole_genehmiger_name.sql` | `sole_genehmiger_name()`: Name des einzigen aktiven Genehmigers für den Ausdruck — ersetzt durch die Genehmiger-Kette (siehe unten) |
| `20260919040000_genehmiger_kette.sql` | `profiles.genehmiger_rang` + `genehmiger_kette()`: feste Vertretungsreihenfolge statt „genau ein Genehmiger"-Heuristik |
| `20260919050000_einsatz_checkliste_namensliste.sql` | `einsatz_checklist_punkte` (Checkliste Notfall/Katastrophe, Notunterkunft) und `einsatz_namensliste` (Evakuierungs-/Unterbringungslisten) als geteilter Serverzustand statt localStorage |
| `20260919060000_datenpflege_bereich.sql` | Neuer Portalbereich `datenpflege` (Schlüssel/Kontakte/Telefonnummern/Fahndungen/Objekte) — Stufe 1 des Rechte-Umbaus, `can_manage_datenpflege` |
| `20260919070000_tagesfunktion_zugriff.sql` | Stufe 2: Zugriff auf Zentrale/Innendienst/Außendienst wird Tagesfunktion aus der Diensteinteilung statt Dauerberechtigung, `is_operative_duty_today()` |
| `20260919080000_produkt_bezugsart_groessenart.sql` | `products.bezugsart` (Massa/Eigenbeschaffung) und `products.size_mode` (Größen/Universal/keine) |
| `20260919090000_produkt_shop_bestellbar.sql` | `products.orderable_in_shop`: trennt „im Lager erfasst" von „im Shop bestellbar" |
| `20260920100000_pool_em_pfefferspray_klein.sql` | Neue Pool-Einsatzmittel-Kategorie „Pfefferspray klein" |
| `20260921110000_support_messages_delete.sql` | DELETE-Policy für `support_messages`: Themenbereich-Verwalter dürfen einzelne Nachrichten löschen |
| `20260921120000_support_tickets_delete.sql` | DELETE-Policy für `support_tickets`: Themenbereich-Verwalter dürfen den ganzen Vorgang löschen |
| `20260921130000_support_delete_grants.sql` | Fix zu den beiden vorherigen Migrationen: fehlendes `GRANT DELETE` an `authenticated` nachgetragen |
| `20260921140000_fleet_status_cleanup_inactive_items.sql` | Verwaiste Status-Einträge deaktivierter Ausstattungsstücke bereinigt, Trigger räumen künftige Deaktivierungen automatisch mit auf |
| `20260921233000_cart_size_mode_none_universal.sql` | Fix: Warenkorb-RPCs schlugen bei Artikeln ohne Größenwahl (`size_mode` none/universal) fehl |
| `20260922100000_test_daten_markierung_und_wipe.sql` | Testdaten-Kennzeichnung (`profiles.is_test` u. a.) + `wipe_test_data`-RPC (siehe `docs/TESTDATEN.md`) |
| `20260922222000_operatives_streifen_cockpit.sql` | `duty_vehicle_defaults`, `incident_supports`, `complete_incident`/`support_incident`/`take_over_incident`/`reopen_incident`/`suggest_duty_vehicle`: streifenbezogene Einsatzaktionen |
| `20260922222757_einsatz_dokumente_serverseitig.sql` | `einsatz_dokumente`: Dokument-Metadaten serverseitig statt im localStorage |
| `20260922224500_streifenaktionen_haertung.sql` | Fremd zugeteilte Einsätze können unterstützt, aber nicht wegübernommen werden |
| `20260922230000_duty_vehicle_defaults_index.sql` | Performance-Index für die operative Fahrzeugvorauswahl |
| `20260922232000_einsatzgrund_und_kontext.sql` | `incident_reason_configs` + `incident_context()`: strukturierter Einsatzgrund steuert automatische Nahbereichsprüfung |
| `20260922234500_incident_context_ohne_fahndungen.sql` | Fahndungen aus dem automatischen Einsatzkontext herausgenommen (fachlich noch nicht konkretisiert) |
| `20260922235000_incident_context_ohne_fahndungen.sql` | Zweiter Korrekturdurchlauf zur vorherigen Migration |
| `20260922241000_bv_av_laufzeit_und_aufhebung.sql` | BV/AV regulär zwei Wochen ab Anordnung, vorzeitige Aufhebung durch die Sicherheitsbehörde als eigener Vorgang |
| `20260922243500_schlanke_einsatzbearbeitung.sql` | Neue Meldungen können offen bleiben oder durch Zentrale/eigene Streife/BP bearbeitet werden |
| `20260923002000_ereignis_meldungszettel_felder.sql` | Zusätzliche Felder für den Ereignis-Meldungszettel |
| `20260923003000_ereignis_entscheidungen.sql` | `ereignis_entscheidungen` (dokumentierte Entscheidungen zu einem Ereignis) |
| `20260923004100_einsatz_dokumente_grants_haerten.sql` | SQL-Grants für `einsatz_dokumente` gehärtet |
| `20260923023000_incident_assistance_requests.sql` | `incident_assistance_requests` (Unterstützungsanfragen zwischen Dienststellen) |
| `20260923030000_namensliste_field_permissions.sql` | Feldweise Berechtigungen für die Namensliste |
| `20260923092000_police_namensliste_readonly.sql` | Namensliste für reine Polizeisicht schreibgeschützt |
| `20260923113009_central_event_lifecycle_rpcs.sql` | `link_incident_to_event`/`unlink_incident_from_event`/`set_event_status`: Ereignis-Lebenszyklus als RPCs statt freiem UPDATE |
| `20260923113815_central_least_privilege_grants.sql` | SQL-Grants der Zentrale-Tabellen auf das tatsächlich nötige Minimum reduziert |
| `20260923114255_lock_down_test_and_staff_rpcs.sql` | Ausführungsrechte von Test- und Staff-RPCs eingeschränkt |
| `20260923123000_cross_org_assistance_requests.sql` | Unterstützungsanfragen auch organisationsübergreifend möglich |
| `20260923125000_event_documents.sql` | `ereignis_dokumente` (Dokument-Metadaten je Ereignis) |
| `20260923131500_central_records_external_requests.sql` | Zentrale Protokolle für externe Anfragen |
| `20260923204222_innendienst_bescheide_arbeitsablauf.sql` | Straßenmusik/-kunst fachlich geschlossen: max. zwei Bescheide/Tag, Planbeilage-Pflicht, Ein-Klick-Widerruf aus dem Außendienst, `innendienst_person_entscheidungen` für künftige Ausstellungen |
| `20260923210000_ereignis_grundlage.sql` | `ereignisse`/`ereignis_einsaetze`/`ereignis_verlauf`/`ereignis_verstaendigungen`: Grundgerüst für ereignisübergreifende Einsatzbündelung |
| `20260923211000_ereignis_dimension_rpc.sql` | `set_incident_event_dimension`-RPC |
| `20260923212000_ereignis_fk_indizes.sql` | Fehlende Indizes für Ereignis-Fremdschlüssel |
| `20260924084401_cleanup_event_after_incident_delete.sql` | Ereignis ohne verbleibenden Einsatz wird beim Löschen der letzten Meldung automatisch mitentfernt |
| `20260924100000_close_orphaned_central_events.sql` | Einmalige Bereinigung bereits vorhandener aktiver Ereignisse ohne Einsatzzuordnung |
| `20260924180124_portal_integrationen_vorbereitung.sql` | `integration_outlook_contacts`/`integration_rainbow_calls`/`portal_integration_settings`: Vorbereitung für Outlook/Rainbow, keine Secrets in der Tabelle (siehe `docs/INTEGRATIONEN_OUTLOOK_RAINBOW.md`) |
| `20260924181942_mehrere_kontaktnummern.sql` | Büro-Telefon, Diensthandy und Privathandy je Kontakt statt einer Nummer |
| `20260924182752_benutzer_telefonnummern.sql` | `profile_phone_numbers`: eigene Dienst-/Privathandys je Benutzer, getrennt von Kontaktregister-Nummern |
| `20260924191728_admin_verstaendigung_und_kontaktanzeigen.sql` | `verstaendigungsregeln`/`ereignis_verstaendigungsschritte`: admin-gepflegte Verständigungsregeln, eigener Stand je Ereignis |
| `20260924192905_admin_ablaufvorlagen.sql` | `ablaufvorlagen`/`einsatz_ablauf_schritte`/`ereignis_entscheidungsschritte`: bearbeitbare Vorlagen, eingefrorene Ablaufpunkte je Einsatz/Ereignis |
| `20260924195435_funktionskontakte_systemeinstellungen.sql` | `portal_funktionskontakte`/`zentrale_kontakt_institutionen`: Funktion (z. B. Bürgermeister) getrennt von der aktuellen Person |
| `20260924195529_kontaktinstitutionen_fk_indizes.sql` | Fehlende Indizes für Kontaktinstitutionen-Fremdschlüssel |
| `20260924215016_funktionskontakte_aktive_ereignisse.sql` | Zuständige Person/Rufnummer in aktiven Ereignissen bleibt aktuell, abgeschlossene Ereignisse behalten ihren Stand |
| `20260924215021_profil_als_funktionskontakt.sql` | Ein Funktionskontakt kann auch direkt einen aktiven Portalbenutzer referenzieren |
| `20260924215028_namenslisten_operativ_freigeben.sql` | Korrektur: Namenslisten aus ZMR-Daten waren versehentlich auf reine Hauslisten beschränkt, jetzt wieder für Zentrale/diensthabende Kräfte beschreibbar |
| `20260925021129_dienstplan_import.sql` | Dienstplan-Import Schritt 1-3: `dienstplan_spalten`/`dienstplan_monate`/`dienstplan_dienste`, `dienstplan_monat_ersetzen`/`_veroeffentlichen` |
| `20260925051510_dienstplan_dienststellenweit_lesen.sql` | Dienstplan-Import Schritt 4-5: Lese-Policy dienststellenweit statt nur eigene Zeilen (Grundlage für den Dienststellenkalender) |
| `20260925052718_operational_today_nachtdienst_ende_8uhr.sql` | Nachtdienst-Ende korrekt auf 08:00 Uhr statt 06:00 Uhr |
| `20260925054715_ereignis_automatisch_abschliessen.sql` | Ereignis wird automatisch geschlossen, sobald der letzte offene Einsatz erledigt ist |
| `20260925071826_dienstplan_sollstunden.sql` | `dienstplan_monate.sollstunden` (aus der Excel-Textbox extrahiert) für die Gegenüberstellung in „Meine Dienste" |

Hosted Branching nimmt den Präfix vor dem ersten `_` als Version. Zwei Dateien
mit gleichem Präfix → `duplicate key`. Eine 8-stellige Version plus eine
14-stellige mit demselben Präfix löst im CLI einen Sortierfehler aus
([supabase/cli#6036](https://github.com/supabase/cli/issues/6036)):
`Remote migration versions not found`. Neue Dateien daher mit `date +%Y%m%d%H%M%S`
als eigenem, garantiert einzigartigem 14-stelligem Präfix.

Schema-Änderungen immer als neue Migrationsdatei dokumentieren.

```bash
supabase db push
```

wendet alle noch fehlenden Migrationen aus `supabase/migrations/` in
chronologischer Reihenfolge an — es gibt keine gesonderte Bootstrap-Datei,
die erste Migration (`20260511210803_add_approved_status_and_proc_listed.sql`)
setzt bereits ein bestehendes Grundschema voraus.

## Offene Punkte für den Betreiber

Diese Schritte brauchen Zugangsdaten bzw. eine fachliche Entscheidung — sie
sind im Code vorbereitet, aber ohne Secrets nicht automatisch erledigt:

1. **Migrationen anwenden** (alle Dateien in `supabase/migrations/`, siehe Tabelle oben) auf das Supabase-Projekt.
2. **`create-user` deployen** (`supabase functions deploy create-user`) — nötig
   auch wegen CORS (kein `*`) und wegen `action: reset_password`.
3. **Cloudflare Pages**: `SUPABASE_URL` und `SUPABASE_ANON_KEY` setzen, sonst
   funktionieren Upload/Dateizugriff nicht mehr (kein JWT mehr im Repo).
4. **Optional** `GEMINI_API_KEY` für Vorrechnungs-Analyse.
5. **Optional** `VITE_MASSA_MAILTO` für einen mailto-Entwurf an Massa Wien
   (ohne Variable: nur Simulation, kein Versand).
6. **Fachentscheidungen** (nicht im Code/README eindeutig):
   - Dürfen Benutzer selbst Schuherstattungen beantragen? Die Seite enthält
     dafür UI, Route und RLS erlauben das nur Genehmigern.
   - Sollen `proc_listed` / `shifted_from` in der UI genutzt werden?
