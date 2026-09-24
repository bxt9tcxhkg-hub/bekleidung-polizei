# Vorbereitung: Outlook und Rainbow

Die Administratorseite **Mein Bereich → Systemeinstellungen** zeigt den tatsächlichen Stand beider Anbindungen. Beide sind bis zur Freigabe, Implementierung und Prüfung durch die Stadt-IT **inaktiv**. Das bisherige Formular zum Speichern einer wirkungslosen Vorbereitung wurde entfernt; die unten beschriebenen Tabellen und früher gespeicherte Angaben bleiben in der Datenbank vorhanden.

## Outlook-Kontakte

- In `portal_integration_settings` können Angaben aus der bisherigen Vorbereitungsmaske liegen (Postfach oder Organisationskontakte, Adresse und Kontaktordner-ID). Die aktuelle Adminseite bietet hierfür keinen Speichern-Button ohne tatsächliche Anbindung.
- Stadt-IT klärt Microsoft-Entra-Mandant, Eigentümer der Kontakte, Graph-Anwendungsregistrierung, Zustimmung und minimal erforderliche Berechtigungen (`Contacts.Read` für Postfachkontakte beziehungsweise `OrgContact.Read.All` für Organisationskontakte). Das Portal erhält keine Passwörter oder Tokens über das Adminformular.
- Eine später einzurichtende **serverseitige** Synchronisation schreibt nur in `integration_outlook_contacts`. Schlüssel `(source_key, external_id)` verhindert doppelte Einträge; lokale `zentrale_kontakte` bleiben unverändert. Das Kontaktregister zeigt importierte Einträge schreibgeschützt mit Herkunft „Outlook“ und klickbarer Telefonnummer. Die Tabelle ist bis dahin leer.
- Vor Inbetriebnahme festlegen: Synchronisationsintervall, Umgang mit Löschungen, Auswahl/Filter dienstlicher Kontakte, Feldzuordnung und Aufbewahrung. Für Postfachordner kann die Graph-Delta-Abfrage Änderungen inkrementell liefern. Keine persönliche Kontaktliste ohne geklärte Berechtigung synchronisieren.

## Rainbow-Telefonie

- Eine zuvor vorgemerkte Zentralnummer kann in `portal_integration_settings` liegen. `integration_rainbow_calls` ist ein geschützter, zunächst leerer Speicher für spätere eingehende Ereignisse mit Rainbow-Benutzer-ID, Anruf-ID, Rufnummern, Zustand und Zeitpunkt. Die Kombination aus Benutzer-ID und Anruf-ID entdoppelt Ereignisse.
- Stadt-IT beziehungsweise Rainbow-Administrator muss die für die Anlage verfügbaren PBX-Ereignisse und deren serverseitige Weiterleitung freigeben. Rainbow bietet Aktionen bei eingehendem, angenommenem und beendetem PBX-Anruf mit Platzhaltern für Anrufer, Ziel, Benutzer und Anruf-ID. Die Desktop-Benachrichtigung allein stellt dem Browser keine verlässliche Schnittstelle bereit.
- Vor Inbetriebnahme: authentifizierten HTTPS-Empfänger mit Prüfung der Herkunft, serverseitigem Geheimnis und Rate-Limit bereitstellen; Nummern normalisieren; Ereignisse nach Anruf-ID zuordnen und geordnet aktualisieren; Sichtbarkeit in der Zentrale und Aufbewahrungsdauer festlegen. `service_role` ausschließlich serverseitig verwenden. Keine automatischen Einsätze aus Anrufen erzeugen.
- Ein persönlicher Rainbow-Zugriffstoken gehört weder in diese Seite noch in den Browser oder Git. Ob er für die konkrete PBX-Ereignisanbindung ausreicht, muss die Stadt-IT anhand ihrer Rainbow-Installation prüfen.

## Berechtigungen

`portal_integration_settings` ist nur für aktive Administratoren lesbar und änderbar. Importierte Kontakte sind für dienstlich berechtigte Zentrale/Datenpflege sichtbar, Rainbow-Anrufe nur für berechtigte Zentrale. Für synchronisierte Daten sind clientseitig keine Schreibrechte erteilt. Die spätere Implementierung muss diese Grenzen und Datenschutzanforderungen zusätzlich serverseitig durchsetzen.
