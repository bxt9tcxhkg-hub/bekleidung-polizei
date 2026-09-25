/**
 * Parser für die monatliche Dienstplan-Excel-Vorlage (.xlsm/.xlsx) der
 * Dienststelle - reine Funktionen auf einem bereits eingelesenen Zellenraster
 * (Array of Arrays), damit sie ohne echte Excel-Datei testbar sind. Der
 * eigentliche Datei-Import (XLSX.read) passiert in der Import-Seite.
 *
 * Format der Vorlage (siehe Analyse der Dateien Oktober 2026/Februar 2026):
 * - eine Spalte "Datum" mit echten Datumswerten, davor Wochentags-Spalte(n)
 * - eine Kopfzeile mit dem Nachnamen je Bediensteten-Spalte, einige Zeilen
 *   oberhalb der ersten Datumszeile (dazwischen liegen Monatssummen-Zeilen -
 *   siehe findeKopfzeile); Hilfsspalten wie "Frei" oder Zähler-Spalten haben
 *   dort keinen Namen und werden übersprungen
 * - pro Kalendertag zwei aufeinanderfolgende Zeilen mit demselben Datum
 *   (Bedeutung des Zusammenspiels beider Zeilen ist fachlich noch nicht
 *   abschließend geklärt - deshalb werden beide unverändert als eigene
 *   Einträge mit zeile 1/2 gespeichert statt sie zu verschmelzen)
 */

export type DienstplanKategorie = 'dienst' | 'krank' | 'urlaub' | 'sonderurlaub' | 'karenz' | 'sonstiges'
export type DienstplanZelle = string | number | Date | null | undefined

export interface DienstplanSpalte {
  index: number
  name: string
  hatEintraege: boolean
}

export interface DienstplanRohEintrag {
  spaltenIndex: number
  spaltenname: string
  datum: string
  zeile: 1 | 2
  rohtext: string
  vonZeit: string | null
  bisZeit: string | null
  kategorie: DienstplanKategorie
}

export interface DienstplanParseErgebnis {
  monat: string
  spalten: DienstplanSpalte[]
  eintraege: DienstplanRohEintrag[]
}

const NICHT_PERSON_SPALTEN = new Set(['<', 'frei'])

function pad2(n: number): string { return String(n).padStart(2, '0') }

/** "VD 08-19" -> { code: "VD", vonZeit: "08:00", bisZeit: "19:00" }; ohne erkennbare Uhrzeit bleibt code der volle Text. */
export function parseDienstCode(rohtext: string): { code: string; vonZeit: string | null; bisZeit: string | null } {
  const match = rohtext.match(/(\d{1,2})(?:[:.](\d{2}))?\s*-\s*(\d{1,2})(?:[:.](\d{2}))?/)
  if (!match) return { code: rohtext.trim(), vonZeit: null, bisZeit: null }
  const [ganz, h1, m1, h2, m2] = match
  const vonStunde = Number(h1), bisStunde = Number(h2)
  if (vonStunde > 23 || bisStunde > 23) return { code: rohtext.trim(), vonZeit: null, bisZeit: null }
  const code = (rohtext.slice(0, match.index).trim() + ' ' + rohtext.slice((match.index ?? 0) + ganz.length).trim()).trim().replace(/[.,]$/, '')
  return { code: code || rohtext.trim(), vonZeit: `${pad2(vonStunde)}:${pad2(Number(m1 ?? 0))}`, bisZeit: `${pad2(bisStunde)}:${pad2(Number(m2 ?? 0))}` }
}

/** Kategorisiert anhand des Rohtexts - Reihenfolge ist wichtig ("SoUrl" enthält nicht "Urlaub", aber Prüfung schadet nicht). */
export function kategorisiereRohtext(rohtext: string): DienstplanKategorie {
  const text = rohtext.toLowerCase()
  if (text.includes('sourl')) return 'sonderurlaub'
  if (text.includes('krank')) return 'krank'
  if (text.includes('karenz')) return 'karenz'
  if (text.includes('urlaub')) return 'urlaub'
  return 'dienst'
}

function zuDatumString(wert: DienstplanZelle): string | null {
  if (!(wert instanceof Date) || Number.isNaN(wert.getTime())) return null
  return `${wert.getFullYear()}-${pad2(wert.getMonth() + 1)}-${pad2(wert.getDate())}`
}

function zellText(wert: DienstplanZelle): string {
  if (wert === null || wert === undefined) return ''
  return String(wert).trim()
}

