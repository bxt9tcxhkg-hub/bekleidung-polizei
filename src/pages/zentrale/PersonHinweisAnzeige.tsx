import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Actions, Area, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import { createPersonNote, PERSON_NOTE_CATEGORIES } from '../../lib/personenhinweise'
import { PERSON_NOTE_LABEL } from '../../lib/zentraleShared'
import type { OperationalPersonNote, OperationalPersonNoteCategory } from '../../lib/types'

const emptyForm = { location: '', category: 'aggressiv' as OperationalPersonNoteCategory, description: '', guidance: '', source: '', validUntil: '' }

function PersonHinweisModal({ personName, createdBy, close, save }: {
  personName: string
  createdBy: string | null
  close: () => void
  save: (input: typeof emptyForm) => Promise<void>
}) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const patch = (values: Partial<typeof form>) => setForm(current => ({ ...current, ...values }))
  async function onSave() {
    if (!createdBy || !form.description.trim()) { setError('Bitte einen sachlichen Hinweis eingeben.'); return }
    setSaving(true)
    try {
      await save(form)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Der Personenhinweis konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }
  return <Modal title={`Personenhinweis: ${personName}`} close={close}>
    <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">Nur erforderliche, sachliche und überprüfbare Informationen erfassen. Bei Infektionsrisiken möglichst den notwendigen Schutz statt einer Diagnose beschreiben.</div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Adresse (optional)" value={form.location} onChange={value => patch({ location: value })} />
      <label className="text-xs font-medium text-gray-600">Art<select className={inputClass} value={form.category} onChange={event => patch({ category: event.target.value as OperationalPersonNoteCategory })}>
        {PERSON_NOTE_CATEGORIES.map(value => <option key={value} value={value}>{PERSON_NOTE_LABEL[value]}</option>)}
      </select></label>
    </div>
    <Area label="Sachlicher Hinweis *" value={form.description} onChange={value => patch({ description: value })} />
    <Area label="Konkreter Handlungshinweis" value={form.guidance} onChange={value => patch({ guidance: value })} />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Grundlage / Referenz" value={form.source} onChange={value => patch({ source: value })} />
      <Field label="Gültig bis" type="date" value={form.validUntil} onChange={value => patch({ validUntil: value })} />
    </div>
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
    {notes.map(item => <p key={item.id} className="flex items-start gap-1.5 text-xs font-semibold text-red-800 bg-red-50 border border-red-200 rounded-lg px-2 py-1 mt-1">
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      <span><span className="font-bold">{PERSON_NOTE_LABEL[item.category]}:</span> {item.note}{item.action_guidance ? <span className="block font-normal mt-0.5">{item.action_guidance}</span> : null}</span>
    </p>)}
    {canOperate ? <button type="button" onClick={() => setShowForm(true)} className="text-xs font-medium text-gray-500 hover:text-red-700 mt-1">+ Personenhinweis erfassen</button> : null}
    {showForm ? <PersonHinweisModal personName={personName} createdBy={createdBy} close={() => setShowForm(false)} save={async form => {
      await createPersonNote({ personId, ...form, createdBy: createdBy ?? '' })
      setShowForm(false)
      onChanged()
    }} /> : null}
  </div>
}
