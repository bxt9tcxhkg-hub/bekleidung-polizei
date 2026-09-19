import { describe, it, expect } from 'vitest'
import { personenAusText } from './zmrPersonen'

// Echte Zeilenstruktur eines ZMR-Auszugs (per pdf.js mit hasEOL rekonstruiert,
// siehe extractPdfPlainText) - ZMR-Zahl, Name, Geburtsdatum, Wohnort,
// Änderungsverlauf in einer Zeile, Adresse inkl. Top-Nummer in der Zeile
// danach.
const ZMR_TEXT = [
  '000 490 409 831 Soyuçok Muhammet 20.05.1991 Dornbirn Person ändern 27.08.2018',
  'Hauptwohnsitz Negrellistraße 13a / Top 20 6890 Lustenau HWS abmelden, neuen HWS anmelden 02.12.2019',
  '000 818 130 232 Soyuçok Selim Miran 17.01.2023 Dornbirn Standarddokument anlegen 28.06.2023',
  'Hauptwohnsitz Negrellistraße 13a / Top 20 6890 Lustenau Wohnsitz anmelden 17.01.2023',
  '000 470 433 978 Soyuçok Shahira Naz 07.02.2021 Dornbirn Standarddokument anlegen 02.08.2021',
  'Hauptwohnsitz Negrellistraße 13a / Top 20 6890 Lustenau Wohnsitz anmelden 07.02.2021',
  '000 938 339 869 Soyuçok Sheela 26.01.1994 Linz Standarddokument anlegen 20.11.2019',
  'Hauptwohnsitz Negrellistraße 13a / Top 20 6890 Lustenau HWS abmelden, neuen HWS anmelden 02.12.2019',
].join('\n')

describe('personenAusText', () => {
  it('erkennt Name und Geburtsdatum aller vier Personen einer echten ZMR-Auszugsseite', () => {
    const found = personenAusText(ZMR_TEXT)
    expect(found).toHaveLength(4)
    expect(found.map(item => item.name)).toEqual(['Soyuçok Muhammet', 'Soyuçok Selim Miran', 'Soyuçok Shahira Naz', 'Soyuçok Sheela'])
    expect(found.map(item => item.geboren)).toEqual(['20.05.1991', '17.01.2023', '07.02.2021', '26.01.1994'])
  })

  it('übernimmt die Wohnungsnummer aus der Adresszeile direkt danach', () => {
    const found = personenAusText(ZMR_TEXT)
    expect(found[0].wohnung).toBe('20')
    expect(found[1].wohnung).toBe('20')
  })

  it('erkennt keine Person aus einer reinen Adresszeile ohne Geburtsdatum', () => {
    const found = personenAusText('Hauptwohnsitz Negrellistraße 13a / Top 20 6890 Lustenau')
    expect(found).toHaveLength(0)
  })

  it('fällt für einfache "Name Geburtsdatum"-Zeilen weiterhin auf die generische Erkennung zurück', () => {
    const found = personenAusText('Max Mustermann 01.01.1980')
    expect(found).toHaveLength(1)
    expect(found[0].name).toBe('Max Mustermann')
    expect(found[0].geboren).toBe('01.01.1980')
  })
})
