import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { loadChecklistPunkte, setChecklistPunktErledigt, setChecklistPunktWer } from '../../lib/einsatzChecklisten'
import { ERSTMELDUNG_CHECKLISTE, NOTUNTERKUNFT_CHECKLISTE, type ChecklistPunktDef } from '../../lib/einsatzSchema'
import type { EinsatzChecklisteName, EinsatzChecklistPunkt } from '../../lib/types'

// Digitale "Checkliste Notfall/Katastrophe" (Erstmeldung) und "Checkliste
// Notunterkunft" - geteilter Server-Zustand (einsatz_checklist_punkte),
// damit Zentrale UND Streife vor Ort denselben Bearbeitungsstand sehen (im
// Gegensatz zur Stufen-/Telefonketten-Checkliste, die weiterhin rein
// geräte-lokal über localStorage läuft, siehe einsatzSchema.ts).

function ChecklistZeile({ punkt, stand, canOperate, onToggle, onWerChange }: {
  punkt: ChecklistPunktDef
  stand?: EinsatzChecklistPunkt
  canOperate: boolean
  onToggle: () => void
  onWerChange: (wer: string) => void
}) {
  const [wer, setWer] = useState(stand?.wer ?? '')
  useEffect(() => setWer(stand?.wer ?? ''), [stand?.wer])
  return <li className={`flex flex-wrap items-start gap-2 rounded-lg px-2 py-1.5 ${stand?.erledigt ? 'bg-green-50' : ''}`}>
    <button type="button" disabled={!canOperate} onClick={onToggle} className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded border ${stand?.erledigt ? 'bg-green-600 border-green-600' : 'border-gray-400 bg-white'}`} aria-label={stand?.erledigt ? 'Erledigt' : 'Offen'} />
    <p className={`text-sm flex-1 min-w-[12rem] ${stand?.erledigt ? 'text-gray-500 line-through' : 'text-gray-800'}`}>{punkt.text}</p>
    {canOperate ? <input type="text" placeholder="Wer?" value={wer} onChange={event => setWer(event.target.value)} onBlur={() => { if (wer !== (stand?.wer ?? '')) onWerChange(wer) }} className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white w-28 flex-shrink-0" />
      : stand?.wer ? <span className="text-xs text-gray-500 flex-shrink-0">{stand.wer}</span> : null}
  </li>
}

function ChecklistAbschnitt({ incidentId, checkliste, punkte, canOperate }: { incidentId: string; checkliste: EinsatzChecklisteName; punkte: ChecklistPunktDef[]; canOperate: boolean }) {
  const { profile } = useAuth()
  const [stand, setStand] = useState<Map<string, EinsatzChecklistPunkt>>(new Map())

  useEffect(() => {
    void loadChecklistPunkte(incidentId, checkliste).then(rows => setStand(new Map(rows.map(row => [row.punkt_key, row]))))
  }, [incidentId, checkliste])

  async function toggle(punktKey: string) {
    if (!profile?.id) return
    const bisher = stand.get(punktKey)
    const erledigt = !bisher?.erledigt
    setStand(current => new Map(current).set(punktKey, { ...(bisher ?? { id: '', incident_id: incidentId, checkliste, punkt_key: punktKey, wer: null, erledigt_at: null, erledigt_von: null, updated_at: '' }), erledigt }))
    await setChecklistPunktErledigt(incidentId, checkliste, punktKey, erledigt, bisher?.wer ?? '', profile.id)
  }

  async function changeWer(punktKey: string, wer: string) {
    const bisher = stand.get(punktKey)
    setStand(current => new Map(current).set(punktKey, { ...(bisher ?? { id: '', incident_id: incidentId, checkliste, punkt_key: punktKey, erledigt: false, erledigt_at: null, erledigt_von: null, updated_at: '' }), wer }))
    await setChecklistPunktWer(incidentId, checkliste, punktKey, wer)
  }

  const erledigtCount = punkte.filter(punkt => stand.get(punkt.key)?.erledigt).length
  return <div>
    <p className="text-xs text-gray-500 mb-1.5">{erledigtCount} / {punkte.length} erledigt</p>
    <ul className="space-y-0.5">{punkte.map(punkt => <ChecklistZeile key={punkt.key} punkt={punkt} stand={stand.get(punkt.key)} canOperate={canOperate} onToggle={() => void toggle(punkt.key)} onWerChange={wer => void changeWer(punkt.key, wer)} />)}</ul>
  </div>
}

export default function EinsatzChecklisten({ incidentId, canOperate }: { incidentId: string; canOperate: boolean }) {
  const [notunterkunftOffen, setNotunterkunftOffen] = useState(false)
  return <div className="space-y-5">
    <div>
      <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-2">Checkliste Erstmeldung</h3>
      <ChecklistAbschnitt incidentId={incidentId} checkliste="erstmeldung" punkte={ERSTMELDUNG_CHECKLISTE} canOperate={canOperate} />
    </div>
    <div className="border-t border-gray-200 pt-3">
      <button type="button" onClick={() => setNotunterkunftOffen(current => !current)} className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-2">
        Checkliste Notunterkunft {notunterkunftOffen ? '▾' : '▸'}
      </button>
      {notunterkunftOffen ? <ChecklistAbschnitt incidentId={incidentId} checkliste="notunterkunft" punkte={NOTUNTERKUNFT_CHECKLISTE} canOperate={canOperate} /> : null}
    </div>
  </div>
}
