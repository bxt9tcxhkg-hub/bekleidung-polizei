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
| Benutzer | Bekleidung bestellen, eigene Bestellungen, Profil (inkl. Größen) |
| Sachbearbeiter | Bestellungen abwickeln, Lager, Produkte, Quartale, Analyse |
| Genehmiger | Freigaben, Budgetverwaltung, Schuherstattungen; Benutzerverwaltung im Portal |
| Admin | Alle Bereiche |

Die Rolle `approver` wird weiterhin als Synonym für `Genehmiger` akzeptiert.

Benutzerverwaltung liegt ausschließlich im **Portal** (`/portal/benutzer`) und ist für
**Admin oder Genehmiger** (Bekleidung) bedienbar. In der Bekleidungs-App gibt es keine
Benutzerseite und keinen Querverweis. Dual-Write `profiles.roles` ↔ `portal_area_roles`
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
Lagerbestand (Pool-Zahlen plus eingelagerte persönliche Stücke). Unterbereich Einsatztraining: offizielle
Module (Combat, Internes ET, Stockschulung TS-Einsatzstock, Erste Hilfe COMBAT,
Szenarientraining, Fahrsicherheitstraining), internes Protokoll (Anwesend/Abwesend, Intervall,
Geschossen-Nachfrage) und externe Teilnahmen. Lesen für `user`, Verwalten für Sachbearbeiter/Admin.
Taktung (Konstante `EINSATZTRAINING_CADENCE`): internes ET 1× pro Halbjahr,
externes ET 4× pro Jahr. Ein abgeschlossenes Modul ist nicht erneut zuweisbar.

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

Benutzeranlage (inkl. Import) ruft `POST /functions/v1/create-user` auf.
Quellcode: `supabase/functions/create-user/`.

```bash
supabase functions deploy create-user
```

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
| `20260914_official_et_roles.sql` | Offizielle ET-Module + Owner-Rollenmatrix nach Dienstnummer |

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

1. **Migrationen anwenden** (`20260501`, `20260830`, `20260901`, `20260903`, `20260906`–`20260914`) auf das Supabase-Projekt.
2. **`create-user` deployen** (`supabase functions deploy create-user`) — nötig auch wegen CORS (kein `*`).
3. **Cloudflare Pages**: `SUPABASE_URL` und `SUPABASE_ANON_KEY` setzen, sonst
   funktionieren Upload/Dateizugriff nicht mehr (kein JWT mehr im Repo).
4. **Optional** `GEMINI_API_KEY` für Vorrechnungs-Analyse.
5. **Optional** `VITE_MASSA_MAILTO` für einen mailto-Entwurf an Massa Wien
   (ohne Variable: nur Simulation, kein Versand).
6. **Fachentscheidungen** (nicht im Code/README eindeutig):
   - Dürfen Benutzer selbst Schuherstattungen beantragen? Die Seite enthält
     dafür UI, Route und RLS erlauben das nur Genehmigern.
   - Sollen `proc_listed` / `shifted_from` in der UI genutzt werden?
