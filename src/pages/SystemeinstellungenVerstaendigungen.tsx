import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ladeFunktionskontakte, ladeVerstaendigungsregeln, nummerFuerArt } from '../lib/verstaendigungsregeln'
import { STUFE_META } from '../lib/einsatzSchema'
import { logAudit } from '../lib/audit'
import type { PortalFunktionskontakt, Verstaendigungsregel, ZentraleKontakt } from '../lib/types'

const DIMENSIONEN = ['mittel', 'gross', 'katastrophe'] as const
const leeresFormular = (dimension: Verstaendigungsregel['dimension']) => ({ dimension, funktionskontakt_key: '', sortierung: 10, pflicht: true })

export default function SystemeinstellungenVerstaendigungen() {
  const [regeln, setRegeln] = useState<Verstaendigungsregel[]>([])
  const [funktionen, setFunktionen] = useState<PortalFunktionskontakt[]>([])
  const [kontakte, setKontakte] = useState<ZentraleKontakt[]>([])
  const [dimension, setDimension] = useState<Verstaendigungsregel['dimension']>('mittel')
  const [editing, setEditing] = useState<Verstaendigungsregel | null>(null)
  const [form, setForm] = useState<ReturnType<typeof leeresFormular> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [regelRows, funktionsRows, kontakteResult] = await Promise.all([
        ladeVerstaendigungsregeln(),
        ladeFunktionskontakte(),
        supabase.from('zentrale_kontakte').select('*').order('name'),
      ])
      if (kontakteResult.error) throw kontakteResult.error
      setRegeln(regelRows)
      setFunktionen(funktionsRows)
      setKontakte((kontakteResult.data ?? []) as ZentraleKontakt[])
      setError('')
    } catch { setError('Das Verständigungsschema konnte nicht geladen werden.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const funktionByKey = useMemo(() => new Map(funktionen.map(row => [row.schluessel, row])), [funktionen])
  const kontaktById = useMemo(() => new Map(kontakte.map(row => [row.id, row])), [kontakte])

  async function speichern() {
    if (!form || saving) return
    const funktion = funktionByKey.get(form.funktionskontakt_key)
    if (!funktion) { setError('Bitte einen Funktionskontakt auswählen.'); return }
    setSaving(true); setError(''); setNotice('')
    const payload = {
      dimension: form.dimension,
      bezeichnung: funktion.bezeichnung,
      funktionskontakt_key: funktion.schluessel,
      sortierung: form.sortierung,
      pflicht: form.pflicht,
      kontakt_id: null,
      telefon_art: null,
      vertretung_id: null,
    }
    const result = editing
      ? await supabase.from('verstaendigungsregeln').update(payload).eq('id', editing.id).select('id').single()
      : await supabase.from('verstaendigungsregeln').insert({ ...payload, schluessel: `schritt_${crypto.randomUUID()}` }).select('id').single()
    setSaving(false)
    if (result.error || !result.data) { setError(result.error?.message ?? 'Speichern fehlgeschlagen.'); return }
    logAudit(editing ? 'Verständigungsregel geändert' : 'Verständigungsregel angelegt', `${form.dimension}: ${funktion.bezeichnung}`)
    setForm(null); setEditing(null); setNotice('Verständigungsregel gespeichert. Sie gilt für neue Ereignisse.'); await load()
  }

  async function entfernen(row: Verstaendigungsregel) {
    if (!window.confirm(`Verständigung „${row.bezeichnung}“ für neue Ereignisse entfernen? Laufende Ereignisse behalten ihren Stand.`)) return
    const result = await supabase.from('verstaendigungsregeln').delete().eq('id', row.id).select('id').single()
    if (result.error || !result.data) { setError('Regel konnte nicht gelöscht werden.'); return }
    logAudit('Verständigungsregel gelöscht', `${row.dimension}: ${row.bezeichnung}`)
    setNotice('Verständigungsregel entfernt.'); await load()
  }

  const verwendeteKeys = new Set(regeln.filter(row => row.dimension === dimension && row.id !== editing?.id).map(row => row.funktionskontakt_key).filter(Boolean))

  return <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
    <Link to="/portal/systemeinstellungen" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4" /> Zu Systemeinstellungen</Link>
    <h1 className="mt-5 text-2xl font-bold text-gray-900">Verständigungsschema</h1>
    <p className="mt-2 text-sm text-gray-600">Hier wird festgelegt, welche Funktionen bei neuen Mittel-, Groß- und Katastrophenereignissen in welcher Reihenfolge erscheinen. Die konkrete Person wird einmal unter Funktionskontakte gepflegt und gilt für alle Ereignisstufen, in denen die Funktion vorkommt.</p>
    <Link to="/portal/systemeinstellungen/funktionskontakte" className="mt-3 inline-flex text-sm font-medium text-blue-800 hover:underline">Funktionskontakte und Rufnummern verwalten</Link>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p> : null}

    <section className="mt-6 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap gap-2">{DIMENSIONEN.map(id => <button type="button" key={id} onClick={() => { setDimension(id); setForm(null); setEditing(null) }} className={`rounded-lg border px-3 py-2 text-sm ${dimension === id ? 'border-blue-800 bg-blue-50 font-bold text-blue-900' : 'border-gray-300'}`}>{STUFE_META[id].label}</button>)}</div>
      {loading ? <p className="mt-4 text-sm">Lädt…</p> : <div className="mt-4 space-y-2">{regeln.filter(row => row.dimension === dimension).map(row => {
        const funktion = row.funktionskontakt_key ? funktionByKey.get(row.funktionskontakt_key) : null
        const person = funktion?.kontakt_id ? kontaktById.get(funktion.kontakt_id) : null
        const nummer = person && funktion ? (funktion.telefon_art ? nummerFuerArt(person, funktion.telefon_art) : null) : null
        return <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
          <span className="w-8 text-gray-500">{row.sortierung}</span>
          <div className="min-w-0 flex-1"><strong>{row.bezeichnung}</strong>{!row.pflicht ? ' · optional' : ''}<p className={person ? 'text-gray-600' : 'text-amber-700'}>{person ? `${person.name}${nummer ? ` · ${nummer}` : ''}` : 'Noch kein konkreter Kontakt zugeordnet'}</p></div>
          <button type="button" className="text-blue-800" onClick={() => { setEditing(row); setForm({ dimension: row.dimension, funktionskontakt_key: row.funktionskontakt_key ?? '', sortierung: row.sortierung, pflicht: row.pflicht }); setError('') }}>Bearbeiten</button>
          <button type="button" aria-label={`${row.bezeichnung} entfernen`} className="text-red-700" onClick={() => void entfernen(row)}><Trash2 className="h-4 w-4" /></button>
        </div>
      })}</div>}
      <button type="button" className="mt-4 inline-flex items-center gap-1 rounded-lg bg-blue-800 px-3 py-2 text-sm font-medium text-white" onClick={() => { setEditing(null); setForm({ ...leeresFormular(dimension), sortierung: (regeln.filter(row => row.dimension === dimension).at(-1)?.sortierung ?? 0) + 10 }); setError('') }}><Plus className="h-4 w-4" /> Verständigung hinzufügen</button>
      {form ? <div className="mt-5 grid gap-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4 sm:grid-cols-2">
        <label className="text-sm">Funktion<select className="mt-1 w-full rounded-lg border p-2" value={form.funktionskontakt_key} onChange={event => setForm({ ...form, funktionskontakt_key: event.target.value })}><option value="">Bitte auswählen</option>{funktionen.filter(row => row.aktiv && (!verwendeteKeys.has(row.schluessel) || row.schluessel === form.funktionskontakt_key)).map(row => <option key={row.schluessel} value={row.schluessel}>{row.bezeichnung}</option>)}</select></label>
        <label className="text-sm">Reihenfolge<input type="number" className="mt-1 w-full rounded-lg border p-2" value={form.sortierung} onChange={event => setForm({ ...form, sortierung: Number(event.target.value) })} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.pflicht} onChange={event => setForm({ ...form, pflicht: event.target.checked })} /> Verpflichtender Schritt</label>
        <div className="flex gap-2 sm:col-span-2"><button type="button" disabled={saving} onClick={() => void speichern()} className="rounded-lg bg-blue-800 px-4 py-2 text-sm text-white">{saving ? 'Speichern…' : 'Speichern'}</button><button type="button" onClick={() => { setForm(null); setEditing(null) }} className="rounded-lg border px-4 py-2 text-sm">Abbrechen</button></div>
      </div> : null}
    </section>
  </div>
}
