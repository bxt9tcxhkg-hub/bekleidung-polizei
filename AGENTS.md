# Bauvorgaben für KI-Agenten

Diese Datei ist die gemeinsame Referenz für **alle** KI-Modelle, die an diesem
Repository arbeiten (Claude, GPT/Codex, etc. — `AGENTS.md` ist der
werkzeugübergreifende Standardname dafür; `CLAUDE.md` verweist nur hierher).
Ziel: Neues fügt sich in Bestehendes ein, statt Muster neu zu erfinden, die
anderswo im Portal längst gelöst sind.

**Grundregel: Vor jeder neuen Implementierung erst nach einem bestehenden
Muster im Code suchen (`grep`/vergleichbare Seite) und dieses übernehmen.**
Ein neues Muster nur einführen, wenn wirklich keines passt — und dann hier
ergänzen.

## Stack

- Frontend: React 19 + TypeScript + Vite + Tailwind CSS, React Router
  (lazy-loaded Routen in `src/App.tsx`)
- Backend: Supabase (Postgres, Row Level Security, Auth, Edge Functions)
- Hosting: Cloudflare Pages (Auto-Deploy von `master`), Dateien über
  Cloudflare Pages Functions (`functions/*.ts`) nach R2
- Sprache in UI, Code-Kommentaren, Commit-Messages, Datenbank-Feldern und
  Fachbegriffen: **Deutsch** (Variablennamen im Code dürfen Englisch sein,
  UI-Text und Domänenbegriffe nicht)

## Berechtigungsmodell — nicht neu erfinden

`src/contexts/AuthContext.tsx` ist die einzige Quelle für Rechte-Entscheidungen
im Frontend. Bereits vorhandene Flags immer wiederverwenden:

- `isStrictAdmin` — roh, nie gegatet. Admin ist Dauerzustand, kein
  „operativer Modus".
- `isGenehmiger` / `isSachbearbeiter` — roh, kein manueller Umschalter mehr
  (der frühere „operative Modus"/Schieberegler wurde entfernt; die Fähigkeit
  ist immer additiv zur normalen Benutzeransicht vorhanden, sobald die Rolle
  zugewiesen ist).
- `isGenehmigerEntitlement` — Alias auf `isGenehmiger`, nur für
  Zugriffs-/Sichtbarkeitsentscheidungen (z. B. „darf diese Seite überhaupt
  sehen"), nicht für Bearbeiten-Fähigkeiten.
- `hasAreaAccess(area)` — Bereichszugriff (`portal_area_roles`).
- `isZentralistOnDuty` — Person hat aktuell Zentrale-Dienst (unabhängig von
  Rolle).

Das wiederkehrende Muster für „darf handeln" in der Zentrale (siehe
`ZentraleUebersicht.tsx`, `StammdatenBaustellen.tsx`, `StammdatenFahndungen.tsx`
u. a.):

```ts
const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
const canManage = isStrictAdmin || isGenehmiger || roles.some(role => ['sachbearbeiter', 'admin'].includes(role))
const canOperate = canManage || isZentralistOnDuty
```

Auf Datenbankebene gilt dasselbe Prinzip über SQL-Helfer statt Frontend-Flags:
`has_portal_area_access('<bereich>')`, `can_manage_zentrale()`,
`is_zentralist_on_duty()`, `has_role('admin')`, `is_genehmiger()`. Eine neue
Policy soll auf einen bestehenden Helfer verweisen, nicht die Logik erneut
in SQL ausschreiben. **Bekannter Fehlerklasse:** mehrfach kam es vor, dass
eine INSERT/SELECT-Policy versehentlich Admin-only blieb, obwohl der Bereich
eigentlich per `has_portal_area_access('zentrale')` für alle Zentrale-Rollen
gedacht war (siehe Migrationen `zentrale_can_create_objects`,
`zentrale_reads_profiles` als Korrekturen). Bei jeder neuen Policy prüfen,
ob sie zum tatsächlich gewünschten Rechtekreis passt, nicht nur zur
nächstliegenden Vorlage.

## Datenbank / Migrationen

- Jede Schemaänderung als **eigene neue Migrationsdatei** in
  `supabase/migrations/`, nie bestehende Migrationen nachträglich ändern.
