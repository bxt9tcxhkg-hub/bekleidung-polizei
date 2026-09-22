# Masterplan Zentrale / Ereignisarbeit

Stand: September 2026

## 1. Leitbild

Das Portal wird zunächst für die Stadtpolizei Dornbirn umgesetzt. Die Architektur wird jedoch so aufgebaut, dass Feuerwehr, Katastrophenschutz und Stadteinsatzleitung später mit demselben Ereignis arbeiten können.

Grundsatz:

> Ein Ereignis – mehrere Organisationen – unterschiedliche Sichten auf dieselbe Lage.

In der ersten Ausbaustufe wird nur die Polizeisicht vollständig umgesetzt. Für andere Organisationen werden keine halbfertigen Module oder Platzhalter angelegt. Das Datenmodell muss aber organisationsübergreifend anschlussfähig bleiben.

Das Portal ergänzt PAD und bestehende Fachsysteme. Es ersetzt diese nicht.

## 2. Operative Grundsätze

- wenige Klicks, wenig Tippen
- Leitfaden: **wenig Klicks, viel Information**
- Informationen werden möglichst automatisch bereitgestellt
- Übersichten zeigen zuerst den aktuellen Stand und die nächsten sinnvollen Aktionen; Detailfelder erscheinen erst bei Bedarf
- bekannte Daten werden weiterverwendet statt erneut abgefragt
- keine zusätzliche Belastung für Zentrale oder Streifen
- sicherheitskritische Entscheidungen bleiben beim Menschen
- keine automatische Einstufung von Mittel-/Großereignis/Katastrophe
- keine automatische Alarmierung ohne ausdrücklich definierten Prozess
- alle gemeinsam benötigten Informationen serverseitig und schichtübergreifend
- keine operativen Kerninformationen in localStorage oder versteckt in Freitextfeldern
- keine doppelten Dateneingaben, wenn Informationen bereits aus der Einsatzmeldung vorhanden sind

## 3. Vier fachliche Ebenen

### 3.1 Meldung / Einsatz
Konkreter Vorgang, z. B. Hilfeschreie, Verkehrsunfall, Alarmanlage, Baum auf Fahrbahn.

Enthält insbesondere:
- Meldungsleger
- Einsatzort
- Sachverhalt
- Zeitpunkt
- Bearbeitungsstatus
- zugewiesene Kräfte
- beteiligte Parteien
- einsatzbezogene Dateien
- operative Hinweise

### 3.2 Bearbeitung
Wer bearbeitet den konkreten Einsatz:
- offen / nicht zugewiesen
- Zentrale
- eigene Streife (JD / VD / temporäre weitere Streife)
- Bundespolizei
- erledigt

Bearbeitung ist unabhängig von der Ereignisdimension.

### 3.3 Ereignisdimension
- Kleinereignis / Tagesgeschäft
- Mittelereignis
- Großereignis
- Katastrophe

Die Ereignisdimension beschreibt die organisatorische Tragweite der Gesamtlage, nicht die Dringlichkeit eines einzelnen Einsatzes.

### 3.4 Sonderprozesse
Zusätzliche Prozesse, die nur bei tatsächlichem Bedarf aktiviert werden, z. B.:
- Notunterkunft
- Evakuierung
- Personen-/Bewohnerlisten
- Kontrolllisten
- Befragungslisten
- weitere lageabhängige Hilfsmittel

Ein Sonderprozess darf nicht allein aufgrund der Ereignisstufe automatisch als erledigungspflichtige Aufgabe entstehen.

## 4. Normaler Zentrale-Ablauf

Neue Meldung:

1. Meldungsleger
   - Umschaltung Person / Meldende Stelle
   - Telefonnummer
   - Name bzw. Organisation
2. Einsatzort
   - Straße + Hausnummer
   - alternativ Straßenkilometer
   - Karte
3. Sachverhalt
4. interne, deterministisch erkannte Kategorie
   - nur bei eindeutiger Zuordnung
   - manuell korrigierbar
5. speichern

Neue Meldungen starten grundsätzlich offen / nicht zugewiesen.

Danach direkte Bearbeitungsaktionen:
- Zentrale übernimmt
- Streife zuweisen
- an BP abtreten

Aktive Streifen sehen offene, nicht zugewiesene Einsätze und können sie selbst übernehmen.

## 5. Arbeitsraum eines normalen Kleinereignisses

Ein normales Kleinereignis darf nicht mit Katastrophenschutzfunktionen überladen werden.

Dauerhafte Hauptbereiche:

- Übersicht
- Parteien
- Dateien

Nicht dauerhaft sichtbar:
- Katastrophenschutz-Ablauf
- Telefonkette
- Stadteinsatzleitung
- Notunterkunft
- Evakuierungslisten
- sonstige ereignisspezifische Prozesse

