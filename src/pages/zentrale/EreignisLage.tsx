import { useEffect, useState } from 'react'
import { updateEreignisLage } from '../../lib/ereignis'
import type { Ereignis, IncidentReport } from '../../lib/types'
import EreignisEntscheidungen from './EreignisEntscheidungen'

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
    <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{value || '–'}</p>
  </div>
}

function TextField({
  label, value, placeholder, disabled, rows = 2, onCommit,
}: {
  label: string
  value: string | null
  placeholder?: string
  disabled: boolean
  rows?: number
  onCommit: (value: string | null) => Promise<void>
}) {
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(value ?? ''), [value])

  async function commit() {
    const next = draft.trim() || null
    if (next === (value ?? null)) return
    setSaving(true)
    try { await onCommit(next) } finally { setSaving(false) }
  }

  return <label className="block">
    <span className="text-xs font-semibold text-gray-700">{label}</span>
    <textarea
      rows={rows}
      disabled={disabled || saving}
      value={draft}
      placeholder={placeholder}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => void commit()}
      className="mt-1 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-600"
    />
  </label>
}

function NumberField({
  label, value, disabled, onCommit,
}: {
  label: string
  value: number | null
  disabled: boolean
  onCommit: (value: number | null) => Promise<void>
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(value == null ? '' : String(value)), [value])

  async function commit() {
    const next = draft.trim() === '' ? null : Math.max(0, Number.parseInt(draft, 10) || 0)
    if (next === value) return
    setSaving(true)
    try { await onCommit(next) } finally { setSaving(false) }
  }

  return <label className="block">
    <span className="text-xs font-semibold text-gray-700">{label}</span>
    <input
      type="number"
      min={0}
      inputMode="numeric"
      disabled={disabled || saving}
      value={draft}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => void commit()}
      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-600"
    />
  </label>
}

export default function EreignisLage({
  ereignis, incident, canOperate, userId, onSaved, onProcessChanged,
}: {
  ereignis: Ereignis
  incident: IncidentReport
  canOperate: boolean
  userId: string | null
  onSaved: (ereignis: Ereignis) => void
  onProcessChanged?: () => void
}) {
  const [error, setError] = useState('')

  async function save(changes: Parameters<typeof updateEreignisLage>[1]) {
    if (!userId) return
    setError('')
    try {
      const saved = await updateEreignisLage(ereignis.id, changes, userId)
      onSaved(saved)
      onProcessChanged?.()
    } catch {
      setError('Lagedaten konnten nicht gespeichert werden.')
    }
  }

  const melder = [incident.caller_name, incident.caller_phone].filter(Boolean).join(' · ') || '–'
  const wann = new Date(incident.reported_at).toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const showKoordination = ereignis.dimension === 'gross' || ereignis.dimension === 'katastrophe'

  return <div className="space-y-4">
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-800">Meldungszettel / Lage</h3>
      <p className="mt-1 text-xs text-gray-500">Bereits bekannte Einsatzdaten werden automatisch übernommen. Nur zusätzliche Lageinformationen ergänzen.</p>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <Info label="Was ist passiert?" value={incident.summary} />
      <Info label="Wo?" value={incident.location || '–'} />
      <Info label="Wann?" value={wann} />
      <Info label="Melder / Kontakt" value={melder} />
    </div>

    <div className="grid grid-cols-2 gap-3">
      <NumberField label="Betroffene Personen" value={ereignis.betroffene_anzahl} disabled={!canOperate} onCommit={value => save({ betroffene_anzahl: value })} />
      <NumberField label="Opfer" value={ereignis.opfer_anzahl} disabled={!canOperate} onCommit={value => save({ opfer_anzahl: value })} />
    </div>

    <TextField label="Sachschäden" value={ereignis.sachschaden} disabled={!canOperate} placeholder="Bekannte Sachschäden, falls relevant" onCommit={value => save({ sachschaden: value })} />
    <TextField label="Grund des Ereignisses" value={ereignis.ereignisgrund} disabled={!canOperate} placeholder="Bekannte Ursache / Ereignisgrund" onCommit={value => save({ ereignisgrund: value })} />
    <TextField label="Was wäre zu tun / erforderliche Maßnahmen" value={ereignis.erforderliche_massnahmen} disabled={!canOperate} rows={3} placeholder="Erforderliche bzw. bereits erkannte Maßnahmen" onCommit={value => save({ erforderliche_massnahmen: value })} />

    <div className="rounded-xl border border-gray-200 p-3">
      <p className="text-sm font-semibold text-gray-900">Öffentliche Sicherheit beeinträchtigt?</p>
      <div className="mt-2 flex gap-2">
        {([true, false] as const).map(value => <button
          key={String(value)}
          type="button"
          disabled={!canOperate}
          onClick={() => void save({ oeffentliche_sicherheit_beeintraechtigt: value })}
          className={'rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ' + (ereignis.oeffentliche_sicherheit_beeintraechtigt === value ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700')}
        >{value ? 'Ja' : 'Nein'}</button>)}
        {ereignis.oeffentliche_sicherheit_beeintraechtigt != null && canOperate ? <button
          type="button"
          onClick={() => void save({ oeffentliche_sicherheit_beeintraechtigt: null })}
          className="px-2 text-xs font-medium text-gray-500"
        >Zurücksetzen</button> : null}
      </div>
    </div>

    {showKoordination ? <div className="rounded-xl border border-gray-200 p-3">
      <p className="text-sm font-semibold text-gray-900">Koordination notwendig?</p>
      <p className="mt-1 text-xs text-gray-500">Relevant bei Großereignis / Katastrophe für die weiteren Koordinations- und Führungsentscheidungen.</p>
      <div className="mt-2 flex gap-2">
        {([true, false] as const).map(value => <button
          key={String(value)}
          type="button"
          disabled={!canOperate}
          onClick={() => void save({ koordinierung_noetig: value })}
          className={'rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ' + (ereignis.koordinierung_noetig === value ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700')}
        >{value ? 'Ja' : 'Nein'}</button>)}
        {ereignis.koordinierung_noetig != null && canOperate ? <button
          type="button"
          onClick={() => void save({ koordinierung_noetig: null })}
          className="px-2 text-xs font-medium text-gray-500"
        >Zurücksetzen</button> : null}
      </div>
    </div> : null}

    {showKoordination && ereignis.koordinierung_noetig === true ? <div className="border-t border-gray-200 pt-4">
      <EreignisEntscheidungen ereignisId={ereignis.id} canOperate={canOperate} userId={userId} onChanged={onProcessChanged} />
    </div> : null}

    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>
}
