import { useState } from 'react'
import { ArrowLeft, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import { telHref, useWichtigeTelefonnummern } from '../../lib/telefonnummern'
import type { TelefonnummerKategorie, WichtigeTelefonnummer } from '../../lib/types'
import { Empty, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'

const KATEGORIE_LABEL: Record<TelefonnummerKategorie, string> = { intern: 'Intern', extern: 'Extern' }
const emptyForm = { kategorie: 'intern' as TelefonnummerKategorie, bezeichnung: '', nummer: '', hinweis: '', sortierung: '0' }

export default function StammdatenTelefonnummernPage() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger } = useAuth()
  const canManage = isStrictAdmin || isGenehmiger
  const { nummern, loading, error: loadError, reload } = useWichtigeTelefonnummern()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<WichtigeTelefonnummer | null>(null)
  const [form, setForm] = useState(emptyForm)

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  function openNew(kategorie: TelefonnummerKategorie) { setEditing(null); setForm({ ...emptyForm, kategorie }); setShowForm(true); setError('') }
  function openEdit(item: WichtigeTelefonnummer) { setEditing(item); setForm({ kategorie: item.kategorie, bezeichnung: item.bezeichnung, nummer: item.nummer, hinweis: item.hinweis ?? '', sortierung: String(item.sortierung) }); setShowForm(true); setError('') }

  async function save() {
    if (!form.bezeichnung.trim()) { setError('Bitte eine Bezeichnung eingeben.'); return }
    if (!form.nummer.trim()) { setError('Bitte eine Nummer eingeben.'); return }
    setSaving(true)
    const payload = { kategorie: form.kategorie, bezeichnung: form.bezeichnung.trim(), nummer: form.nummer.trim(), hinweis: form.hinweis.trim() || null, sortierung: Number(form.sortierung) || 0 }
    const response = editing
      ? await supabase.from('wichtige_telefonnummern').update(payload).eq('id', editing.id).select('id')
      : await supabase.from('wichtige_telefonnummern').insert({ ...payload, created_by: profile?.id ?? null }).select('id')
    setSaving(false)
    if (response.error || !response.data?.length) { setError('Nummer konnte nicht gespeichert werden.'); return }
    logAudit(editing ? 'Telefonnummer bearbeitet' : 'Telefonnummer angelegt', form.bezeichnung.trim()); setShowForm(false); setNotice('Telefonnummer wurde gespeichert.'); await reload()
  }
  async function remove() {
    if (!editing || !window.confirm(`Nummer „${editing.bezeichnung}“ endgültig löschen?`)) return
    const result = await supabase.from('wichtige_telefonnummern').delete().eq('id', editing.id).select('id')
    if (result.error || !result.data?.length) { setError('Nummer konnte nicht gelöscht werden.'); return }
    logAudit('Telefonnummer endgültig gelöscht', editing.bezeichnung); setShowForm(false); setNotice('Telefonnummer wurde endgültig gelöscht.'); await reload()
  }

  return <div>
    <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" /> Zum Portal</Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Stammdaten &amp; Nachschlagewerke</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Wichtige Telefonnummern</h1><p className="text-sm text-gray-500 mt-1">Intern (Dienststelle) und extern (andere Dienststellen/Behörden), erscheinen als Kachel auf der Zentrale- und Innendienst-Hauptseite.</p></div>
    {!canManage ? <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">Nur lesender Zugriff. Änderungen an diesen Stammdaten führen ausschließlich Administration und Genehmiger durch.</div> : null}
    {(error || loadError) && !showForm ? <ErrorMessage text={error || 'Die Telefonnummern konnten nicht geladen werden.'} /> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(['intern', 'extern'] as const).map(kategorie => {
          const items = nummern.filter(item => item.kategorie === kategorie)
          return <section key={kategorie} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3">
              <div><h2 className="font-bold text-gray-900">{KATEGORIE_LABEL[kategorie]}</h2><p className="text-sm text-gray-500">{items.length} Nummern.</p></div>
              {canManage ? <button type="button" onClick={() => openNew(kategorie)} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Nummer</button> : null}
            </div>
            {items.length === 0 ? <Empty text="Keine Nummern hinterlegt." /> : <div className="divide-y divide-gray-100">{items.map(item => <article key={item.id} className="p-4 sm:p-5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900">{item.bezeichnung}</h3>
                <a href={telHref(item.nummer)} className="mt-1 inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline"><Phone className="w-3.5 h-3.5" /> {item.nummer}</a>
                {item.hinweis ? <p className="text-sm text-gray-500 mt-1">{item.hinweis}</p> : null}
              </div>
              {canManage ? <button type="button" onClick={() => openEdit(item)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex-shrink-0" aria-label="Nummer bearbeiten"><Pencil className="w-4 h-4" /></button> : null}
            </article>)}</div>}
          </section>
        })}
      </div>
    )}
    {showForm ? <Modal title={editing ? 'Nummer bearbeiten' : 'Nummer anlegen'} close={() => setShowForm(false)}>
      <label className="block text-xs font-medium text-gray-600">Kategorie
        <select className={inputClass} value={form.kategorie} onChange={event => setForm(current => ({ ...current, kategorie: event.target.value as TelefonnummerKategorie }))}>
          <option value="intern">Intern</option>
          <option value="extern">Extern</option>
        </select>
      </label>
      <Field label="Bezeichnung *" value={form.bezeichnung} onChange={value => setForm(current => ({ ...current, bezeichnung: value }))} />
      <Field label="Nummer *" value={form.nummer} onChange={value => setForm(current => ({ ...current, nummer: value }))} />
      <Field label="Hinweis (optional)" value={form.hinweis} onChange={value => setForm(current => ({ ...current, hinweis: value }))} />
      <Field label="Sortierung" type="number" value={form.sortierung} onChange={value => setForm(current => ({ ...current, sortierung: value }))} />
      {error ? <ErrorMessage text={error} /> : null}
      <div className="flex flex-wrap gap-3 pt-2">
        {editing && canManage ? <button type="button" disabled={saving} onClick={() => void remove()} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /> Endgültig löschen</button> : <span className="mr-auto" />}
        <button type="button" onClick={() => setShowForm(false)} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button>
        <button type="button" disabled={saving} onClick={() => void save()} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button>
      </div>
    </Modal> : null}
  </div>
}
