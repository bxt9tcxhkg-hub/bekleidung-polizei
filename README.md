# Bekleidungsverwaltung Stadtpolizei Dornbirn

Interne Web-App zur Verwaltung von Dienstbekleidung: Bestellungen, Genehmigungen,
Budget, Lager, Schneider-Aufträge und Schuherstattungen.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL mit Row Level Security, Auth, Edge Functions)
- **Hosting**: Cloudflare Pages (Auto-Deploy vom `master`-Branch)
- **Dateien**: Cloudflare R2 (Vorrechnungen), PDF-Analyse via Gemini

## Rollen

| Rolle | Bereich |
|---|---|
| Benutzer | Bekleidung bestellen, eigene Bestellungen, Profil (inkl. Größen) |
| Sachbearbeiter | Bestellungen abwickeln, Lager, Produkte, Quartale, Benutzer, Analyse |
| Genehmiger | Freigaben, Budgetverwaltung, Schuherstattungen |
| Admin | Alle Bereiche |

## Bestell-Workflow

```
Warenkorb (pending)
  → eingereicht (approved | pending_approval wenn Budget überschritten)
  → Genehmiger gibt frei (approved)
  → beim Lieferanten bestellt (ordered_supplier)
  → ggf. Schneider (at_tailor)
  → bereit zur Ausgabe (ready_for_issue)
  → ausgegeben (issued) | storniert (cancelled, mit Grund)
```

## Entwicklung

```bash
npm install
npm run dev        # Dev-Server
npm run lint       # ESLint
npm test           # Unit-Tests (vitest)
npm run build      # Typecheck + Produktions-Build
```

### Umgebungsvariablen (.env)

```
VITE_SUPABASE_URL=https://<projekt>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

### Cloudflare Pages Functions

- `functions/upload.ts` — Datei-Upload nach R2 (nur angemeldete Benutzer),
  optional PDF-Analyse wenn `GEMINI_API_KEY` gesetzt ist
- `functions/files/[[path]].ts` — Auslieferung der R2-Dateien (nur angemeldet)
- `functions/_middleware.ts` — SPA-Fallback auf index.html

### Datenbank

Migrationsdateien liegen in `supabase/migrations/`. Schema-Änderungen immer
als Migrationsdatei dokumentieren, auch wenn sie direkt über das
Supabase-Dashboard oder MCP angewendet wurden.
