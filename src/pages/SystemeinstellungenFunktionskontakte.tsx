import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ContactRound, Save } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import { kontaktTelefonnummern } from '../lib/kontaktTelefon'
import { funktionskontaktSupabase, ladeFunktionskontakte, nummerFuerArt, TELEFON_ARTEN } from '../lib/verstaendigungsregeln'
import type { KontaktTelefonArt, PortalFunktionskontakt, ZentraleKontakt } from '../lib/types'

const GRUPPEN = [
  { id: 'stadtfuehrung', label: 'Stadtführung' },
  { id: 'einsatzorganisation', label: 'Einsatzorganisation' },
  { id: 'fachabteilung', label: 'Fachabteilungen' },
] as const

export default function SystemeinstellungenFunktionskontakte() {
  const { profile } = useAuth()
  const [funktionen, setFunktionen] = useState<PortalFunktionskontakt[]>([])
  const [kontakte, setKontakte] = useState<ZentraleKontakt[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rollen, kontakteResult] = await Promise.all([
        ladeFunktionskontakte(),
        supabase.from('zentrale_kontakte').select('*').order('name'),
      ])
      if (kontakteResult.error) throw kontakteResult.error
      setFunktionen(rollen)
      setKontakte((kontakteResult.data ?? []) as ZentraleKontakt[])
      setError('')
    } catch {
      setError('Funktionskontakte konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const byId = useMemo(() => new Map(kontakte.map(kontakt => [kontakt.id, kontakt])), [kontakte])

  function update(schluessel: string, changes: Partial<PortalFunktionskontakt>) {
    setFunktionen(current => current.map(row => row.schluessel === schluessel ? { ...row, ...changes } : row))
  }

  async function speichern(row: PortalFunktionskontakt) {
    if (!row.bezeichnung.trim()) { setError('Die Bezeichnung darf nicht leer sein.'); return }
    const ausgewaehlterKontakt = row.kontakt_id ? byId.get(row.kontakt_id) : null
    if (row.telefon_art && (!ausgewaehlterKontakt || !nummerFuerArt(ausgewaehlterKontakt, row.telefon_art))) {
      setError('Die bevorzugte Rufnummer ist beim gewählten Kontakt nicht vorhanden.'); return
    }
    setSaving(row.schluessel); setError(''); setNotice('')
    const result = await funktionskontaktSupabase.from('portal_funktionskontakte').update({
      bezeichnung: row.bezeichnung.trim(),
      kontakt_id: row.kontakt_id,
      telefon_art: row.telefon_art,
      vertretung_id: row.vertretung_id,
      aktiv: row.aktiv,
      updated_by: profile?.id ?? null,
    } as never).eq('schluessel', row.schluessel).select('schluessel').single()
    setSaving(null)
    if (result.error || !result.data) { setError('Funktionskontakt konnte nicht gespeichert werden.'); return }
    logAudit('Funktionskontakt geändert', row.bezeichnung.trim())
    setNotice(`${row.bezeichnung.trim()} wurde gespeichert und gilt für neue Ereignisse.`)
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
    {loading ? <p className="mt-6 text-sm text-gray-500">Funktionskontakte werden geladen…</p> : <div className="mt-7 space-y-7">
      {GRUPPEN.map(gruppe => <section key={gruppe.id}>
        <h2 className="text-lg font-bold text-gray-900">{gruppe.label}</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {funktionen.filter(row => row.gruppe === gruppe.id).map(row => {
            const person = row.kontakt_id ? byId.get(row.kontakt_id) : null
            const arten = person ? TELEFON_ARTEN.filter(art => nummerFuerArt(person, art.id)) : []
            const hatNummer = person ? kontaktTelefonnummern(person).length > 0 : false
            return <article key={row.schluessel} className="rounded-xl border border-gray-200 bg-white p-4">
              <label className="block text-sm font-medium text-gray-700">Funktion<input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={row.bezeichnung} onChange={event => update(row.schluessel, { bezeichnung: event.target.value })} /></label>
              <label className="mt-3 block text-sm font-medium text-gray-700">Zuständiger Kontakt<select className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" value={row.kontakt_id ?? ''} onChange={event => update(row.schluessel, { kontakt_id: event.target.value || null, telefon_art: null, vertretung_id: row.vertretung_id === event.target.value ? null : row.vertretung_id })}><option value="">Noch nicht zugeordnet</option>{kontakte.map(kontakt => <option key={kontakt.id} value={kontakt.id}>{kontakt.name}{kontakt.funktion ? ` · ${kontakt.funktion}` : ''}</option>)}</select></label>
              <label className="mt-3 block text-sm font-medium text-gray-700">Bevorzugte Rufnummer<select disabled={!person} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 disabled:bg-gray-100" value={row.telefon_art ?? ''} onChange={event => update(row.schluessel, { telefon_art: (event.target.value || null) as KontaktTelefonArt | null })}><option value="">Alle vorhandenen Nummern anzeigen</option>{arten.map(art => <option key={art.id} value={art.id}>{art.label}: {person && nummerFuerArt(person, art.id)}</option>)}</select></label>
              <label className="mt-3 block text-sm font-medium text-gray-700">Vertretung<select className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" value={row.vertretung_id ?? ''} onChange={event => update(row.schluessel, { vertretung_id: event.target.value || null })}><option value="">Keine Vertretung</option>{kontakte.filter(kontakt => kontakt.id !== row.kontakt_id).map(kontakt => <option key={kontakt.id} value={kontakt.id}>{kontakt.name}</option>)}</select></label>
              {!person ? <p className="mt-3 text-xs font-medium text-amber-700">Noch keine Person zugeordnet. Legen Sie die Person zuerst unter Kontakte an.</p> : !hatNummer ? <p className="mt-3 text-xs font-medium text-amber-700">Der Kontakt ist zugeordnet, hat aber noch keine Rufnummer.</p> : null}
              <div className="mt-4 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={row.aktiv} onChange={event => update(row.schluessel, { aktiv: event.target.checked })} /> Aktiv</label>
                <button type="button" disabled={saving !== null} onClick={() => void speichern(row)} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><Save className="h-4 w-4" /> {saving === row.schluessel ? 'Speichern…' : 'Speichern'}</button>
              </div>
            </article>
          })}
        </div>
      </section>)}
    </div>}
  </div>
}
