import { useEffect, useState } from 'react'
import { updateEreignisLage } from '../../lib/ereignis'
import type { Ereignis, IncidentReport } from '../../lib/types'

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
      setError('Lageinformation konnte nicht gespeichert werden.')
    }
  }

  const melder = [incident.caller_name, incident.caller_phone].filter(Boolean).join(' · ') || '–'
  const wann = new Date(incident.reported_at).toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return <div className="space-y-4">
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-800">Lageinformation</h3>
      <p className="mt-1 text-xs text-gray-500">Die Zentrale dokumentiert vorhandene Meldungen und Rückmeldungen. Sie trifft hier keine Entscheidungen für die Kräfte vor Ort.</p>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <Info label="Was ist passiert?" value={incident.summary} />
      <Info label="Wo?" value={incident.location || '–'} />
      <Info label="Wann?" value={wann} />
      <Info label="Melder / Kontakt" value={melder} />
    </div>

    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Rückmeldung von vor Ort</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Gemeldete Betroffene" value={ereignis.betroffene_anzahl} disabled={!canOperate} onCommit={value => save({ betroffene_anzahl: value })} />
        <NumberField label="Gemeldete Verletzte / Opfer" value={ereignis.opfer_anzahl} disabled={!canOperate} onCommit={value => save({ opfer_anzahl: value })} />
      </div>
    </div>

    <TextField label="Gemeldete Sachschäden" value={ereignis.sachschaden} disabled={!canOperate} placeholder="Nur übermittelte Informationen dokumentieren" onCommit={value => save({ sachschaden: value })} />
    <TextField label="Gemeldete Ursache / Hintergrund" value={ereignis.ereignisgrund} disabled={!canOperate} placeholder="Nur soweit bekannt bzw. gemeldet" onCommit={value => save({ ereignisgrund: value })} />
    <TextField
      label="Auftrag / Unterstützungsbedarf an die Zentrale"
      value={ereignis.erforderliche_massnahmen}
      disabled={!canOperate}
      rows={3}
      placeholder="z. B. ZMR-Abfrage, Unterlage vorbereiten, Kontakt herstellen"
      onCommit={value => save({ erforderliche_massnahmen: value })}
    />

    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>
}
