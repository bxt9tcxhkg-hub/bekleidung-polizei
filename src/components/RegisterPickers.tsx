import { useEffect, useState, type FocusEvent } from 'react'
import { supabase } from '../lib/supabase'
import { composeObjectAddress, objectLabel, personDisplayName, personLabel } from '../lib/register'
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
    const result = await supabase.from('operational_persons').insert({ vorname: vorname.trim() || null, nachname: nachname.trim() || null, birth_date: birthDate || null, created_by: createdBy }).select('*').single()
    if (result.error || !result.data) { setSaving(false); setError('Person konnte nicht angelegt werden.'); return }
    // Telefonnummer lebt im gemeinsamen, verknüpfbaren Register statt als
    // eigenes Feld bei der Person (siehe ZentralePersonen.tsx).
    if (phone.trim()) {
      const today = new Date()
      const erhobenAm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      await supabase.from('operational_phone_numbers').insert({ person_id: result.data.id, number: phone.trim(), erhoben_am: erhobenAm, created_by: createdBy })
    }
    setSaving(false)
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

function normalizePhoneDigits(value: string) { return value.replace(/\D/g, '') }

/**
 * Wie PersonPicker, aber ohne separaten "Neue Person anlegen"-Klick: Vor-
 * und Nachname werden direkt als Textfelder eingegeben, während getippt
 * wird erscheinen passende bestehende Personen als Vorschlag (und, sofern
 * phone übergeben ist, auch Personen mit passender Telefonnummer - z. B.
 * die TEL-Nr. des Melders). Wählt man keinen Vorschlag, wird beim Verlassen
 * der Felder automatisch geprüft, ob eine Person mit exakt diesem Namen
 * bereits existiert (dann wird sie verknüpft) oder ob eine neue Person
 * angelegt werden muss (dann geschieht das automatisch, ohne weiteren Klick).
 */
