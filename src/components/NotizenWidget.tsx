import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, NotebookPen, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { inputClass, ErrorMessage } from './ZentraleEntryEditor'
import type { NotizBereich, NotizSichtbarkeit, ZentraleNotiz } from '../lib/types'

// Schwebendes Notiz-Widget über der Arbeitsfläche in Zentrale/Innendienst
// (Ersatz für Klebezettel am Bildschirm). Zwei Sichtbarkeiten: privat (nur
// die eigene Notiz) und geteilt (Schicht-Pinnwand, z. B. Übergabe-Hinweise).
// Siehe supabase/migrations/20260926074234_zentrale_notizen.sql für die
// RLS-Regeln, die dieselbe Trennung durchsetzen.

const STORAGE_KEY = 'notizenWidgetOffen'

export default function NotizenWidget({ bereich }: { bereich: NotizBereich }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })
  const [notizen, setNotizen] = useState<ZentraleNotiz[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [sichtbarkeit, setSichtbarkeit] = useState<NotizSichtbarkeit>('privat')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('zentrale_notizen')
      .select('*')
      .eq('bereich', bereich)
      .order('erledigt', { ascending: true })
      .order('created_at', { ascending: false })
    if (loadError) { setError(loadError.message); return }
    setNotizen(data ?? [])
  }, [bereich])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    load().finally(() => setLoading(false)).catch(() => {})
  }, [open, load])

  useEffect(() => {
    if (!open) return
    const channel = supabase
      .channel(`zentrale-notizen-${bereich}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zentrale_notizen', filter: `bereich=eq.${bereich}` }, () => { load().catch(() => {}) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [open, bereich, load])

  function toggleOpen() {
    const next = !open
    setOpen(next)
    try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* ignore */ }
  }

  async function addNotiz() {
    const value = text.trim()
    if (!value || !user) return
    setSaving(true)
    setError('')
    const { error: insertError } = await supabase
      .from('zentrale_notizen')
      .insert({ bereich, text: value, sichtbarkeit, autor_id: user.id })
    setSaving(false)
    if (insertError) { setError(insertError.message); return }
    setText('')
    await load()
  }

  async function toggleErledigt(item: ZentraleNotiz) {
    const { error: updateError } = await supabase
      .from('zentrale_notizen')
      .update({ erledigt: !item.erledigt })
      .eq('id', item.id)
    if (updateError) { setError(updateError.message); return }
    await load()
  }

  async function remove(item: ZentraleNotiz) {
    const { error: deleteError } = await supabase.from('zentrale_notizen').delete().eq('id', item.id)
    if (deleteError) { setError(deleteError.message); return }
    await load()
  }

  function startEdit(item: ZentraleNotiz) {
    setEditingId(item.id)
    setEditText(item.text)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditText('')
  }

  async function saveEdit(item: ZentraleNotiz) {
    const value = editText.trim()
    if (!value) return
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase
      .from('zentrale_notizen')
      .update({ text: value })
      .eq('id', item.id)
    setSaving(false)
    if (updateError) { setError(updateError.message); return }
    cancelEdit()
    await load()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Notizen öffnen"
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white shadow-lg rounded-full px-4 py-3"
      >
        <NotebookPen className="w-5 h-5" />
        {notizen.some(item => !item.erledigt) ? <span className="text-xs font-semibold bg-white text-blue-800 rounded-full w-5 h-5 flex items-center justify-center">{notizen.filter(item => !item.erledigt).length}</span> : null}
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[min(92vw,22rem)] max-h-[75vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-gray-50">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><NotebookPen className="w-4 h-4" /> Notizen</h2>
        <button type="button" onClick={toggleOpen} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Notizen schließen"><X className="w-4 h-4" /></button>
      </div>

      <div className="px-4 py-3 border-b space-y-2">
        <textarea
          className={`${inputClass} min-h-16 resize-y`}
          placeholder="Neue Notiz…"
          value={text}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void addNotiz() }}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex text-xs rounded-lg border border-gray-300 overflow-hidden">
            <button type="button" onClick={() => setSichtbarkeit('privat')} className={`px-3 py-1.5 font-medium ${sichtbarkeit === 'privat' ? 'bg-blue-800 text-white' : 'text-gray-600'}`}>Privat</button>
            <button type="button" onClick={() => setSichtbarkeit('geteilt')} className={`px-3 py-1.5 font-medium ${sichtbarkeit === 'geteilt' ? 'bg-blue-800 text-white' : 'text-gray-600'}`}>Geteilt</button>
          </div>
          <button
            type="button"
            disabled={saving || !text.trim()}
            onClick={() => void addNotiz()}
            className="inline-flex items-center gap-1.5 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Hinzufügen
          </button>
        </div>
        {error ? <ErrorMessage text={error} /> : null}
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {loading ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          : notizen.length === 0 ? <p className="px-4 py-6 text-sm text-gray-500 text-center">Keine Notizen vorhanden.</p>
          : notizen.map(item => {
            const canEdit = item.autor_id === user?.id || item.sichtbarkeit === 'geteilt'
            const isEditing = editingId === item.id
            return (
              <div key={item.id} className="flex items-start gap-2.5 px-4 py-3">
                <button type="button" onClick={() => void toggleErledigt(item)} aria-label={item.erledigt ? 'Als offen markieren' : 'Als erledigt markieren'} className={`mt-0.5 flex-none w-5 h-5 rounded-full border flex items-center justify-center ${item.erledigt ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300'}`}>
                  {item.erledigt ? <Check className="w-3 h-3" /> : null}
                </button>
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <div className="space-y-1.5">
                      <textarea
                        autoFocus
                        className={`${inputClass} min-h-16 resize-y text-sm`}
                        value={editText}
                        onChange={event => setEditText(event.target.value)}
                        onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void saveEdit(item) }}
                      />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={cancelEdit} className="text-xs px-2.5 py-1 border border-gray-300 rounded-lg">Abbrechen</button>
                        <button type="button" disabled={saving || !editText.trim()} onClick={() => void saveEdit(item)} className="text-xs px-2.5 py-1 bg-blue-800 hover:bg-blue-900 text-white rounded-lg disabled:opacity-50">Speichern</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className={`text-sm whitespace-pre-wrap break-words ${item.erledigt ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.text}</p>
                      {item.sichtbarkeit === 'geteilt' ? <span className="inline-block mt-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Geteilt</span> : null}
                    </>
                  )}
                </div>
                {!isEditing && canEdit ? (
                  <div className="flex-none flex items-center gap-0.5">
                    <button type="button" onClick={() => startEdit(item)} aria-label="Notiz bearbeiten" className="p-1.5 text-gray-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => void remove(item)} aria-label="Notiz löschen" className="p-1.5 text-gray-400 hover:text-red-700 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
      </div>
    </div>
  )
}