/**
 * Findet die Datums-Spalte (die mit den meisten echten Datumswerten) - robuster
 * als eine feste Spaltennummer, falls sich der Aufbau zwischen Monaten leicht
 * verschiebt (z. B. unterschiedlich viele Bediensteten-Spalten).
 */
function findeDatumsSpalte(grid: readonly DienstplanZelle[][]): number | null {
  const zaehler = new Map<number, number>()
  for (const row of grid) {
    row.forEach((wert, spalte) => { if (wert instanceof Date && !Number.isNaN(wert.getTime())) zaehler.set(spalte, (zaehler.get(spalte) ?? 0) + 1) })
  }
  let beste: number | null = null, bestesAnzahl = 0
  for (const [spalte, anzahl] of zaehler) if (anzahl > bestesAnzahl) { beste = spalte; bestesAnzahl = anzahl }
  return bestesAnzahl >= 5 ? beste : null
}

/**
 * Die Namens-Kopfzeile liegt NICHT direkt über der ersten Datumszeile (dazwischen
 * liegen rund 20 Zeilen mit Monatssummen je Spalte, z. B. "Anzahl Zusatzdienste").
 * Erkennungsmerkmal: die Namenszeile hat in den Personen-Spalten überwiegend
 * echten Text (Nachnamen), die Summenzeilen dort überwiegend Zahlen - die Zeile
 * mit den meisten nicht-numerischen Textzellen in diesem Spaltenbereich gewinnt.
 */
function findeKopfzeile(grid: readonly DienstplanZelle[][], datumsSpalte: number, ersteDatumsZeile: number): number {
  let beste = -1, besteAnzahl = 0
  for (let zeile = 0; zeile < ersteDatumsZeile; zeile++) {
    let anzahl = 0
    for (let spalte = datumsSpalte + 1; spalte < grid[zeile].length; spalte++) {
      const wert = grid[zeile][spalte]
      if (typeof wert === 'string' && wert.trim() && Number.isNaN(Number(wert.trim()))) anzahl++
    }
    if (anzahl > besteAnzahl) { besteAnzahl = anzahl; beste = zeile }
  }
  return besteAnzahl >= 5 ? beste : -1
}

export function parseDienstplanGrid(grid: readonly DienstplanZelle[][]): DienstplanParseErgebnis | { error: string } {
  const datumsSpalte = findeDatumsSpalte(grid)
  if (datumsSpalte === null) return { error: 'Keine Datumsspalte gefunden - ist das die richtige Dienstplan-Vorlage?' }

  const ersteDatumsZeile = grid.findIndex(row => row[datumsSpalte] instanceof Date)
  if (ersteDatumsZeile <= 0) return { error: 'Keine Datumszeile gefunden.' }
  const kopfzeileIndex = findeKopfzeile(grid, datumsSpalte, ersteDatumsZeile)
  if (kopfzeileIndex === -1) return { error: 'Keine Kopfzeile mit Namen oberhalb der ersten Datumszeile gefunden.' }
  const kopfzeile = grid[kopfzeileIndex]

  const letzteSpalte = kopfzeile.length

  const spaltenListe: { index: number; name: string }[] = []
  for (let spalte = datumsSpalte + 1; spalte < letzteSpalte; spalte++) {
    const name = zellText(kopfzeile[spalte])
    if (!name || NICHT_PERSON_SPALTEN.has(name.toLowerCase())) continue
    spaltenListe.push({ index: spalte, name })
  }
  if (spaltenListe.length === 0) return { error: 'Keine Personen-Spalten in der Kopfzeile gefunden.' }

  // Monat = häufigster Monat/Jahr unter allen Datumswerten dieser Spalte -
  // filtert damit automatisch "überlaufende" Zeilen ins Folgemonat heraus
  // (die Vorlage hat eine feste Zeilenzahl für 31 Tage, kürzere Monate lassen
  // die letzten Zeilen mit Datum des Folgemonats stehen).
  const monatsZaehler = new Map<string, number>()
  for (let zeile = ersteDatumsZeile; zeile < grid.length; zeile++) {
    const wert = grid[zeile][datumsSpalte]
    if (wert instanceof Date && !Number.isNaN(wert.getTime())) {
      const schluessel = `${wert.getFullYear()}-${pad2(wert.getMonth() + 1)}`
      monatsZaehler.set(schluessel, (monatsZaehler.get(schluessel) ?? 0) + 1)
    }
  }
  let zielMonat: string | null = null, zielMonatAnzahl = 0
  for (const [schluessel, anzahl] of monatsZaehler) if (anzahl > zielMonatAnzahl) { zielMonat = schluessel; zielMonatAnzahl = anzahl }
  if (!zielMonat) return { error: 'Kein gültiger Monat in der Datumsspalte gefunden.' }
  const monat = `${zielMonat}-01`

  // Aufeinanderfolgende Zeilen mit demselben Datum zu einer Tages-Gruppe
  // zusammenfassen (üblicherweise genau zwei Zeilen je Tag).
  const tagesGruppen: { datum: string; zeilen: number[] }[] = []
  for (let zeile = ersteDatumsZeile; zeile < grid.length; zeile++) {
    const datum = zuDatumString(grid[zeile][datumsSpalte])
    if (!datum || !datum.startsWith(zielMonat)) continue
    const letzte = tagesGruppen[tagesGruppen.length - 1]
    if (letzte && letzte.datum === datum && letzte.zeilen.length < 2) letzte.zeilen.push(zeile)
    else tagesGruppen.push({ datum, zeilen: [zeile] })
  }

  const eintraege: DienstplanRohEintrag[] = []
  const hatEintraege = new Map<number, boolean>()
  for (const spalte of spaltenListe) {
    for (const gruppe of tagesGruppen) {
      gruppe.zeilen.forEach((zeilenIndex, position) => {
        const rohtext = zellText(grid[zeilenIndex][spalte.index])
        if (!rohtext) return
        hatEintraege.set(spalte.index, true)
        const { vonZeit, bisZeit } = parseDienstCode(rohtext)
        eintraege.push({
          spaltenIndex: spalte.index, spaltenname: spalte.name, datum: gruppe.datum,
          zeile: (position + 1) as 1 | 2, rohtext, vonZeit, bisZeit,
          kategorie: kategorisiereRohtext(rohtext),
        })
      })
    }
  }

  const spalten: DienstplanSpalte[] = spaltenListe.map(spalte => ({ index: spalte.index, name: spalte.name, hatEintraege: hatEintraege.get(spalte.index) ?? false }))
  return { monat, spalten, eintraege }
}