export function PersonNameAutocomplete({ persons, value, onChange, createdBy, onCreated, label = 'Person', required = false, phone }: {
  persons: OperationalPerson[]
  value: string | null
  onChange: (id: string | null) => void
  createdBy: string | null
  onCreated: (person: OperationalPerson) => void
  label?: string
  required?: boolean
  /** Aktuell eingegebene Telefonnummer (z. B. TEL-Nr. des Melders) - liefert zusätzliche Vorschläge nach Nummer und wird bei einer neu angelegten Person übernommen. */
  phone?: string
}) {
  const selected = persons.find(person => person.id === value) ?? null
  const [vorname, setVorname] = useState(selected?.vorname ?? '')
  const [nachname, setNachname] = useState(selected?.nachname ?? '')
  const [open, setOpen] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState('')

  // Wird von außen eine bestehende Person zugewiesen (z. B. Formular mit
  // vorhandenem Melder geöffnet), Felder synchron halten. Ein Wechsel auf
  // null (z. B. weil editName() selbst gerade onChange(null) ausgelöst hat)
  // wird hier bewusst NICHT übernommen - sonst würde das lokale Tippen im
  // jeweils anderen Feld (Vorname/Nachname) durch diesen Effekt überschrieben.
  useEffect(() => {
    if (value === null) return
    const person = persons.find(item => item.id === value)
    if (person) { setVorname(person.vorname ?? ''); setNachname(person.nachname ?? '') }
  }, [value, persons])

  const vornameQuery = vorname.trim().toLowerCase()
  const nachnameQuery = nachname.trim().toLowerCase()
  const phoneDigits = normalizePhoneDigits(phone ?? '')
  const suggestions = value ? [] : (vornameQuery || nachnameQuery
    ? persons.filter(person =>
        (vornameQuery && (person.vorname ?? '').toLowerCase().includes(vornameQuery))
        || (nachnameQuery && (person.nachname ?? '').toLowerCase().includes(nachnameQuery)),
      ).slice(0, 8)
    : (phoneDigits.length >= 4 ? persons.filter(person => person.phone && normalizePhoneDigits(person.phone) === phoneDigits).slice(0, 5) : []))

  function selectPerson(person: OperationalPerson) {
    setVorname(person.vorname ?? ''); setNachname(person.nachname ?? ''); onChange(person.id); setOpen(false); setError('')
  }
  function editName(nextVorname: string, nextNachname: string) {
    if (value) onChange(null)
    setVorname(nextVorname); setNachname(nextNachname); setOpen(true)
  }
  function resolve() {
    // Kurze Verzögerung, damit ein Klick auf einen Vorschlag (onMouseDown)
    // zuerst greift - sonst schließt das onBlur die Liste vorher.
    setTimeout(() => { void (async () => {
      setOpen(false)
      if (value) return
      if (!vorname.trim() && !nachname.trim()) return
      const exact = persons.find(person => (person.vorname ?? '').toLowerCase() === vorname.trim().toLowerCase() && (person.nachname ?? '').toLowerCase() === nachname.trim().toLowerCase())
      if (exact) { selectPerson(exact); return }
      setResolving(true)
      const result = await supabase.from('operational_persons').insert({ vorname: vorname.trim() || null, nachname: nachname.trim() || null, created_by: createdBy }).select('*').single()
      if (result.error || !result.data) { setResolving(false); setError('Person konnte nicht angelegt werden.'); return }
      if (phone?.trim()) {
        const today = new Date()
        const erhobenAm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        await supabase.from('operational_phone_numbers').insert({ person_id: result.data.id, number: phone.trim(), erhoben_am: erhobenAm, created_by: createdBy })
      }
      setResolving(false)
      onCreated(result.data as OperationalPerson)
      onChange(result.data.id)
    })() }, 150)
  }

  // Container-weites onBlur statt je Feld: sonst löst resolve() schon beim
  // Wechsel von Vorname zu Nachname aus (Fokus verlässt nur das erste Feld,
  // nicht das ganze Widget) und legt verfrüht eine Person mit fehlendem
  // Nachnamen an. relatedTarget zeigt das Element, das den Fokus erhält -
  // liegt es noch innerhalb dieses Containers, war es nur ein Feldwechsel.
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    resolve()
  }

  return <div className="relative" onBlur={handleBlur}>
    <p className="block text-xs font-medium text-gray-600 mb-1">{label}{required ? ' *' : ''}</p>
    <div className="grid grid-cols-2 gap-2">
      <input className={inputClass} placeholder="Vorname" value={vorname} onChange={event => editName(event.target.value, nachname)} onFocus={() => setOpen(true)} />
      <input className={inputClass} placeholder="Nachname" value={nachname} onChange={event => editName(vorname, event.target.value)} onFocus={() => setOpen(true)} />
    </div>
    {value ? <p className="text-xs text-green-700 mt-1">✓ {personDisplayName(selected)} - bestehende Person verknüpft</p> : resolving ? <p className="text-xs text-gray-500 mt-1">Wird geprüft…</p> : null}
    {error ? <p className="text-xs text-red-700 mt-1">{error}</p> : null}
    {open && suggestions.length > 0 ? <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
      {suggestions.map(person => <button key={person.id} type="button" onMouseDown={event => event.preventDefault()} onClick={() => selectPerson(person)} className="block w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
        {personLabel(person)}{person.phone ? <span className="text-gray-400"> · {person.phone}</span> : null}
      </button>)}
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
  const [strasse, setStrasse] = useState('')
  const [hausnummer, setHausnummer] = useState('')
  const [plz, setPlz] = useState('')
  const [ort, setOrt] = useState('')
  const [objLabel, setObjLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    const address = composeObjectAddress({ strasse, hausnummer, plz, ort })
    if (!address) { setError('Bitte Straße, PLZ und Ort eingeben.'); return }
    setSaving(true)
    const result = await supabase.from('operational_objects').insert({
      address, strasse: strasse.trim(), hausnummer: hausnummer.trim() || null, plz: plz.trim(), ort: ort.trim(),
      label: objLabel.trim() || null, created_by: createdBy,
    }).select('*').single()
    setSaving(false)
    if (result.error || !result.data) { setError('Objekt konnte nicht angelegt werden.'); return }
    onCreated(result.data as OperationalObject)
    onChange(result.data.id)
    setShowCreate(false); setStrasse(''); setHausnummer(''); setPlz(''); setOrt(''); setObjLabel(''); setError('')
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
      <div className="grid grid-cols-3 gap-2">
        <input className={`${inputClass} col-span-2`} placeholder="Straße *" value={strasse} onChange={event => setStrasse(event.target.value)} />
        <input className={inputClass} placeholder="Hausnr." value={hausnummer} onChange={event => setHausnummer(event.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input className={inputClass} placeholder="PLZ *" value={plz} onChange={event => setPlz(event.target.value)} />
        <input className={`${inputClass} col-span-2`} placeholder="Ort *" value={ort} onChange={event => setOrt(event.target.value)} />
      </div>
      <input className={inputClass} placeholder="Bezeichnung (optional, z. B. Name des Gebäudes)" value={objLabel} onChange={event => setObjLabel(event.target.value)} />
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => { setShowCreate(false); setError('') }} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg">Abbrechen</button>
        <button type="button" disabled={saving} onClick={() => void create()} className="text-xs px-3 py-1.5 bg-blue-800 hover:bg-blue-900 text-white rounded-lg disabled:opacity-60">{saving ? 'Anlegen…' : 'Anlegen'}</button>
      </div>
    </div> : null}
  </div>
}
