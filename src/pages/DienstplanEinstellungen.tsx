import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { dienstplanSupabase, type DienstplanPersonEinstellungenRow, type DienstplanRegelRow } from '../lib/dienstplanSupabase'
import { ErrorMessage, inputClass } from '../components/ZentraleEntryEditor'
import { thisMonthLocal } from '../lib/ueberstunden'
import { berechneSollstunden } from '../lib/dienstplanSollstunden'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [regelForm, setRegelForm] = useState({ stundenProWerktag: '', mindestruhezeitStunden: '', wunschfristTage: '' })
  const [regelnSpeichern, setRegelnSpeichern] = useState(false)

  const [editId, setEditId] = useState<string | null>(null)
  const [editGrad, setEditGrad] = useState('')
  const [personSpeichern, setPersonSpeichern] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [regelnResult, mitarbeiterResult, einstellungenResult] = await Promise.all([
      dienstplanSupabase.from('dienstplan_regeln').select('id,stunden_pro_werktag,mindestruhezeit_stunden,wunschfrist_tage,updated_by,updated_at').eq('id', 1).maybeSingle(),
      supabase.from('profiles').select('id,name,dienstnummer').eq('active', true).eq('organisation', ET_ROSTER_ORGANISATION).order('name'),
      dienstplanSupabase.from('dienstplan_person_einstellungen').select('beamter_id,beschaeftigungsgrad'),
    ])
    if (regelnResult.error || mitarbeiterResult.error || einstellungenResult.error) { setError('Grunddaten konnten nicht geladen werden.'); setLoading(false); return }
    if (regelnResult.data) {
      setRegeln(regelnResult.data)
      setRegelForm({ stundenProWerktag: String(regelnResult.data.stunden_pro_werktag), mindestruhezeitStunden: String(regelnResult.data.mindestruhezeit_stunden), wunschfristTage: String(regelnResult.data.wunschfrist_tage) })
    }
    setMitarbeiter(mitarbeiterResult.data ?? [])
    setEinstellungen(new Map((einstellungenResult.data as PersonEinstellungRow[] ?? []).map(row => [row.beamter_id, row.beschaeftigungsgrad])))
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  async function speichereRegeln() {
    const stundenProWerktag = Number(regelForm.stundenProWerktag.replace(',', '.'))
    const mindestruhezeitStunden = Number(regelForm.mindestruhezeitStunden.replace(',', '.'))
    const wunschfristTage = Number(regelForm.wunschfristTage)
    if (!Number.isFinite(stundenProWerktag) || stundenProWerktag <= 0 || !Number.isFinite(mindestruhezeitStunden) || mindestruhezeitStunden < 0 || !Number.isInteger(wunschfristTage) || wunschfristTage < 0) {
      setError('Bitte gültige Werte eingeben.'); return
    }
    setRegelnSpeichern(true); setError(''); setNotice('')
    const result = await dienstplanSupabase.from('dienstplan_regeln').update({ stunden_pro_werktag: stundenProWerktag, mindestruhezeit_stunden: mindestruhezeitStunden, wunschfrist_tage: wunschfristTage, updated_by: profile?.id ?? null }).eq('id', 1)
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
    if (!Number.isFinite(grad) || grad <= 0 || grad > 100) { setError('Beschäftigungsgrad muss zwischen 1 und 100 liegen.'); return }
    setPersonSpeichern(true); setError('')
    const result = await dienstplanSupabase.from('dienstplan_person_einstellungen').upsert({ beamter_id: beamterId, beschaeftigungsgrad: grad, updated_by: profile?.id ?? null }, { onConflict: 'beamter_id' })
    setPersonSpeichern(false)
    if (result.error) { setError('Der Beschäftigungsgrad konnte nicht gespeichert werden.'); return }
    setEditId(null)
    await load()
  }

  const aktuellerMonat = thisMonthLocal()
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
        <div className="mt-4 flex justify-end">
          <button type="button" disabled={regelnSpeichern} onClick={() => void speichereRegeln()} className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{regelnSpeichern ? 'Speichern…' : 'Regeln speichern'}</button>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="font-semibold text-gray-900">Beschäftigungsgrad je Person</h2>
        <p className="mt-1 text-xs text-gray-500">Sollstunden-Vorschau für {aktuellerMonat} bei aktuell hinterlegtem Grad.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Person</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Beschäftigungsgrad</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Sollstunden ({aktuellerMonat})</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mitarbeiter.map(person => {
                const grad = einstellungen.get(person.id) ?? 100
                const editing = editId === person.id
                const angezeigterGrad = editing ? (Number(editGrad.replace(',', '.')) || 0) : grad
                return <tr key={person.id}>
                  <td className="px-3 py-2 font-medium text-gray-900">{person.name}{person.dienstnummer ? <span className="text-xs text-gray-400"> (DNr. {person.dienstnummer})</span> : null}</td>
                  <td className="px-3 py-2 text-right">
                    {editing ? <input type="text" inputMode="decimal" autoFocus className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={editGrad} onChange={event => setEditGrad(event.target.value)}
                      onKeyDown={event => { if (event.key === 'Enter') void speicherePerson(person.id); if (event.key === 'Escape') setEditId(null) }} />
                      : <span className={grad === 100 ? 'text-gray-900' : 'font-medium text-amber-700'}>{grad} %</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{berechneSollstunden(aktuellerMonat, stundenProWerktagVorschau, angezeigterGrad)}</td>
                  <td className="px-3 py-2 text-right">
                    {editing ? <div className="flex justify-end gap-1">
                      <button type="button" disabled={personSpeichern} onClick={() => void speicherePerson(person.id)} className="rounded p-1 text-green-600 hover:bg-green-50"><Check className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setEditId(null)} className="rounded p-1 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
                    </div> : <button type="button" onClick={() => beginneBearbeitung(person.id, grad)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil className="h-4 w-4" /></button>}
                  </td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>}
  </div>
}
