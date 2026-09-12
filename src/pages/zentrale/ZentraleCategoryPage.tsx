import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import type { ZentraleEntry, ZentraleEntryCategory } from '../../lib/types'
import { EntryList, EntryModal } from '../../components/ZentraleEntryEditor'
import { EMPTY_ENTRY_FORM, entryToForm, type EntryFormState } from '../../lib/zentraleEntries'

// Generische Seite für die zentrale_entries-Kategorien, die aus den Tabs der
// Zentrale-Hauptseite in die Sidebar gewandert sind (AV/BV & EV, Fahndungen,
// Schlüssel, Kontakte, Alarmierung, Unterlagen) – jeweils eine eigene,
// bookmarkbare Seite statt eines Reiters.
export default function ZentraleCategoryPage({ category, title, description }: { category: ZentraleEntryCategory; title: string; description: string }) {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManage = isStrictAdmin || isGenehmiger || roles.some(role => ['sachbearbeiter', 'admin'].includes(role))
  const [entries, setEntries] = useState<ZentraleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ZentraleEntry | null>(null)
  const [entry, setEntry] = useState<EntryFormState>(EMPTY_ENTRY_FORM)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('zentrale_entries').select('*').eq('category', category).order('priority').order('updated_at', { ascending: false })
    if (result.error) setError('Die Einträge konnten nicht geladen werden.')
    else setError('')
    setEntries((result.data ?? []) as ZentraleEntry[])
    setLoading(false)
  }, [category])
  useEffect(() => { void load() }, [load])

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  function openNew() { setEditing(null); setEntry(EMPTY_ENTRY_FORM); setShowForm(true); setError('') }
  function openEdit(item: ZentraleEntry) { setEditing(item); setEntry(entryToForm(item)); setShowForm(true); setError('') }

  async function save() {
    if (!entry.title.trim()) { setError('Bitte eine Bezeichnung eingeben.'); return }
    setSaving(true)
    const payload = { category, title: entry.title.trim(), description: entry.description.trim() || null, priority: entry.priority, status: entry.status, valid_from: entry.validFrom || null, valid_until: entry.validUntil || null, location: entry.location.trim() || null, responsible: entry.responsible.trim() || null, reference: entry.reference.trim() || null, restricted: entry.restricted }
    const response = editing ? await supabase.from('zentrale_entries').update(payload).eq('id', editing.id) : await supabase.from('zentrale_entries').insert({ ...payload, created_by: profile?.id ?? null })
    setSaving(false)
    if (response.error) { setError('Eintrag konnte nicht gespeichert werden.'); return }
    logAudit(editing ? 'Zentraleintrag bearbeitet' : 'Zentraleintrag angelegt', `${title} · ${entry.title.trim()}`); setShowForm(false); setNotice('Eintrag wurde gespeichert.'); await load()
  }
  async function remove() {
    if (!editing || !window.confirm(`Eintrag „${editing.title}“ endgültig löschen?`)) return
    const result = await supabase.from('zentrale_entries').delete().eq('id', editing.id)
    if (result.error) { setError('Eintrag konnte nicht gelöscht werden.'); return }
    logAudit('Zentraleintrag endgültig gelöscht', editing.title); setShowForm(false); setNotice('Eintrag wurde endgültig gelöscht.'); await load()
  }

  return <div>
    <Link to="/zentrale" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" /> Zur Zentrale</Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich · Zentrale</p><h1 className="text-2xl font-bold text-gray-900 mt-1">{title}</h1><p className="text-sm text-gray-500 mt-1">{description}</p></div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading
      ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      : <EntryList title={title} description={description} entries={entries} canManage={canManage} openNew={openNew} openEdit={openEdit} />}
    {showForm ? <EntryModal entry={entry} setEntry={setEntry} editing={editing} saving={saving} error={error} close={() => setShowForm(false)} save={save} remove={remove} /> : null}
  </div>
}
