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

export type DienstplanKategorie = 'dienst' | 'krank' | 'urlaub' | 'sonderurlaub' | 'karenz' | 'stundenersatz' | 'sonstiges'
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

/** "VD 08-19" -> { code: "VD", vonZeit: "08:00", bisZeit: "19:00" }; ohne erkennbare Uhrzeit bleibt code der volle Text (ohne abschließenden Punkt/Komma, z. B. "ID." -> "ID"). */
export function parseDienstCode(rohtext: string): { code: string; vonZeit: string | null; bisZeit: string | null } {
  const match = rohtext.match(/(\d{1,2})(?:[:.](\d{2}))?\s*-\s*(\d{1,2})(?:[:.](\d{2}))?/)
  if (!match) return { code: rohtext.trim().replace(/[.,]$/, ''), vonZeit: null, bisZeit: null }
  const [ganz, h1, m1, h2, m2] = match
  const vonStunde = Number(h1), bisStunde = Number(h2)
  if (vonStunde > 23 || bisStunde > 23) return { code: rohtext.trim().replace(/[.,]$/, ''), vonZeit: null, bisZeit: null }
  const code = (rohtext.slice(0, match.index).trim() + ' ' + rohtext.slice((match.index ?? 0) + ganz.length).trim()).trim().replace(/[.,]$/, '')
  return { code: code || rohtext.trim().replace(/[.,]$/, ''), vonZeit: `${pad2(vonStunde)}:${pad2(Number(m1 ?? 0))}`, bisZeit: `${pad2(bisStunde)}:${pad2(Number(m2 ?? 0))}` }
}

/** "08:00" -> "08" (volle Stunde ohne Minuten), "08:15" -> "08:15" (Minuten bleiben, wenn ungleich 00). */
function formatZeitKurz(zeitRoh: string): string {
  const zeit = zeitRoh.slice(0, 5)
  return zeit.endsWith(':00') ? zeit.slice(0, 2) : zeit
}

/**
 * Kürzel + Uhrzeit für die Anzeige im Dienstplan (Planer-Grid/Druckansicht),
 * z. B. "VD 14-19" - nur wenn für diese Zeile eine Uhrzeit angegeben wurde
 * (von_zeit/bis_zeit gesetzt, z. B. bei einem Urlaubs-Halbtag oder einem
 * Zusatzdienst mit abweichender Zeit). Ohne Uhrzeit (z. B. Nachtdienst mit
 * Standardzeit) nur das Kürzel - siehe dienstZeitraumMitNachtdienstDefault
 * in lib/dienstplanAuswertung.ts für die implizite Standardzeit.
 */
export function formatDienstAnzeige(zeile: { rohtext: string; von_zeit: string | null; bis_zeit: string | null }): string {
  const { code } = parseDienstCode(zeile.rohtext)
  if (!zeile.von_zeit || !zeile.bis_zeit) return code
  return `${code} ${formatZeitKurz(zeile.von_zeit)}-${formatZeitKurz(zeile.bis_zeit)}`
}

/**
 * Kategorisiert anhand des Dienst-Kürzels (nach Abzug einer evtl. Uhrzeit,
 * siehe parseDienstCode) - Reihenfolge ist wichtig ("SoUrl" enthält nicht
 * "Urlaub", aber Prüfung schadet nicht). "U" (mit oder ohne Uhrzeit, z. B.
 * "U 08-13" für einen Urlaubs-Halbtag) zählt laut Kommandant ebenfalls als
 * Urlaub - anders als "Urlaub" ist das kein Teilstring-Treffer, sondern das
 * gesamte Kürzel muss "U" sein (sonst würden andere Kürzel mit einem "u"
 * darin fälschlich mitgezählt).
 */
