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
| `20260501_000000_initial_schema.sql` | Rekonstruierte Baseline (Tabellen, Views, RPCs-Helfer, Benutzer-Policies) |
| `20260511_approved_status.sql` | Status-Hinweis |
| `20260512_proc_listed.sql` | `proc_listed` (eigene 8-stellige Version, nicht `20260511…`) |
| `20260702_drop_foreign_project_tables.sql` | Fremde Tabellen entfernen |
| `20260703_security_hardening.sql` | Security-Hardening (eigene 8-stellige Version, nicht `20260702…`) |
| `20260707_*` … `20260708_*` | RPCs, Indizes, Rollenabdeckung |
| `20260830_production_readiness.sql` | Genehmiger-WITH-CHECK, deliveries-RLS, `has_role` prüft `active` |
| `20260831_preview_rebuild.sql` | No-op (`SELECT 1`) — nur Preview-Rebuild nach der 20260501-Korrektur, keine Schemaänderung |
| `20260901_user_admin_rights.sql` | Genehmiger darf Profile aktualisieren; Status nur Genehmiger/Admin |
| `20260903_support_tickets.sql` | Interner Support (Tickets in Supabase, kein Drittanbieter) |
| `20260906_portal_area_roles.sql` | Portal-Bereichsrechte (`portal_area_roles`), Backfill, Sync-Trigger |
| `20260907_personal_einsatzmittel.sql` | Persönliche Einsatzmittel (eine Tabelle + category), RLS über `einsatz_mt` |
| `20260908_pool_einsatzmittel.sql` | Pool-Einsatzmittel + Verwahrungsort (eine Tabelle + category), RLS über `einsatz_mt` |
| `20260909_einsatztraining.sql` | Einsatztraining: Module, Trainingstage, Protokoll, Abschlüsse/Sperre, RLS über `einsatz_mt` |
| `20260910_personal_em_verwahrungsort.sql` | Persönliche EM: optionaler Officer + Verwahrungsort (Lager) |
| `20260911_portal_benutzer_genehmiger.sql` | Genehmiger darf `portal_area_roles` lesen; Schreiben bleibt Admin |
| `20260912_pool_verwahrungsorte_lager.sql` | Pool-Orte Spind/Waffentresor + Lager-Notiz |
| `20260913_munition_verbrauch_ausbuchung.sql` | Munitionsverbrauch am Trainingstag, Ausbuchung `removed_at` |
| `20260914_official_et_roles.sql` | Offizielle ET-Module + Rollen aus users-seed.json |
| `20260915_et_roster_stadtpolizei.sql` | Stadtpolizei-Organisation für ET-Liste |
| `20260916_parkaufsicht_roster.sql` | Parkaufsicht-Organisation für Owner-Liste |
| `20260917_force_username_set.sql` | `username` nullable (`DROP NOT NULL`), Wipe `dn{N}`, `force_username_set`, Erstlogin setzt PC-Namen |
| `20260918_budget_used_adjustment.sql` | `user_budgets.used_adjustment`, Verbrauchskorrektur je Kalenderjahr, `submit_cart` berücksichtigt Korrektur |
| `20260919_einsatztraining_fachlogik.sql` | Pflicht/Zusatz, schiesst, Halbjahr, Ausschreibung/Anmeldung |
| `20260920_einsatztraining_geltung.sql` | Geltung `applies_to` (Polizei/Parkaufsicht/Alle), Selbstanmeldung prüft Organisation |
| `20260921_lookup_login_email.sql` | RPC `lookup_login_email`: anon, Username → Auth-E-Mail |
| `20260911100000_vehicle_checks_and_mail_deliveries.sql` | `vehicle_checks` (Fahrzeug-/Materialcheck je Fahrzeug/Tag/Schicht) und `mail_deliveries` (RSa/RSb je Person, Status, Akteneigentümer) samt RPC `record_mail_delivery_action` für die Schnellaktionen |
| `20260911110000_innendienst_cockpit.sql` | `innendienst_shift_tasks` (Kassen-Bestätigung je Person/Tag/Schicht) und `innendienst_records` (schlankes Protokoll für Bescheide Straßenmusik/-kunst und Verstöße – ohne Bescheidinhalte/Gebühren) |
| `20260911120000_innendienst_verstoss_bescheid_bezug.sql` | `innendienst_records.related_bescheid_id`: Verstöße gegen Auflagen müssen sich auf einen konkreten Bescheid (Straßenmusik/-kunst) beziehen, per Trigger geprüft |
| `20260923204222_innendienst_bescheide_arbeitsablauf.sql` | Straßenmusik/-kunst fachlich geschlossen: maximal zwei Bescheide pro Tag, Planbeilage verpflichtend, Außendienst-Ein-Klick-Widerruf und personenbezogene Kommandantenentscheidung |
| `20260924084401_cleanup_event_after_incident_delete.sql` | Entfernt beim Löschen des letzten zugeordneten Einsatzes das Ereignis samt Verständigungen und sonstigen Ereignisdaten; gemeinsame Ereignisse mit weiteren Einsätzen bleiben erhalten |
| `20260924100000_close_orphaned_central_events.sql` | Schließt bereits vorhandene aktive Ereignisse ohne Einsatzzuordnung einmalig; Verlauf und Dokumente bleiben erhalten, offene Verständigungen verschwinden aus dem Arbeitsstand |
| `20260924180124_portal_integrationen_vorbereitung.sql` | Administrator-Konfiguration für Outlook und Rainbow sowie getrennte, geschützte Tabellen für künftige Kontakte und Anrufereignisse; siehe `docs/INTEGRATIONEN_OUTLOOK_RAINBOW.md` |
| `20260924181942_mehrere_kontaktnummern.sql` | Büro-Telefon, Diensthandy und Privathandy je Kontakt; bestehende Nummern bleiben unverändert und ohne angenommene Zuordnung erhalten |
| `20260924182752_benutzer_telefonnummern.sql` | Eigene Dienst- und Privathandys je Benutzer mit getrennten Leserechten für den dienstlichen Kontaktbereich |
| `20260924191728_admin_verstaendigung_und_kontaktanzeigen.sql` | Adminregeln je Ereignisstufe, feste Verständigungsschritte pro Ereignis und Verknüpfung wichtiger Telefonnummern mit konkreten Kontaktnummern |
| `20260924192905_admin_ablaufvorlagen.sql` | Admin-Vorlagen für Maßnahmen und Entscheidungen; unveränderliche Schritte je Einsatz/Ereignis mit RLS und Übernahme bestehender Vorgänge |
| `20260924195435_funktionskontakte_systemeinstellungen.sql` | Zentrale, einmalig gepflegte Funktionskontakte für Stadtführung, Einsatzorganisation und Fachabteilungen; Verständigungsregeln übernehmen stufenübergreifend die jeweils aktuelle Person und Rufnummer; Kontaktinstitutionen sind frei erweiterbar |
| `20260924195529_kontaktinstitutionen_fk_indizes.sql` | Abdeckende Fremdschlüsselindizes für verwaltete Kontaktinstitutionen und deren Zuordnung zu Kontakten |
| `20260924215016_funktionskontakte_aktive_ereignisse.sql` | Zuständige Personen und Rufnummern in aktiven Ereignissen nachführen; bestehende aktive Verständigungsschritte einmalig ergänzen und Löschung verwendeter Funktionen verhindern |
| `20260924215021_profil_als_funktionskontakt.sql` | Aktive Portalbenutzer einschließlich Kommando direkt als Funktionskontakt und Vertretung auswählbar; Profilrufnummern bleiben zentral gepflegt und erscheinen in Verständigungen |
| `20260924215028_namenslisten_operativ_freigeben.sql` | Evakuierungs- und Unterbringungslisten aus ZMR-Daten für Zentrale sowie diensthabende Einsatzkräfte wieder beschreibbar; ersetzt die versehentliche Beschränkung auf reine Hauslisten |
| `20260925021129_dienstplan_import.sql` | Schritt 1-3 des Dienstplan-Imports: `dienstplan_spalten` (einmalig gepflegte Zuordnung Excel-Namensspalte → Profil, `immer_aktiv` für Sonderfälle wie Kommandant/Stellvertreter ohne Diensteintrag), `dienstplan_monate` (ein Eintrag je hochgeladenem Monat, Status `entwurf`/`veroeffentlicht`), `dienstplan_dienste` (Rohzeilen je Beamten/Tag, zeile 1/2 unverändert getrennt gespeichert) + RPCs `dienstplan_monat_ersetzen` (atomarer Delete+Insert beim erneuten Upload desselben Monats) und `dienstplan_monat_veroeffentlichen`. Reine Anzeige, bewusst getrennt vom Überstunden-Meldeworkflow; Parser in `lib/dienstplanImport.ts`, Admin-Import-Seite unter `/portal/systemeinstellungen/dienstplan-import` |
| `20260925051510_dienstplan_dienststellenweit_lesen.sql` | Schritt 4-5: `dienstplan_dienste`-Lese-Policy von "nur eigene Zeilen" auf dienststellenweit (jede/r aktive Bedienstete sieht alle Zeilen eines veröffentlichten Monats) geändert - analog zu `duty_assignments`, wer Dienst hat ist Basisinformation für die ganze Dienststelle. Grundlage für `/dienststellenkalender` (wer hat wann Dienst) und `/meine-dienste` (eigene Diensteinträge + automatisch aus den Uhrzeiten berechnete Stunden, siehe `lib/dienstplanAuswertung.ts` - reine Anzeige, ersetzt nicht die Überstundenmeldung) |
| `20260925071826_dienstplan_sollstunden.sql` | `dienstplan_monate.sollstunden` (nullable) - die Sollstunden des Monats stehen in einer Textbox der Excel-Vorlage, nicht im Zellenraster (siehe `lib/dienstplanImport.ts::extrahiereSollstundenEintraege`, per JSZip aus `xl/drawings/drawingN.xml` gelesen); Import trägt sie nach dem Speichern der Diensteinträge nach. Grundlage für die Gesamt-/Sollstunden-Gegenüberstellung in `/meine-dienste` |
| `20260925153300_dienstplan_genehmiger_planung.sql` | Dienstplan-Planung im Portal, Phase 0: `has_role('genehmiger')` zusätzlich zu `has_role('admin')` bei den Dienstplan-Lese-Policies sowie in `dienstplan_monat_ersetzen`/`dienstplan_monat_veroeffentlichen` zugelassen; neue granulare RPCs `dienstplan_monat_anlegen` (Monat als Entwurf anlegen, ohne bestehende Diensteinträge zu löschen), `dienstplan_dienst_setzen`/`dienstplan_dienst_loeschen` (Upsert/Delete einer einzelnen Diensteintrag-Zeile) für die manuelle Planung einzelner Zellen statt komplettem Monatsersatz |
| `20260925155613_dienstplan_regeln_personaleinstellungen.sql` | Dienstplan-Planung im Portal, Phase 1: `dienstplan_regeln` (Singleton-Zeile: Stunden pro Werktag, Mindestruhezeit, Wunschfrist, nur Admin/Genehmiger änderbar) und `dienstplan_person_einstellungen` (Beschäftigungsgrad je Beamten + `zusatz`-jsonb für künftige Personal-Einstellungen). Grundlage für die Sollstunden-Formel in `lib/dienstplanSollstunden.ts` (Werktage × Stunden pro Werktag × Beschäftigungsgrad, wird nirgends pro Monat gespeichert) und die neue Seite `/dienstplan/einstellungen` |
| `20260925161058_dienstplan_wuensche.sql` | Dienstplan-Planung im Portal, Phase 2: `dienstplan_wuensche` (ein Wunsch je Beamten/Tag: frei/Tagdienst bevorzugt/Nachtdienst bevorzugt + Notiz) sowie RPCs `dienstplan_wunsch_setzen`/`dienstplan_wunsch_loeschen`, die serverseitig gegen die Wunschfrist aus `dienstplan_regeln.wunschfrist_tage` prüfen. Grundlage für die neue Seite `/meine-dienstwuensche` (siehe auch `lib/dienstplanWunsch.ts` für die clientseitige Deadline-Anzeige) |
| `20260911180000_innendienst_kassensturz.sql` | `innendienst_shift_tasks`: Kassensturz-Felder `float_amount`, `expected_revenue`, `cash_denominations`, `counted_total` |
| `20260911190000_mail_deliveries_owner_vernehmung_close.sql` | `mail_deliveries`: Typ `vernehmung`, Status `durchgefuehrt`, Akteneigentümer automatisch = Ersteller (Trigger), `closed_at`/`closed_by` + RPC `close_mail_delivery` (endgültiges Schließen durch den Akteneigentümer) |
| `20260911200000_fuhrpark_vollstaendig.sql` | Fuhrpark komplett: `fleet_equipment_items`/`fleet_equipment_status` (Füllliste/Mängel), `fleet_care_tasks` (Reinigung & Pflege), `fleet_appointments` (Werkstatt & Termine, Fristen), `is_vehicle_responsible()`, Fahrzeugkontrolle auch für Fuhrpark-Mitglieder, Unterlagenbereich `fuhrpark` |
| `20260911210000_fuhrpark_dokumente_pro_fahrzeug.sql` | Fuhrparkweiter Unterlagenbereich `fuhrpark` wieder entfernt (Rückbau von `einsatz_material_tabs`/`einsatz_materials` auf `einsatzmittel`/`einsatztraining`/`schulungen`), stattdessen `fleet_documents` (Zulassung, Serviceheft etc. direkt je Fahrzeug) |
| `20261001_genehmiger_bereichsuebergreifend.sql` | Genehmiger (globale Rolle) bekommt in `has_portal_area_access()`, `can_manage_zentrale()`, `can_manage_fuhrpark()`, `can_manage_einsatzmittel()`, `can_manage_schulungen()` dieselben Rechte wie ein Bereichs-Sachbearbeiter, unabhängig von einer eigenen `portal_area_roles`-Zeile — bereichsübergreifende Aufsicht |
| `20261002_fahrzeugverantwortlicher_lesen.sql` | Lese-Policies auf `fleet_vehicles`/`fleet_equipment_status`/`fleet_care_tasks`/`fleet_appointments` um `is_vehicle_responsible()` ergänzt — analog zu den bereits bestehenden Schreib-Policies, damit Fahrzeugverantwortliche ihr Fahrzeug auch ohne eigene Fuhrpark-Bereichsrolle lesen können (Portal-Widget „Mein Fahrzeug“) |
| `20261003_training_zuteilung_vorschlag.sql` | `einsatz_training_assignments` (Trainingsvorschlag, mit oder ohne Termin) + `is_genehmiger()` (reine Genehmiger-Prüfung ohne Bereichsrollen-Fallback) + RPC `decide_training_assignment` — Anmeldung zu einem Einsatztraining (Selbst- oder Fremdanmeldung) ist ab jetzt nur noch ein Vorschlag, erst der Genehmiger macht daraus per Einteilung eine echte `einsatz_training_registrations`-Zeile (oder lehnt ab) |
| `20261004_pool_einsatzmittel_beschaffung.sql` | `pool_einsatzmittel_requests` (Beschaffungsantrag: Kategorie, Verwahrungsort, Anzahl, Begründung) + RPC `decide_pool_einsatzmittel_request` — direktes Anlegen neuer Pool-Einsatzmittel (`pool_einsatzmittel` INSERT) ist ab jetzt dem Genehmiger vorbehalten (`is_genehmiger()`), der Sachbearbeiter meldet Bedarf nur noch als Antrag; bei Genehmigung entsteht atomar der Pool-Eintrag (Langwaffen einzeln je Stück). Bearbeiten/Ausbuchen bestehender Einträge bleibt unverändert Sachbearbeiter-Aufgabe |
| `20261005_innendienst_gebuehrenordnung.sql` | Gebührenordnung als reine Referenztabelle: `innendienst_gebuehrenpositionen` (Position + Betrag, z. B. Bundesabgabe, Verwaltungsgebühr), `innendienst_gebuehrensaetze` (benannte Sätze, z. B. „Bescheid Straßenmusik") + `innendienst_gebuehrensatz_positionen` (Zusammensetzung). Lesen für den gesamten operativen Bereich (`has_portal_area_access('zentrale')`), Schreiben ausschließlich `is_genehmiger()` — kein Bezug zu `innendienst_records` |
| `20261006_schulungen_tracking.sql` | Schulungen bekommen ein Modul-/Termin-Tracking analog zu Einsatztraining, aber bewusst einfacher (einmalig/ad-hoc, keine Halbjahrespflicht): `schulungen_module`, `schulungen_sessions`, `schulungen_registrations`, `schulungen_completions` + `schulungen_assignments` (Vorschlag → Genehmiger-Entscheidung, RPC `decide_schulung_assignment`, `can_self_register_schulung()`). Kapazität wird per Trigger unabhängig vom Schreibweg durchgesetzt. Abschlüsse bleiben reines Sachbearbeiter-Tracking ohne Genehmiger-Zwang |
| `20260917081000_einsatz_parteien.sql` | `einsatz_parteien`: beteiligte Parteien eines Einsatzes (Beschuldigter/Opfer/Zeuge/Sonstige), getrennt vom Melder (`caller_person_id`), verweist wie überall sonst auf `operational_persons` - dieselbe Person lässt sich unverändert zusätzlich als Gefährder/geschützte Person in einem Schutzfall verwenden. Erfassung erst beim Weiterarbeiten mit einem bestehenden Einsatz, nicht beim Anlegen der Meldung |
| `20260917090000_merge_operational_persons.sql` | RPC `merge_operational_persons` (Admin-only): führt zwei versehentlich doppelt angelegte Personen zusammen - hängt alle Verweise (Personenhinweise, RSa/RSb, AV/BV & EV, Fahndungen, Einsatz-Parteien, Schutzmaßnahmen, Telefonnummern) auf die verbleibende Person um, ergänzt fehlende Stammdaten, löscht danach die entfernte Person |
| `20260917100000_zentrale_reads_profiles.sql` | Zusätzliche, additive SELECT-Policy auf `profiles` über `has_portal_area_access('zentrale')` - Kontakte-Register spiegelt automatisch alle aktiven Benutzer, das muss auch für Zentrale-Personal ohne eigene Bekleidungs-Rolle lesbar sein |
| `20260917110000_zentrale_can_create_objects.sql` | Behebt denselben Admin-only-Bug wie zuvor bei Personen: "Objekte anlegen" war seit `admin_only_register_maintenance` fälschlich Admin-only, jetzt wieder `has_portal_area_access('zentrale')` - nötig, damit ein Einsatzort direkt beim Vormerken eines Schutzfalls als Objekt angelegt werden kann |
| `20260918193000_schutzfall_kontrollauftrag.sql` | `zentrale_entries.schutzfall_id` (Verweis auf `schutzfaelle`) + Trigger `schutzbereich_ensure_kontrollauftrag` (SECURITY DEFINER, feuert auf `schutzbereiche`-Insert): erzeugt automatisch einen Kontrollauftrag (Kategorie `kontrollauftrag`, Priorität hoch, Frist `due_at` = Beginn + 72 Stunden), sobald ein Schutzfall (BV/AV oder EV) mit seinem ersten Schutzbereich gespeichert wird - bewusst als Trigger statt Frontend-Insert, weil "Kontrollaufträge anlegen" per RLS auf `is_genehmiger()` beschränkt ist, ein automatisch erzeugter Auftrag aber keine Genehmiger-Entscheidung ist |
| `20260918200000_incident_streife_zuweisung.sql` | `incident_reports.assigned_vehicle_id` (von der Zentrale zugewiesene Streife/Fahrzeug, zusätzlich zur groben Disposition JD/VD/BP) sowie `taken_over_by`/`taken_over_at` (Streife übernimmt eine offene Meldung selbst) + RPCs `take_over_incident`/`release_incident_takeover` (SECURITY DEFINER, nur `has_portal_area_access('zentrale')` nötig statt der sonst für `incident_reports`-UPDATE erforderlichen Zentralist-Rechte) |
| `20260918210000_revert_schutzfall_kontrollauftrag.sql` | Rückbau von `20260918193000_schutzfall_kontrollauftrag.sql` - nicht gewünscht: weder sollten bereits angelegte Schutzfälle rückwirkend Kontrollaufträge bekommen (passierte ungewollt beim bloßen Bearbeiten, weil das Speichern eines Schutzfalls alle Schutzbereiche löscht und neu einfügt, was den Trigger erneut auslöste) noch soll das automatisch weiterlaufen. Trigger, Funktion und `zentrale_entries.schutzfall_id` entfernt, bereits automatisch erzeugte Kontrollaufträge gelöscht |
| `20260918220000_kontrollauftrag_zeitfenster_und_karte.sql` | `zentrale_entries.zeitfenster` (Freitext für eine zeitliche Eingrenzung innerhalb der Gültigkeit, z. B. "ab 19:00 Uhr" - täglich wiederkehrendes Zeitfenster im Streifendienst, kein einzelner Zeitpunkt, daher kein weiteres Datumsfeld) sowie `location_lat`/`location_lng` für die Kartenansicht im Kontrollauftrag-Formular (wie bei "Neue Meldung") |
| `20260918230000_schutzfall_kontrollauftrag_optional.sql` | Zweiter Anlauf nach dem Rückbau: `zentrale_entries.schutzfall_id` wieder da, plus RPC `create_schutzfall_kontrollauftrag` (SECURITY DEFINER, idempotent) - diesmal kein Trigger, sondern eine Checkbox "Kontrolle durch die Streife erforderlich" beim Anlegen eines Schutzfalls in ZentraleAvBv.tsx, die genau einmal einen echten, für den Genehmiger unter Kontrollaufträge bearbeitbaren Eintrag erzeugt |
| `20260918240000_schutzfall_kontrolle_erforderlich_persistieren.sql` | `schutzfaelle.kontrolle_erforderlich` (die Checkbox aus 20260918230000 wurde bis dahin nirgends gespeichert und beim erneuten Öffnen immer auf true zurückgesetzt) + RPC `remove_schutzfall_kontrollauftrag` (SECURITY DEFINER, gleiche Berechtigung wie das Anlegen), damit ein nachträgliches Wegklicken beim Bearbeiten einen zuvor erzeugten Kontrollauftrag auch wirklich zurücknimmt |
| `20260918250000_schutzfall_kontrolle_ohne_eigenes_flag.sql` | Rückbau von `kontrolle_erforderlich`: das eigene Flag lief gegenüber dem tatsächlichen Kontrollauftrag auseinander, sobald der Genehmiger ihn direkt auf der Kontrollaufträge-Seite löschte ("kein Effekt auf den Schutzfall"). Einzige Wahrheit ist ab jetzt, ob ein verknüpfter `zentrale_entries`-Eintrag existiert - ZentraleAvBv.tsx liest/schreibt die Checkbox direkt gegen diesen Ist-Zustand, Vorbelegung je nach Maßnahme (BV/AV: an, EV: aus, gesetzliche 72h-Erstkontrollpflicht gilt nur für BV/AV), frei änderbar |
| `20260918260000_wichtige_telefonnummern.sql` | Neue Tabelle `wichtige_telefonnummern` (Kategorie intern/extern, Bezeichnung, Nummer, optionaler Hinweis, Sortierung) inkl. Erstbefüllung aus den bisherigen Klebezetteln am Bildschirm ("POLIZEI" / "Telefonnummern Dienststelle"). Lesen für alle mit Zentrale-Zugriff (deckt auch Innendienst ab), Pflege nur Admin/Genehmiger. Neue Kachel "Wichtige Telefonnummern" auf der Zentrale- und Innendienst-Hauptseite, Pflege über `/stammdaten/telefonnummern` |
| `20260919000000_operational_today_nachtdienst.sql` | Neue Funktion `operational_today()`: ein Nachtdienst läuft über Mitternacht, bleibt aber mit dem Kalendertag seines Beginns als `duty_date` erfasst. `is_zentralist_on_duty()` verglich bisher gegen `CURRENT_DATE` (Session-Zeitzone UTC, kein Nachtdienst-Ausgleich) - ein Zentralist verlor dadurch kurz nach (UTC-)Mitternacht, mitten im eigenen Nachtdienst, die per RLS gewährten Rechte. `operational_today()` rechnet in Europe/Vienna und zählt vor 6 Uhr lokal noch den Vortag - client-seitig gespiegelt als `operationalToday()`/`startOfOperationalDayIso()` in `lib/zentraleShared.ts`, ersetzt dort die alten `todayLocal()`-Aufrufe für Diensteinteilung und "heutige" Einsätze in ZentraleShell.tsx, AussendienstShell.tsx und AuthContext.tsx (Ursache dafür, dass heute erfasste Einsätze kurz nach Mitternacht aus der Liste verschwanden) |
| `20260919010000_unterlagen_je_bereich.sql` | `zentrale_unterlagen.bereich` (zentrale/aussendienst/innendienst, Default 'zentrale' für Bestandsdaten): "Kontrollbehelfe" im Außendienst und "Unterlagen" im Innendienst verlinkten bisher direkt auf die Zentrale-Seite (dieselbe Tabelle, keine eigene Kopie) - fachlich falsch, da es unterschiedliche Inhalte für unterschiedliche Bereiche sind. Alle drei laufen weiterhin unter derselben Portal-Berechtigung (`has_portal_area_access('zentrale')`/`can_manage_zentrale()`), nur die Inhalte sind jetzt per bereich-Spalte getrennt - neue Seiten `/aussendienst/kontrollbehelfe` und `/innendienst/unterlagen` (gemeinsame Komponente `UnterlagenRegister.tsx`, gefiltert je Bereich) statt gemeinsam genutzter `/zentrale/unterlagen` |
| `20260919020000_material_unterordner.sql` | `einsatz_material_tabs.parent_id` (selbstreferenzierend, on delete cascade) für beliebig tief verschachtelbare Unterordner bei den Unterlagen (Einsatzmittel/Einsatztraining/Schulungen teilen sich `EinsatzMaterials.tsx`) statt einer flachen Tab-Ebene. Eindeutigkeit des Namens jetzt je Ordner statt bereichsweit. Trigger `check_einsatz_material_tab_no_cycle` verhindert zyklische Verschachtelung (Ordner als eigener indirekter Unterordner) |
| `20260919030000_sole_genehmiger_name.sql` | RPC `sole_genehmiger_name()` (SECURITY DEFINER): lieferte den Namen des einzigen aktiven Admin/Genehmiger/Approver, sonst `null` (mehrdeutig bei mehreren) - ersetzt durch `20260919040000_genehmiger_kette.sql`, da in der Praxis nie genau einer war |
| `20260919040000_genehmiger_kette.sql` | `profiles.genehmiger_rang` (1 = primär, 2/3 = Stellvertreter falls der/die Vorherige nicht da ist) + RPC `genehmiger_kette()` (SECURITY DEFINER, liefert id/name/rang der Kette): feste, vom Kommandanten vorgegebene Reihenfolge (Hans-Peter Schwendinger → Andreas Gisinger → Martin Feurstein) statt der bisherigen "genau ein Genehmiger"-Heuristik. `ueberstunden_meldungen.genehmiger_wahl_id`: beim Anlegen einer Meldung wählt der Ersteller aus der Kette, wer sie voraussichtlich vorgelegt bekommt (rein informativ, ersetzt nicht die tatsächliche Entscheidung über `genehmiger_id`). Gisinger und Feurstein haben dabei die Rolle `genehmiger` erhalten, damit sie auch tatsächlich entscheiden können, sobald sie ausgewählt wurden |
| `20260919050000_einsatz_checkliste_namensliste.sql` | Digitale Abbildung der offiziellen "Checkliste Notfall/Katastrophe" (Erstmeldung) und "Checkliste Notunterkunft" (Stadt Dornbirn) als geteilter Server-Zustand statt localStorage: neue Tabelle `einsatz_checklist_punkte` (erledigt/wer je Checklisten-Punkt, fester `punkt_key`) und `einsatz_namensliste` (ersetzt die bisher rein lokale ZMR-Personenliste aus `lib/zmrPersonen.ts` um eine "unterbringung"-Listenart mit den Spalten der offiziellen Namensliste-Vorlage: Alter/Geschlecht/Sprache/Familie/Telefon/Ort Unterkunft/Anmerkungen). Beide Tabellen lesen/schreiben unter `has_portal_area_access('zentrale')` - bewusst nicht auf Zentralist/Admin beschränkt (anders als `einsatz_parteien`), da sowohl Zentrale als auch Streife vor Ort damit arbeiten sollen. Neue Komponente `EinsatzChecklisten.tsx` (Tab "Ablauf" in `EinsatzArbeitModal.tsx`, aufklappbar bei der Streife in `aussendienstShared.tsx`). Die Personen-/Namensliste ist bewusst als eigene Komponente `IncidentNamensliste.tsx` (Tab "Listen") von den reinen Dateien (`IncidentDocs.tsx`, Tab "Dateien") getrennt statt gemeinsam in einem Tab: ein ZMR-Auszug landet beim Hochladen automatisch in der Liste "Haus/Bewohner", ausgewählte Personen daraus lassen sich im Listen-Tab gezielt in die Notunterkunft-Namensliste kopieren (nicht automatisch). `IncidentNamensliste.tsx` sortiert nach Top-Nr und druckt die jeweilige Liste über `lib/einsatzNamenslistePdf.ts` als befüllte PDF-Vorlage (bei "unterbringung" an die offizielle Namensliste-Vorlage angelehnt) |
| `20260919060000_datenpflege_bereich.sql` | Stufe 1 des Rechte-Umbaus (Audit-Punkt 4 - bisher hingen Stammdaten/Außendienst/Innendienst technisch alle am einzigen Bereich `zentrale`): neuer eigenständiger Portalbereich `datenpflege` mit eigener Sachbearbeiter-Rolle für die Register, die inhaltlich eine dauerhafte Administrationsaufgabe sind, nicht an eine Tagesfunktion gebunden (Schlüssel, Kontakte, wichtige Telefonnummern, Fahndungen, Objekte). Neue Funktion `can_manage_datenpflege()`; RLS dieser Tabellen liest jetzt `has_portal_area_access('zentrale') OR has_portal_area_access('datenpflege')`, Pflege zusätzlich zu Admin auch durch Datenpflege-Sachbearbeiter. Objekte sind bewusst ein gemeinsames Register (sowohl aus Einsätzen als auch eigenständig aus der Datenpflege befüllt), damit der Zentralist beim Einsatz an einer Adresse alle bekannten Infos sieht. RSa/RSb (`mail_deliveries`) ist jetzt für jeden aktiven Benutzer offen, unabhängig von jedem Portalbereich. Bestehende Zentrale-Sachbearbeiter/Admins wurden einmalig automatisch auch zu Datenpflege-Sachbearbeitern gemacht, damit die Register am Umstelltag nicht verwaist sind. `save_portal_profile_v4` → `save_portal_profile_v5` (neuer Parameter `p_datenpflege_roles`) für die Rechtevergabe in `Users.tsx`; `create-user`-Edge-Function ebenso erweitert (`datenpflege_roles`). Die tagesfunktionsbasierte Zugriffssteuerung für Zentrale/Innendienst/Außendienst selbst (inkl. Sidebar-Umbau für Sachbearbeiter/Genehmiger) ist bewusst noch nicht Teil dieser Migration und folgt separat |
| `20260919070000_tagesfunktion_zugriff.sql` | Stufe 2 des Rechte-Umbaus: Zugriff auf Zentrale/Innendienst/Außendienst ist keine Dauerberechtigung mehr, sondern eine Tagesfunktion aus der Diensteinteilung (`duty_assignments`) - jede/r Benutzer/in der Stadtpolizei kann an einem Tag Zentrale, an einem anderen Innendienst oder Außendienst (Funktionen `jd`/`vd`) haben. Neue Funktion `is_operative_duty_today()` (verallgemeinert `is_zentralist_on_duty()` auf alle drei Tagesfunktionen), zusätzlich zur bisherigen `has_portal_area_access('zentrale')`-Prüfung bei ca. 30 Lese-Policies verwendet (additiv - bestehende Dauerberechtigungen bleiben erhalten). `duty_assignments`/`duty_functions` sind jetzt für jede/n aktive/n Benutzer/in weder an `zentrale`-Recht gebunden lesbar noch (eigene Zeile) beschreibbar - vorher konnte niemand ohne bestehende Zentrale-Berechtigung überhaupt eine Tagesfunktion wählen, ein Henne-Ei-Problem. `zentrale_baustellen` prüfte bisher zusätzlich `has_portal_area_access('aussendienst')` - ein Bereich, der über die Rechteverwaltung nie vergeben werden konnte (totes Recht) - jetzt durch die echte Tagesfunktions-Prüfung ersetzt. Client: neuer Hook `useOwnOperativBereicheToday()` (`lib/dutyAccess.ts`) ersetzt in `Portal.tsx`/den drei Shells/allen Stammdaten-Seiten die reine `hasAreaAccess('zentrale')`-Prüfung; im Portal zeigt der "Operative Bereich" jetzt nur die heute zugeteilte Kachel (Admin sieht als Aufsicht weiterhin immer alle drei), die Funktionswahl (`TodayFunctionCard`) ist für jede/n Benutzer/in sichtbar statt nur mit Zentrale-Recht. Schreibrechte (`is_zentralist_on_duty()`-gesteuert, weiterhin nur zentrale+innendienst) und der Sidebar-Umbau für Sachbearbeiter/Genehmiger (Schieberegler-Entfernung) sind bewusst noch nicht Teil dieser Migration |
| `20260919080000_produkt_bezugsart_groessenart.sql` | `products.bezugsart` (`massa`/`eigenbeschaffung`) und `products.size_mode` (`sizes`/`universal`/`none`): der Sachbearbeiter legt pro Artikel fest, ob er über die Massa-Sammelbestellung läuft oder eigenbeschafft wird, und ob er eine Größenliste, eine Universalgröße oder gar keine Größenangabe hat (z. B. Schuhbänder). Bestehende Produkte ohne definierte Größe wurden auf `size_mode = 'none'` migriert, alle anderen bleiben `sizes`; `bezugsart` startet für alle bei `massa` (bisheriges Verhalten). Die Bestellungen-Seite teilt die "Massa Wien"-Sammelbestellung dadurch jetzt in zwei getrennte Kurzbriefe (Massa per Mail-Entwurf, Eigenbeschaffung als reine CSV-Liste ohne festen Empfänger); Shop, Lager, MyOrders, Approvals, Lieferungen und Grundausstattung blenden die Größenauswahl/-anzeige für `universal`/`none`-Artikel aus |
| `20260919090000_produkt_shop_bestellbar.sql` | `products.orderable_in_shop` (Default `true`): trennt "im Lager erfasst/nachbestellbar" von "im Bekleidungskatalog für Beamte bestellbar" - bisher hing beides allein am Aktiv-Schalter. Rein intern verwaltetes Material (z. B. Verbrauchsmaterial) lässt sich damit im Lager führen und über die Bestellungen-Seite nachbestellen, ohne je im Shop aufzutauchen. `Shop.tsx` filtert zusätzlich zur bisherigen Aktiv/Restbestand-Logik auf `orderable_in_shop`; Produktverwaltung hat dafür einen eigenen Schalter neben Aktiv |
| `20260920100000_pool_em_pfefferspray_klein.sql` | Neue Pool-Einsatzmittel-Kategorie `pfefferspray_klein` (Pfefferspray Nachfüllkartusche klein, analog zu `pfefferspray_gross`): erweitert die CHECK-Constraints `pool_einsatzmittel_category_check` und `pool_einsatzmittel_requests_category_check` um den neuen Wert |
| `20260921110000_support_messages_delete.sql` | Neue DELETE-Policy `support_messages`: wer den Themenbereich eines Support-Tickets verwaltet (`can_manage_support_topic()`), kann einzelne Nachrichten im Thread löschen (z. B. Fehleintrag/Spam) - eigene Nachrichten bleiben für gewöhnliche Benutzer weiterhin nicht selbst löschbar, bisher gab es für die Tabelle gar keine DELETE-Policy |
| `20260921120000_support_tickets_delete.sql` | Neue DELETE-Policy `support_tickets`: wer den Themenbereich verwaltet, kann jetzt auch den gesamten Vorgang inkl. Chatverlauf löschen, nicht nur einzelne Nachrichten - `support_messages.ticket_id` hat bereits `ON DELETE CASCADE`, die Nachrichten verschwinden also automatisch mit |
| `20260921130000_support_delete_grants.sql` | Fix zu den beiden vorherigen Migrationen: `GRANT DELETE` an `authenticated` auf `support_messages`/`support_tickets` nachgetragen - die RLS-Policies allein liefen ins Leere, weil das darunterliegende SQL-Recht fehlte (`permission denied for table ...`) |
| `20260921140000_fleet_status_cleanup_inactive_items.sql` | Fix: Ein deaktiviertes Ausstattungsstück (`fleet_equipment_items.active = false`) ließ seinen `fleet_equipment_status`-Eintrag stehen - Portal-Banner, Fleet-Übersicht, "Mein Fahrzeug"-Karte und Mängel-Liste zählten ihn dadurch dauerhaft als offene Aufgabe mit, obwohl die Fahrzeug-Detailseite selbst korrekt filtert. Verwaiste Einträge bereinigt, neue Trigger `cleanup_inactive_fleet_equipment_status`/`cleanup_inactive_fleet_check_item_status` räumen künftige Deaktivierungen automatisch mit auf (analoges Muster bei `fleet_check_items`/`fleet_check_item_status`, die Füllliste, vorsorglich mit) |

Hosted Branching nimmt den Präfix vor dem ersten `_` als Version. Zwei Dateien
mit gleichem Präfix → `duplicate key`. Eine 8-stellige Version plus eine
14-stellige mit demselben Präfix (`20260511` + `20260511000002`) löst im CLI
einen Sortierfehler aus ([supabase/cli#6036](https://github.com/supabase/cli/issues/6036)):
`Remote migration versions not found`. Neue Dateien daher mit eigener
8-stelliger Version ohne gemeinsames Präfix.

Schema-Änderungen immer als neue Migrationsdatei dokumentieren.

Auf einer **bestehenden** Produktionsdatenbank:

```bash
supabase db push
# oder die SQL-Dateien 20260501 und 20260830 im Dashboard ausführen.
# 20260501 ist idempotent (IF NOT EXISTS / OR REPLACE).
```

`20260501` auf einer bestehenden DB auszuführen, legt fehlende Objekte an und
berührt die späteren Staff-Policies nicht (alte Policy-Namen werden dort nicht
neu erzeugt).

## Offene Punkte für den Betreiber

Diese Schritte brauchen Zugangsdaten bzw. eine fachliche Entscheidung — sie
sind im Code vorbereitet, aber ohne Secrets nicht automatisch erledigt:

1. **Migrationen anwenden** (`20260501`, `20260830`, `20260901`, `20260903`, `20260906`–`20260920`) auf das Supabase-Projekt.
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
