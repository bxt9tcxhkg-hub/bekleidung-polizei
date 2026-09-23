# Zentrale – End-to-End-Abnahmetest

Ziel: Die Zentrale muss den realen Arbeitsablauf unterstützen, ohne das PAD als führendes Einsatzprotokoll der Stadtpolizei zu ersetzen.

## Grundsatz

- Portal: Meldungsannahme, Disposition, offene Arbeit, Verständigungen, Abfragen, ZMR-/Dokumentenbereitstellung, gemeinsame Ereigniszuordnung.
- PAD: Einsatzverlauf, Maßnahmen, Feststellungen, Rückmeldungen von vor Ort und operative Personendetails.
- Funk/Telefon werden nicht als Kommunikationsprotokoll nacherfasst.
- Feuerwehr/Krisenstab stellen Anforderungen praktisch per Funk/Telefon; die Zentrale merkt den Bedarf im Einsatz vor und stellt Ergebnisse bereit.

## Abnahmeszenario A – normaler Einsatz

1. Neue Meldung mit Anlass, Ort und optionalem Melder erfassen.
2. Prüfen, dass der Einsatz in der Zentrale als offen erscheint und auf der Karte markiert ist.
3. Einsatz öffnen.
4. Erwartung:
   - Status, Disposition und Ort sofort sichtbar.
   - Sicherheits-/Objekt-/Schlüsselhinweise erscheinen nur bei konkretem Einsatzbezug.
   - „Nächster Schritt“ zeigt fehlende Disposition, wenn noch keine Bearbeitung festgelegt ist.
5. JD/VD/Streife zuweisen.
6. Erwartung:
   - Disposition und Fahrzeug/Funkrufname sind sichtbar.
   - Der nächste Schritt verlangt keine erneute Disposition.

## Abnahmeszenario B – Unterstützungsabfrage der Streife

1. Streife fordert Personenabfrage/ZMR/Fahrzeugabfrage an.
2. Erwartung Zentrale:
   - Aufgabe erscheint in „Offene Abfragen / Bereitstellungen“.
   - Im geöffneten Einsatz erscheint dieselbe Aufgabe direkt unter „Unterstützung / Abfragen“.
3. Aufgabe übernehmen.
4. Ergebnisdatei hochladen.
5. Erwartung:
   - Aufgabe wird erledigt.
   - Ergebnis liegt am Einsatz.
   - Bei ZMR-PDF werden erkannte Bewohnerdaten als neutrale Informationsbasis übernommen.
   - Es wird kein Funk-/Telefontext verlangt.
6. Konkurrenztest:
   - Zweiter Zentralist versucht dieselbe Aufgabe zeitgleich zu übernehmen.
   - Erwartung: keine doppelte Übernahme; verständlicher Konflikthinweis.

## Abnahmeszenario C – Feuerwehr/Krisenstab benötigt Information

1. Feuerwehr/Krisenstab meldet Bedarf telefonisch oder per Funk.
2. Zentralist öffnet den betreffenden Einsatz und wählt „+ Bedarf vormerken“.
3. Organisation und Abfrageart auswählen.
4. Erwartung:
   - Kein externes Ticketformular.
   - Aufgabe wird als interne Zentralenarbeit sichtbar.
5. Ergebnis hochladen.
6. Erwartung:
   - Bei gemeinsamem Ereignis wird das Ergebnis automatisch als Ereignisdokument für die anfordernde Organisation bereitgestellt.
   - Der Zentralist muss keinen Speicherort auswählen.

## Abnahmeszenario D – mehrere Einsätze

1. Mindestens zwei offene Einsätze anlegen.
2. Erwartung:
   - Karten sind kompakt.
   - Alle Einsatzorte sind auf der Karte sichtbar.
3. Einen Einsatz aufklappen.
4. Erwartung:
   - Karte zentriert auf diesen Einsatz.
   - Einsatzdetails und Aktionen erscheinen.
5. Wieder zuklappen.
6. Erwartung:
   - Karte zeigt wieder alle offenen Einsatzorte.

## Abnahmeszenario E – gemeinsames Ereignis

