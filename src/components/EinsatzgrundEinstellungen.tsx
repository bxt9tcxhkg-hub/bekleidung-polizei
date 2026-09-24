import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { IncidentReasonConfig } from '../lib/types'
import { logAudit } from '../lib/audit'

export default function EinsatzgrundEinstellungen() {
  const [items, setItems] = useState<IncidentReasonConfig[]>([])
  const [edit, setEdit] = useState<IncidentReasonConfig | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    const { data, error: problem } = await supabase.from('incident_reason_configs').select('*').order('sort_order')
    if (problem) setError('Einsatzgründe konnten nicht geladen werden.')
    else { setItems(data ?? []); setError('') }
  }, [])
  useEffect(() => { void load() }, [load])
  async function save() {
    if (!edit?.label.trim() || !edit.code.trim()) { setError('Code und Bezeichnung sind erforderlich.'); return }
    if (edit.nearby_radius_m < 0 || edit.nearby_radius_m > 1000) { setError('Umkreis muss zwischen 0 und 1000 m liegen.'); return }
    setSaving(true)
    const exists = items.some(row => row.code === edit.code)
    const result = exists
      ? await supabase.from('incident_reason_configs').update({ label: edit.label.trim(), nearby_radius_m: edit.nearby_radius_m, sort_order: edit.sort_order, active: edit.active }).eq('code', edit.code).select('code').single()
      : await supabase.from('incident_reason_configs').insert({ ...edit, code: edit.code.trim(), label: edit.label.trim() }).select('code').single()
    setSaving(false)
    if (result.error || !result.data) { setError(result.error?.message ?? 'Einsatzgrund konnte nicht gespeichert werden.'); return }
    logAudit(exists ? 'Einsatzgrund geändert' : 'Einsatzgrund angelegt', `${edit.code}: ${edit.label.trim()}`)
    setEdit(null); await load()
  }
  return <section className="mt-6 rounded-xl border bg-white p-5"><h2 className="text-lg font-bold">Einsatzgründe</h2>
    <p className="mt-1 text-sm text-gray-600">Bezeichnung, Reihenfolge, Sichtbarkeit und Nahbereichsprüfung der Auswahl in der Meldung bearbeiten. Die automatische Erkennung aus Freitext ist derzeit für bestehende Gründe fest vorgegeben; neu angelegte Gründe werden manuell ausgewählt.</p>
    {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
    <div className="mt-3 space-y-1">{items.map(row => <div key={row.code} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"><span>{row.sort_order}. {row.label}{!row.active ? ' · ausgeblendet' : ''}{row.nearby_radius_m ? ` · ${row.nearby_radius_m} m` : ''}</span><button type="button" className="text-blue-800" onClick={() => setEdit({ ...row })}>Bearbeiten</button></div>)}</div>
    <button type="button" className="mt-3 rounded-lg border px-3 py-2 text-sm text-blue-800" onClick={() => setEdit({ code: '', label: '', nearby_radius_m: 0, sort_order: (items.at(-1)?.sort_order ?? 0) + 10, active: true })}>Einsatzgrund hinzufügen</button>
    {edit ? <div className="mt-4 grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
      <label className="text-sm">Bezeichnung<input className="mt-1 w-full rounded-lg border p-2" value={edit.label} onChange={e => setEdit({ ...edit, label: e.target.value })} /></label>
      <label className="text-sm">Technischer Code (nach Anlage unveränderlich)<input className="mt-1 w-full rounded-lg border p-2" disabled={items.some(row => row.code === edit.code)} value={edit.code} onChange={e => setEdit({ ...edit, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} /></label>
      <label className="text-sm">Reihenfolge<input type="number" className="mt-1 w-full rounded-lg border p-2" value={edit.sort_order} onChange={e => setEdit({ ...edit, sort_order: Number(e.target.value) })} /></label>
      <label className="text-sm">Umkreis für Hinweise (Meter; 0 = aus)<input type="number" min="0" max="1000" className="mt-1 w-full rounded-lg border p-2" value={edit.nearby_radius_m} onChange={e => setEdit({ ...edit, nearby_radius_m: Number(e.target.value) })} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active} onChange={e => setEdit({ ...edit, active: e.target.checked })} /> In Auswahl sichtbar</label>
      <div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-blue-800 px-3 py-2 text-sm text-white">Speichern</button><button type="button" onClick={() => setEdit(null)} className="rounded-lg border px-3 py-2 text-sm">Abbrechen</button></div>
    </div> : null}
  </section>
}
