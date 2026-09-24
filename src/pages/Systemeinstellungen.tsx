import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ladeVerstaendigungsregeln, nummerFuerArt, TELEFON_ARTEN } from '../lib/verstaendigungsregeln'
import { STUFE_META } from '../lib/einsatzSchema'
import EinsatzgrundEinstellungen from '../components/EinsatzgrundEinstellungen'
import AblaufvorlagenEinstellungen from '../components/AblaufvorlagenEinstellungen'
import { kontaktTelefonnummern } from '../lib/kontaktTelefon'
import { logAudit } from '../lib/audit'
import type { KontaktTelefonArt, Verstaendigungsregel, ZentraleKontakt } from '../lib/types'

const NAV = [
  { titel: 'Benutzer und Rechte', links: [['Benutzer verwalten', '/portal/benutzer'], ['Auditlog', '/auditlog']] },
  { titel: 'Kontakte und Stammdaten', links: [['Kontakte', '/stammdaten/kontakte'], ['Wichtige Telefonnummern', '/stammdaten/telefonnummern'], ['Register', '/stammdaten']] },
  { titel: 'Dienst und Fachbereiche', links: [['Dienstfunktionen', '/'], ['Fuhrpark', '/fuhrpark'], ['Innendienst und Gebühren', '/innendienst/gebuehren'], ['Schulungen', '/schulungen'], ['Einsatzmittel und Training', '/einsatz'], ['Bekleidung und Budgets', '/budgets']] },
  { titel: 'Operative Inhalte', links: [['Einsatzgründe in der Zentrale', '/zentrale/einsaetze'], ['Kontrollbehelfe', '/aussendienst/kontrollbehelfe'], ['Unterlagen der Zentrale', '/zentrale/unterlagen'], ['Unterlagen des Innendiensts', '/innendienst/unterlagen']] },
] as const
const DIMENSIONEN = ['mittel', 'gross', 'katastrophe'] as const
const leeresFormular = (dimension: Verstaendigungsregel['dimension']) => ({ dimension, bezeichnung: '', kontakt_id: '', telefon_art: '', vertretung_id: '', sortierung: 10, pflicht: true })

