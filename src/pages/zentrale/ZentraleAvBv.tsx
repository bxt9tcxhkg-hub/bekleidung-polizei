import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, MapPin, Pencil, Plus, X } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import LeafletMap from '../../components/LeafletMap'
import { PersonPicker } from '../../components/RegisterPickers'
import { logAudit } from '../../lib/audit'
import { geocodeLocation } from '../../lib/geocode'
import { findSimilarObjects, objectLabel, personDisplayName, useObjects, usePersons } from '../../lib/register'
import { defaultBvAvEnd, firstControlDeadline, hasInitialControl, localDateTimeInput, MASSNAHME_LABEL, SCHUTZ_SELECT, type EvRechtsgrundlage, type Schutzfall, type SchutzfallStatus, type Schutzmassnahme } from '../../lib/schutzmassnahmen'
import { supabase } from '../../lib/supabase'
import { Area, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'

type AreaForm = { key: string; objectId: string; label: string; lat: number | null; lng: number | null; radius: number; confirmed: boolean }
type FormState = {
  massnahme: Schutzmassnahme
  rechtsgrundlage: EvRechtsgrundlage
  gefaehrderId: string
  geschuetzteIds: string[]
  pad: string
  externeAkte: string
  stelle: string
  beginn: string
  ende: string
  status: SchutzfallStatus
  waffenverbot: boolean
  schluesselStatus: Schutzfall['schluessel_status']
  verwahrort: string
  ausnahmen: string
  hinweise: string
}

function newArea(): AreaForm { return { key: crypto.randomUUID(), objectId: '', label: '', lat: null, lng: null, radius: 100, confirmed: false } }
function emptyForm(): FormState {
  const begin = localDateTimeInput()
  return { massnahme: 'bv_av', rechtsgrundlage: '382b', gefaehrderId: '', geschuetzteIds: [], pad: '', externeAkte: '', stelle: '', beginn: begin, ende: defaultBvAvEnd(begin), status: 'aktiv', waffenverbot: true, schluesselStatus: 'nicht_erfasst', verwahrort: '', ausnahmen: '', hinweise: '' }
}

export default function ZentraleAvBvPage() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive, isZentralistOnDuty } = useAuth()
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManage = isStrictAdmin || isGenehmiger || (operativeModeActive && roles.some(role => ['sachbearbeiter', 'admin'].includes(role)))
  const canOperate = canManage || isZentralistOnDuty
  const { persons, setPersons } = usePersons()
  const { objects, setObjects, loading: objectsLoading } = useObjects()
  const [items, setItems] = useState<Schutzfall[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Schutzfall | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [areas, setAreas] = useState<AreaForm[]>([newArea()])
  const [locatingKey, setLocatingKey] = useState<string | null>(null)
  const [now] = useState(() => new Date().getTime())
  const [searchParams, setSearchParams] = useSearchParams()

  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('schutzfaelle').select(SCHUTZ_SELECT).order('status').order('ende')
    setLoading(false)
    if (result.error) { setError('Die Schutzmaßnahmen konnten nicht geladen werden.'); return }
    setError(''); setItems((result.data ?? []) as unknown as Schutzfall[])
  }, [])
  useEffect(() => { void load() }, [load])

  const mapCircles = useMemo(() => items.filter(item => item.status === 'aktiv' && new Date(item.ende).getTime() > now).flatMap(item => (item.bereiche ?? []).map(area => ({
    lat: area.lat, lng: area.lng, radiusMeters: area.radius_m,
    popup: `${MASSNAHME_LABEL[item.massnahme]} · ${area.bezeichnung} · PAD ${item.pad_aktenzahl}`,
    color: item.massnahme === 'bv_av' ? '#dc2626' : '#7c3aed',
    fillColor: item.massnahme === 'bv_av' ? '#ef4444' : '#8b5cf6',
  }))), [items, now])

  // Vormerkung aus der Parteien-Erfassung eines Einsatzes: Person(en) direkt
  // als Gefährder bzw. geschützte Person(en) in ein neues Schutzfall-Formular
  // übernehmen, gebündelt in einem Zug (nicht mehr einzeln, sonst geht die
  // jeweils andere Auswahl beim erneuten Öffnen verloren). Der Einsatzort
  // wird dabei wie eine Person behandelt: erst im Objekt-Register nach einer
  // passenden Adresse suchen (z. B. schon über einen Schlüssel angelegt) und
  // verknüpfen, sonst den Einsatzort selbst als neues Objekt anlegen - damit
  // ist der Schutzbereich ein echtes, wiederverwendbares Objekt statt nur
  // loser Text/Koordinaten.
  useEffect(() => {
    const gefaehrderId = searchParams.get('gefaehrderId')
    const geschuetzteIds = searchParams.getAll('geschuetztePersonId')
    if ((!gefaehrderId && geschuetzteIds.length === 0) || !canOperate) return
    // Solange das Objekt-Register noch lädt, nicht schon vorschnell ein
    // (mögliches Duplikat-)Objekt anlegen - auf den fertig geladenen Stand warten.
    if (objectsLoading) return
    const ort = searchParams.get('ort')
    const lat = Number(searchParams.get('lat'))
    const lng = Number(searchParams.get('lng'))
    setSearchParams({}, { replace: true })
    void (async () => {
      setEditing(null)
      setForm({ ...emptyForm(), gefaehrderId: gefaehrderId ?? '', geschuetzteIds })
      if (!ort || !Number.isFinite(lat) || !Number.isFinite(lng)) { setAreas([newArea()]); setShowForm(true); setError(''); return }
      const match = findSimilarObjects(objects, ort)[0]
      if (match) {
        setAreas([{ ...newArea(), objectId: match.id, label: objectLabel(match), lat, lng, confirmed: true }])
      } else if (profile?.id) {
        const created = await supabase.from('operational_objects').insert({ address: ort, created_by: profile.id }).select('*').single()
        if (created.data) {
          setObjects(current => [...current, created.data as typeof objects[number]].sort((a, b) => a.address.localeCompare(b.address, 'de-AT')))
          setAreas([{ ...newArea(), objectId: created.data.id, label: objectLabel(created.data), lat, lng, confirmed: true }])
        } else {
          setAreas([{ ...newArea(), label: ort, lat, lng, confirmed: true }])
        }
      } else {
        setAreas([{ ...newArea(), label: ort, lat, lng, confirmed: true }])
      }
      setShowForm(true); setError('')
    })()
  }, [searchParams, canOperate, objectsLoading])

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  function chooseMeasure(massnahme: Schutzmassnahme) {
    setForm(current => {
      const next = { ...current, massnahme, waffenverbot: massnahme === 'bv_av' ? true : current.waffenverbot }
      if (massnahme === 'bv_av') { next.ende = defaultBvAvEnd(current.beginn) }
      return next
    })
    setAreas(current => massnahme === 'bv_av' ? [{ ...(current[0] ?? newArea()), radius: 100 }] : current)
  }

  function openNew() { setEditing(null); setForm(emptyForm()); setAreas([newArea()]); setShowForm(true); setError('') }
  function openEdit(item: Schutzfall) {
    setEditing(item)
    setForm({
      massnahme: item.massnahme, rechtsgrundlage: item.ev_rechtsgrundlage ?? '382b', gefaehrderId: item.gefaehrder_id,
      geschuetzteIds: (item.geschuetzte ?? []).map(row => row.person_id), pad: item.pad_aktenzahl,
      externeAkte: item.externe_aktenzahl ?? '', stelle: item.ausstellende_stelle ?? '',
      beginn: localDateTimeInput(item.beginn), ende: localDateTimeInput(item.ende), status: item.status,
      waffenverbot: item.waffenverbot, schluesselStatus: item.schluessel_status,
      verwahrort: item.schluessel_verwahrort ?? '', ausnahmen: item.ausnahmen ?? '', hinweise: item.hinweise ?? '',
    })
    setAreas((item.bereiche ?? []).map(area => ({ key: area.id, objectId: area.object_id ?? '', label: area.bezeichnung, lat: area.lat, lng: area.lng, radius: area.radius_m, confirmed: area.position_bestaetigt })))
    setShowForm(true); setError('')
  }

  function updateArea(key: string, changes: Partial<AreaForm>) { setAreas(current => current.map(area => area.key === key ? { ...area, ...changes } : area)) }
  function selectObject(key: string, objectId: string) {
    const object = objects.find(row => row.id === objectId)
    updateArea(key, { objectId, label: object ? objectLabel(object) : '', lat: null, lng: null, confirmed: false })
  }
  async function locateArea(area: AreaForm) {
    if (!area.label.trim()) { setError('Bitte zuerst ein Objekt auswählen oder eine Adresse/Bezeichnung eintragen.'); return }
    setLocatingKey(area.key); setError('')
    const result = await geocodeLocation(area.label)
    setLocatingKey(null)
    if (!result) { setError('Die Position wurde nicht gefunden. Bitte Bezeichnung prüfen oder anschließend auf der Karte korrigieren.'); return }
    updateArea(area.key, { lat: result.lat, lng: result.lng, confirmed: false })
  }

  async function save() {
    if (!profile?.id) return
    if (!form.beginn || !form.ende || !Number.isFinite(new Date(form.beginn).getTime()) || !Number.isFinite(new Date(form.ende).getTime()) || new Date(form.ende) <= new Date(form.beginn)) { setError('Bitte einen gültigen Beginn und ein späteres Ende angeben.'); return }
    if (!form.gefaehrderId || form.geschuetzteIds.length === 0 || !form.pad.trim()) { setError('Gefährder, mindestens eine geschützte Person und die PAD-Aktenzahl sind erforderlich.'); return }
    if (form.geschuetzteIds.includes(form.gefaehrderId)) { setError('Gefährder und geschützte Person dürfen nicht dieselbe Person sein.'); return }
    if (areas.length === 0 || areas.some(area => !area.label.trim() || area.lat === null || area.lng === null || !area.confirmed || !Number.isFinite(area.radius) || area.radius < 1 || area.radius > 5000)) { setError('Jeder Schutzbereich braucht eine Bezeichnung, einen gültigen Radius und eine bestätigte Kartenposition.'); return }
    if (form.massnahme === 'bv_av' && areas.length !== 1) { setError('Für das BV/AV ist genau der Wohnungs-Schutzbereich zu erfassen.'); return }
    setSaving(true); setError('')
    const payload = {
      massnahme: form.massnahme, ev_rechtsgrundlage: form.massnahme === 'ev' ? form.rechtsgrundlage : null,
      gefaehrder_id: form.gefaehrderId, pad_aktenzahl: form.pad.trim(), externe_aktenzahl: form.externeAkte.trim() || null,
      ausstellende_stelle: form.stelle.trim() || null, beginn: new Date(form.beginn).toISOString(), ende: new Date(form.ende).toISOString(),
      status: form.status, waffenverbot: form.waffenverbot, schluessel_status: form.schluesselStatus,
      schluessel_verwahrort: form.verwahrort.trim() || null, ausnahmen: form.ausnahmen.trim() || null, hinweise: form.hinweise.trim() || null,
    }
    let id = editing?.id
    if (editing) {
      const result = await supabase.from('schutzfaelle').update(payload).eq('id', editing.id)
      if (result.error) { setSaving(false); setError(result.error.code === '23505' ? 'Diese PAD-Aktenzahl ist für diese Maßnahme bereits vorhanden.' : 'Schutzmaßnahme konnte nicht gespeichert werden.'); return }
      const [personsDelete, areasDelete] = await Promise.all([supabase.from('schutzfall_personen').delete().eq('schutzfall_id', editing.id), supabase.from('schutzbereiche').delete().eq('schutzfall_id', editing.id)])
      if (personsDelete.error || areasDelete.error) { setSaving(false); setError('Die Zuordnungen konnten nicht aktualisiert werden.'); return }
    } else {
      const result = await supabase.from('schutzfaelle').insert({ ...payload, created_by: profile.id }).select('id').single()
      if (result.error || !result.data) { setSaving(false); setError(result.error?.code === '23505' ? 'Diese PAD-Aktenzahl ist für diese Maßnahme bereits vorhanden.' : 'Schutzmaßnahme konnte nicht angelegt werden.'); return }
      id = result.data.id
    }
    const [personsResult, areasResult] = await Promise.all([
      supabase.from('schutzfall_personen').insert(form.geschuetzteIds.map(personId => ({ schutzfall_id: id!, person_id: personId }))),
      supabase.from('schutzbereiche').insert(areas.map((area, index) => ({ schutzfall_id: id!, art: form.massnahme === 'bv_av' ? 'wohnung' : 'ort', object_id: area.objectId || null, bezeichnung: area.label.trim(), lat: area.lat!, lng: area.lng!, radius_m: form.massnahme === 'bv_av' ? 100 : area.radius, position_bestaetigt: true, sort_order: index }))),
    ])
    setSaving(false)
    if (personsResult.error || areasResult.error) { setError('Der Schutzfall wurde gespeichert, aber Personen oder Schutzbereiche konnten nicht vollständig zugeordnet werden. Bitte den Eintrag öffnen und vervollständigen.'); await load(); return }
    logAudit(editing ? 'Schutzmaßnahme bearbeitet' : 'Schutzmaßnahme angelegt', `${MASSNAHME_LABEL[form.massnahme]} · PAD ${form.pad.trim()}`)
    setShowForm(false); setNotice(editing ? 'Schutzmaßnahme wurde aktualisiert.' : 'Schutzmaßnahme wurde angelegt.'); await load()
  }

  return <div className="space-y-5">
    <div><Link to="/zentrale" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" /> Zur Zentrale</Link><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich · Zentrale</p><h1 className="text-2xl font-bold text-gray-900 mt-1">BV/AV & einstweilige Verfügungen</h1><p className="text-sm text-gray-500 mt-1">Schutzbereiche und einsatzrelevante Hinweise – ergänzend zum führenden PAD-Akt.</p></div>
    {error && !showForm ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
    {notice ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div> : null}
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="font-bold text-gray-900">Aktive Schutzbereiche</h2><p className="text-xs text-gray-500">Rot: polizeiliches BV/AV (fix 100 m um die Wohnung) · Violett: gerichtliche EV.</p></div>{canOperate ? <button type="button" onClick={openNew} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" /> Schutzfall</button> : null}</div><LeafletMap height={400} markers={[]} circles={mapCircles} /></section>
    {loading ? <div className="py-10 text-center text-sm text-gray-500">Schutzmaßnahmen werden geladen…</div> : items.length === 0 ? <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">Noch keine Schutzmaßnahmen erfasst.</div> : <section className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">{items.map(item => {
      const initialDone = hasInitialControl(item)
      const overdue = item.massnahme === 'bv_av' && !initialDone && firstControlDeadline(item).getTime() < now
      const dueSoon = item.massnahme === 'bv_av' && !initialDone && !overdue
      return <article key={item.id} className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.massnahme === 'bv_av' ? 'bg-red-100 text-red-800' : 'bg-purple-100 text-purple-800'}`}>{MASSNAHME_LABEL[item.massnahme]}</span><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{item.status}</span>{overdue ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800"><AlertTriangle className="mr-1 inline h-3 w-3" />Erstkontrolle überfällig</span> : dueSoon ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Erstkontrolle bis {firstControlDeadline(item).toLocaleString('de-AT')}</span> : item.massnahme === 'bv_av' ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800"><CheckCircle2 className="mr-1 inline h-3 w-3" />Erstkontrolle erfasst</span> : null}</div>
          <h3 className="mt-2 font-semibold text-gray-900">Gefährder: {item.gefaehrder ? personDisplayName(item.gefaehrder) : '—'}</h3><p className="mt-1 text-sm text-gray-600">Geschützt: {(item.geschuetzte ?? []).map(row => row.person ? personDisplayName(row.person) : '—').join(', ') || '—'}</p>
          <p className="mt-1 text-xs text-gray-500">PAD {item.pad_aktenzahl} · {new Date(item.beginn).toLocaleString('de-AT')} bis {new Date(item.ende).toLocaleString('de-AT')}</p>
          {(item.bereiche ?? []).map(area => <p key={area.id} className="mt-1 text-sm text-gray-600"><MapPin className="mr-1 inline h-4 w-4 text-blue-700" />{area.bezeichnung} · {area.radius_m} m</p>)}
          {item.ausnahmen ? <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900"><strong>Ausnahmen:</strong> {item.ausnahmen}</p> : null}{item.hinweise ? <p className="mt-2 text-sm text-gray-700"><strong>Hinweise:</strong> {item.hinweise}</p> : null}
        </div>{canOperate ? <button type="button" onClick={() => openEdit(item)} className="rounded-lg p-2 text-gray-500 hover:bg-blue-50 hover:text-blue-700" aria-label="Schutzmaßnahme bearbeiten"><Pencil className="h-4 w-4" /></button> : null}</div>
      </article>
    })}</section>}
    {showForm ? <Modal title={editing ? 'Schutzmaßnahme bearbeiten' : 'Schutzmaßnahme anlegen'} close={() => setShowForm(false)}>
      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => chooseMeasure('bv_av')} className={`rounded-xl border p-3 text-left text-sm ${form.massnahme === 'bv_av' ? 'border-red-500 bg-red-50 text-red-900' : 'border-gray-200'}`}><strong>BV/AV</strong><br /><span className="text-xs">kombiniertes polizeiliches Verbot</span></button><button type="button" onClick={() => chooseMeasure('ev')} className={`rounded-xl border p-3 text-left text-sm ${form.massnahme === 'ev' ? 'border-purple-500 bg-purple-50 text-purple-900' : 'border-gray-200'}`}><strong>EV</strong><br /><span className="text-xs">gerichtliche einstweilige Verfügung</span></button></div>
      {form.massnahme === 'ev' ? <label className="block text-xs font-medium text-gray-600">Rechtsgrundlage *<select className={inputClass} value={form.rechtsgrundlage} onChange={event => setForm(current => ({ ...current, rechtsgrundlage: event.target.value as EvRechtsgrundlage }))}><option value="382b">§ 382b EO – Wohnung</option><option value="382c">§ 382c EO – allgemeiner Schutz</option><option value="kombiniert">§§ 382b und 382c EO</option></select></label> : <div className="rounded-xl bg-blue-50 p-3 text-xs text-blue-900"><strong>Automatisch:</strong> Ende nach 14 Tagen und 100-m-Schutzbereich um die Wohnung. Die personenbezogene 100-m-Annäherung wird nicht als feste Kreiszone dargestellt.</div>}
      <PersonPicker persons={persons} value={form.gefaehrderId || null} onChange={id => setForm(current => ({ ...current, gefaehrderId: id ?? '' }))} createdBy={profile?.id ?? null} onCreated={person => setPersons(current => [...current.filter(row => row.id !== person.id), person].sort((a, b) => personDisplayName(a).localeCompare(personDisplayName(b), 'de-AT')))} label="Gefährder" required />
      <fieldset><legend className="text-xs font-medium text-gray-600">Geschützte Person(en) *</legend><div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-300 p-2 space-y-1">{persons.filter(person => person.id !== form.gefaehrderId).map(person => <label key={person.id} className="flex items-center gap-2 rounded p-1.5 text-sm hover:bg-gray-50"><input type="checkbox" checked={form.geschuetzteIds.includes(person.id)} onChange={event => setForm(current => ({ ...current, geschuetzteIds: event.target.checked ? [...current.geschuetzteIds, person.id] : current.geschuetzteIds.filter(id => id !== person.id) }))} />{personDisplayName(person)}</label>)}</div><div className="mt-2"><PersonPicker persons={persons.filter(person => person.id !== form.gefaehrderId && !form.geschuetzteIds.includes(person.id))} value={null} onChange={id => { if (id) setForm(current => ({ ...current, geschuetzteIds: current.geschuetzteIds.includes(id) ? current.geschuetzteIds : [...current.geschuetzteIds, id] })) }} createdBy={profile?.id ?? null} onCreated={person => setPersons(current => [...current.filter(row => row.id !== person.id), person].sort((a, b) => personDisplayName(a).localeCompare(personDisplayName(b), 'de-AT')))} label="Weitere geschützte Person hinzufügen" /></div></fieldset>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="PAD-Aktenzahl *" value={form.pad} onChange={value => setForm(current => ({ ...current, pad: value }))} /><Field label="Ausstellende Stelle" value={form.stelle} onChange={value => setForm(current => ({ ...current, stelle: value }))} /><Field label="Beginn *" type="datetime-local" value={form.beginn} onChange={value => setForm(current => ({ ...current, beginn: value, ende: current.massnahme === 'bv_av' ? defaultBvAvEnd(value) : current.ende }))} /><Field label="Ende *" type="datetime-local" value={form.ende} onChange={value => setForm(current => ({ ...current, ende: value }))} /></div>
      <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-900">{form.massnahme === 'bv_av' ? 'Wohnungs-Schutzbereich' : 'Gerichtliche Schutzbereiche'}</h3>{form.massnahme === 'ev' ? <button type="button" onClick={() => setAreas(current => [...current, newArea()])} className="text-sm font-semibold text-blue-700"><Plus className="mr-1 inline h-4 w-4" />Weiterer Ort</button> : null}</div>{areas.map((area, index) => <div key={area.key} className="rounded-xl border border-gray-200 p-3 space-y-3">
        <div className="flex items-center justify-between"><span className="text-xs font-bold text-gray-500">Schutzbereich {index + 1}</span>{form.massnahme === 'ev' && areas.length > 1 ? <button type="button" onClick={() => setAreas(current => current.filter(row => row.key !== area.key))} aria-label="Schutzbereich entfernen"><X className="h-4 w-4 text-gray-500" /></button> : null}</div>
        <label className="block text-xs font-medium text-gray-600">Objekt aus Stammdaten<select className={inputClass} value={area.objectId} onChange={event => selectObject(area.key, event.target.value)}><option value="">Ohne Objektverknüpfung</option>{objects.map(object => <option key={object.id} value={object.id}>{objectLabel(object)}</option>)}</select></label>
        <Field label="Adresse / Bezeichnung *" value={area.label} onChange={value => updateArea(area.key, { label: value, confirmed: false })} />
        {form.massnahme === 'ev' ? <label className="block text-xs font-medium text-gray-600">Radius laut gerichtlicher Verfügung (m) *<input className={inputClass} type="number" min={1} max={5000} value={area.radius} onChange={event => updateArea(area.key, { radius: Number(event.target.value) })} /></label> : <p className="text-xs text-gray-500">Radius: 100 m (gesetzlich fix)</p>}
        <button type="button" onClick={() => void locateArea(area)} disabled={locatingKey === area.key} className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-medium text-blue-800"><MapPin className="mr-1 inline h-4 w-4" />{locatingKey === area.key ? 'Position wird gesucht…' : 'Adresse auf Karte suchen'}</button>
        {area.lat !== null && area.lng !== null ? <><LeafletMap height={240} markers={[{ lat: area.lat, lng: area.lng, popup: area.label }]} circles={[{ lat: area.lat, lng: area.lng, radiusMeters: form.massnahme === 'bv_av' ? 100 : area.radius, popup: area.label, color: form.massnahme === 'bv_av' ? '#dc2626' : '#7c3aed' }]} onMapClick={(lat, lng) => updateArea(area.key, { lat, lng, confirmed: false })} /><button type="button" onClick={() => updateArea(area.key, { confirmed: true })} className={`w-full rounded-lg px-3 py-2 text-sm font-semibold ${area.confirmed ? 'bg-green-100 text-green-800' : 'bg-blue-800 text-white'}`}>{area.confirmed ? 'Position bestätigt' : 'Diese Position bestätigen'}</button></> : null}
      </div>)}</div>
      <details className="rounded-xl border border-gray-200 p-3"><summary className="cursor-pointer text-sm font-semibold text-gray-700">Weitere Angaben (nur wenn vorhanden)</summary><div className="mt-4 space-y-4"><Field label="Externe / gerichtliche Aktenzahl" value={form.externeAkte} onChange={value => setForm(current => ({ ...current, externeAkte: value }))} /><label className="block text-xs font-medium text-gray-600">Status<select className={inputClass} value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value as SchutzfallStatus }))}><option value="aktiv">Aktiv</option><option value="aufgehoben">Aufgehoben</option><option value="abgelaufen">Abgelaufen</option></select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.waffenverbot} onChange={event => setForm(current => ({ ...current, waffenverbot: event.target.checked }))} />Vorläufiges Waffenverbot beachten</label><label className="block text-xs font-medium text-gray-600">Schlüsselstatus<select className={inputClass} value={form.schluesselStatus} onChange={event => setForm(current => ({ ...current, schluesselStatus: event.target.value as Schutzfall['schluessel_status'] }))}><option value="nicht_erfasst">Nicht erfasst</option><option value="abgenommen">Abgenommen</option><option value="verwahrt">Verwahrt</option><option value="gericht">Bei Gericht</option><option value="ausgefolgt">Ausgefolgt</option></select></label>{form.schluesselStatus !== 'nicht_erfasst' ? <Field label="Verwahrort / Übergabe" value={form.verwahrort} onChange={value => setForm(current => ({ ...current, verwahrort: value }))} /> : null}<Area label="Ausnahmen" value={form.ausnahmen} onChange={value => setForm(current => ({ ...current, ausnahmen: value }))} /><Area label="Einsatzrelevante Hinweise" value={form.hinweise} onChange={value => setForm(current => ({ ...current, hinweise: value }))} /></div></details>
      {error ? <ErrorMessage text={error} /> : null}<div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm">Abbrechen</button><button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button></div>
    </Modal> : null}
  </div>
}