1. Einen Einsatz auf Mittel-/Großereignis setzen.
2. Zweiten Einsatz dem bestehenden Ereignis zuordnen.
3. Erwartung:
   - Beide Einsatzkarten zeigen den gemeinsamen Ereigniskontext.
   - Zugehörige Einsatzorte werden auf der Karte gemeinsam hervorgehoben.
   - Im Einsatz sind die weiteren Einsätze des Ereignisses direkt erreichbar.
4. Zuordnung eines Einsatzes lösen.
5. Erwartung:
   - Nur dieser Einsatz verlässt das Ereignis.
6. Alle zugeordneten Einsätze erledigen.
7. Erwartung:
   - Portal weist darauf hin, das Ereignis zu prüfen/abzuschließen.
   - Ereignis wird nicht automatisch fachlich abgeschlossen.
8. Ereignis abschließen und wieder öffnen.
9. Erwartung:
   - Statuswechsel funktioniert und wird serverseitig protokolliert.

## Abnahmeszenario F – Verständigungskette

1. Mittel-/Großereignis öffnen.
2. Erwartung:
   - Nächster offener Verständigungsschritt wird hervorgehoben.
   - vorhandene Telefonnummern sind direkt anwählbar.
3. „Versucht“ bzw. „Erreicht“ setzen.
4. Erwartung:
   - Stand bleibt nach Neuladen erhalten.
   - Schichtwechsel sieht denselben Stand.
   - Das Portal dokumentiert keinen Einsatzverlauf.

## Abnahmeszenario G – Dienst-/Schichtwechsel

1. Offene Einsätze, offene Abfrage und aktives Ereignis mit offener Verständigung vorbereiten.
2. Zentrale neu laden bzw. nächster Zentralist meldet sich an.
3. Erwartung im Arbeitsstand:
   - Anzahl offene Einsätze.
   - Anzahl offene Abfragen.
   - Anzahl aktive Ereignisse.
   - offene Verständigungen werden hervorgehoben.
4. Erwartung:
   - Kein eigenes Übergabeprotokoll ist erforderlich, um den offenen Systemstand zu erkennen.

## Abnahmeszenario H – Berechtigungen

Negativtests:
- normaler nicht-operativer Benutzer darf keine Einsatzmeldung ändern/löschen.
- Außendienst darf keine Bewohner-/ZMR-Daten als Vor-Ort-Feststellung verändern.
- Feuerwehr/Krisenstab kann keine Unterstützungsanforderung als Portal-Ticket anlegen.
- anon darf keine Zentrale-/Namenslisten-/Ereignisdaten lesen.
- Ereigniszuordnung und Ereignisstatus dürfen nur Zentrale-Manager bzw. diensthabender Zentralist verändern.
- direkte Datei-URL muss dieselben RLS-/Objektberechtigungen respektieren.

## Abnahmeszenario I – Fehlerfälle

- Karten-/VoGIS-Dienst nicht erreichbar: Einsatzbearbeitung bleibt möglich, Fehler wird sichtbar.
- Abfrage-Upload scheitert: Aufgabe bleibt offen; keine falsche „Erledigt“-Anzeige.
- Datenbankabfrage scheitert: keine erfundenen Daten; sichtbarer Ladefehler.
- zwei Zentralisten bearbeiten dieselbe Abfrage: nur eine Übernahme möglich.
- fehlendes Ergebnisdokument: „Erledigt“ bleibt möglich, wenn Ergebnis ausschließlich mündlich übermittelt wurde.

## Abnahmeszenario J – Mobile/Tablet

Prüfbreiten mindestens:
- Smartphone ca. 390 px
- Tablet Portrait ca. 768 px
- Desktop/Laptop ab 1280 px

Erwartung:
- Modal auf Smartphone als nahezu volle Höhe, kein abgeschnittener Schließen-Button.
- Status/Disposition/Ort stapeln sich sauber.
- „Unterstützung / Abfragen“ bleibt vollständig bedienbar.
- Ereignisaktionen umbrechen statt horizontal zu überlaufen.
- Mehrfacheinsatzkarten bleiben lesbar.
- Karte verursacht kein horizontales Scrolling.

## Fertig-Kriterium

Die Zentrale gilt für diesen Funktionsumfang als abgenommen, wenn alle Szenarien ohne Datenverlust, Rechteüberschreitung, parallele PAD-Dokumentation oder nicht erklärten Fehlerzustand durchlaufen.