Die Bezeichnung „Kleinereignis“ soll im Tagesgeschäft optisch zurückgenommen werden. Erst höhere Ereignisdimensionen müssen deutlich hervorgehoben werden.

## 6. Ereignis-Arbeitsraum ab Mittelereignis

Ab Mittelereignis wird zusätzlich ein Bereich „Ereignis“ aktiviert.

Der Ereignis-Arbeitsraum hat vier Funktionsgruppen:

### 6.1 Lageführung
- Ereignisdimension
- Lagebeschreibung
- Meldungszettel
- Betroffenheit
- Opfer
- Sachschäden
- erforderliche Maßnahmen
- Lageskizze
- relevante Entscheidungen
- Verlauf / Änderungen

Bestehende Daten werden übernommen:
- Was passiert ist <- Sachverhalt
- Wo <- Einsatzort
- Wann <- Meldezeitpunkt
- Melder <- Meldungsleger

Keine doppelte Eingabe.

### 6.2 Verständigung
Stufenabhängige Informations- und Verständigungswege.

Gespeichert werden:
- Funktion / Stelle
- versucht
- erreicht
- Zeitpunkt
- bearbeitende Person
- optional Bemerkung

Kontaktdaten kommen aus zentral gepflegten Stammdaten und werden nicht in Checklisten hart verdrahtet.

### 6.3 Unterstützung der Kräfte vor Ort
Ab Mittelereignis ist die Zentrale aktive Informations- und Arbeitsunterstützung.

Dazu gehören insbesondere:
- ZMR-Abfragen
- Bewohnerlisten
- Evakuierungslisten
- Kontrolllisten
- Befragungslisten
- Notunterkunftslisten
- Lagepläne
- PDFs / Abfragen / Fotos / sonstige Unterlagen
- vorbereitete Informationen für Einsatzkräfte vor Ort

Der bereits vorhandene ZMR-Workflow bleibt erhalten:
1. ZMR-Auszug oder Abfrage als PDF hochladen
2. PDF-Text mit pdf.js auslesen
3. Personen automatisch in „Haus / Bewohner“ übernehmen
4. Benutzer wählt tatsächlich relevante Personen aus
5. gezielte Weiterführung in Evakuierung, Kontrolle, Befragung oder Notunterkunft
6. Zentrale und Kräfte vor Ort arbeiten auf demselben serverseitigen Stand
7. Listen können als PDF bereitgestellt / gedruckt werden

Es erfolgt bewusst keine automatische Übernahme aller ZMR-Personen in die Notunterkunft, da nicht jede gemeldete Person tatsächlich anwesend oder unterzubringen ist.

### 6.4 Sonderprozesse
Sonderprozesse werden bewusst aktiviert.

Beispiel Notunterkunft:
- Einzelperson / Familie
- mehrere betroffene Personen
- Sammelstelle
- Anzahl Betroffene
- Unterkunft benötigt ab
- voraussichtliche Dauer
- Personen-/Namensliste
- Betreuung
- Akutbetreuung
- Versorgung
- kurzfristige Quartiere
- mittelfristige Unterbringung
- Übergabe an zuständige städtische Stellen

Die aktuell gültigen Dornbirner Abläufe müssen fachlich festgelegt werden, bevor alte und neuere Checklisten zusammengeführt werden.

## 7. Parteien und Betroffenenlisten bleiben getrennt

### Parteien
Polizeiliche Einsatzbeteiligte:
- Beschuldigter
- Opfer
- Zeuge
- sonstige Partei

### Betroffenen-/Evakuierungslisten
Organisatorische Erfassung im Ereignis:
- Nachname
- Vorname
- Alter
- Geschlecht
- Sprache
- Familienzugehörigkeit
- Telefonnummer
- Ort der Unterkunft
- Anmerkungen / medizinisch relevante organisatorische Hinweise

Diese beiden Modelle dürfen fachlich und technisch nicht vermischt werden.

## 8. Ereignis als organisationsübergreifendes Objekt

Langfristig darf ein Ereignis nicht einer Organisation „gehören“.

Beispiel:

EREIGNIS: Hochwasser Dornbirn

Verknüpfte Einsätze:
- Unterführung überflutet
- Keller unter Wasser
- Baum auf Fahrbahn
- eingeschlossene Person

Gemeinsam am Ereignis:
- Ereignisdimension
- Lagebild
- Meldungszettel
- Verständigungen
- Entscheidungen
- gemeinsame Dateien
- Betroffenen-/Evakuierungslisten
- Sonderprozesse

Organisationsspezifisch:

