import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import type { Ablaufvorlage, AblaufvorlageTyp } from '../lib/types'

const kategorien: { id: AblaufvorlageTyp; label: string }[] = [
  { id: 'erstmeldung', label: 'Maßnahmen Erstmeldung' },
  { id: 'notunterkunft', label: 'Notunterkunft' },
  { id: 'entscheidung', label: 'Entscheidungen' },
]

export default function AblaufvorlagenEinstellungen() {
  const [items, setItems] = useState<Ablaufvorlage[]>([])
  const [typ, setTyp] = useState<AblaufvorlageTyp>('erstmeldung')
  const [edit, setEdit] = useState<Ablaufvorlage | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const result = await supabase.from('ablaufvorlagen').select('*').order('sortierung').order('bezeichnung')
    if (result.error) setError('Ablaufvorlagen konnten nicht geladen werden: ' + result.error.message)
    else { setItems(result.data ?? []); setError('') }
  }, [])
  useEffect(() => { void load() }, [load])

  async function save() {
    if (!edit || saving) return
    if (!edit.bezeichnung.trim() || edit.bezeichnung.trim().length > 500 || !Number.isSafeInteger(edit.sortierung)) {
      setError('Bezeichnung (maximal 500 Zeichen) und eine gültige Reihenfolge eingeben.'); return
    }
    setSaving(true); setError(''); setNotice('')
    const exists = items.some(row => row.id === edit.id)
    const result = exists
      ? await supabase.from('ablaufvorlagen').update({ bezeichnung: edit.bezeichnung.trim(), sortierung: edit.sortierung, aktiv: edit.aktiv }).eq('id', edit.id).select('id').single()
      : await supabase.from('ablaufvorlagen').insert({ typ: edit.typ, schluessel: edit.schluessel, bezeichnung: edit.bezeichnung.trim(), sortierung: edit.sortierung, aktiv: edit.aktiv }).select('id').single()
    setSaving(false)
    if (result.error || !result.data) { setError(result.error?.message ?? 'Vorlage konnte nicht gespeichert werden.'); return }
    logAudit(exists ? 'Ablaufvorlage geändert' : 'Ablaufvorlage angelegt', `${edit.typ}: ${edit.bezeichnung.trim()}`)
    setEdit(null); await load(); setNotice('Vorlage gespeichert. Sie gilt für neu angelegte Einsätze und Ereignisse.')
  }

  const current = items.filter(row => row.typ === typ)
  return <section className="mt-6 rounded-xl border bg-white p-5" aria-label="Ablaufvorlagen">
    <h2 className="text-lg font-bold">Ablaufvorlagen und Entscheidungen</h2>
    <p className="mt-1 text-sm text-gray-600">Reihenfolge, Text und Sichtbarkeit für neue Einsätze festlegen. Bestehende Einsätze behalten ihre dokumentierten Schritte und den Bearbeitungsstand.</p>
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    {notice ? <p role="status" className="mt-3 text-sm text-green-700">{notice}</p> : null}
    <div className="mt-4 flex flex-wrap gap-2">{kategorien.map(row => <button key={row.id} type="button" onClick={() => { setTyp(row.id); setEdit(null) }} className={'rounded-lg border px-3 py-2 text-sm ' + (row.id === typ ? 'border-blue-800 bg-blue-50 font-bold text-blue-900' : 'border-gray-300')}>{row.label}</button>)}</div>
    <div className="mt-4 space-y-2">{current.map(row => <div key={row.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
      <span className="w-9 shrink-0 text-gray-500">{row.sortierung}</span><span className="flex-1">{row.bezeichnung}{!row.aktiv ? <span className="ml-2 text-gray-500">· ausgeblendet</span> : null}</span>
      <button type="button" className="text-blue-800" onClick={() => { setEdit({ ...row }); setError('') }}>Bearbeiten</button>
    </div>)}</div>
    <button type="button" className="mt-3 rounded-lg border px-3 py-2 text-sm text-blue-800" onClick={() => { setEdit({ id: crypto.randomUUID(), typ, schluessel: `punkt_${crypto.randomUUID()}`, bezeichnung: '', sortierung: (current.at(-1)?.sortierung ?? 0) + 10, aktiv: true }); setError('') }}>Punkt hinzufügen</button>
    {edit ? <div className="mt-4 grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">Bezeichnung<input className="mt-1 w-full rounded-lg border p-2" maxLength={500} value={edit.bezeichnung} onChange={event => setEdit({ ...edit, bezeichnung: event.target.value })} /></label>
      <label className="text-sm">Reihenfolge<input className="mt-1 w-full rounded-lg border p-2" type="number" value={edit.sortierung} onChange={event => setEdit({ ...edit, sortierung: Number(event.target.value) })} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.aktiv} onChange={event => setEdit({ ...edit, aktiv: event.target.checked })} /> Für neue Vorgänge sichtbar</label>
      <div className="flex gap-2 sm:col-span-2"><button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-blue-800 px-3 py-2 text-sm text-white">{saving ? 'Speichern…' : 'Speichern'}</button><button type="button" onClick={() => setEdit(null)} className="rounded-lg border px-3 py-2 text-sm">Abbrechen</button></div>
    </div> : null}
  </section>
}