export interface DienstplanSpaltenZuordnung { beamterId: string | null; immerAktiv: boolean }

/** Aktive Spalten = solche mit mindestens einem Diensteintrag ODER explizit als "immer aktiv" gepflegt (z. B. Kommandant/Stellvertreter, die auch ganz ohne Eintrag in der Zuordnung bleiben sollen). */
export function istSpalteAktiv(spalte: DienstplanSpalte, zuordnung: DienstplanSpaltenZuordnung | undefined): boolean {
  return spalte.hatEintraege || (zuordnung?.immerAktiv ?? false)
}

export interface DienstplanDienstPayload {
  beamter_id: string
  datum: string
  zeile: 1 | 2
  rohtext: string
  von_zeit: string
  bis_zeit: string
  kategorie: DienstplanKategorie
}

/**
 * Baut aus dem Parse-Ergebnis und den (vom Admin bestätigten) Spaltenzuordnungen
 * die Nutzlast für die RPC dienstplan_monat_ersetzen - nur aktive, zugeordnete
 * Spalten fließen ein; ignorierte oder noch unzugeordnete Spalten werden
 * stillschweigend übersprungen (die Aufrufstelle muss vorher sicherstellen,
 * dass jede aktive Spalte entweder zugeordnet oder bewusst ignoriert wurde).
 */
export function baueDienstePayload(ergebnis: DienstplanParseErgebnis, zuordnungenNachSpaltenname: ReadonlyMap<string, DienstplanSpaltenZuordnung>): DienstplanDienstPayload[] {
  const beamterNachSpalte = new Map<number, string>()
  for (const spalte of ergebnis.spalten) {
    const zuordnung = zuordnungenNachSpaltenname.get(spalte.name)
    if (zuordnung?.beamterId) beamterNachSpalte.set(spalte.index, zuordnung.beamterId)
  }
  return ergebnis.eintraege
    .filter(eintrag => beamterNachSpalte.has(eintrag.spaltenIndex))
    .map(eintrag => ({
      beamter_id: beamterNachSpalte.get(eintrag.spaltenIndex) as string, datum: eintrag.datum, zeile: eintrag.zeile,
      rohtext: eintrag.rohtext, von_zeit: eintrag.vonZeit ?? '', bis_zeit: eintrag.bisZeit ?? '', kategorie: eintrag.kategorie,
    }))
}
