import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { dienstplanSupabase, type DienstplanMarkierungRow, type DienstplanPersonEinstellungenRow, type DienstplanRegelRow } from '../lib/dienstplanSupabase'
import { ErrorMessage, inputClass } from '../components/ZentraleEntryEditor'
import { thisMonthLocal } from '../lib/ueberstunden'
import { berechneSollstunden, naechsterPlanbarerMonat, VOLLZEIT_BESCHAEFTIGUNGSGRAD } from '../lib/dienstplanSollstunden'
import { monatsKontingent } from '../lib/dienstplanWunsch'
import { DIENSTPLAN_GRUPPE_LABEL, dienstplanGruppe, istAdminProfil, sortiereNachDienstplanGruppe } from '../lib/dienstplanRoster'
import { markierungFarbKlassen, MARKIERUNG_FARBEN, MARKIERUNG_FARBE_LABEL, type DienstplanMarkierungFarbe } from '../lib/dienstplanMarkierungen'
import { ET_ROSTER_ORGANISATION } from '../lib/usersSeed'

// Planungsregeln für die Dienstplan-Planung im Portal (siehe
// /root/.claude/plans/glowing-imagining-badger.md, Phase 1): Sollstunden-
// Formel-Parameter, Mindestruhezeit und Wunschfrist als Singleton-Zeile in
// dienstplan_regeln, sowie der Beschäftigungsgrad je Beamten in
// dienstplan_person_einstellungen (dort auch ein "zusatz"-jsonb-Feld für
// künftige, hier noch nicht bekannte Personal-Einstellungen). Die
// Sollstunden selbst werden NICHT pro Monat gespeichert (siehe
// lib/dienstplanSollstunden.ts) - unterschiedlicher Beschäftigungsgrad
// ergibt einen anderen Wert je Person, ein einzelner Monatswert könnte das
// nicht abbilden. Nur Admin/Genehmiger (siehe ProtectedRoute genehmigerOnly
// in App.tsx) erreichen diese Seite.

interface MitarbeiterOption { id: string; name: string; dienstnummer: string | null }
type PersonEinstellungRow = Pick<DienstplanPersonEinstellungenRow, 'beamter_id' | 'beschaeftigungsgrad'>

