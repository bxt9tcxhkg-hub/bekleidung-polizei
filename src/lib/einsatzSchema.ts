export const EREIGNISSTUFEN = ['klein', 'mittel', 'gross', 'katastrophe'] as const
export type Ereignisstufe = (typeof EREIGNISSTUFEN)[number]

export const STUFE_META: Record<Ereignisstufe, { label: string; color: string; bg: string; hint: string; dienstbetrieb: string; wann: string }> = {
  klein: {
    label: 'Kleinereignis',
    color: '#166534',
    bg: '#dcfce7',
    hint: 'Brand PKW, Wasser im Keller, Rettungseinsatz, üblicher Polizeieinsatz',
    dienstbetrieb: 'Normaler Dienstbetrieb',
    wann: 'Tagesgeschäft im normalen Dienstbetrieb.',
  },
  mittel: {
    label: 'Mittelereignis',
    color: '#854d0e',
    bg: '#fef08a',
    hint: 'Zum Beispiel Brand eines Einfamilienhauses mit Obdachlosigkeit oder Rutschung mit betroffenem Gebäude',
    dienstbetrieb: 'Informationskette per Telefon',
    wann: 'Gewisse Betroffenheit in der Bevölkerung. Die vorgesehene Informationskette wird relevant.',
  },
  gross: {
    label: 'Großereignis',
    color: '#9a3412',
    bg: '#fdba74',
    hint: 'Viele Schadstellen oder ein gravierendes Ereignis, zum Beispiel Hochwasser oder Großbrand',
    dienstbetrieb: 'Koordinierung kann notwendig werden',
    wann: 'Große Betroffenheit in der Bevölkerung. Koordinations- und Führungsentscheidungen können erforderlich werden.',
  },
  katastrophe: {
    label: 'Katastrophe',
    color: '#991b1b',
    bg: '#fecaca',
    hint: 'Mit örtlichen Einsatzmitteln nicht bewältigbar; überörtliche Zusammenarbeit notwendig',
    dienstbetrieb: 'Überörtliche Zusammenarbeit notwendig',
    wann: 'Außerordentlich große Betroffenheit. Die Lage kann mit örtlichen Einsatzmitteln nicht abgearbeitet werden.',
  },
}

// Zwei getrennte Ketten statt einer für alle Stufen (Stand: Alarmierungs-
// und Meldeschema Stadt Dornbirn, Amt der Stadt Dornbirn, Abt. Feuerwehr und
// Katastrophenschutz, April 2025, V1.5) - Mittelereignis braucht keine
// Öffentlichkeitsarbeit, Großereignis/Katastrophe schon.
export const TELEFONKETTE_MITTEL = [
  'Bürgermeisterin',
  'Notfallkoordinator',
  'Stadtamtsdirektor',
  'Leitung Gruppe 2',
  'Kdo Stadtpolizei',
]
export const TELEFONKETTE_GROSS = [
  'Bürgermeisterin',
  'Notfallkoordinator',
  'Stadtamtsdirektor',
  'Leitung Gruppe 2',
  'Öffentlichkeitsarbeit',
  'Kdo Stadtpolizei',
]

export function telefonketteFuer(stufe: Ereignisstufe): string[] {
  if (stufe === 'mittel') return TELEFONKETTE_MITTEL
  if (stufe === 'gross' || stufe === 'katastrophe') return TELEFONKETTE_GROSS
  return []
}

// Digitale Abbildung der offiziellen "Checkliste Notfall/Katastrophe" (Erst-
// meldung, Stand 2018 V1) und "Checkliste Notunterkunft" (Stand Jänner 2019
// V1.1), Amt der Stadt Dornbirn. punkt_key ist stabil (Primärschlüssel-
// Bestandteil in einsatz_checklist_punkte) - beim Umformulieren eines Textes
// bitte den key NICHT ändern, sonst geht der Bearbeitungsstand bestehender
// Einsätze für diesen Punkt verloren.
export interface ChecklistPunktDef { key: string; text: string }

