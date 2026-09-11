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
| `20260911180000_innendienst_kassensturz.sql` | `innendienst_shift_tasks`: Kassensturz-Felder `float_amount`, `expected_revenue`, `cash_denominations`, `counted_total` |
| `20260911190000_mail_deliveries_owner_vernehmung_close.sql` | `mail_deliveries`: Typ `vernehmung`, Status `durchgefuehrt`, Akteneigentümer automatisch = Ersteller (Trigger), `closed_at`/`closed_by` + RPC `close_mail_delivery` (endgültiges Schließen durch den Akteneigentümer) |
| `20260911200000_fuhrpark_vollstaendig.sql` | Fuhrpark komplett: `fleet_equipment_items`/`fleet_equipment_status` (Füllliste/Mängel), `fleet_care_tasks` (Reinigung & Pflege), `fleet_appointments` (Werkstatt & Termine, Fristen), `is_vehicle_responsible()`, Fahrzeugkontrolle auch für Fuhrpark-Mitglieder, Unterlagenbereich `fuhrpark` |
| `20260911210000_fuhrpark_dokumente_pro_fahrzeug.sql` | Fuhrparkweiter Unterlagenbereich `fuhrpark` wieder entfernt (Rückbau von `einsatz_material_tabs`/`einsatz_materials` auf `einsatzmittel`/`einsatztraining`/`schulungen`), stattdessen `fleet_documents` (Zulassung, Serviceheft etc. direkt je Fahrzeug) |
| `20261001_genehmiger_bereichsuebergreifend.sql` | Genehmiger (globale Rolle) bekommt in `has_portal_area_access()`, `can_manage_zentrale()`, `can_manage_fuhrpark()`, `can_manage_einsatzmittel()`, `can_manage_schulungen()` dieselben Rechte wie ein Bereichs-Sachbearbeiter, unabhängig von einer eigenen `portal_area_roles`-Zeile — bereichsübergreifende Aufsicht |

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
