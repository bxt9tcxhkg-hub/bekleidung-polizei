import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileOutput, Pencil, Plus, RotateCcw, Send, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import PortalChrome from '../components/PortalChrome'
import { Actions, Area, ErrorMessage, Field, Modal, inputClass } from '../components/ZentraleEntryEditor'
import { generateUeberstundenPdf } from '../lib/ueberstundenPdf'
import { EMPTY_MELDUNG_FORM, FORM_FIELD_BY_KATEGORIE, KATEGORIEN, STATUS_COLOR, STATUS_LABEL, formToPayload, formatStunden, meldungToForm, totalStunden, type MeldungFormState } from '../lib/ueberstunden'
import type { UeberstundenMeldung } from '../lib/types'

// Überstundenmeldung: self-service - jede/r Bedienstete erfasst die eigenen
// Überstunden (siehe lib/ueberstunden.ts für Kategorien/Kodierung),
// verwaltet sie als Entwurf und reicht sie ein; der Genehmiger entscheidet
// darüber (Abschnitt "Zu entscheiden", nur für Genehmiger sichtbar). Kein
// eigener Bereichs-Layout/Sidebar nötig, dafür ist die Seite zu klein -
// eine einzelne Seite wie z. B. Hilfe.tsx.

function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"><CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{text}</p></div> }

function StundenBreakdown({ item }: { item: UeberstundenMeldung }) {
  const parts = KATEGORIEN.filter(kat => item[kat.key] > 0).map(kat => `${kat.code} ${formatStunden(item[kat.key])} Std.`)
  if (parts.length === 0) return null
  return <p className="text-xs text-gray-500 mt-1">{parts.join(' · ')}</p>
}

