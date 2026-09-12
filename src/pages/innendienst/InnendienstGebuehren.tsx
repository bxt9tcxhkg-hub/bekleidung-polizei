import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { fmtEUR } from '../../lib/format'
import {
  gebuehrensatzTotal,
  parseGebuehrenBetrag,
  validateGebuehrenpositionName,
  validateGebuehrensatzName,
} from '../../lib/innendienstGebuehren'
import type { InnendienstGebuehrenposition, InnendienstGebuehrensatz, InnendienstGebuehrensatzPosition } from '../../lib/types'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

type SatzWithPositions = InnendienstGebuehrensatz & { items: InnendienstGebuehrensatzPosition[] }

export default function InnendienstGebuehrenPanel({ isGenehmiger }: { isGenehmiger: boolean }) {
  const [positions, setPositions] = useState<InnendienstGebuehrenposition[]>([])
  const [saetze, setSaetze] = useState<InnendienstGebuehrensatz[]>([])
  const [items, setItems] = useState<InnendienstGebuehrensatzPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [positionForm, setPositionForm] = useState<{ id: string | null; name: string; betrag: string } | null>(null)
  const [satzForm, setSatzForm] = useState<{ id: string | null; name: string; positionIds: Set<string> } | null>(null)

  async function load() {
    setLoading(true)
    const [posRes, satzRes, itemRes] = await Promise.all([
      supabase.from('innendienst_gebuehrenpositionen').select('*').order('name'),
      supabase.from('innendienst_gebuehrensaetze').select('*').order('name'),
      supabase.from('innendienst_gebuehrensatz_positionen').select('*, position:innendienst_gebuehrenpositionen(id,name,betrag,active)'),
    ])
    if (posRes.error || satzRes.error || itemRes.error) {
      setError('Gebührenordnung konnte nicht geladen werden.')
    } else {
      setError('')
    }
    setPositions((posRes.data ?? []) as InnendienstGebuehrenposition[])
    setSaetze((satzRes.data ?? []) as InnendienstGebuehrensatz[])
    setItems((itemRes.data ?? []) as InnendienstGebuehrensatzPosition[])
    setLoading(false)
  }

  useEffect(() => {
    load().catch(() => {
      setError('Gebührenordnung konnte nicht geladen werden.')
      setLoading(false)
    })
  }, [])

  const saetzeWithItems = useMemo<SatzWithPositions[]>(
    () => saetze.map(satz => ({ ...satz, items: items.filter(item => item.gebuehrensatz_id === satz.id) })),
    [saetze, items],
  )

  function openNewPosition() {
    setPositionForm({ id: null, name: '', betrag: '' })
    setError('')
  }
  function openEditPosition(position: InnendienstGebuehrenposition) {
    setPositionForm({ id: position.id, name: position.name, betrag: String(position.betrag) })
    setError('')
  }

  async function savePosition() {
    if (!positionForm) return
    const nameError = validateGebuehrenpositionName(positionForm.name)
    if (nameError) { setError(nameError); return }
    const betrag = parseGebuehrenBetrag(positionForm.betrag)
    if (betrag === null) { setError('Bitte einen gültigen Betrag (≥ 0) angeben.'); return }
    setSaving(true)
    setError('')
    const payload = { name: positionForm.name.trim(), betrag }
    const { error: saveError } = positionForm.id
      ? await supabase.from('innendienst_gebuehrenpositionen').update(payload).eq('id', positionForm.id)
      : await supabase.from('innendienst_gebuehrenpositionen').insert(payload)
    setSaving(false)
    if (saveError) { setError(saveError.message || 'Position konnte nicht gespeichert werden.'); return }
    logAudit(positionForm.id ? 'Gebührenposition bearbeitet' : 'Gebührenposition angelegt', `${payload.name} · ${fmtEUR(betrag)}`)
    setPositionForm(null)
    await load()
  }

  async function removePosition(position: InnendienstGebuehrenposition) {
    if (!window.confirm(`Position „${position.name}“ wirklich löschen? Sie muss zuerst aus allen Sätzen entfernt werden.`)) return
    const { error: deleteError } = await supabase.from('innendienst_gebuehrenpositionen').delete().eq('id', position.id)
    if (deleteError) { setError(deleteError.message || 'Position konnte nicht gelöscht werden (wird evtl. noch in einem Satz verwendet).'); return }
    logAudit('Gebührenposition gelöscht', position.name)
    await load()
  }

  function openNewSatz() {
    setSatzForm({ id: null, name: '', positionIds: new Set() })
    setError('')
  }
  function openEditSatz(satz: SatzWithPositions) {
    setSatzForm({ id: satz.id, name: satz.name, positionIds: new Set(satz.items.map(item => item.position_id)) })
    setError('')
  }
  function togglePositionInSatz(positionId: string) {
    setSatzForm(current => {
      if (!current) return current
      const next = new Set(current.positionIds)
      if (next.has(positionId)) next.delete(positionId)
      else next.add(positionId)
      return { ...current, positionIds: next }
    })
  }

  async function saveSatz() {
    if (!satzForm) return
    const nameError = validateGebuehrensatzName(satzForm.name)
    if (nameError) { setError(nameError); return }
    setSaving(true)
    setError('')
    const name = satzForm.name.trim()
    const existingSatzId = satzForm.id
    if (existingSatzId) {
      const { error: updateError } = await supabase.from('innendienst_gebuehrensaetze').update({ name }).eq('id', existingSatzId)
      if (updateError) { setError(updateError.message || 'Satz konnte nicht gespeichert werden.'); setSaving(false); return }
      const existing = items.filter(item => item.gebuehrensatz_id === existingSatzId).map(item => item.position_id)
      const toRemove = existing.filter(id => !satzForm.positionIds.has(id))
      const toAdd = [...satzForm.positionIds].filter(id => !existing.includes(id))
      if (toRemove.length > 0) {
        const { error: removeError } = await supabase.from('innendienst_gebuehrensatz_positionen').delete().eq('gebuehrensatz_id', existingSatzId).in('position_id', toRemove)
        if (removeError) { setError(removeError.message || 'Positionen konnten nicht entfernt werden.'); setSaving(false); return }
      }
      if (toAdd.length > 0) {
        const { error: addError } = await supabase.from('innendienst_gebuehrensatz_positionen').insert(toAdd.map(position_id => ({ gebuehrensatz_id: existingSatzId, position_id })))
        if (addError) { setError(addError.message || 'Positionen konnten nicht hinzugefügt werden.'); setSaving(false); return }
      }
    } else {
      const { data, error: insertError } = await supabase.from('innendienst_gebuehrensaetze').insert({ name }).select('id').single()
      if (insertError || !data) { setError(insertError?.message || 'Satz konnte nicht angelegt werden.'); setSaving(false); return }
      const newSatzId = data.id
      if (satzForm.positionIds.size > 0) {
        const { error: addError } = await supabase.from('innendienst_gebuehrensatz_positionen').insert([...satzForm.positionIds].map(position_id => ({ gebuehrensatz_id: newSatzId, position_id })))
        if (addError) { setError(addError.message || 'Positionen konnten nicht zugeordnet werden.'); setSaving(false); return }
      }
    }
    setSaving(false)
    logAudit(satzForm.id ? 'Gebührensatz bearbeitet' : 'Gebührensatz angelegt', name)
    setSatzForm(null)
    await load()
  }

  async function removeSatz(satz: InnendienstGebuehrensatz) {
    if (!window.confirm(`Satz „${satz.name}“ wirklich löschen?`)) return
    const { error: deleteError } = await supabase.from('innendienst_gebuehrensaetze').delete().eq('id', satz.id)
    if (deleteError) { setError(deleteError.message || 'Satz konnte nicht gelöscht werden.'); return }
    logAudit('Gebührensatz gelöscht', satz.name)
    await load()
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        {isGenehmiger
          ? 'Positionen und deren Zusammensetzung zu Sätzen (z. B. Bescheid Straßenmusik) festlegen.'
          : 'Nachschlagen, welche Positionen sich zu welchem Betrag summieren. Wird ausschließlich vom Genehmiger gepflegt.'}
      </p>
      {error ? <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Positionen</h3>
          {isGenehmiger && (
            <button type="button" onClick={openNewPosition} className="flex items-center gap-1.5 text-xs font-medium bg-blue-800 hover:bg-blue-900 text-white px-2.5 py-1.5 rounded-lg">
              <Plus className="w-3.5 h-3.5" /> Position
            </button>
          )}
        </div>
        {positions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">Noch keine Positionen angelegt.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {positions.map(position => (
              <li key={position.id} className="px-4 py-2.5 flex items-center justify-between gap-2 text-sm">
                <span className={`min-w-0 truncate ${position.active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{position.name}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-medium tabular-nums text-gray-700">{fmtEUR(position.betrag)}</span>
                  {isGenehmiger && (
                    <>
                      <button type="button" onClick={() => openEditPosition(position)} className="text-gray-500 hover:text-gray-900" aria-label="Bearbeiten"><Pencil className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => { void removePosition(position) }} className="text-red-600 hover:text-red-800" aria-label="Löschen"><Trash2 className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Sätze (Zusammensetzung)</h3>
          {isGenehmiger && (
            <button type="button" onClick={openNewSatz} disabled={positions.length === 0} className="flex items-center gap-1.5 text-xs font-medium bg-blue-800 hover:bg-blue-900 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-60">
              <Plus className="w-3.5 h-3.5" /> Satz
            </button>
          )}
        </div>
        {saetzeWithItems.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">Noch keine Sätze angelegt.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {saetzeWithItems.map(satz => (
              <li key={satz.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{satz.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {satz.items.length === 0
                        ? 'Keine Positionen zugeordnet.'
                        : satz.items.map(item => item.position?.name ?? '–').join(' + ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold tabular-nums text-gray-900">{fmtEUR(gebuehrensatzTotal(satz.items))}</span>
                    {isGenehmiger && (
                      <>
                        <button type="button" onClick={() => openEditSatz(satz)} className="text-gray-500 hover:text-gray-900" aria-label="Bearbeiten"><Pencil className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => { void removeSatz(satz) }} className="text-red-600 hover:text-red-800" aria-label="Löschen"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {positionForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{positionForm.id ? 'Position bearbeiten' : 'Neue Position'}</h2>
              <button type="button" onClick={() => setPositionForm(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <label className="block text-xs font-medium text-gray-600">
                Name *
                <input className={`${inputClass} mt-1`} value={positionForm.name} onChange={e => setPositionForm(current => current && { ...current, name: e.target.value })} placeholder="z. B. Bundesabgabe" />
              </label>
              <label className="block text-xs font-medium text-gray-600">
                Betrag (€) *
                <input className={`${inputClass} mt-1`} inputMode="decimal" value={positionForm.betrag} onChange={e => setPositionForm(current => current && { ...current, betrag: e.target.value })} placeholder="z. B. 15,00" />
              </label>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button type="button" onClick={() => setPositionForm(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button type="button" onClick={() => { void savePosition() }} disabled={saving} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button>
            </div>
          </div>
        </div>
      )}

      {satzForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{satzForm.id ? 'Satz bearbeiten' : 'Neuer Satz'}</h2>
              <button type="button" onClick={() => setSatzForm(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <label className="block text-xs font-medium text-gray-600">
                Name *
                <input className={`${inputClass} mt-1`} value={satzForm.name} onChange={e => setSatzForm(current => current && { ...current, name: e.target.value })} placeholder="z. B. Bescheid Straßenmusik" />
              </label>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Positionen</p>
                {positions.length === 0 ? (
                  <p className="text-sm text-gray-500">Zuerst eine Position anlegen.</p>
                ) : (
                  <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                    {positions.map(position => (
                      <li key={position.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          id={`satz-pos-${position.id}`}
                          checked={satzForm.positionIds.has(position.id)}
                          onChange={() => togglePositionInSatz(position.id)}
                        />
                        <label htmlFor={`satz-pos-${position.id}`} className="flex-1 min-w-0 truncate">{position.name}</label>
                        <span className="text-gray-500 tabular-nums">{fmtEUR(position.betrag)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button type="button" onClick={() => setSatzForm(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button type="button" onClick={() => { void saveSatz() }} disabled={saving} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
