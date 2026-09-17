import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Actions, ErrorMessage, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import { createPersonNote, PERSON_NOTE_CATEGORIES } from '../../lib/personenhinweise'
import { PERSON_NOTE_LABEL } from '../../lib/zentraleShared'
import type { OperationalPersonNote, OperationalPersonNoteCategory } from '../../lib/types'

/** Personenhinweis reduziert sich auf die Art - kein Freitext-Formular. */
function PersonHinweisModal({ personName, close, save }: {
  personName: string
  close: () => void
  save: (category: OperationalPersonNoteCategory) => Promise<void>
}) {
  const [category, setCategory] = useState<OperationalPersonNoteCategory>('aggressiv')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function onSave() {
    setSaving(true)
    try {
      await save(category)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Der Personenhinweis konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }
  return <Modal title={`Personenhinweis: ${personName}`} close={close}>
    <label className="text-xs font-medium text-gray-600">Art<select className={inputClass} value={category} onChange={event => setCategory(event.target.value as OperationalPersonNoteCategory)}>
      {PERSON_NOTE_CATEGORIES.map(value => <option key={value} value={value}>{PERSON_NOTE_LABEL[value]}</option>)}
    </select></label>
    {error ? <ErrorMessage text={error} /> : null}
    <Actions saving={saving} close={close} save={onSave} />
  </Modal>
}

/** Einsatzrelevante Personenhinweise zu einer Person - überall dort eingeblendet, wo die Person erfasst wird (Einsatz-Parteien, AV/BV Gefährder/geschützte Person), unabhängig vom jeweiligen Einsatz. */
export function PersonHinweisAnzeige({ personId, personName, notes, createdBy, canOperate, onChanged }: {
  personId: string
  personName: string
  notes: OperationalPersonNote[]
  createdBy: string | null
  canOperate: boolean
  onChanged: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  return <div className="mt-1">
    {notes.map(item => <p key={item.id} className="flex items-center gap-1.5 text-xs font-semibold text-red-800 bg-red-50 border border-red-200 rounded-lg px-2 py-1 mt-1">
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {PERSON_NOTE_LABEL[item.category]}
    </p>)}
    {canOperate ? <button type="button" onClick={() => setShowForm(true)} className="text-xs font-medium text-gray-500 hover:text-red-700 mt-1">+ Personenhinweis erfassen</button> : null}
    {showForm && createdBy ? <PersonHinweisModal personName={personName} close={() => setShowForm(false)} save={async category => {
      await createPersonNote({ personId, category, location: '', description: PERSON_NOTE_LABEL[category], guidance: '', source: '', validUntil: '', createdBy })
      setShowForm(false)
      onChanged()
    }} /> : null}
  </div>
}