export default function DienstplanEinstellungen() {
  const { profile } = useAuth()
  const [regeln, setRegeln] = useState<DienstplanRegelRow | null>(null)
  const [mitarbeiter, setMitarbeiter] = useState<MitarbeiterOption[]>([])
  const [einstellungen, setEinstellungen] = useState<Map<string, number>>(new Map())
  const [vorhandeneMonate, setVorhandeneMonate] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [regelForm, setRegelForm] = useState({ stundenProWerktag: '', mindestruhezeitStunden: '', wunschfristTage: '', offenerWunschMonat: '', aktuellerPlanungsmonat: '' })
  const [regelnSpeichern, setRegelnSpeichern] = useState(false)

  const [editId, setEditId] = useState<string | null>(null)
  const [editGrad, setEditGrad] = useState('')
  const [personSpeichern, setPersonSpeichern] = useState(false)

  // Freie, vom Planer selbst definierbare Farbmarkierungen für einzelne
  // Diensteinträge (z. B. "Überstunden" blau) - werden im Planer-Grid
  // (Dienstplan-Planung) je Zeile ausgewählt und färben die Zelle
  // durchgehend über Tag/Nacht ein (siehe lib/dienstplanMarkierungen.ts).
  const [markierungen, setMarkierungen] = useState<DienstplanMarkierungRow[]>([])
  const [neueMarkierungName, setNeueMarkierungName] = useState('')
  const [neueMarkierungFarbe, setNeueMarkierungFarbe] = useState<DienstplanMarkierungFarbe>('blau')
  const [editMarkierungId, setEditMarkierungId] = useState<string | null>(null)
  const [editMarkierungName, setEditMarkierungName] = useState('')
  const [editMarkierungFarbe, setEditMarkierungFarbe] = useState<DienstplanMarkierungFarbe>('blau')
  const [markierungSpeichern, setMarkierungSpeichern] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [regelnResult, mitarbeiterResult, einstellungenResult, monateResult, markierungenResult] = await Promise.all([
      dienstplanSupabase.from('dienstplan_regeln').select('id,stunden_pro_werktag,mindestruhezeit_stunden,wunschfrist_tage,offener_wunsch_monat,aktueller_planungsmonat,updated_by,updated_at').eq('id', 1).maybeSingle(),
      supabase.from('profiles').select('id,name,dienstnummer,roles').eq('active', true).eq('organisation', ET_ROSTER_ORGANISATION).order('name'),
      dienstplanSupabase.from('dienstplan_person_einstellungen').select('beamter_id,beschaeftigungsgrad'),
      dienstplanSupabase.from('dienstplan_monate').select('monat'),
      dienstplanSupabase.from('dienstplan_markierungen').select('id,name,farbe,kategorie,reihenfolge,updated_by,updated_at').order('kategorie', { ascending: true, nullsFirst: false }).order('reihenfolge').order('name'),
    ])
    if (regelnResult.error || mitarbeiterResult.error || einstellungenResult.error || monateResult.error || markierungenResult.error) { setError('Grunddaten konnten nicht geladen werden.'); setLoading(false); return }
    if (regelnResult.data) {
      setRegeln(regelnResult.data)
      setRegelForm({
        stundenProWerktag: String(regelnResult.data.stunden_pro_werktag),
        mindestruhezeitStunden: String(regelnResult.data.mindestruhezeit_stunden),
        wunschfristTage: String(regelnResult.data.wunschfrist_tage),
        offenerWunschMonat: regelnResult.data.offener_wunsch_monat?.slice(0, 7) ?? '',
        aktuellerPlanungsmonat: regelnResult.data.aktueller_planungsmonat?.slice(0, 7) ?? '',
      })
    }
    const einteilbar = (mitarbeiterResult.data ?? []).filter(person => !istAdminProfil(person.roles))
    setMitarbeiter(sortiereNachDienstplanGruppe(einteilbar))
    setEinstellungen(new Map((einstellungenResult.data as PersonEinstellungRow[] ?? []).map(row => [row.beamter_id, row.beschaeftigungsgrad])))
    setVorhandeneMonate((monateResult.data ?? []).map(row => row.monat))
    setMarkierungen(markierungenResult.data ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  async function markierungAnlegen() {
    const name = neueMarkierungName.trim()
    if (!name) { setError('Bitte einen Namen für die Markierung eingeben.'); return }
    setMarkierungSpeichern(true); setError('')
    const result = await dienstplanSupabase.from('dienstplan_markierungen').insert({ name, farbe: neueMarkierungFarbe, updated_by: profile?.id ?? null })
    setMarkierungSpeichern(false)
    if (result.error) { setError('Die Markierung konnte nicht angelegt werden (Name eventuell schon vergeben).'); return }
    setNeueMarkierungName(''); setNeueMarkierungFarbe('blau')
    await load()
  }

  function beginneMarkierungBearbeitung(markierung: DienstplanMarkierungRow) {
    setEditMarkierungId(markierung.id); setEditMarkierungName(markierung.name); setEditMarkierungFarbe(markierung.farbe as DienstplanMarkierungFarbe); setError('')
  }

  async function markierungSpeichernAendern(id: string) {
    const name = editMarkierungName.trim()
    if (!name) { setError('Bitte einen Namen für die Markierung eingeben.'); return }
    setMarkierungSpeichern(true); setError('')
    const result = await dienstplanSupabase.from('dienstplan_markierungen').update({ name, farbe: editMarkierungFarbe, updated_by: profile?.id ?? null }).eq('id', id)
    setMarkierungSpeichern(false)
    if (result.error) { setError('Die Markierung konnte nicht gespeichert werden (Name eventuell schon vergeben).'); return }
    setEditMarkierungId(null)
    await load()
  }

  async function markierungLoeschen(id: string) {
    setMarkierungSpeichern(true); setError('')
    const result = await dienstplanSupabase.from('dienstplan_markierungen').delete().eq('id', id)
    setMarkierungSpeichern(false)
    if (result.error) { setError('Die Markierung konnte nicht gelöscht werden.'); return }
    await load()
  }

  /** Für die fünf System-Markierungen (Urlaub/Krank/Sonderurlaub/Karenz/Stundenersatz, kategorie gesetzt): Name/Bedeutung bleiben fix, nur die Farbe lässt sich direkt ändern - kein separater Bearbeiten-Modus nötig. */
  async function systemFarbeAendern(id: string, farbe: DienstplanMarkierungFarbe) {
    setMarkierungSpeichern(true); setError('')
    const result = await dienstplanSupabase.from('dienstplan_markierungen').update({ farbe, updated_by: profile?.id ?? null }).eq('id', id)
    setMarkierungSpeichern(false)
    if (result.error) { setError('Die Farbe konnte nicht gespeichert werden.'); return }
    await load()
  }

  async function speichereRegeln() {
    const stundenProWerktag = Number(regelForm.stundenProWerktag.replace(',', '.'))
    const mindestruhezeitStunden = Number(regelForm.mindestruhezeitStunden.replace(',', '.'))
    const wunschfristTage = Number(regelForm.wunschfristTage)
    if (!Number.isFinite(stundenProWerktag) || stundenProWerktag <= 0 || !Number.isFinite(mindestruhezeitStunden) || mindestruhezeitStunden < 0 || !Number.isInteger(wunschfristTage) || wunschfristTage < 0) {
      setError('Bitte gültige Werte eingeben.'); return
    }
    setRegelnSpeichern(true); setError(''); setNotice('')
    const result = await dienstplanSupabase.from('dienstplan_regeln').update({
      stunden_pro_werktag: stundenProWerktag,
      mindestruhezeit_stunden: mindestruhezeitStunden,
      wunschfrist_tage: wunschfristTage,
      offener_wunsch_monat: regelForm.offenerWunschMonat ? `${regelForm.offenerWunschMonat}-01` : null,
      aktueller_planungsmonat: regelForm.aktuellerPlanungsmonat ? `${regelForm.aktuellerPlanungsmonat}-01` : null,
      updated_by: profile?.id ?? null,
    }).eq('id', 1)
    setRegelnSpeichern(false)
    if (result.error) { setError('Die Regeln konnten nicht gespeichert werden.'); return }
    setNotice('Regeln gespeichert.')
    await load()
  }

  function beginneBearbeitung(beamterId: string, aktuellerGrad: number) {
    setEditId(beamterId); setEditGrad(String(aktuellerGrad)); setError('')
  }

  async function speicherePerson(beamterId: string) {
    const grad = Number(editGrad.replace(',', '.'))
    if (!Number.isFinite(grad) || grad <= 0 || grad > VOLLZEIT_BESCHAEFTIGUNGSGRAD) { setError(`Beschäftigungsgrad muss zwischen 1 und ${VOLLZEIT_BESCHAEFTIGUNGSGRAD} (Vollzeit) liegen.`); return }
    setPersonSpeichern(true); setError('')
    const result = await dienstplanSupabase.from('dienstplan_person_einstellungen').upsert({ beamter_id: beamterId, beschaeftigungsgrad: grad, updated_by: profile?.id ?? null }, { onConflict: 'beamter_id' })
    setPersonSpeichern(false)
    if (result.error) { setError('Der Beschäftigungsgrad konnte nicht gespeichert werden.'); return }
    setEditId(null)
    await load()
  }

  const aktuellerMonat = useMemo(() => naechsterPlanbarerMonat(vorhandeneMonate, thisMonthLocal()), [vorhandeneMonate])
  const stundenProWerktagVorschau = useMemo(() => Number(regelForm.stundenProWerktag.replace(',', '.')) || regeln?.stunden_pro_werktag || 0, [regelForm.stundenProWerktag, regeln])

  return <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
    <h1 className="text-2xl font-bold text-gray-900">Dienstplan-Einstellungen</h1>
    <p className="mt-2 max-w-2xl text-sm text-gray-600">Regeln für die Dienstplan-Planung im Portal: Sollstunden-Formel, Mindestruhezeit zwischen zwei Diensten, Frist für das Einreichen von Dienstwünschen sowie der Beschäftigungsgrad je Person.</p>

    {error ? <div className="mt-4"><ErrorMessage text={error} /></div> : null}
    {notice ? <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p> : null}

    {loading ? <div className="mt-8 flex justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-800" /></div> : <>
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="font-semibold text-gray-900">Planungsregeln</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Stunden pro Werktag (Sollstunden-Formel)</span>
            <input type="text" inputMode="decimal" className={inputClass} value={regelForm.stundenProWerktag} onChange={event => setRegelForm(form => ({ ...form, stundenProWerktag: event.target.value }))} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Mindestruhezeit zwischen Diensten (Stunden)</span>
            <input type="text" inputMode="decimal" className={inputClass} value={regelForm.mindestruhezeitStunden} onChange={event => setRegelForm(form => ({ ...form, mindestruhezeitStunden: event.target.value }))} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Wunschfrist (Tage vor Monatsbeginn)</span>
            <input type="text" inputMode="numeric" className={inputClass} value={regelForm.wunschfristTage} onChange={event => setRegelForm(form => ({ ...form, wunschfristTage: event.target.value }))} />
          </label>
        </div>
        <p className="mt-3 text-xs text-gray-500">Sollstunden = Werktage im Monat (Montag-Freitag, ohne gesetzliche Feiertage) × Stunden pro Werktag × Beschäftigungsgrad. Wird nirgends fix gespeichert, sondern überall live berechnet.</p>

        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Offener Monat für Freiplanungswünsche</span>
            <input type="month" className={inputClass} value={regelForm.offenerWunschMonat} onChange={event => setRegelForm(form => ({ ...form, offenerWunschMonat: event.target.value }))} />
            <span className="mt-1 block text-xs text-gray-400">Beamte können nur für diesen Monat Freiplanungswünsche einreichen. Leer = aktuell kein Monat offen.</span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Aktueller Dienstplan (Standard-Monat)</span>
            <input type="month" className={inputClass} value={regelForm.aktuellerPlanungsmonat} onChange={event => setRegelForm(form => ({ ...form, aktuellerPlanungsmonat: event.target.value }))} />
            <span className="mt-1 block text-xs text-gray-400">Monat, den Dienstplan-Planung/Dienststellenkalender/Meine Dienste beim Öffnen voreinstellen. Andere Monate bleiben frei wählbar.</span>
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" disabled={regelnSpeichern} onClick={() => void speichereRegeln()} className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{regelnSpeichern ? 'Speichern…' : 'Regeln speichern'}</button>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="font-semibold text-gray-900">Beschäftigungsgrad je Person</h2>
        <p className="mt-1 text-xs text-gray-500">{VOLLZEIT_BESCHAEFTIGUNGSGRAD} = Vollzeit. Sollstunden-Vorschau für {aktuellerMonat} sowie das monatliche Freiplanungswunsch-Kontingent (18 bei Vollzeit) bei aktuell hinterlegtem Grad.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Person</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Beschäftigungsgrad</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Sollstunden ({aktuellerMonat})</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Freiplanungswünsche/Monat</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mitarbeiter.map((person, index) => {
                const grad = einstellungen.get(person.id) ?? VOLLZEIT_BESCHAEFTIGUNGSGRAD
                const editing = editId === person.id
                const angezeigterGrad = editing ? (Number(editGrad.replace(',', '.')) || 0) : grad
                const gruppe = dienstplanGruppe(person.dienstnummer)
                const vorherigeGruppe = index > 0 ? dienstplanGruppe(mitarbeiter[index - 1].dienstnummer) : null
                return <Fragment key={person.id}>
                  {gruppe !== vorherigeGruppe ? <tr><td colSpan={5} className="bg-gray-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gray-500">{DIENSTPLAN_GRUPPE_LABEL[gruppe]}</td></tr> : null}
                  <tr>
                    <td className="px-3 py-2 font-medium text-gray-900">{person.name}{person.dienstnummer ? <span className="text-xs text-gray-400"> (DNr. {person.dienstnummer})</span> : null}</td>
                    <td className="px-3 py-2 text-right">
                      {editing ? <input type="text" inputMode="decimal" autoFocus className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={editGrad} onChange={event => setEditGrad(event.target.value)}
                        onKeyDown={event => { if (event.key === 'Enter') void speicherePerson(person.id); if (event.key === 'Escape') setEditId(null) }} />
                        : <span className={grad === VOLLZEIT_BESCHAEFTIGUNGSGRAD ? 'text-gray-900' : 'font-medium text-amber-700'}>{grad}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{berechneSollstunden(aktuellerMonat, stundenProWerktagVorschau, angezeigterGrad)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{monatsKontingent(angezeigterGrad)}</td>
                    <td className="px-3 py-2 text-right">
                      {editing ? <div className="flex justify-end gap-1">
                        <button type="button" disabled={personSpeichern} onClick={() => void speicherePerson(person.id)} className="rounded p-1 text-green-600 hover:bg-green-50"><Check className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setEditId(null)} className="rounded p-1 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
                      </div> : <button type="button" onClick={() => beginneBearbeitung(person.id, grad)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil className="h-4 w-4" /></button>}
                    </td>
                  </tr>
                </Fragment>
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="font-semibold text-gray-900">Farbmarkierungen</h2>
        <p className="mt-1 text-xs text-gray-500">Frei definierbare Markierungen für einzelne Diensteinträge im Planer-Grid (Dienstplan-Planung), z. B. "Überstunden" blau - rein visuell, unabhängig vom Dienst-Kürzel, auch auf sonst leere Zellen anwendbar. Die sechs System-Markierungen (Urlaub, Sonderurlaub, Stundenersatz, Krank, Karenz, Wochenende/Feiertag) sind die Farben, mit denen diese Abwesenheiten bzw. Wochenende/Feiertag überall im Portal dargestellt werden - nur die Farbe ist dort änderbar.</p>
        <div className="mt-3 space-y-2">
          {markierungen.map(markierung => {
            const editing = editMarkierungId === markierung.id
            const farben = markierungFarbKlassen(editing ? editMarkierungFarbe : markierung.farbe)
            if (markierung.kategorie) {
              // System-Markierung (Abwesenheitskategorie) - Name/Bedeutung fix, nur die Farbe ist änderbar, kein Löschen.
              return <div key={markierung.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${farben.bg} ${farben.text}`}>{markierung.name}</span>
                <span className="text-xs text-gray-400">System-Markierung</span>
                <select className="ml-auto rounded-lg border border-gray-300 px-2 py-1 text-sm" disabled={markierungSpeichern} value={markierung.farbe} onChange={event => void systemFarbeAendern(markierung.id, event.target.value as DienstplanMarkierungFarbe)}>
                  {MARKIERUNG_FARBEN.map(farbe => <option key={farbe} value={farbe}>{MARKIERUNG_FARBE_LABEL[farbe]}</option>)}
                </select>
              </div>
            }
            return <div key={markierung.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
              {editing ? <>
                <input type="text" autoFocus className="w-40 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editMarkierungName} onChange={event => setEditMarkierungName(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') void markierungSpeichernAendern(markierung.id); if (event.key === 'Escape') setEditMarkierungId(null) }} />
                <select className="rounded-lg border border-gray-300 px-2 py-1 text-sm" value={editMarkierungFarbe} onChange={event => setEditMarkierungFarbe(event.target.value as DienstplanMarkierungFarbe)}>
                  {MARKIERUNG_FARBEN.map(farbe => <option key={farbe} value={farbe}>{MARKIERUNG_FARBE_LABEL[farbe]}</option>)}
                </select>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${farben.bg} ${farben.text}`}>Vorschau</span>
                <div className="ml-auto flex gap-1">
                  <button type="button" disabled={markierungSpeichern} onClick={() => void markierungSpeichernAendern(markierung.id)} className="rounded p-1 text-green-600 hover:bg-green-50"><Check className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setEditMarkierungId(null)} className="rounded p-1 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
                </div>
              </> : <>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${farben.bg} ${farben.text}`}>{markierung.name}</span>
                <span className="text-xs text-gray-400">{MARKIERUNG_FARBE_LABEL[markierung.farbe as DienstplanMarkierungFarbe] ?? markierung.farbe}</span>
                <div className="ml-auto flex gap-1">
                  <button type="button" onClick={() => beginneMarkierungBearbeitung(markierung)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil className="h-4 w-4" /></button>
                  <button type="button" disabled={markierungSpeichern} onClick={() => void markierungLoeschen(markierung.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                </div>
              </>}
            </div>
          })}
          {markierungen.length === 0 ? <p className="text-sm text-gray-400">Noch keine Farbmarkierungen angelegt.</p> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <input type="text" placeholder="Name, z. B. Überstunden" className="w-40 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={neueMarkierungName} onChange={event => setNeueMarkierungName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void markierungAnlegen() }} />
          <select className="rounded-lg border border-gray-300 px-2 py-1 text-sm" value={neueMarkierungFarbe} onChange={event => setNeueMarkierungFarbe(event.target.value as DienstplanMarkierungFarbe)}>
            {MARKIERUNG_FARBEN.map(farbe => <option key={farbe} value={farbe}>{MARKIERUNG_FARBE_LABEL[farbe]}</option>)}
          </select>
          <button type="button" disabled={markierungSpeichern} onClick={() => void markierungAnlegen()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"><Plus className="h-4 w-4" /> Anlegen</button>
        </div>
      </section>
    </>}
  </div>
}