export default function Systemeinstellungen() {
  const [regeln, setRegeln] = useState<Verstaendigungsregel[]>([])
  const [kontakte, setKontakte] = useState<ZentraleKontakt[]>([])
  const [dimension, setDimension] = useState<Verstaendigungsregel['dimension']>('mittel')
  const [editing, setEditing] = useState<Verstaendigungsregel | null>(null)
  const [form, setForm] = useState<ReturnType<typeof leeresFormular> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [items, result] = await Promise.all([ladeVerstaendigungsregeln(), supabase.from('zentrale_kontakte').select('*').order('name')])
      if (result.error) throw result.error
      setRegeln(items)
      setKontakte((result.data ?? []) as ZentraleKontakt[])
      setError('')
    } catch { setError('Einstellungen konnten nicht geladen werden. Bitte Datenbank und Adminrechte prüfen.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const kontakt = kontakte.find(row => row.id === form?.kontakt_id)
  const verfuegbareArten = kontakt ? TELEFON_ARTEN.filter(art => nummerFuerArt(kontakt, art.id)) : []
  const byId = new Map(kontakte.map(row => [row.id, row]))

  async function speichern() {
    if (!form || saving) return
    if (!form.bezeichnung.trim()) { setError('Bitte eine Funktion eingeben.'); return }
    if (form.kontakt_id && (!form.telefon_art || !kontakt || !nummerFuerArt(kontakt, form.telefon_art as KontaktTelefonArt))) { setError('Bitte eine vorhandene Rufnummer des Kontakts auswählen.'); return }
    const vertretung = kontakte.find(row => row.id === form.vertretung_id)
    if (form.vertretung_id && (!vertretung || !kontaktTelefonnummern(vertretung).length)) { setError('Die Vertretung braucht eine Rufnummer.'); return }
    setSaving(true); setError(''); setNotice('')
    const payload = { dimension: form.dimension, bezeichnung: form.bezeichnung.trim(), sortierung: form.sortierung, pflicht: form.pflicht,
      kontakt_id: form.kontakt_id || null, telefon_art: (form.telefon_art || null) as KontaktTelefonArt | null, vertretung_id: form.vertretung_id || null }
    const result = editing
      ? await supabase.from('verstaendigungsregeln').update(payload).eq('id', editing.id).select('id').single()
      : await supabase.from('verstaendigungsregeln').insert({ ...payload, schluessel: `schritt_${crypto.randomUUID()}` }).select('id').single()
    setSaving(false)
    if (result.error || !result.data) { setError(result.error?.message ?? 'Speichern fehlgeschlagen.'); return }
    logAudit(editing ? 'Verständigungsregel geändert' : 'Verständigungsregel angelegt', `${form.dimension}: ${form.bezeichnung.trim()}`)
    setForm(null); setEditing(null); setNotice('Verständigungsregel gespeichert. Sie gilt für neue Ereignisse.'); await load()
  }

  async function entfernen(row: Verstaendigungsregel) {
    if (!window.confirm(`Verständigung „${row.bezeichnung}“ für neue Ereignisse entfernen? Laufende Ereignisse behalten ihren Stand.`)) return
    const result = await supabase.from('verstaendigungsregeln').delete().eq('id', row.id).select('id').single()
    if (result.error || !result.data) { setError('Regel konnte nicht gelöscht werden.'); return }
    logAudit('Verständigungsregel gelöscht', `${row.dimension}: ${row.bezeichnung}`)
    setNotice('Verständigungsregel entfernt.'); await load()
  }

  return <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
    <Link to="/" className="inline-flex items-center gap-1 text-sm text-blue-700"><ArrowLeft className="h-4 w-4" /> Zu Mein Bereich</Link>
    <h1 className="mt-5 text-2xl font-bold">Systemeinstellungen</h1>
    <p className="mt-2 text-sm text-gray-600">Verständigungsregeln und Zugänge zur Fachverwaltung. Änderungen an Regeln gelten für neue Ereignisse; laufende Ereignisse behalten ihre Schritte.</p>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p> : null}

    <section className="mt-6 rounded-xl border bg-white p-5" aria-label="Verständigungsschema">
      <h2 className="text-lg font-bold">Verständigungsschema</h2>
      <p className="mt-1 text-sm text-gray-600">Jede Funktion bekommt einen fest zugeordneten Kontakt, eine bevorzugte Nummer und optional eine Vertretung. Ohne Zuordnung erscheint eine Warnung in der Zentrale.</p>
      <div className="mt-4 flex flex-wrap gap-2">{DIMENSIONEN.map(id => <button type="button" key={id} onClick={() => { setDimension(id); setForm(null) }} className={`rounded-lg border px-3 py-2 text-sm ${dimension === id ? 'border-blue-800 bg-blue-50 font-bold text-blue-900' : 'border-gray-300'}`}>{STUFE_META[id].label}</button>)}</div>
      {loading ? <p className="mt-4 text-sm">Lädt…</p> : <div className="mt-4 space-y-2">{regeln.filter(row => row.dimension === dimension).map(row => {
        const person = row.kontakt_id ? byId.get(row.kontakt_id) : null
        const nummer = person ? nummerFuerArt(person, row.telefon_art) : null
        return <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
          <span className="w-8 text-gray-500">{row.sortierung}</span><div className="min-w-0 flex-1"><strong>{row.bezeichnung}</strong>{!row.pflicht ? ' · optional' : ''}<p className={person && nummer ? 'text-gray-600' : 'text-amber-700'}>{person && nummer ? `${person.name} · ${nummer}` : 'Kontakt oder ausgewählte Rufnummer fehlt'}{row.vertretung_id ? ` · Vertretung: ${byId.get(row.vertretung_id)?.name ?? 'Kontakt fehlt'}` : ''}</p></div>
          <button type="button" className="text-blue-800" onClick={() => { setEditing(row); setForm({ dimension: row.dimension, bezeichnung: row.bezeichnung, kontakt_id: row.kontakt_id ?? '', telefon_art: row.telefon_art ?? '', vertretung_id: row.vertretung_id ?? '', sortierung: row.sortierung, pflicht: row.pflicht }); setError('') }}>Bearbeiten</button>
          <button type="button" aria-label={`${row.bezeichnung} entfernen`} className="text-red-700" onClick={() => void entfernen(row)}><Trash2 className="h-4 w-4" /></button>
        </div>
      })}</div>}
      <button type="button" className="mt-4 inline-flex items-center gap-1 rounded-lg bg-blue-800 px-3 py-2 text-sm font-medium text-white" onClick={() => { setEditing(null); setForm({ ...leeresFormular(dimension), sortierung: (regeln.filter(r => r.dimension === dimension).at(-1)?.sortierung ?? 0) + 10 }); setError('') }}><Plus className="h-4 w-4" /> Verständigung hinzufügen</button>
      {form ? <div className="mt-5 grid gap-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4 sm:grid-cols-2">
        <label className="text-sm">Funktion<input className="mt-1 w-full rounded-lg border p-2" value={form.bezeichnung} onChange={e => setForm({ ...form, bezeichnung: e.target.value })} /></label>
        <label className="text-sm">Reihenfolge<input type="number" className="mt-1 w-full rounded-lg border p-2" value={form.sortierung} onChange={e => setForm({ ...form, sortierung: Number(e.target.value) })} /></label>
        <label className="text-sm">Kontakt<select className="mt-1 w-full rounded-lg border p-2" value={form.kontakt_id} onChange={e => setForm({ ...form, kontakt_id: e.target.value, telefon_art: '' })}><option value="">Noch nicht zugeordnet</option>{kontakte.map(k => <option key={k.id} value={k.id}>{k.name}{k.funktion ? ` · ${k.funktion}` : ''}</option>)}</select></label>
        <label className="text-sm">Bevorzugte Rufnummer<select className="mt-1 w-full rounded-lg border p-2" value={form.telefon_art} onChange={e => setForm({ ...form, telefon_art: e.target.value })}><option value="">Bitte Rufnummer wählen</option>{verfuegbareArten.map(a => <option key={a.id} value={a.id}>{a.label}: {kontakt && nummerFuerArt(kontakt, a.id)}</option>)}</select></label>
        <label className="text-sm">Vertretung<select className="mt-1 w-full rounded-lg border p-2" value={form.vertretung_id} onChange={e => setForm({ ...form, vertretung_id: e.target.value })}><option value="">Keine</option>{kontakte.filter(k => k.id !== form.kontakt_id).map(k => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.pflicht} onChange={e => setForm({ ...form, pflicht: e.target.checked })} /> Verpflichtender Schritt</label>
        <div className="flex gap-2 sm:col-span-2"><button type="button" disabled={saving} onClick={() => void speichern()} className="rounded-lg bg-blue-800 px-4 py-2 text-sm text-white">{saving ? 'Speichern…' : 'Speichern'}</button><button type="button" onClick={() => setForm(null)} className="rounded-lg border px-4 py-2 text-sm">Abbrechen</button></div>
      </div> : null}
    </section>

    <EinsatzgrundEinstellungen />
    <AblaufvorlagenEinstellungen />
    <div className="mt-6 grid gap-4 sm:grid-cols-2">{NAV.map(group => <section key={group.titel} className="rounded-xl border bg-white p-5"><h2 className="font-bold">{group.titel}</h2><div className="mt-3 flex flex-wrap gap-2">{group.links.map(([name, to]) => <Link key={to} to={to} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-blue-800 hover:bg-blue-50">{name}</Link>)}</div></section>)}</div>
    <section className="mt-4 rounded-xl border bg-white p-5"><h2 className="font-bold">Outlook und Rainbow</h2><p className="mt-2 text-sm text-gray-600">Derzeit besteht keine Verbindung. Sobald die Stadt-IT die notwendigen Zugänge und die Rainbow-Ereignisanbindung freigegeben hat, werden hier echte Verbindungs-, Prüf- und Betriebsfunktionen ergänzt.</p></section>
  </div>
}