- Dateiname mit **eigenem, garantiert einzigartigem Präfix vor dem ersten
  `_`** (8- oder 14-stellig). Zwei Dateien mit gleichem Präfix kollidieren
  beim Hosted Branching; eine 8-stellige und eine 14-stellige Version mit
  gemeinsamem Präfix lösen einen Sortierfehler im Supabase-CLI aus
  ([supabase/cli#6036](https://github.com/supabase/cli/issues/6036)). Im
  Zweifel `date +%Y%m%d%H%M%S` als Präfix verwenden.
- Migrationen werden bei Push nach `master` automatisch auf das lebende
  Supabase-Projekt angewendet — vorher mit `mcp__Supabase__execute_sql` /
  `list_migrations` prüfen, nicht blind `apply_migration` aufrufen.
- Jede neue Migration in der Tabelle in `README.md` unter „Datenbank"
  mit einer knappen Beschreibung eintragen (bestehendes Format übernehmen).
- SECURITY DEFINER-RPCs für Aktionen, die eine Prüfung brauchen, die RLS
  allein nicht sauber abbilden kann (z. B. `merge_operational_persons`,
  `record_mail_delivery_action`, `close_mail_delivery`,
  `decide_training_assignment`) — bestehende RPCs als Vorlage nehmen statt
  Berechtigungslogik verstreut im Frontend nachzubauen.

## Frontend-Konventionen

- Gemeinsame Bausteine statt Neubau: `src/components/ZentraleEntryEditor.tsx`
  stellt `Modal`, `Actions`, `ErrorMessage`, `Empty`, `inputClass` u. a. für
  alle Zentrale-Formulare/-Modals bereit. Vor einem neuen Modal/Formular
  immer zuerst dort nachsehen.
- **RLS-Fehler nie still verschlucken.** `.update()`/`.insert()` ohne
  `.select()` liefert bei einer RLS-blockierten Zeile *keinen* SQL-Fehler
  (0 betroffene Zeilen sieht aus wie Erfolg) und die UI zeigt fälschlich
  „gespeichert", obwohl beim nächsten Laden der alte Stand zurückkommt.
  Bei jedem `.update()` mit `.select('id')` (oder vergleichbar) prüfen, ob
  eine Zeile zurückkam, und sonst einen Fehler anzeigen (siehe
  `src/pages/lager/useLager.ts`, `saveQty`/`saveMinQty`).
- Validierungs-/Dubletten-Erkennung ist **Hinweis, keine Sperre** — Prinzip
  aus der Zentrale: möglichst wenige Klicks, kein Aktenbearbeitungsprogramm.
  Beispiel: `findSimilarPersons()`/`findSimilarObjects()` in
  `src/lib/register.ts` schlagen ähnliche Treffer vor, blockieren das
  Anlegen aber nicht.
- Registerbezogene Objekte (Personen, Objekte/Schutzbereiche) werden genau
  einmal zentral gepflegt (`operational_persons`, `operational_objects`) und
  von allen Kontexten (Einsatz-Parteien, AV/BV, RSa/RSb, Personenhinweise)
  referenziert — nie ein kontextspezifisches Duplikat der Personendaten
  anlegen. Rollen/Zusammenhang (Gefährder, Beschuldigter, Partei RSa/RSb …)
  hängen am Kontext, nicht an der Person selbst.
- Deutsche Fachbegriffe nicht raten — im Zweifel im Code/README nach der
  bestehenden Verwendung suchen oder nachfragen. Bekannte Abkürzungen:
  BV = Betretungsverbot, AV = Annäherungsverbot, EV = Einstweilige Verfügung
  (gerichtliche Verlängerung von BV/AV). Kleidergröße `NNI`/`NNII`-Suffix
  (z. B. `34I`/`34II`) = **Länge**, nicht Weite.

## Vor jedem Commit (Validierungs-Gate)

```bash
npx tsc -b        # muss sauber durchlaufen
npm run lint       # 0 Fehler (die ~19 bestehenden react-hooks/exhaustive-deps-Warnungen sind bekannt/akzeptiert)
npm run build
npm test           # alle Tests grün
```

Kein Schritt darf übersprungen werden, bevor Code als fertig gilt.

## Git

- Alle Änderungen auf dem jeweils zugewiesenen Feature-Branch, Merge nach
  `master` **nur nach expliziter Freigabe** durch den Auftraggeber — nie
  eigenständig mergen, auch wenn alle Checks grün sind.
- Migrationsdateien sind Teil des normalen Commits, nicht gesondert
  behandeln.

## Wenn etwas hier fehlt

Diese Datei wächst mit dem Projekt. Wird ein neues wiederkehrendes Muster
eingeführt (neue Seiten-Art, neuer Berechtigungs-Fall, neue
Datei-Upload-Variante etc.), **hier ergänzen**, damit das nächste Modell es
nicht erneut herleiten muss.