export function kategorisiereRohtext(rohtext: string): DienstplanKategorie {
  const { code } = parseDienstCode(rohtext)
  const kuerzel = code.toLowerCase()
  if (kuerzel.includes('sourl')) return 'sonderurlaub'
  if (kuerzel.includes('krank')) return 'krank'
  if (kuerzel.includes('karenz')) return 'karenz'
  if (kuerzel.includes('stdersatz') || kuerzel.includes('stundenersatz')) return 'stundenersatz'
  if (kuerzel.includes('urlaub') || kuerzel === 'u') return 'urlaub'
  return 'dienst'
}

/**
 * Klartext-Bezeichnungen der Dienst-Kürzel (vom Kommandanten bestätigt).
 * Unbekannte Kürzel zeigt kuerzelKlartext() einfach als das Kürzel selbst.
 */
export const DIENST_KUERZEL_LABEL: Record<string, string> = {
  VD: 'Verkehrsdienst',
  JD: 'Journaldienst',
  ID: 'Innendienst',
  Z: 'Zentrale',
  TD: 'Tagdienst (Kanzleidienst)',
  ET: 'Einsatztraining',
  SVE: 'Schulverkehrserziehung',
  RA: 'Radar',
  BHF: 'Bahnhofsdienst',
  KFZ: 'Kraftfahrzeugdienst (Fahrzeugpflege)',
  MOT: 'Motorraddienst',
  PV: 'Personalvertretung',
  SCH: 'Schulung',
  ZIV: 'Zivilstreife',
}

/** Übersetzt ein (auch kombiniertes, z. B. "Sch/VD") Dienst-Kürzel in Klartext - unbekannte Teile bleiben als Kürzel stehen. */
export function kuerzelKlartext(code: string): string {
  return code.split('/').map(teil => DIENST_KUERZEL_LABEL[teil.trim().toUpperCase()] ?? teil.trim()).filter(Boolean).join(' / ')
}

/** Grundbesetzung laut Kommandant: jeder Tag soll je eine Person auf Zentrale, Innendienst und Journaldienst haben (siehe DienststellenKalender.tsx). */
export const GRUNDBESETZUNG_CODES = ['Z', 'ID', 'JD'] as const
export type GrundbesetzungCode = (typeof GRUNDBESETZUNG_CODES)[number]
export const GRUNDBESETZUNG_TITEL: Record<GrundbesetzungCode, string> = { Z: 'Zentrale', ID: 'Innendienst', JD: 'Journaldienst' }

/** Mindestbesetzung je Grundbesetzungs-Kürzel, gleichermaßen für Tag und Nacht (vom Kommandanten vorgegeben: 1x Zentrale, 1x Innendienst, 2x Journaldienst). */
export const MINDESTBESETZUNG: Record<GrundbesetzungCode, number> = { Z: 1, ID: 1, JD: 2 }

