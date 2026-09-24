import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Building2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import { kontaktTelefonnummern } from '../../lib/kontaktTelefon'
import { integrationSupabase, type IntegrationOutlookContact } from '../../lib/integrations'
import { profilTelefonClient, type ProfilTelefonnummern } from '../../lib/profilTelefon'
import type { ZentraleKontakt } from '../../lib/types'
import { Empty, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import { ObjectPicker } from '../../components/RegisterPickers'
import { objectLabel, useObjects } from '../../lib/register'
import { useOwnOperativBereicheToday } from '../../lib/dutyAccess'
import type { ContextualReference } from '../../lib/contextualReference'
import { ladeFunktionskontakte, nummerFuerArt } from '../../lib/verstaendigungsregeln'
import type { PortalFunktionskontakt } from '../../lib/types'
import { kontaktInstitutionSupabase, ladeKontaktInstitutionen, type KontaktInstitution } from '../../lib/kontaktInstitutionen'

const emptyForm = { name: '', institution: '', funktion: '', telefon: '', telefon_buero: '', telefon_diensthandy: '', telefon_privathandy: '', email: '', erreichbarkeit: '', objectId: null as string | null, note: '', restricted: false }

type BenutzerProfil = { id: string; name: string; dienstnummer: string | null; dienstgrad: string | null; organisation: string }
/** Vereinheitlichte Anzeigezeile: echte Kontakte (Institutionen/Rufbereitschaften) und automatisch gespiegelte Benutzer. */
type KontaktRow = { key: string; kind: 'kontakt' | 'benutzer' | 'outlook'; name: string; institution: string | null; funktion: string | null; telefon: string | null; email?: string | null; kontakt?: ZentraleKontakt; benutzerTelefon?: ProfilTelefonnummern }

export default function StammdatenKontaktePage({ context }: { context?: ContextualReference }) {
  const { profile, hasAreaAccess, isStrictAdmin, areaRoles } = useAuth()
  const { bereiche: eigeneBereicheHeute } = useOwnOperativBereicheToday(profile?.id)
  // Pflege obliegt der Administration oder den Sachbearbeitern im Bereich
  // Datenpflege (eigener Portalbereich, siehe portalEntitlements.ts) - gelesen
  // wird das Register von Zentrale UND Datenpflege gemeinsam.
  const datenpflegeRoles = areaRoles?.find(row => row.area === 'datenpflege')?.roles ?? []
  const isDatenpflegeSachbearbeiter = datenpflegeRoles.some(role => ['sachbearbeiter', 'admin'].includes(role))
  const canManage = (!context || context.allowManage) && (isStrictAdmin || isDatenpflegeSachbearbeiter)
  const { objects, setObjects } = useObjects()
  const [items, setItems] = useState<ZentraleKontakt[]>([])
  const [benutzer, setBenutzer] = useState<BenutzerProfil[]>([])
  const [benutzerTelefone, setBenutzerTelefone] = useState<ProfilTelefonnummern[]>([])
  const [outlookKontakte, setOutlookKontakte] = useState<IntegrationOutlookContact[]>([])
  const [funktionskontakte, setFunktionskontakte] = useState<PortalFunktionskontakt[]>([])
  const [verwalteteInstitutionen, setVerwalteteInstitutionen] = useState<KontaktInstitution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ZentraleKontakt | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [filterInstitution, setFilterInstitution] = useState('')
  const [search, setSearch] = useState('')
  const [showInstitutionForm, setShowInstitutionForm] = useState(false)
  const [newInstitution, setNewInstitution] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [kontakteResult, benutzerResult, telefonResult, outlookResult, funktionsResult, institutionenResult] = await Promise.all([
      supabase.from('zentrale_kontakte').select('*, object:operational_objects(id,address,label)').order('name'),
      supabase.from('profiles').select('id,name,dienstnummer,dienstgrad,organisation').eq('active', true).order('name'),
      profilTelefonClient.from('profile_phone_numbers').select('*'),
      integrationSupabase.from('integration_outlook_contacts').select('*').order('name'),
      ladeFunktionskontakte().then(data => ({ data, error: null })).catch(error => ({ data: [] as PortalFunktionskontakt[], error })),
      ladeKontaktInstitutionen().then(data => ({ data, error: null })).catch(error => ({ data: [] as KontaktInstitution[], error })),
    ])
    if (kontakteResult.error || outlookResult.error || telefonResult.error || funktionsResult.error || institutionenResult.error) setError('Die Kontakte konnten nicht vollständig geladen werden.')
    else setError('')
    setItems((kontakteResult.data ?? []) as unknown as ZentraleKontakt[])
    setBenutzer(benutzerResult.error ? [] : (benutzerResult.data ?? []) as unknown as BenutzerProfil[])
    setBenutzerTelefone((telefonResult.data ?? []) as unknown as ProfilTelefonnummern[])
    setOutlookKontakte(outlookResult.data ?? [])
    setFunktionskontakte(funktionsResult.data)
    setVerwalteteInstitutionen(institutionenResult.data)
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const rows = useMemo((): KontaktRow[] => [
    ...items.map((item): KontaktRow => ({ key: `kontakt:${item.id}`, kind: 'kontakt', name: item.name, institution: item.institution, funktion: item.funktion, telefon: item.telefon, kontakt: item })),
    ...benutzer.map((person): KontaktRow => ({ key: `benutzer:${person.id}`, kind: 'benutzer', name: person.name, institution: person.organisation, funktion: [person.dienstgrad, person.dienstnummer ? `DN ${person.dienstnummer}` : null].filter(Boolean).join(' · ') || null, telefon: null, benutzerTelefon: benutzerTelefone.find(row => row.user_id === person.id) })),
    ...outlookKontakte.map((item): KontaktRow => ({ key: `outlook:${item.id}`, kind: 'outlook', name: item.name, institution: item.institution, funktion: item.funktion, telefon: item.telefon, email: item.email })),
  ].sort((a, b) => a.name.localeCompare(b.name, 'de-AT')), [items, benutzer, benutzerTelefone, outlookKontakte])
  const institutions = useMemo(() => [...new Set([
    ...verwalteteInstitutionen.map(row => row.name),
    ...rows.map(row => row.institution).filter((value): value is string => Boolean(value)),
  ])].sort((a, b) => a.localeCompare(b, 'de-AT')), [rows, verwalteteInstitutionen])
  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('de-AT')
    return rows.filter(row => {
      if (filterInstitution && row.institution !== filterInstitution) return false
      if (!query) return true
      return [row.name, row.funktion, row.institution].some(value => value?.toLocaleLowerCase('de-AT').includes(query))
    })
  }, [rows, filterInstitution, search])
  const kontakteById = useMemo(() => new Map(items.map(item => [item.id, item])), [items])
  const sichtbareFunktionen = useMemo(() => funktionskontakte.filter(row => canManage || (row.aktiv && row.kontakt_id)), [funktionskontakte, canManage])

  if (!hasAreaAccess('zentrale') && !hasAreaAccess('datenpflege') && eigeneBereicheHeute.size === 0) return <Navigate to="/" replace />

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true); setError('') }
  function openEdit(item: ZentraleKontakt) { setEditing(item); setForm({ name: item.name, institution: item.institution ?? '', funktion: item.funktion ?? '', telefon: item.telefon ?? '', telefon_buero: item.telefon_buero ?? '', telefon_diensthandy: item.telefon_diensthandy ?? '', telefon_privathandy: item.telefon_privathandy ?? '', email: item.email ?? '', erreichbarkeit: item.erreichbarkeit ?? '', objectId: item.object_id, note: item.note ?? '', restricted: item.restricted }); setShowForm(true); setError('') }

  async function save() {
    if (!form.name.trim()) { setError('Bitte einen Namen eingeben.'); return }
    setSaving(true)
    const payload = { name: form.name.trim(), institution: form.institution.trim() || null, funktion: form.funktion.trim() || null, telefon: form.telefon.trim() || null, telefon_buero: form.telefon_buero.trim() || null, telefon_diensthandy: form.telefon_diensthandy.trim() || null, telefon_privathandy: form.telefon_privathandy.trim() || null, email: form.email.trim() || null, erreichbarkeit: form.erreichbarkeit.trim() || null, object_id: form.objectId, note: form.note.trim() || null, restricted: form.restricted }
    const response = editing ? await supabase.from('zentrale_kontakte').update(payload).eq('id', editing.id).select('id').single() : await supabase.from('zentrale_kontakte').insert({ ...payload, created_by: profile?.id ?? null }).select('id').single()
    setSaving(false)
    if (response.error || !response.data) { setError('Kontakt konnte nicht gespeichert werden.'); return }
    logAudit(editing ? 'Kontakt bearbeitet' : 'Kontakt angelegt', form.name.trim()); setShowForm(false); setNotice('Kontakt wurde gespeichert.'); await load()
  }
  async function remove() {
    if (!editing || !window.confirm(`Kontakt „${editing.name}“ endgültig löschen?`)) return
    const result = await supabase.from('zentrale_kontakte').delete().eq('id', editing.id)
    if (result.error) { setError('Kontakt konnte nicht gelöscht werden.'); return }
    logAudit('Kontakt endgültig gelöscht', editing.name); setShowForm(false); setNotice('Kontakt wurde endgültig gelöscht.'); await load()
  }

  async function addInstitution() {
    const name = newInstitution.trim()
    if (!name) { setError('Bitte eine Institution eingeben.'); return }
    setSaving(true); setError('')
    const result = await kontaktInstitutionSupabase.from('zentrale_kontakt_institutionen').insert({ name, created_by: profile?.id ?? null }).select('name').single()
    setSaving(false)
    if (result.error || !result.data) {
      setError(result.error?.code === '23505' ? 'Diese Institution ist bereits vorhanden.' : 'Institution konnte nicht angelegt werden.')
      return
    }
    logAudit('Kontaktinstitution angelegt', name)
    setNewInstitution(''); setShowInstitutionForm(false); setNotice(`Institution „${name}“ wurde angelegt.`); await load()
  }

  return <div>
    <Link to={context?.backTo ?? '/stammdaten'} className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" /> {context?.backLabel ?? 'Zu Stammdaten'}</Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">{context ? `${context.areaLabel} · Nachschlagewerk` : 'Stammdaten & Nachschlagewerke'}</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Kontakte</h1><p className="text-sm text-gray-500 mt-1">Dienstlich notwendige Kontakte und Rufbereitschaften, ergänzt um aktive Benutzer und künftig synchronisierte Outlook-Kontakte. Outlook-Kontakte können hier nicht bearbeitet werden.</p></div>
    {!canManage ? <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">Nur Nachschlageansicht. Änderungen erfolgen ausschließlich im Bereich Stammdaten.</div> : null}
    {sichtbareFunktionen.length > 0 ? <section className="mb-5 rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 sm:px-5"><div><h2 className="font-semibold text-gray-900">Funktionskontakte</h2><p className="text-xs text-gray-500">Stadtführung, Einsatzorganisation und Fachabteilungen</p></div>{canManage ? <Link to="/portal/systemeinstellungen/funktionskontakte" className="text-sm font-medium text-blue-800 hover:underline">Zuordnungen bearbeiten</Link> : null}</div>
      <div className="divide-y divide-gray-100">{sichtbareFunktionen.map(row => {
        const person = row.kontakt_id ? kontakteById.get(row.kontakt_id) : null
        const nummer = person && row.telefon_art ? nummerFuerArt(person, row.telefon_art) : null
        return <div key={row.schluessel} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
          <div><p className="font-medium text-gray-900">{row.bezeichnung}</p>{person ? <p className="text-gray-600">{person.name}{nummer ? ` · ${nummer}` : ''}</p> : <p className="text-amber-700">Noch kein Kontakt zugeordnet</p>}</div>
          {!row.aktiv ? <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">Inaktiv</span> : null}
        </div>
      })}</div>
    </section> : null}
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold text-gray-900">Kontakte</h2><p className="text-sm text-gray-500">{visibleRows.length} von {rows.length} Kontakten{benutzer.length > 0 ? ` (davon ${benutzer.length} Benutzer)` : ''}.</p></div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none"><span className="sr-only">Person suchen</span><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><input type="search" className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm" value={search} onChange={event => setSearch(event.target.value)} placeholder="Person suchen…" /></label>
            {institutions.length > 0 ? <select className="text-sm border border-gray-300 rounded-lg px-2 py-2 bg-white" value={filterInstitution} onChange={event => setFilterInstitution(event.target.value)}>
              <option value="">Alle Institutionen</option>
              {institutions.map(name => <option key={name} value={name}>{name}</option>)}
            </select> : null}
            {canManage ? <button type="button" onClick={() => { setNewInstitution(''); setError(''); setShowInstitutionForm(true) }} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700"><Building2 className="h-4 w-4" /> Institution</button> : null}
            {canManage ? <button type="button" onClick={openNew} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Kontakt</button> : null}
          </div>
        </div>
        {visibleRows.length === 0 ? <Empty text="Keine Kontakte gefunden." /> : <div className="divide-y divide-gray-100">{visibleRows.map(row => row.kind !== 'kontakt' ? <article key={row.key} className="p-4 sm:p-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900">{row.name}</h3>
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{row.kind === 'outlook' ? 'Outlook' : 'Benutzer'}</span>
            </div>
            {(row.institution || row.funktion) ? <p className="text-sm text-gray-600 mt-1">{[row.institution, row.funktion].filter(Boolean).join(' · ')}</p> : null}
            {row.kind === 'outlook' ? <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-gray-600">{row.telefon ? <a href={`tel:${row.telefon.replace(/[^\d+]/g, '')}`} className="text-blue-700 hover:underline">TEL: {row.telefon}</a> : null}{row.email ? <span>{row.email}</span> : null}</div> : null}
            {row.kind === 'benutzer' && row.benutzerTelefon ? <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {row.benutzerTelefon.diensthandy ? <a href={`tel:${row.benutzerTelefon.diensthandy.replace(/[^\d+]/g, '')}`} className="text-blue-700 hover:underline" aria-label={`${row.name}, Diensthandy: ${row.benutzerTelefon.diensthandy}`}>Diensthandy: {row.benutzerTelefon.diensthandy}</a> : null}
              {row.benutzerTelefon.privathandy ? <a href={`tel:${row.benutzerTelefon.privathandy.replace(/[^\d+]/g, '')}`} className="text-blue-700 hover:underline" aria-label={`${row.name}, Privathandy: ${row.benutzerTelefon.privathandy}`}>Privathandy: {row.benutzerTelefon.privathandy}</a> : null}
            </div> : null}
          </div>
        </article> : <article key={row.key} className="p-4 sm:p-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900">{row.kontakt!.name}</h3>
              {row.kontakt!.restricted ? <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Vertraulich</span> : null}
            </div>
            {(row.kontakt!.institution || row.kontakt!.funktion) ? <p className="text-sm text-gray-600 mt-1">{[row.kontakt!.institution, row.kontakt!.funktion].filter(Boolean).join(' · ')}</p> : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1.5">
              {kontaktTelefonnummern(row.kontakt!).map(({ art, nummer }) => <a key={art} href={`tel:${nummer.replace(/[^\d+]/g, '')}`} className="text-blue-700 hover:underline" aria-label={`${row.kontakt!.name}, ${art}: ${nummer}`}>{art}: {nummer}</a>)}
              {row.kontakt!.email ? <span>{row.kontakt!.email}</span> : null}
              {row.kontakt!.erreichbarkeit ? <span>Erreichbar: {row.kontakt!.erreichbarkeit}</span> : null}
              {row.kontakt!.object ? <span>Zuständig für: {objectLabel(row.kontakt!.object)}</span> : null}
            </div>
            {row.kontakt!.note ? <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{row.kontakt!.note}</p> : null}
          </div>
          {canManage ? <button type="button" onClick={() => openEdit(row.kontakt!)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex-shrink-0" aria-label="Kontakt bearbeiten"><Pencil className="w-4 h-4" /></button> : null}
        </article>)}</div>}
      </section>
    )}
    {showForm ? <Modal title={editing ? 'Kontakt bearbeiten' : 'Kontakt anlegen'} close={() => setShowForm(false)}>
      <Field label="Name *" value={form.name} onChange={value => setForm(current => ({ ...current, name: value }))} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block text-xs font-medium text-gray-600">Institution<select className={inputClass} value={form.institution} onChange={event => setForm(current => ({ ...current, institution: event.target.value }))}><option value="">Keine Institution</option>{form.institution && !verwalteteInstitutionen.some(row => row.name === form.institution) ? <option value={form.institution}>{form.institution}</option> : null}{verwalteteInstitutionen.map(row => <option key={row.name} value={row.name}>{row.name}</option>)}</select></label>
        <Field label="Funktion" value={form.funktion} onChange={value => setForm(current => ({ ...current, funktion: value }))} />
        <Field label="E-Mail" value={form.email} onChange={value => setForm(current => ({ ...current, email: value }))} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Büro-Telefon" value={form.telefon_buero} onChange={value => setForm(current => ({ ...current, telefon_buero: value }))} />
        <Field label="Diensthandy" value={form.telefon_diensthandy} onChange={value => setForm(current => ({ ...current, telefon_diensthandy: value }))} />
        <Field label="Privathandy" value={form.telefon_privathandy} onChange={value => setForm(current => ({ ...current, telefon_privathandy: value }))} />
        {editing?.telefon ? <Field label="Bisherige Nummer (Art unbekannt)" value={form.telefon} onChange={value => setForm(current => ({ ...current, telefon: value }))} /> : null}
      </div>
      {editing?.telefon ? <p className="text-xs text-gray-500">Die bisherige Nummer bleibt erhalten. Nach Zuordnung zu Büro, Diensthandy oder Privathandy kann sie hier entfernt werden.</p> : null}
      <Field label="Erreichbarkeit (z. B. Mo–Fr 8–16 Uhr)" value={form.erreichbarkeit} onChange={value => setForm(current => ({ ...current, erreichbarkeit: value }))} />
      <ObjectPicker objects={objects} value={form.objectId} onChange={id => setForm(current => ({ ...current, objectId: id }))} createdBy={profile?.id ?? null} onCreated={created => setObjects(current => [...current, created].sort((a, b) => a.address.localeCompare(b.address, 'de-AT')))} label="Zuständig für Objekt (optional)" />
      <label className="block text-xs font-medium text-gray-600">Notiz<textarea className={`${inputClass} min-h-20 resize-y`} value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></label>
      <label className="flex items-start gap-2.5 text-sm text-gray-700"><input type="checkbox" className="mt-0.5 rounded" checked={form.restricted} onChange={event => setForm(current => ({ ...current, restricted: event.target.checked }))} /><span><strong>Vertraulich</strong><br /><span className="text-xs text-gray-500">Nur Zentralisten, zuständige Sachbearbeiter und Admins können den Eintrag sehen.</span></span></label>
      {error ? <ErrorMessage text={error} /> : null}
      <div className="flex flex-wrap gap-3 pt-2">
        {editing && canManage ? <button type="button" disabled={saving} onClick={() => void remove()} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /> Endgültig löschen</button> : <span className="mr-auto" />}
        <button type="button" onClick={() => setShowForm(false)} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button>
        <button type="button" disabled={saving} onClick={() => void save()} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button>
      </div>
    </Modal> : null}
    {showInstitutionForm ? <Modal title="Institution hinzufügen" close={() => setShowInstitutionForm(false)}>
      <Field label="Name der Institution *" value={newInstitution} onChange={setNewInstitution} />
      {error ? <ErrorMessage text={error} /> : null}
      <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setShowInstitutionForm(false)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm">Abbrechen</button><button type="button" disabled={saving} onClick={() => void addInstitution()} className="rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Speichern…' : 'Hinzufügen'}</button></div>
    </Modal> : null}
  </div>
}
