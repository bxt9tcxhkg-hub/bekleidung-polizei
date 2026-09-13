import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { objectLabel, personLabel } from '../lib/register'
import type { OperationalObject, OperationalPerson } from '../lib/types'
import { inputClass } from './ZentraleEntryEditor'

// Auswahlkomponenten für das Personen- und Objekte-Register
// (operational_persons/operational_objects), damit AV/BV & EV, Fahndungen,
// Schlüssel, Kontakte, Personenhinweise und RSa/RSb auf dieselben
// Personen/Objekte verweisen können, statt Namen/Adressen je Kategorie
// separat als Freitext zu erfassen. Lade-Hooks + reine Hilfsfunktionen
// stehen in ../lib/register.ts.

const NEW_OPTION = '__neu__'

export function PersonPicker({ persons, value, onChange, createdBy, onCreated, label = 'Person', required = false }: {
  persons: OperationalPerson[]
  value: string | null
  onChange: (id: string | null) => void
  createdBy: string | null
  onCreated: (person: OperationalPerson) => void
  label?: string
  required?: boolean
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    // Am Telefon ist oft zunächst nur Vor- oder Nachname bekannt - beide
    // einzeln optional, aber mindestens eines muss angegeben werden.
    if (!vorname.trim() && !nachname.trim()) { setError('Bitte Vor- oder Nachname eingeben.'); return }
    setSaving(true)
    const result = await supabase.from('operational_persons').insert({ vorname: vorname.trim() || null, nachname: nachname.trim() || null, birth_date: birthDate || null, phone: phone.trim() || null, created_by: createdBy }).select('*').single()
    setSaving(false)
    if (result.error || !result.data) { setError('Person konnte nicht angelegt werden.'); return }
    onCreated(result.data as OperationalPerson)
    onChange(result.data.id)
    setShowCreate(false); setVorname(''); setNachname(''); setBirthDate(''); setPhone(''); setError('')
  }

  return <div>
    <label className="block text-xs font-medium text-gray-600">{label}{required ? ' *' : ''}
      <select className={inputClass} value={value ?? ''} onChange={event => { if (event.target.value === NEW_OPTION) { setShowCreate(true); return } onChange(event.target.value || null) }}>
        <option value="">– keine Auswahl –</option>
        {persons.map(person => <option key={person.id} value={person.id}>{personLabel(person)}</option>)}
        <option value={NEW_OPTION}>+ Neue Person anlegen…</option>
      </select>
    </label>
    {showCreate ? <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input className={inputClass} placeholder="Vorname" value={vorname} onChange={event => setVorname(event.target.value)} />
        <input className={inputClass} placeholder="Nachname" value={nachname} onChange={event => setNachname(event.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input type="date" className={inputClass} value={birthDate} onChange={event => setBirthDate(event.target.value)} />
        <input className={inputClass} placeholder="Telefon" value={phone} onChange={event => setPhone(event.target.value)} />
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => { setShowCreate(false); setError('') }} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg">Abbrechen</button>
        <button type="button" disabled={saving} onClick={() => void create()} className="text-xs px-3 py-1.5 bg-blue-800 hover:bg-blue-900 text-white rounded-lg disabled:opacity-60">{saving ? 'Anlegen…' : 'Anlegen'}</button>
      </div>
    </div> : null}
  </div>
}

export function ObjectPicker({ objects, value, onChange, createdBy, onCreated, label = 'Objekt / Adresse', required = false }: {
  objects: OperationalObject[]
  value: string | null
  onChange: (id: string | null) => void
  createdBy: string | null
  onCreated: (object: OperationalObject) => void
  label?: string
  required?: boolean
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [address, setAddress] = useState('')
  const [objLabel, setObjLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    if (!address.trim()) { setError('Bitte eine Adresse eingeben.'); return }
    setSaving(true)
    const result = await supabase.from('operational_objects').insert({ address: address.trim(), label: objLabel.trim() || null, created_by: createdBy }).select('*').single()
    setSaving(false)
    if (result.error || !result.data) { setError('Objekt konnte nicht angelegt werden.'); return }
    onCreated(result.data as OperationalObject)
    onChange(result.data.id)
    setShowCreate(false); setAddress(''); setObjLabel(''); setError('')
  }

  return <div>
    <label className="block text-xs font-medium text-gray-600">{label}{required ? ' *' : ''}
      <select className={inputClass} value={value ?? ''} onChange={event => { if (event.target.value === NEW_OPTION) { setShowCreate(true); return } onChange(event.target.value || null) }}>
        <option value="">– keine Auswahl –</option>
        {objects.map(object => <option key={object.id} value={object.id}>{objectLabel(object)}</option>)}
        <option value={NEW_OPTION}>+ Neues Objekt anlegen…</option>
      </select>
    </label>
    {showCreate ? <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <input className={inputClass} placeholder="Adresse *" value={address} onChange={event => setAddress(event.target.value)} />
      <input className={inputClass} placeholder="Bezeichnung (optional, z. B. Name des Gebäudes)" value={objLabel} onChange={event => setObjLabel(event.target.value)} />
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => { setShowCreate(false); setError('') }} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg">Abbrechen</button>
        <button type="button" disabled={saving} onClick={() => void create()} className="text-xs px-3 py-1.5 bg-blue-800 hover:bg-blue-900 text-white rounded-lg disabled:opacity-60">{saving ? 'Anlegen…' : 'Anlegen'}</button>
      </div>
    </div> : null}
  </div>
}
