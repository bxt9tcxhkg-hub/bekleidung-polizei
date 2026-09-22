import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { loadChecklistPunkte, setChecklistPunktErledigt, setChecklistPunktWer } from '../../lib/einsatzChecklisten'
import { ERSTMELDUNG_CHECKLISTE, NOTUNTERKUNFT_CHECKLISTE, type ChecklistPunktDef } from '../../lib/einsatzSchema'
import type { EinsatzChecklisteName, EinsatzChecklistPunkt } from '../../lib/types'

const WEITERE_ERSTMELDUNG_CHECKLISTE = ERSTMELDUNG_CHECKLISTE.filter(
  punkt => punkt.key !== 'meldungszettel' && punkt.key !== 'oeffentliche_sicherheit',
)

function MassnahmenAbschnitt({
  incidentId,
  checkliste,
  punkte,
  canOperate,
  onChanged,
  startCollapsed = false,
}: {
  incidentId: string
  checkliste: EinsatzChecklisteName
  punkte: ChecklistPunktDef[]
  canOperate: boolean
  onChanged?: () => void
  startCollapsed?: boolean
}) {
  const { profile } = useAuth()
  const [stand, setStand] = useState<Map<string, EinsatzChecklistPunkt>>(new Map())
  const [showAll, setShowAll] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [collapsed, setCollapsed] = useState(startCollapsed)
  const [editingWer, setEditingWer] = useState<string | null>(null)
  const [werDraft, setWerDraft] = useState('')

  useEffect(() => {
    void loadChecklistPunkte(incidentId, checkliste).then(rows => setStand(new Map(rows.map(row => [row.punkt_key, row]))))
  }, [incidentId, checkliste])

  const offen = useMemo(() => punkte.filter(punkt => !stand.get(punkt.key)?.erledigt), [punkte, stand])
  const erledigt = useMemo(() => punkte.filter(punkt => stand.get(punkt.key)?.erledigt), [punkte, stand])
  const visible = showAll ? offen : offen.slice(0, 4)

  async function toggle(punktKey: string) {
    if (!profile?.id) return
    const bisher = stand.get(punktKey)
    const next = !bisher?.erledigt
    setStand(current => new Map(current).set(punktKey, {
      ...(bisher ?? { id: '', incident_id: incidentId, checkliste, punkt_key: punktKey, wer: null, erledigt_at: null, erledigt_von: null, updated_at: '' }),
      erledigt: next,
    }))
    await setChecklistPunktErledigt(incidentId, checkliste, punktKey, next, bisher?.wer ?? '', profile.id)
    onChanged?.()
  }

  async function saveWer(punktKey: string) {
    await setChecklistPunktWer(incidentId, checkliste, punktKey, werDraft)
    const bisher = stand.get(punktKey)
    setStand(current => new Map(current).set(punktKey, {
      ...(bisher ?? { id: '', incident_id: incidentId, checkliste, punkt_key: punktKey, erledigt: false, erledigt_at: null, erledigt_von: null, updated_at: '' }),
      wer: werDraft,
    }))
    setEditingWer(null)
    onChanged?.()
  }

  return <div className="space-y-2">
    <button type="button" onClick={() => setCollapsed(current => !current)} className="flex w-full items-center justify-between gap-2 text-left">
      <div>
        <p className="text-sm font-bold text-gray-900">{offen.length === 0 ? 'Alles erledigt' : offen.length + ' offen'}</p>
        <p className="text-xs text-gray-500">{erledigt.length} erledigt</p>
      </div>
      {collapsed ? <ChevronRight className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
    </button>

    {!collapsed ? <>
      {offen.length === 0 ? <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">Keine offene Maßnahme.</div> : <div className="space-y-2">
        {visible.map((punkt, index) => {
          const row = stand.get(punkt.key)
          const isEditing = editingWer === punkt.key
          return <div key={punkt.key} className={'rounded-xl border p-3 ' + (index === 0 ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white')}>
            {index === 0 ? <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">Als Nächstes</p> : null}
            <div className="flex items-start gap-2">
              <button
                type="button"
                disabled={!canOperate}
                onClick={() => void toggle(punkt.key)}
                className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded border border-gray-400 bg-white disabled:opacity-50"
                aria-label="Als erledigt markieren"
              ><Check className="h-3.5 w-3.5 text-transparent" /></button>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900">{punkt.text}</p>
                {row?.wer ? <p className="mt-1 text-xs text-gray-500">Zuständig: {row.wer}</p> : null}
                {canOperate ? <button type="button" onClick={() => { setEditingWer(isEditing ? null : punkt.key); setWerDraft(row?.wer ?? '') }} className="mt-1 text-xs font-medium text-gray-500">
                  {row?.wer ? 'Zuständigkeit ändern' : 'Zuständigkeit optional'}
                </button> : null}
                {isEditing ? <div className="mt-2 flex gap-2">
                  <input type="text" value={werDraft} onChange={event => setWerDraft(event.target.value)} placeholder="Wer?" className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs" />
                  <button type="button" onClick={() => void saveWer(punkt.key)} className="rounded-md bg-blue-800 px-2.5 py-1.5 text-xs font-bold text-white">Speichern</button>
                </div> : null}
              </div>
            </div>
          </div>
        })}
      </div>}

      {offen.length > 4 ? <button type="button" onClick={() => setShowAll(current => !current)} className="text-xs font-semibold text-blue-800">
        {showAll ? 'Nur nächste Maßnahmen' : 'Weitere ' + (offen.length - 4) + ' anzeigen'}
      </button> : null}

      {erledigt.length > 0 ? <div className="pt-1">
        <button type="button" onClick={() => setShowDone(current => !current)} className="text-xs font-medium text-gray-500">
          {showDone ? 'Erledigte ausblenden' : erledigt.length + ' erledigte anzeigen'}
        </button>
        {showDone ? <ul className="mt-2 space-y-1">{erledigt.map(punkt => <li key={punkt.key} className="flex items-start gap-2 text-xs text-gray-500">
          <button type="button" disabled={!canOperate} onClick={() => void toggle(punkt.key)} className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded bg-green-600 text-white"><Check className="h-3 w-3" /></button>
          <span className="line-through">{punkt.text}</span>
        </li>)}</ul> : null}
      </div> : null}
    </> : null}
  </div>
}

export default function EinsatzChecklisten({ incidentId, canOperate, onChanged }: { incidentId: string; canOperate: boolean; onChanged?: () => void }) {
  const [notunterkunftOffen, setNotunterkunftOffen] = useState(false)

  return <div className="space-y-4">
    <MassnahmenAbschnitt
      incidentId={incidentId}
      checkliste="erstmeldung"
      punkte={WEITERE_ERSTMELDUNG_CHECKLISTE}
      canOperate={canOperate}
      onChanged={onChanged}
    />

    <div className="border-t border-gray-200 pt-3">
      <button type="button" onClick={() => setNotunterkunftOffen(current => !current)} className="flex w-full items-center justify-between gap-2 text-left">
        <div>
          <p className="text-sm font-bold text-gray-900">Sonderprozess Notunterkunft</p>
          <p className="text-xs text-gray-500">Nur öffnen, wenn tatsächlich benötigt.</p>
        </div>
        {notunterkunftOffen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>
      {notunterkunftOffen ? <div className="mt-3">
        <MassnahmenAbschnitt
          incidentId={incidentId}
          checkliste="notunterkunft"
          punkte={NOTUNTERKUNFT_CHECKLISTE}
          canOperate={canOperate}
          onChanged={onChanged}
        />
      </div> : null}
    </div>
  </div>
}