### Polizei
- Meldungsannahme
- Streifendisposition
- ZMR
- Personen-/Objekthinweise
- operative Unterstützung
- polizeiliche Parteien

### Feuerwehr – spätere Ausbaustufe
Mögliche eigene Sicht auf dasselbe Ereignis, ohne heute Funktionen vorzutäuschen.

### Katastrophenschutz / Stadteinsatzleitung – spätere Ausbaustufe
Mögliche Führungs-, Koordinations- und Lagefunktionen auf demselben Ereignis.

## 9. Gemeinsame Daten vs. organisationsspezifische Daten

### Gemeinsame Ereignisdaten
- Ereignis-ID
- Titel
- Ereignisdimension
- Lage
- räumliche Bezüge
- Betroffenheit
- Meldungszettel
- Lagebild
- gemeinsame Dokumente
- Betroffenenlisten
- Verständigungen
- wichtige Entscheidungen
- aktive Sonderprozesse

### Polizeispezifische Daten
- Einsatzmeldungen
- JD/VD/BP-Bearbeitung
- Streifenübernahme
- Schutz-/Personen-/Objekthinweise
- ZMR-Unterstützung
- polizeiliche Parteien
- PAD-Verweise

## 10. Serverseitige Speicherung

Operativ relevante Daten müssen geteilt und schichtübergreifend gespeichert werden.

Insbesondere:
- Ereignisdimension
- Änderungshistorie
- wer wann hoch-/herabgestuft hat
- Verständigungsprotokoll
- Checklistenstand
- Meldungszettel
- Entscheidungen
- Sonderprozesse
- ZMR-/Bewohner-/Evakuierungs-/Unterkunftslisten
- Verknüpfung mehrerer Einsätze mit einem Ereignis

Zu entfernen/abzulösen:
- Ereignisstufe aus localStorage
- Telefonkettenstatus aus localStorage
- STUFE:-Marker im Notizfeld als operative Datenquelle

## 11. UI-Struktur

### Kleinereignis
Übersicht | Parteien | Dateien

### Mittel-/Großereignis/Katastrophe
Übersicht | Ereignis | Parteien | Dateien

Weitere Funktionen erscheinen innerhalb des Ereignisbereichs kontextabhängig und nicht als dauerhaft wachsende horizontale Tab-Leiste.

Auf Mobilgeräten darf keine wichtige Funktion nur durch horizontales Scrollen auffindbar sein.

## 12. Umsetzung in Phasen

### Phase 1 – Datenmodell
- echtes organisationsübergreifendes Ereignisobjekt
- Verknüpfung Einsatz <-> Ereignis
- serverseitige Ereignisdimension
- Ereignis-Historie
- Verständigungsprotokoll
- localStorage-Ablösung

### Phase 2 – Arbeitsraum
- normales Kleinereignis verschlanken
- Übersicht / Parteien / Dateien
- Ereignisbereich nur ab Mittelereignis bzw. bei bewusst aktiviertem Ereignisprozess

### Phase 3 – Meldeschema / Lageführung
- offizielle vier Ereignisdimensionen
- Meldungszettel
- stufenabhängige Verständigungen
- geführte Erstmeldung
- Entscheidungen / Maßnahmen

### Phase 4 – Unterstützung vor Ort
- bestehenden ZMR-Workflow integrieren
- Haus-/Bewohnerliste
- Evakuierung
- Kontrolle
- Befragung
- PDF-Ausgaben
- gemeinsamer Stand Zentrale / Außendienst

### Phase 5 – Notunterkunft
- gültige Prozessvarianten festlegen
- strukturierter Ablauf
- Betroffenenliste
- Unterkunftsdaten
- Kontakte aus Stammdaten

### Phase 6 – Mehrere Einsätze je Ereignis
- Lage mit mehreren Schadstellen
- gemeinsame Ereignisdaten
- einzelne operative Einsätze bleiben separat bearbeitbar

### Phase 7 – spätere organisationsübergreifende Erweiterung
- Feuerwehr-Sicht
- Katastrophenschutz-/Stadteinsatzleitungs-Sicht
- gemeinsame Lage bei getrennten organisationsspezifischen Arbeitsbereichen

## 13. Nicht verhandelbare Qualitätskriterien

- keine Placebos
- keine Fake-Funktionen
- keine Platzhalterprozesse
- keine sicherheitskritischen KI-Entscheidungen
- keine unnötigen Pflichtfelder
- keine Doppelpflege
- keine operative Information nur lokal auf einem Endgerät
- bestehende funktionierende ZMR-/Listenlogik nicht neu erfinden
- PAD bleibt führendes Akten-/Fachsystem
- Portal dient der schnellen operativen Unterstützung und Koordination