export const ERSTMELDUNG_CHECKLISTE: ChecklistPunktDef[] = [
  { key: 'meldungszettel', text: 'Meldungszettel ausfüllen (Was, wo, wann, warum, wie viele Menschen betroffen, was ist betroffen)' },
  { key: 'oeffentliche_sicherheit', text: 'Beeinträchtigt das Ereignis die öffentliche Sicherheit?' },
  { key: 'meldung_katschutz', text: 'Meldung an Katastrophenschutz' },
  { key: 'meldung_bgm', text: 'Meldung an BGM (VBGM), nach Anweisung' },
  { key: 'meldung_sad', text: 'Meldung an Stadtamtsdirektor, nach Anweisung' },
  { key: 'meldung_recht', text: 'Meldung an Rechtsabteilung, nach Anweisung' },
  { key: 'meldung_oeffentlichkeitsarbeit', text: 'Meldung an Öffentlichkeitsarbeit, nach Anweisung' },
  { key: 'anweisungen_abwarten', text: 'Anweisungen abwarten (Sofortmaßnahmen, Ort der Einsatzleitung, Einberufung Einsatzleitung)' },
  { key: 'personen_verstaendigen', text: 'Notwendige Personen verständigen (kleine Stadteinsatzleitung/Stadteinsatzleitung), nach Anweisung' },
  { key: 'in_lage_einfuehren', text: 'Personen der Stadteinsatzleitung in Lage einführen, nach Anweisung' },
  { key: 'erkundung', text: 'Erkundung anweisen (mit Einsatzleitung, KatSchutz) und Lageinformation an Stadteinsatzleitung weitergeben, nach Anweisung' },
  { key: 'sofortmassnahmen', text: 'Sofortmaßnahmen setzen, nach Anweisung' },
  { key: 'fuehrung_uebernommen', text: 'Lage und Führung wird durch Stadteinsatzleitung übernommen' },
  { key: 'verbindungsoffizier', text: 'Verbindungsoffizier in Stadteinsatzleitung entsenden' },
  { key: 'meldungszettel_uebergeben', text: 'Meldungszettel an Stadteinsatzleitung übergeben' },
]

export const NOTUNTERKUNFT_CHECKLISTE: ChecklistPunktDef[] = [
  { key: 'sammelstelle', text: 'Sammelstelle einrichten vor Ort (Einsatzleiter, KatSchutz, RK)' },
  { key: 'pls_besprechung', text: 'PLS durch RK, kurze Besprechung vor Ort Polizei/FW/RK zur Koordinierung Sammelraum' },
  { key: 'alarmgruppe_info', text: 'Alarmgruppe Dornbirn / Stadteinsatzleitung informieren (WhatsApp und Telefon, Bgm!)' },
  { key: 'betroffenheit_klaeren', text: 'Betroffenheit klären: Anzahl Personen, ab wann Unterkunft benötigt, voraussichtliche Dauer' },
  { key: 'meldeverzeichnis', text: 'Abfrage Meldeverzeichnis durch Stadtpolizei: Anzahl, Namen Bewohner (ZMR-Auszug → Namensliste übernehmen)' },
  { key: 'stadteinsatzleitung_noetig', text: 'Abklärung ob Stadteinsatzleitung benötigt wird (KatSchutz)' },
  { key: 'transport_sammelraum', text: 'Transport zum Sammelraum (Feuerwehr, RK, KatSchutz)' },
  { key: 'namensliste_erfassen', text: 'Erfassung Personen mittels Namensliste (und RK PLS), (KatSchutz)' },
  { key: 'betreuung_rk', text: 'Betreuung Personen durch RK' },
  { key: 'akutbetreuung', text: 'Weitere Akutbetreuung: KIT, Familienkrisendienst, CARITAS, IFS, RK? (KatSchutz, RK)' },
  { key: 'alarmierung_personal', text: 'Alarmierung notwendiges Personal als Unterstützung KatSchutz' },
  { key: 'kuechenmannschaft', text: 'Benachrichtigung Küchenmannschaft Feuerwehr: Versorgung sicherstellen (mit RK)' },
  { key: 'kurzfristige_quartiere', text: 'Abklärung kurzfristig möglicher Quartiere mit Betroffenen? Nachbarn, Verwandte? (KatSchutz)' },
  { key: 'folder_brand', text: 'Übergabe Folder „Was tun nach einem Brand" bei Brandereignis' },
  { key: 'besprechung_vorgehen', text: 'Einberufung Besprechung weitere Vorgehensweise mit allen notwendigen Personen (FW, RK, Polizei, Vertreter Stadt Dornbirn, Vermieter etc.) (KatSchutz)' },
  { key: 'information_stellen', text: 'Information an Bgm., SAD, Abt. Recht, Abt. Soziales, Wohnungsamt, Stadtpolizei, Abt. Vermögen' },
  { key: 'mittelfristige_unterbringung', text: 'Abklärung mittelfristige Unterbringung (Vertreter Stadt Dornbirn, Vermieter)' },
  { key: 'medienmitteilung', text: 'Anschließend Medienmitteilung (S5)' },
  { key: 'ueberfuehrung_notquartier', text: 'Überführung der Personen in kurzfristige Notquartiere / Beherbergungsbetriebe (FW, RK, Polizei)' },
  { key: 'uebergabe_soziales', text: 'Am nächsten Werktag / nach Akutphase: Organisation der sozialen Betreuung und Übergabe der Koordinierung an Abt. Soziales (Übergabe durch KatSchutz)' },
]

export const ENTSCHEIDUNGSPUNKTE = [
  'Sofortmaßnahmen festlegen',
  'Ort der Einsatzleitung',
  'Einberufung Stadteinsatzleitung',
  'Zivilschutzalarm',
]

export function formatStamp(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
