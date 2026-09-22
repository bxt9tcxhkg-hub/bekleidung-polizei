# Testdaten: Kennzeichnung + Wipe

Wir testen in **derselben** Production-Supabase-DB (`qqkxlkrkbctexwnqjitx`, kein
zweites Projekt, kein Pro-Branching). Damit Testdaten jederzeit klar erkennbar und
rückstandslos löschbar sind, gilt folgende verbindliche Konvention.

## 1. Konvention

### Test-Benutzer (`profiles`)
- `username` beginnt mit `test_` (z. B. `test_sb_bekleidung`)
- `name` beginnt mit `[TEST] ` (z. B. `[TEST] Sachbearbeiter Bekleidung`)
- `is_test = true`

Beim Anlegen eines Test-Accounts also **alle drei** setzen — `is_test` ist die
Spalte, auf der die Wipe-Funktion technisch aufbaut; `test_`/`[TEST] ` sind die
visuellen Marker im UI (Benutzerliste, siehe Abschnitt 4).

### Fachdaten (Produkte, Bestellungen, Zentrale-Einträge, Einsatzmittel, Schulungen,
Fuhrpark, …)
Ein Datensatz gilt als Testdatum, wenn **mindestens eine** der folgenden Bedingungen
zutrifft:

1. Er hängt über die für die jeweilige Tabelle übliche Eigentümer-Spalte
   (`created_by`, `user_id`, `officer_id`, `beamter_id`, `requester_id` oder
   `requested_by`) an einem Profil mit `is_test = true`.
2. Sein freitextlicher Titel/Name beginnt mit `[TEST] ` — unabhängig davon, wer ihn
   angelegt hat. Das deckt z. B. Demo-Produkte oder Demo-Zentrale-Einträge ab, die für
   einen echten Account erzeugt wurden.

Die genaue Liste der geprüften (Tabelle, Spalte)-Paare steht als Kommentar direkt über
`wipe_test_data()` in der Migration
[`20260922100000_test_daten_markierung_und_wipe.sql`](../supabase/migrations/20260922100000_test_daten_markierung_und_wipe.sql).
Tabellen, die per `ON DELETE CASCADE` an einer dort gelisteten Tabelle hängen (z. B.
`schutzbereiche` an `schutzfaelle`, `zentrale_entries` an `incident_reports`), müssen
dort **nicht** separat stehen — sie werden automatisch mitgelöscht.

### Dateien (Cloudflare R2)
- Pfad-Präfix `test/` **oder**
- Dateiname beginnt mit `[TEST]`

`wipe_test_data()` räumt nur in Postgres auf. R2-Objekte mit diesem Präfix/Namen
müssen separat gelöscht werden (z. B. per kleinem Skript mit dem R2-S3-kompatiblen
Client, gefiltert auf `test/` bzw. `[TEST]` — aktuell nicht automatisiert).

### Was **nicht** passieren darf
- Echte Daten (echte Bedienstete, echte Vorgänge) werden **nie** umbenannt oder auf
  `is_test = true` gesetzt, nur um sie testbar zu machen.
- Kein zweites Supabase-Projekt, kein Massen-Seed echter Beamter, keine Secrets in Git.

## 2. Wipe ausführen

`wipe_test_data()` ist eine `SECURITY DEFINER`-Funktion, aufrufbar von Admins
(`profiles.roles` enthält `admin`, geprüft über das bestehende `has_role('admin')`)
oder mit dem Service-Role-Key.

**Im Supabase SQL-Editor / per `psql`:**
```sql
select * from wipe_test_data();
```
Liefert eine Tabelle `(tabelle text, geloescht bigint)` — pro betroffener Tabelle die
Anzahl gelöschter Zeilen, plus eine Zeile für `auth.users (+ profiles kaskadiert)`
bzw. `profiles (auth.users NICHT gelöscht …)`.

**Aus der App / einem Script (supabase-js, eingeloggt als Admin):**
```ts
const { data, error } = await supabase.rpc('wipe_test_data')
```

**Mit dem Service-Role-Key** (z. B. aus einer Edge Function oder einem Server-Skript,
niemals im Client-Bundle):
```ts
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const { data, error } = await admin.rpc('wipe_test_data')
```

Kein Bestätigungsdialog eingebaut — die Funktion löscht sofort. Vor dem ersten
Produktiv-Einsatz einmal mit einem einzelnen, unkritischen Test-Account durchspielen
und den Report prüfen.

## 3. Wie ein Test-Account angelegt wird

1. Über die bestehende `create-user`-Edge-Function (oder direkt per SQL) einen Account
   mit `username` beginnend mit `test_` und `name` beginnend mit `[TEST] ` anlegen.
2. Danach:
   ```sql
   update public.profiles set is_test = true where username = 'test_sb_bekleidung';
   ```
3. Testdaten damit anlegen wie gewohnt (Bestellungen, Zentrale-Einträge, …) — sie
   hängen über `created_by`/`user_id`/… automatisch am Test-Profil.
4. Für Demodaten an einem **echten** Account: Titel/Name mit `[TEST] ` präfixen.
5. Aufräumen: `select * from wipe_test_data();`

## 4. UI-Kennzeichnung

In der Benutzerliste (`src/pages/Users.tsx`) zeigt ein grau-gestricheltes **TEST**-
Badge neben dem Namen an, dass `profiles.is_test = true` ist (Desktop-Tabelle und
Mobile-Kartenansicht).

## 5. Bekannte Grenzfälle

- **Sekundäre Bearbeiter-Spalten** (`reviewed_by`, `approved_by`, `checked_by`,
  `genehmiger_id`, `decided_by`, `proposed_by`, `removed_by`,
  `munition_recorded_by`, …) zeigen ebenfalls auf `profiles(id)`, sind aber keine
  Eigentümer-Spalten im Sinne der Konvention — ein Testaccount, der zufällig einen
  **echten** Vorgang genehmigt/geprüft/entgegengenommen hat, darf diesen echten
  Datensatz nicht löschen. `wipe_test_data()` setzt solche Spalten stattdessen
  generisch auf `NULL` (ermittelt zur Laufzeit über `pg_constraint`, deckt also auch
  künftig neu hinzukommende Spalten ab, ohne die Funktion anzupassen).
- Ein paar dieser Spalten sind `NOT NULL` (`vehicle_checks.checked_by`,
  `strassenzustand_berichte.bearbeiter`, `support_messages.author_id`,
  `fleet_check_item_status.checked_by`, `fleet_equipment_status.checked_by`,
  `einsatz_training_assignments.proposed_by`, `schulungen_assignments.proposed_by`).
  Zeigen diese noch auf einen zu löschenden Test-Account, bricht die
  Profil-Löschung am Ende **kontrolliert mit einer FK-Verletzung** ab, statt echte
  Daten stillschweigend zu verstümmeln oder falsch zuzuordnen. In dem Fall: den
  betroffenen Datensatz manuell einem echten Account zuweisen (oder den Testaccount
  vorher nicht für solche Aktionen auf echten Vorgängen verwenden) und die Funktion
  erneut aufrufen.
- `auth.users`-Löschung per SQL hängt von den DB-Rechten ab. Klappt es nicht
  (`insufficient_privilege`), löscht die Funktion nur `public.profiles` und meldet das
  im Report — der Auth-User muss dann manuell im Supabase-Dashboard (Authentication →
  Users) entfernt werden.
- R2-Dateien (`test/`-Präfix, `[TEST]`-Dateiname) werden **nicht** von
  `wipe_test_data()` angefasst (siehe oben).
