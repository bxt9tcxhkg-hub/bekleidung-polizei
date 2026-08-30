# Bekleidungsverwaltung Stadtpolizei Dornbirn

Interne Web-App zur Verwaltung von Dienstbekleidung: Bestellungen, Genehmigungen,
Budget, Lager, Schneider-Aufträge und Schuherstattungen.

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
| Sachbearbeiter | Bestellungen abwickeln, Lager, Produkte, Quartale, Benutzer, Analyse |
| Genehmiger | Freigaben, Budgetverwaltung, Schuherstattungen |
| Admin | Alle Bereiche |

Die Rolle `approver` wird weiterhin als Synonym für `Genehmiger` akzeptiert.

## Bestell-Workflow

```
Warenkorb (pending)
  → eingereicht (approved | pending_approval wenn Budget überschritten)
  → Genehmiger gibt frei (approved)
  → beim Lieferanten bestellt (ordered_supplier)
  → ggf. Schneider (at_tailor)
  → bereit zur Ausgabe (ready_for_issue)
  → optional teilweise ausgegeben (partially_issued)
  → ausgegeben (issued) | storniert (cancelled, mit Grund)
```

Zusätzlich im Code (nicht extra in der ursprünglichen README, aber bereits implementiert):

- **Sammelbestellung / Lieferungen**: `approved` → `ordered_supplier` mit `deliveries`-Datensatz, Vorrechnung (R2), Wareneingang.
- **Lager-Shortcut**: Warteende `approved`-Bestellungen können nach Lager-Wareneingang direkt auf `ready_for_issue` gesetzt werden.
- **Standardbudget**: 350 €/Jahr, falls kein `user_budgets`-Eintrag existiert.
- **Schuherstattungs-Cap**: 120 €, falls kein `shoe_refund_caps`-Eintrag existiert.

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
```

Cloudflare Pages Functions (Runtime, **nicht** `VITE_`):

```
SUPABASE_URL=https://<projekt>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
GEMINI_API_KEY=            # optional, PDF-Analyse der Vorrechnungen
```

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
`SUPABASE_SERVICE_ROLE_KEY` bereitgestellt). Nur aktive Sachbearbeiter/Admins
dürfen anlegen; Rollenvergabe entspricht der UI (`admin` nur durch Admins).

### Datenbank

Migrationsdateien liegen in `supabase/migrations/`.

| Datei | Inhalt |
|---|---|
| `20260501_000000_initial_schema.sql` | Rekonstruierte Baseline (Tabellen, Views, RPCs-Helfer, Benutzer-Policies) |
| `20260511000001_*` / `20260511000002_*` | Status-Hinweis / `proc_listed` (Versionen entdoppelt für Branching) |
| `20260702000001_*` / `20260702000002_*` | Fremde Tabellen / Security-Hardening (Versionen entdoppelt) |
| `20260707_*` … `20260708_*` | RPCs, Indizes, Rollenabdeckung |
| `20260830_production_readiness.sql` | Genehmiger-WITH-CHECK, deliveries-RLS, `has_role` prüft `active` |

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

1. **Migrationen anwenden** (`20260501`, `20260830`) auf das Supabase-Projekt.
2. **`create-user` deployen** (`supabase functions deploy create-user`).
3. **Cloudflare Pages**: `SUPABASE_URL` und `SUPABASE_ANON_KEY` setzen, sonst
   funktionieren Upload/Dateizugriff nicht mehr (kein JWT mehr im Repo).
4. **Optional** `GEMINI_API_KEY` für Vorrechnungs-Analyse.
5. **Fachentscheidungen** (nicht im Code/README eindeutig):
   - Dürfen Benutzer selbst Schuherstattungen beantragen? Die Seite enthält
     dafür UI, Route und RLS erlauben das nur Genehmigern.
   - Soll der Lager-Shortcut (`approved` → `ready_for_issue`) der offizielle
     Weg bleiben?
   - Sollen `tailor_jobs` / `proc_listed` / `shifted_from` in der UI genutzt
     werden? Felder existieren, die Oberfläche setzt sie nicht.
   - Inventurabzug bei Ausgabe: `issueOrder` bucht derzeit keinen Bestand.
