import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ContactRound, Plus, Save, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import { kontaktTelefonnummern } from '../lib/kontaktTelefon'
import { profilTelefonClient, profilTelefonnummern, profilNummerFuerArt, type ProfilTelefonnummern } from '../lib/profilTelefon'
import { funktionskontaktSupabase, ladeFunktionskontakte, nummerFuerArt, TELEFON_ARTEN } from '../lib/verstaendigungsregeln'
import type { KontaktTelefonArt, PortalFunktionskontakt, ZentraleKontakt } from '../lib/types'

const GRUPPEN = [
  { id: 'stadtfuehrung', label: 'Stadtführung' },
  { id: 'einsatzorganisation', label: 'Einsatzorganisation' },
  { id: 'fachabteilung', label: 'Fachabteilungen' },
] as const
type Mitarbeiter = { id: string; name: string; dienstgrad: string | null; organisation: string }

export default function SystemeinstellungenFunktionskontakte() {
  const { profile } = useAuth()
  const [funktionen, setFunktionen] = useState<PortalFunktionskontakt[]>([])
  const [kontakte, setKontakte] = useState<ZentraleKontakt[]>([])
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([])
  const [telefone, setTelefone] = useState<ProfilTelefonnummern[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [neueFunktion, setNeueFunktion] = useState({ bezeichnung: '', gruppe: 'einsatzorganisation' as PortalFunktionskontakt['gruppe'] })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rollen, kontakteResult, mitarbeiterResult, telefonResult] = await Promise.all([
        ladeFunktionskontakte(),
        supabase.from('zentrale_kontakte').select('*').order('name'),
        supabase.from('profiles').select('id,name,dienstgrad,organisation').eq('active', true).order('name'),
        profilTelefonClient.from('profile_phone_numbers').select('*'),
      ])
      if (kontakteResult.error || mitarbeiterResult.error || telefonResult.error) throw kontakteResult.error ?? mitarbeiterResult.error ?? telefonResult.error
      setFunktionen(rollen)
      setKontakte((kontakteResult.data ?? []) as ZentraleKontakt[])
      setMitarbeiter((mitarbeiterResult.data ?? []) as Mitarbeiter[])
      setTelefone(telefonResult.data ?? [])
      setError('')
    } catch {
      setError('Funktionskontakte konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const byId = useMemo(() => new Map(kontakte.map(kontakt => [kontakt.id, kontakt])), [kontakte])
  const mitarbeiterById = useMemo(() => new Map(mitarbeiter.map(person => [person.id, person])), [mitarbeiter])
  const telefonById = useMemo(() => new Map(telefone.map(row => [row.user_id, row])), [telefone])

  function update(schluessel: string, changes: Partial<PortalFunktionskontakt>) {
    setFunktionen(current => current.map(row => row.schluessel === schluessel ? { ...row, ...changes } : row))
  }

  async function speichern(row: PortalFunktionskontakt) {
    if (!row.bezeichnung.trim()) { setError('Die Bezeichnung darf nicht leer sein.'); return }
    const ausgewaehlterKontakt = row.kontakt_id ? byId.get(row.kontakt_id) : null
    const profilTelefon = row.profil_id ? telefonById.get(row.profil_id) : null
    const nummer = row.profil_id
      ? profilNummerFuerArt(profilTelefon, row.telefon_art === 'diensthandy' || row.telefon_art === 'privathandy' ? row.telefon_art : null)
      : ausgewaehlterKontakt && nummerFuerArt(ausgewaehlterKontakt, row.telefon_art)
    if (row.telefon_art && !nummer) {
      setError('Die bevorzugte Rufnummer ist beim gewählten Kontakt nicht vorhanden.'); return
    }
    setSaving(row.schluessel); setError(''); setNotice('')
    const result = await funktionskontaktSupabase.from('portal_funktionskontakte').update({
      bezeichnung: row.bezeichnung.trim(),
      kontakt_id: row.kontakt_id,
      profil_id: row.profil_id,
      telefon_art: row.telefon_art,
      vertretung_id: row.vertretung_id,
      vertretung_profil_id: row.vertretung_profil_id,
      aktiv: row.aktiv,
      updated_by: profile?.id ?? null,
    } as never).eq('schluessel', row.schluessel).select('schluessel').single()
    setSaving(null)
    if (result.error || !result.data) { setError('Funktionskontakt konnte nicht gespeichert werden.'); return }
    logAudit('Funktionskontakt geändert', row.bezeichnung.trim())
    setNotice(`${row.bezeichnung.trim()} wurde gespeichert und gilt für aktive und neue Ereignisse.`)
    await load()
  }

  async function hinzufuegen() {
    const bezeichnung = neueFunktion.bezeichnung.trim()
    if (!bezeichnung) { setError('Bitte eine Bezeichnung eingeben.'); return }
    setSaving('neu'); setError(''); setNotice('')
    const result = await funktionskontaktSupabase.from('portal_funktionskontakte').insert({
      schluessel: `funktion_${crypto.randomUUID()}`,
      bezeichnung,
      gruppe: neueFunktion.gruppe,
      sortierung: Math.max(0, ...funktionen.map(row => row.sortierung)) + 10,
      kontakt_id: null,
      profil_id: null,
      telefon_art: null,
      vertretung_id: null,
      vertretung_profil_id: null,
      aktiv: true,
      updated_by: profile?.id ?? null,
    } as never).select('schluessel').single()
    setSaving(null)
    if (result.error || !result.data) { setError(result.error?.code === '23505' ? 'Diese Funktion besteht bereits.' : 'Funktionskontakt konnte nicht angelegt werden.'); return }
    logAudit('Funktionskontakt angelegt', bezeichnung)
    setNeueFunktion({ bezeichnung: '', gruppe: 'einsatzorganisation' })
    setNotice(`${bezeichnung} wurde angelegt. Ordnen Sie jetzt eine Person zu und nehmen Sie die Funktion bei Bedarf in das Verständigungsschema auf.`)
    await load()
  }

  async function entfernen(row: PortalFunktionskontakt) {
    if (!window.confirm(`Funktion „${row.bezeichnung}“ löschen? Das ist nur möglich, wenn sie in keinem Verständigungsschema verwendet wird.`)) return
    setSaving(row.schluessel); setError(''); setNotice('')
    const result = await funktionskontaktSupabase.from('portal_funktionskontakte').delete().eq('schluessel', row.schluessel).select('schluessel').single()
    setSaving(null)
    if (result.error || !result.data) { setError('Funktionskontakt konnte nicht gelöscht werden. Entfernen Sie zuerst seine Einträge im Verständigungsschema.'); return }
    logAudit('Funktionskontakt gelöscht', row.bezeichnung)
    setNotice(`${row.bezeichnung} wurde gelöscht.`)
    await load()
  }

  return <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
    <Link to="/portal/systemeinstellungen" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4" /> Zu Systemeinstellungen</Link>
    <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-gray-900">Funktionskontakte</h1><p className="mt-2 max-w-3xl text-sm text-gray-600">Hier wird eine dauerhaft benötigte Funktion der aktuell zuständigen Person zugeordnet. Ein Personenwechsel wird einmal geändert und wirkt danach in Kontakten und neuen Verständigungsabläufen.</p></div>
      <Link to="/portal/systemeinstellungen/kontakte" className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800"><ContactRound className="h-4 w-4" /> Kontakte verwalten</Link>
    </div>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p> : null}
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="font-semibold text-gray-900">Funktion hinzufügen</h2>
      <p className="mt-1 text-xs text-gray-600">Die Funktion wird erst bei einer Ereignisstufe angezeigt, wenn sie im Verständigungsschema dieser Stufe ausgewählt wurde.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-52 flex-1 text-sm font-medium text-gray-700">Bezeichnung<input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={neueFunktion.bezeichnung} onChange={event => setNeueFunktion(current => ({ ...current, bezeichnung: event.target.value }))} /></label>
        <label className="text-sm font-medium text-gray-700">Gruppe<select className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2" value={neueFunktion.gruppe} onChange={event => setNeueFunktion(current => ({ ...current, gruppe: event.target.value as PortalFunktionskontakt['gruppe'] }))}>{GRUPPEN.map(gruppe => <option key={gruppe.id} value={gruppe.id}>{gruppe.label}</option>)}</select></label>
        <button type="button" disabled={saving !== null} onClick={() => void hinzufuegen()} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><Plus className="h-4 w-4" /> Hinzufügen</button>
      </div>
    </section>
    {loading ? <p className="mt-6 text-sm text-gray-500">Funktionskontakte werden geladen…</p> : <div className="mt-7 space-y-7">
      {GRUPPEN.map(gruppe => <section key={gruppe.id}>
        <h2 className="text-lg font-bold text-gray-900">{gruppe.label}</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {funktionen.filter(row => row.gruppe === gruppe.id).map(row => {
            const person = row.kontakt_id ? byId.get(row.kontakt_id) : null
            const profil = row.profil_id ? mitarbeiterById.get(row.profil_id) : null
            const profilTelefon = row.profil_id ? telefonById.get(row.profil_id) : null
            const arten = profil ? TELEFON_ARTEN.filter(art => (art.id === 'diensthandy' || art.id === 'privathandy') && profilNummerFuerArt(profilTelefon, art.id)) : person ? TELEFON_ARTEN.filter(art => nummerFuerArt(person, art.id)) : []
            const hatNummer = profil ? profilTelefonnummern(profilTelefon).length > 0 : person ? kontaktTelefonnummern(person).length > 0 : false
            const zuordnung = row.profil_id ? `profil:${row.profil_id}` : row.kontakt_id ? `kontakt:${row.kontakt_id}` : ''
            const vertretung = row.vertretung_profil_id ? `profil:${row.vertretung_profil_id}` : row.vertretung_id ? `kontakt:${row.vertretung_id}` : ''
            return <article key={row.schluessel} className="rounded-xl border border-gray-200 bg-white p-4">
              <label className="block text-sm font-medium text-gray-700">Funktion<input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={row.bezeichnung} onChange={event => update(row.schluessel, { bezeichnung: event.target.value })} /></label>
              <label className="mt-3 block text-sm font-medium text-gray-700">Zuständige Person<select className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" value={zuordnung} onChange={event => { const [art, id] = event.target.value.split(':'); update(row.schluessel, { kontakt_id: art === 'kontakt' ? id : null, profil_id: art === 'profil' ? id : null, telefon_art: null, vertretung_id: vertretung === event.target.value ? null : row.vertretung_id, vertretung_profil_id: vertretung === event.target.value ? null : row.vertretung_profil_id }) }}><option value="">Noch nicht zugeordnet</option><optgroup label="Portalbenutzer (z. B. Kommando)">{mitarbeiter.map(m => <option key={m.id} value={`profil:${m.id}`}>{m.name}{m.dienstgrad ? ` · ${m.dienstgrad}` : ''} · {m.organisation}</option>)}</optgroup><optgroup label="Kontakte">{kontakte.map(kontakt => <option key={kontakt.id} value={`kontakt:${kontakt.id}`}>{kontakt.name}{kontakt.funktion ? ` · ${kontakt.funktion}` : ''}</option>)}</optgroup></select></label>
              <label className="mt-3 block text-sm font-medium text-gray-700">Bevorzugte Rufnummer<select disabled={!person && !profil} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 disabled:bg-gray-100" value={row.telefon_art ?? ''} onChange={event => update(row.schluessel, { telefon_art: (event.target.value || null) as KontaktTelefonArt | null })}><option value="">Alle vorhandenen Nummern anzeigen</option>{arten.map(art => <option key={art.id} value={art.id}>{art.label}: {profil ? profilNummerFuerArt(profilTelefon, art.id === 'diensthandy' || art.id === 'privathandy' ? art.id : null) : person && nummerFuerArt(person, art.id)}</option>)}</select></label>
              <label className="mt-3 block text-sm font-medium text-gray-700">Vertretung<select className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" value={vertretung} onChange={event => { const [art, id] = event.target.value.split(':'); update(row.schluessel, { vertretung_id: art === 'kontakt' ? id : null, vertretung_profil_id: art === 'profil' ? id : null }) }}><option value="">Keine Vertretung</option><optgroup label="Portalbenutzer">{mitarbeiter.filter(m => m.id !== row.profil_id).map(m => <option key={m.id} value={`profil:${m.id}`}>{m.name}</option>)}</optgroup><optgroup label="Kontakte">{kontakte.filter(kontakt => kontakt.id !== row.kontakt_id).map(kontakt => <option key={kontakt.id} value={`kontakt:${kontakt.id}`}>{kontakt.name}</option>)}</optgroup></select></label>
              {!person && !profil ? <p className="mt-3 text-xs font-medium text-amber-700">Noch keine Person zugeordnet.</p> : !hatNummer ? <p className="mt-3 text-xs font-medium text-amber-700">Die Person ist zugeordnet, hat aber noch keine Rufnummer hinterlegt.</p> : null}
              <div className="mt-4 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={row.aktiv} onChange={event => update(row.schluessel, { aktiv: event.target.checked })} /> Aktiv</label>
                <div className="flex items-center gap-2"><button type="button" disabled={saving !== null} onClick={() => void entfernen(row)} aria-label={`${row.bezeichnung} löschen`} className="rounded-lg p-2 text-red-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button><button type="button" disabled={saving !== null} onClick={() => void speichern(row)} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><Save className="h-4 w-4" /> {saving === row.schluessel ? 'Speichern…' : 'Speichern'}</button></div>
              </div>
            </article>
          })}
        </div>
      </section>)}
    </div>}
  </div>
}