/** Ordnet einen (evtl. kombinierten, z. B. "Sch/VD") Dienst-Code einem Grundbesetzungs-Kürzel zu, falls einer der Teile exakt passt. */
export function grundbesetzungCode(code: string): GrundbesetzungCode | null {
  const teile = code.split('/').map(teil => teil.trim().toUpperCase())
  return GRUNDBESETZUNG_CODES.find(g => teile.includes(g)) ?? null
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

export interface DienstplanProfilOption { id: string; name: string }

function normalisiereNamen(text: string): string {
  return text.trim().toLowerCase().replace(/\s*-\s*/g, '-')
}

/**
 * Ordnet eine Dienstplan-Spalte (nur Nachname, z. B. "Schwendinger D." zur
 * Unterscheidung mehrerer Träger desselben Nachnamens) automatisch einem
 * Profil zu, wenn GENAU EIN aktives Profil passt. Profile mit `name` im
 * Format "Vorname Nachname" (siehe lib/csvUsers.ts) - endet die Spalte auf
 * einen einzelnen Buchstaben (+ optionaler Punkt), gilt er als Vornamens-
 * Initiale zur Unterscheidung. Mehrdeutige oder gar keine Treffer (z. B.
 * Kürzel wie "SchwendHP") liefern null - dann bleibt die manuelle Zuordnung
 * nötig, damit nie eine falsche Person automatisch verknüpft wird.
 */
export function automatischeSpaltenZuordnung(spaltenname: string, profile: readonly DienstplanProfilOption[]): string | null {
  const woerter = spaltenname.trim().split(/\s+/)
  let initiale: string | null = null
  let nachname = spaltenname
  if (woerter.length > 1 && /^[a-zäöüß]\.?$/i.test(woerter[woerter.length - 1])) {
    initiale = woerter[woerter.length - 1].replace('.', '').toLowerCase()
    nachname = woerter.slice(0, -1).join(' ')
  }
  const nachnameNormalisiert = normalisiereNamen(nachname)

  const treffer = profile.filter(person => {
    const teile = person.name.trim().split(/\s+/)
    const profilNachname = normalisiereNamen(teile.slice(1).join(' '))
    if (profilNachname !== nachnameNormalisiert) return false
    if (!initiale) return true
    const vorname = teile[0] ?? ''
    return vorname.toLowerCase().startsWith(initiale)
  })

  return treffer.length === 1 ? treffer[0].id : null
}

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

/**
 * Die Sollstunden des Monats stehen NICHT im Zellenraster, sondern in einer
 * frei platzierten Textbox der Vorlage ("Monat : Februar" / "Jahr 2026" /
 * "Sollstunden: 171" als drei aufeinanderfolgende Textzeilen) - siehe Analyse
 * der echten Datei (xl/drawings/drawingN.xml, <a:t>-Textläufe). Die Vorlage
 * enthält dabei oft mehrere solcher Blöcke (alte, stehengelassene Monate als
 * Kopiervorlage plus der tatsächlich aktuelle) - bei mehreren Treffern für
 * denselben Monat zählt der zuletzt im Dokument stehende (siehe
 * sollstundenFuerMonat), das war in der Praxis immer der echte.
 */
const MONATSNAMEN = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']

function monatsnameZuNummer(name: string): number | null {
  const normalisiert = name.trim().toLowerCase() === 'jänner' ? 'januar' : name.trim().toLowerCase()
  const index = MONATSNAMEN.indexOf(normalisiert)
  return index === -1 ? null : index + 1
}

export interface SollstundenEintrag { monat: string; sollstunden: number }

/** Extrahiert alle "Monat : X" / "Jahr Y" / "Sollstunden: Z"-Dreiergruppen aus den <a:t>-Textläufen einer Drawing-XML-Datei (in Dokumentreihenfolge). */
export function extrahiereSollstundenEintraege(drawingXml: string): SollstundenEintrag[] {
  const texte = Array.from(drawingXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map(m => m[1])
  const ergebnisse: SollstundenEintrag[] = []
  for (let i = 0; i < texte.length; i++) {
    const monatMatch = texte[i].match(/^\s*Monat\s*:\s*(\S+)\s*$/i)
    if (!monatMatch) continue
    const monatNr = monatsnameZuNummer(monatMatch[1])
    if (!monatNr) continue
    const jahrMatch = texte[i + 1]?.match(/^\s*Jahr\s*(\d{4})\s*$/i)
    if (!jahrMatch) continue
    const sollMatch = texte[i + 2]?.match(/Sollstunden\s*:\s*(\d+)/i)
    if (!sollMatch) continue
    ergebnisse.push({ monat: `${jahrMatch[1]}-${String(monatNr).padStart(2, '0')}`, sollstunden: Number(sollMatch[1]) })
  }
  return ergebnisse
}

/** Sollstunden für einen bestimmten Monat (YYYY-MM) aus mehreren extrahierten Einträgen - bei Dubletten zählt der zuletzt gefundene (siehe extrahiereSollstundenEintraege). */
export function sollstundenFuerMonat(eintraege: readonly SollstundenEintrag[], monat: string): number | null {
  const treffer = eintraege.filter(eintrag => eintrag.monat === monat)
  return treffer.length ? treffer[treffer.length - 1].sollstunden : null
}
