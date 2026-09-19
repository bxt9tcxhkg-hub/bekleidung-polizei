import { useEffect, useState, type FocusEvent } from 'react'
import { supabase } from '../lib/supabase'
import { composeObjectAddress, findSimilarPersons, objectLabel, personDisplayName, personLabel } from '../lib/register'
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
  const similar = findSimilarPersons(persons, vorname, nachname)

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
      {similar.length > 0 ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
        <p className="text-xs font-semibold text-amber-800">Ähnliche Person(en) bereits vorhanden - ist es eine davon?</p>
        <div className="mt-1 space-y-1">{similar.map(person => <button key={person.id} type="button" onClick={() => { onChange(person.id); setShowCreate(false); setVorname(''); setNachname(''); setBirthDate(''); setPhone(''); setError('') }} className="block w-full text-left text-xs text-amber-900 hover:underline">{personLabel(person)}</button>)}</div>
      </div> : null}
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
export function PersonNameAutocomplete({ persons, value, onChange, createdBy, onCreated, label = 'Person', required = false, phone, includeBirthDate = false }: {
  persons: OperationalPerson[]
  value: string | null
  onChange: (id: string | null) => void
  createdBy: string | null
  onCreated: (person: OperationalPerson) => void
  label?: string
  required?: boolean
  /** Aktuell eingegebene Telefonnummer (z. B. TEL-Nr. des Melders) - liefert zusätzliche Vorschläge nach Nummer und wird bei einer neu angelegten Person übernommen. */
  phone?: string
  /**
   * Geburtsdatum-Feld zusätzlich anzeigen und für den Abgleich/die
   * automatische Neuanlage heranziehen - Namensgleichheit allein reicht
   * nicht zur Unterscheidung, wenn mehrere Personen denselben Namen tragen
   * (z. B. Gefährder/geschützte Person eines Schutzfalls). Ohne dieses Flag
   * unverändertes Verhalten (z. B. Melder in IncidentModal).
   */
  includeBirthDate?: boolean
}) {
  const selected = persons.find(person => person.id === value) ?? null
  const [vorname, setVorname] = useState(selected?.vorname ?? '')
  const [nachname, setNachname] = useState(selected?.nachname ?? '')
  const [birthDate, setBirthDate] = useState(selected?.birth_date ?? '')
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
    if (person) { setVorname(person.vorname ?? ''); setNachname(person.nachname ?? ''); setBirthDate(person.birth_date ?? '') }
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
    setVorname(person.vorname ?? ''); setNachname(person.nachname ?? ''); setBirthDate(person.birth_date ?? ''); onChange(person.id); setOpen(false); setError('')
  }
  function editName(nextVorname: string, nextNachname: string) {
    if (value) onChange(null)
    setVorname(nextVorname); setNachname(nextNachname); setOpen(true)
  }
  function editBirthDate(next: string) {
    if (value) onChange(null)
    setBirthDate(next)
  }
  async function createPerson() {
    if (includeBirthDate && !birthDate.trim()) { setError('Bitte Geburtsdatum eingeben.'); return }
    setOpen(false); setResolving(true)
    const result = await supabase.from('operational_persons').insert({ vorname: vorname.trim() || null, nachname: nachname.trim() || null, birth_date: birthDate.trim() || null, created_by: createdBy }).select('*').single()
    if (result.error || !result.data) { setResolving(false); setError('Person konnte nicht angelegt werden.'); return }
    if (phone?.trim()) {
      const today = new Date()
      const erhobenAm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      await supabase.from('operational_phone_numbers').insert({ person_id: result.data.id, number: phone.trim(), erhoben_am: erhobenAm, created_by: createdBy })
    }
    setResolving(false)
    onCreated(result.data as OperationalPerson)
    onChange(result.data.id)
  }
  function resolve() {
    // Kurze Verzögerung, damit ein Klick auf einen Vorschlag (onMouseDown)
    // zuerst greift - sonst schließt das onBlur die Liste vorher.
    setTimeout(() => { void (async () => {
      if (value) { setOpen(false); return }
      if (!vorname.trim() && !nachname.trim()) { setOpen(false); return }
      // Bei includeBirthDate zählt nur ein Treffer mit exakt gleichem
      // Geburtsdatum als dieselbe Person - Namensgleichheit allein würde bei
      // Namensvettern die falsche Person verknüpfen.
      const exact = persons.find(person => (person.vorname ?? '').toLowerCase() === vorname.trim().toLowerCase() && (person.nachname ?? '').toLowerCase() === nachname.trim().toLowerCase() && (!includeBirthDate || (person.birth_date ?? '') === birthDate.trim()))
      if (exact) { selectPerson(exact); return }
      // Ähnliche Namen vorhanden, aber keine exakte Übereinstimmung: nicht
      // stillschweigend anlegen, sondern die Vorschlagsliste offen lassen -
      // "+ Neue Person anlegen" muss dort bewusst angeklickt werden.
      if (suggestions.length > 0) return
      await createPerson()
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
    <div className={includeBirthDate ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'}>
      <input className={inputClass} placeholder="Vorname" value={vorname} onChange={event => editName(event.target.value, nachname)} onFocus={() => setOpen(true)} />
      <input className={inputClass} placeholder="Nachname" value={nachname} onChange={event => editName(vorname, event.target.value)} onFocus={() => setOpen(true)} />
      {includeBirthDate ? <input type="date" className={inputClass} value={birthDate} onChange={event => editBirthDate(event.target.value)} onFocus={() => setOpen(true)} /> : null}
    </div>
    {value ? <p className="text-xs text-green-700 mt-1">✓ {personDisplayName(selected)} - bestehende Person verknüpft</p> : resolving ? <p className="text-xs text-gray-500 mt-1">Wird geprüft…</p> : null}
    {error ? <p className="text-xs text-red-700 mt-1">{error}</p> : null}
    {open && suggestions.length > 0 ? <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
      <p className="px-3 pt-2 text-xs text-gray-500">Ähnliche(r) Name(n) gefunden - eine davon, oder als neue Person anlegen?</p>
      {suggestions.map(person => <button key={person.id} type="button" onMouseDown={event => event.preventDefault()} onClick={() => selectPerson(person)} className="block w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
        {personLabel(person)}{person.phone ? <span className="text-gray-400"> · {person.phone}</span> : null}
      </button>)}
      {vorname.trim() || nachname.trim() ? <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => void createPerson()} className="block w-full text-left px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 border-t border-gray-100">+ „{[vorname, nachname].filter(Boolean).join(' ')}“ als neue Person anlegen</button> : null}
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

/**
 * Wie PersonNameAutocomplete, aber für das Objekt-Register: eine
 * Adresssuche statt einer Liste aller je erfassten Objekte. Tippen filtert
 * passende bestehende Objekte; kein Treffer gewünscht -> "+ Neues Objekt
 * anlegen" öffnet dieselben Adressfelder wie ObjectPicker.
 */
export function ObjectAddressAutocomplete({ objects, value, onChange, createdBy, onCreated, label = 'Objekt / Adresse', required = false }: {
  objects: OperationalObject[]
  value: string | null
  onChange: (id: string | null) => void
  createdBy: string | null
  onCreated: (object: OperationalObject) => void
  label?: string
  required?: boolean
}) {
  const selected = objects.find(object => object.id === value) ?? null
  const [query, setQuery] = useState(selected ? objectLabel(selected) : '')
  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [strasse, setStrasse] = useState('')
  const [hausnummer, setHausnummer] = useState('')
  const [plz, setPlz] = useState('')
  const [ort, setOrt] = useState('')
  const [objLabel2, setObjLabel2] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (value === null) return
    const object = objects.find(item => item.id === value)
    if (object) setQuery(objectLabel(object))
  }, [value, objects])

  const q = query.trim().toLowerCase()
  const suggestions = value || q.length < 2 ? [] : objects.filter(object => objectLabel(object).toLowerCase().includes(q)).slice(0, 8)

  function selectObject(object: OperationalObject) {
    setQuery(objectLabel(object)); onChange(object.id); setOpen(false); setError('')
  }
  function editQuery(next: string) {
    if (value) onChange(null)
    setQuery(next); setOpen(true)
  }
  async function create() {
    const address = composeObjectAddress({ strasse, hausnummer, plz, ort })
    if (!address) { setError('Bitte Straße, PLZ und Ort eingeben.'); return }
    setSaving(true)
    const result = await supabase.from('operational_objects').insert({
      address, strasse: strasse.trim(), hausnummer: hausnummer.trim() || null, plz: plz.trim(), ort: ort.trim(),
      label: objLabel2.trim() || null, created_by: createdBy,
    }).select('*').single()
    setSaving(false)
    if (result.error || !result.data) { setError('Objekt konnte nicht angelegt werden.'); return }
    const created = result.data as OperationalObject
    onCreated(created)
    onChange(created.id)
    setQuery(objectLabel(created))
    setShowCreate(false); setStrasse(''); setHausnummer(''); setPlz(''); setOrt(''); setObjLabel2(''); setError(''); setOpen(false)
  }
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setOpen(false)
  }

  return <div className="relative" onBlur={handleBlur}>
    <label className="block text-xs font-medium text-gray-600">{label}{required ? ' *' : ''}
      <input className={inputClass} placeholder="Adresse suchen…" value={query} onChange={event => editQuery(event.target.value)} onFocus={() => setOpen(true)} />
    </label>
    {value ? <p className="text-xs text-green-700 mt-1">✓ Mit bestehendem Objekt verknüpft <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { onChange(null); setQuery('') }} className="text-gray-500 hover:underline">Entfernen</button></p> : null}
    {open && (suggestions.length > 0 || q.length >= 2) ? <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
      {suggestions.length > 0 ? <><p className="px-3 pt-2 text-xs text-gray-500">Passendes Objekt gefunden - eines davon verknüpfen?</p>
        {suggestions.map(object => <button key={object.id} type="button" onMouseDown={event => event.preventDefault()} onClick={() => selectObject(object)} className="block w-full text-left px-3 py-2 text-sm hover:bg-blue-50">{objectLabel(object)}</button>)}
      </> : null}
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { setShowCreate(true); setOpen(false) }} className="block w-full text-left px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 border-t border-gray-100">+ Neues Objekt anlegen…</button>
    </div> : null}
    {showCreate ? <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <input className={`${inputClass} col-span-2`} placeholder="Straße *" value={strasse} onChange={event => setStrasse(event.target.value)} />
        <input className={inputClass} placeholder="Hausnr." value={hausnummer} onChange={event => setHausnummer(event.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input className={inputClass} placeholder="PLZ *" value={plz} onChange={event => setPlz(event.target.value)} />
        <input className={`${inputClass} col-span-2`} placeholder="Ort *" value={ort} onChange={event => setOrt(event.target.value)} />
      </div>
      <input className={inputClass} placeholder="Bezeichnung (optional, z. B. Name des Gebäudes)" value={objLabel2} onChange={event => setObjLabel2(event.target.value)} />
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => { setShowCreate(false); setError('') }} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg">Abbrechen</button>
        <button type="button" disabled={saving} onClick={() => void create()} className="text-xs px-3 py-1.5 bg-blue-800 hover:bg-blue-900 text-white rounded-lg disabled:opacity-60">{saving ? 'Anlegen…' : 'Anlegen'}</button>
      </div>
    </div> : null}
  </div>
}