export default function Ueberstunden() {
  const { profile, isGenehmiger } = useAuth()
  const [meldungen, setMeldungen] = useState<UeberstundenMeldung[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<UeberstundenMeldung | null>(null)
  const [form, setForm] = useState<MeldungFormState>(EMPTY_MELDUNG_FORM)
  const [rejecting, setRejecting] = useState<UeberstundenMeldung | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    // RLS liefert automatisch die eigenen Meldungen (jeder Status) plus - nur
    // für Genehmiger - alle übrigen, siehe Policy "Überstundenmeldungen lesen".
    const result = await supabase.from('ueberstunden_meldungen')
      .select('*, beamter:profiles!ueberstunden_meldungen_beamter_id_fkey(id,name,dienstnummer), genehmiger:profiles!ueberstunden_meldungen_genehmiger_id_fkey(id,name,dienstnummer)')
      .order('datum', { ascending: false }).order('created_at', { ascending: false })
    if (result.error) setError('Die Überstundenmeldungen konnten nicht geladen werden.')
    else setError('')
    setMeldungen((result.data ?? []) as unknown as UeberstundenMeldung[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const eigene = useMemo(() => meldungen.filter(item => item.beamter_id === profile?.id), [meldungen, profile?.id])
  const zuEntscheiden = useMemo(() => meldungen.filter(item => item.status === 'eingereicht' && item.beamter_id !== profile?.id), [meldungen, profile?.id])

  function openNew() { setEditing(null); setForm(EMPTY_MELDUNG_FORM); setShowForm(true); setError('') }
  function openEdit(item: UeberstundenMeldung) { setEditing(item); setForm(meldungToForm(item)); setShowForm(true); setError('') }

  async function saveDraft() {
    if (!profile?.id) return
    if (!form.grund.trim()) { setError('Bitte den Grund der Überstunde(n) angeben.'); return }
    const payload = formToPayload(form)
    if (totalStunden(payload) <= 0) { setError('Bitte mindestens eine Stundenkategorie ausfüllen.'); return }
    setSaving(true)
    const response = editing
      ? await supabase.from('ueberstunden_meldungen').update(payload).eq('id', editing.id)
      : await supabase.from('ueberstunden_meldungen').insert({ ...payload, beamter_id: profile.id, created_by: profile.id })
    setSaving(false)
    if (response.error) { setError('Die Meldung konnte nicht gespeichert werden.'); return }
    setShowForm(false); setNotice('Entwurf wurde gespeichert.'); await load()
  }
  async function submitMeldung(item: UeberstundenMeldung) {
    const result = await supabase.from('ueberstunden_meldungen').update({ status: 'eingereicht', eingereicht_at: new Date().toISOString() }).eq('id', item.id)
    if (result.error) { setError('Die Meldung konnte nicht eingereicht werden.'); return }
    logAudit('Überstundenmeldung eingereicht', `${item.datum} · ${formatStunden(totalStunden(item))} Std.`)
    setNotice('Meldung wurde eingereicht und wartet auf Genehmigung.'); await load()
  }
  async function withdrawMeldung(item: UeberstundenMeldung) {
    const result = await supabase.from('ueberstunden_meldungen').update({ status: 'entwurf' }).eq('id', item.id)
    if (result.error) { setError('Die Meldung konnte nicht zurückgezogen werden.'); return }
    setNotice('Meldung wurde zurückgezogen und ist wieder als Entwurf bearbeitbar.'); await load()
  }
  async function deleteMeldung(item: UeberstundenMeldung) {
    if (!window.confirm('Diesen Entwurf endgültig löschen?')) return
    const result = await supabase.from('ueberstunden_meldungen').delete().eq('id', item.id)
    if (result.error) { setError('Die Meldung konnte nicht gelöscht werden.'); return }
    setNotice('Entwurf wurde gelöscht.'); await load()
  }
  async function decide(item: UeberstundenMeldung, status: 'genehmigt' | 'abgelehnt', note: string) {
    if (!profile?.id) return
    const result = await supabase.from('ueberstunden_meldungen').update({ status, genehmiger_id: profile.id, genehmigt_at: new Date().toISOString(), genehmiger_note: note.trim() || null }).eq('id', item.id)
    if (result.error) { setError('Die Entscheidung konnte nicht gespeichert werden.'); return }
    logAudit(status === 'genehmigt' ? 'Überstundenmeldung genehmigt' : 'Überstundenmeldung abgelehnt', `${item.beamter?.name ?? '–'} · ${item.datum}`)
    setRejecting(null); setRejectNote(''); setNotice(status === 'genehmigt' ? 'Meldung wurde genehmigt.' : 'Meldung wurde abgelehnt.'); await load()
  }

  function printMeldung(item: UeberstundenMeldung) {
    generateUeberstundenPdf({
      beamterName: item.beamter?.name ?? '–', bearbeiterName: profile?.name ?? '–', genehmigerName: item.genehmiger?.name ?? null,
      datum: item.datum, zeitVon: item.zeit_von?.slice(0, 5) ?? null, zeitBis: item.zeit_bis?.slice(0, 5) ?? null, grund: item.grund,
      stunden: { std_werktag_50: item.std_werktag_50, std_sonn_100: item.std_sonn_100, std_19_22: item.std_19_22, std_22_06: item.std_22_06, std_sonn_200: item.std_sonn_200 },
    })
  }

  return <PortalChrome wide>
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Mein Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Überstundenmeldung</h1><p className="text-sm text-gray-500 mt-1">Überstunden über das vorgegebene Formular erfassen und zur Prüfung abgeben.</p></div><button type="button" onClick={openNew} className="inline-flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Neue Meldung</button></div>
    {error ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : <div className="space-y-8">

      {isGenehmiger ? <section>
        <h2 className="font-bold text-gray-900 mb-3">Zu entscheiden</h2>
        {zuEntscheiden.length === 0 ? <Empty text="Keine eingereichten Meldungen zu entscheiden." /> : <div className="space-y-3">{zuEntscheiden.map(item => <article key={item.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="font-bold text-gray-900">{item.beamter?.name ?? '–'}</span>{item.beamter?.dienstnummer ? <span className="text-xs text-gray-500">DNr. {item.beamter.dienstnummer}</span> : null}<span className="text-xs text-gray-400">{new Date(item.datum).toLocaleDateString('de-AT')}</span></div>
              <p className="text-sm text-gray-700 mt-1">{item.grund}</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{formatStunden(totalStunden(item))} Std. gesamt</p>
              <StundenBreakdown item={item} />
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <button type="button" onClick={() => printMeldung(item)} className="p-2 text-blue-700 hover:bg-white rounded-lg" aria-label="Als PDF ausgeben"><FileOutput className="w-4 h-4" /></button>
              <button type="button" onClick={() => void decide(item, 'genehmigt', '')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 border border-green-300 bg-white px-3 py-2 rounded-lg"><ThumbsUp className="w-3.5 h-3.5" /> Genehmigen</button>
              <button type="button" onClick={() => { setRejecting(item); setRejectNote('') }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 border border-red-300 bg-white px-3 py-2 rounded-lg"><ThumbsDown className="w-3.5 h-3.5" /> Ablehnen</button>
            </div>
          </div>
        </article>)}</div>}
      </section> : null}

      <section>
        <h2 className="font-bold text-gray-900 mb-3">Meine Meldungen</h2>
        {eigene.length === 0 ? <Empty text="Noch keine Überstundenmeldung erfasst." /> : <div className="space-y-3">{eigene.map(item => <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="font-bold text-gray-900">{new Date(item.datum).toLocaleDateString('de-AT')}</span><span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLOR[item.status]}`}>{STATUS_LABEL[item.status]}</span></div>
              <p className="text-sm text-gray-700 mt-1">{item.grund}</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{formatStunden(totalStunden(item))} Std. gesamt</p>
              <StundenBreakdown item={item} />
              {item.status === 'abgelehnt' && item.genehmiger_note ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg mt-2">Rückfrage/Begründung: {item.genehmiger_note}</p> : null}
              {item.status === 'genehmigt' && item.genehmiger ? <p className="text-xs text-green-700 mt-1">Genehmigt von {item.genehmiger.name}</p> : null}
            </div>
            <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
              <button type="button" onClick={() => printMeldung(item)} className="p-2 text-blue-700 hover:bg-blue-50 rounded-lg" aria-label="Als PDF ausgeben"><FileOutput className="w-4 h-4" /></button>
              {item.status === 'entwurf' ? <>
                <button type="button" onClick={() => openEdit(item)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Bearbeiten"><Pencil className="w-4 h-4" /></button>
                <button type="button" onClick={() => void submitMeldung(item)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 border border-blue-200 px-3 py-2 rounded-lg"><Send className="w-3.5 h-3.5" /> Einreichen</button>
                <button type="button" onClick={() => void deleteMeldung(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Löschen"><Trash2 className="w-4 h-4" /></button>
              </> : null}
              {item.status === 'eingereicht' ? <button type="button" onClick={() => void withdrawMeldung(item)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-300 px-3 py-2 rounded-lg"><RotateCcw className="w-3.5 h-3.5" /> Zurückziehen</button> : null}
            </div>
          </div>
        </article>)}</div>}
      </section>
    </div>}

    {showForm ? <Modal title={editing ? 'Überstundenmeldung bearbeiten' : 'Neue Überstundenmeldung'} close={() => setShowForm(false)}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Datum *" type="date" value={form.datum} onChange={value => setForm(current => ({ ...current, datum: value }))} />
        <Field label="Uhrzeit von" type="time" value={form.zeitVon} onChange={value => setForm(current => ({ ...current, zeitVon: value }))} />
        <Field label="Uhrzeit bis" type="time" value={form.zeitBis} onChange={value => setForm(current => ({ ...current, zeitBis: value }))} />
      </div>
      <Area label="Grund der Überstunde(n) *" value={form.grund} onChange={value => setForm(current => ({ ...current, grund: value }))} />
      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">Ü-Std aufgeschlüsselt</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{KATEGORIEN.map(kat => { const field = FORM_FIELD_BY_KATEGORIE[kat.key]; return <label key={kat.key} className="block text-xs font-medium text-gray-600 rounded-lg border border-gray-200 p-2.5">{kat.label}{kat.hinweis ? <span className="block text-[11px] font-normal text-gray-400 mt-0.5">{kat.hinweis}</span> : null}<span className="block text-[11px] font-normal text-gray-400 mt-0.5">{kat.satz} · {kat.code}</span><input inputMode="decimal" className={inputClass} placeholder="0" value={form[field]} onChange={event => setForm(current => ({ ...current, [field]: event.target.value }))} /></label> })}</div>
      </div>
      {error ? <ErrorMessage text={error} /> : null}
      <Actions saving={saving} close={() => setShowForm(false)} save={saveDraft} />
    </Modal> : null}

    {rejecting ? <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-md"><div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b"><h2 className="font-bold text-gray-900">Meldung ablehnen</h2><button type="button" onClick={() => setRejecting(null)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button></div><div className="px-5 sm:px-6 py-4 space-y-4">
      <label className="block text-xs font-medium text-gray-600">Rückfrage/Begründung (optional)<textarea className={`${inputClass} min-h-24 resize-y`} value={rejectNote} onChange={event => setRejectNote(event.target.value)} /></label>
      <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setRejecting(null)} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button><button type="button" onClick={() => void decide(rejecting, 'abgelehnt', rejectNote)} className="bg-red-700 hover:bg-red-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg">Ablehnen</button></div>
    </div></div></div> : null}
  </PortalChrome>
}
