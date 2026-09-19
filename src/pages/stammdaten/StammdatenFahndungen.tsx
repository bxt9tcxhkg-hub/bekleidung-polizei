import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import FileDrop from '../../components/FileDrop'
import { Empty, ErrorMessage, Modal } from '../../components/ZentraleEntryEditor'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { decodeFahndungPdf, encodeFahndungPdf } from '../../lib/fahndungPdf'
import { supabase } from '../../lib/supabase'
import { useOwnOperativBereicheToday } from '../../lib/dutyAccess'
import type { ZentraleFahndung } from '../../lib/types'

export default function StammdatenFahndungen() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, isZentralistOnDuty } = useAuth()
  const { bereiche: eigeneBereicheHeute } = useOwnOperativBereicheToday(profile?.id)
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const datenpflegeRoles = areaRoles?.find(row => row.area === 'datenpflege')?.roles ?? []
  const canManage = isStrictAdmin || isGenehmiger
    || (roles.some(role => ['sachbearbeiter', 'admin'].includes(role)) || datenpflegeRoles.some(role => ['sachbearbeiter', 'admin'].includes(role)))
  const canOperate = canManage || isZentralistOnDuty
  const [items, setItems] = useState<ZentraleFahndung[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('zentrale_fahndungen').select('*').order('updated_at', { ascending: false })
    if (result.error) setError('Die Fahndungen konnten nicht geladen werden.')
    else setError('')
    setItems((result.data ?? []) as ZentraleFahndung[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  if (!hasAreaAccess('zentrale') && !hasAreaAccess('datenpflege') && eigeneBereicheHeute.size === 0) return <Navigate to="/" replace />

  async function uploadPdf(files: FileList | File[]) {
    const file = Array.from(files)[0]
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Nur PDF-Dateien.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const response = await fetch('/strassenzustand-upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`,
          'Content-Type': 'application/pdf',
          'X-File-Size': String(file.size),
          'X-File-Name': encodeURIComponent(file.name),
        },
        body: file,
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(data?.error || 'Upload fehlgeschlagen.')
      }
      const uploaded = await response.json() as { key: string; name: string }
      const title = uploaded.name.replace(/\.pdf$/i, '')
      const { error: insertError } = await supabase.from('zentrale_fahndungen').insert({
        art: 'sonstiges',
        beschreibung: title,
        note: encodeFahndungPdf(uploaded.key, uploaded.name),
        priority: 'hoch',
        status: 'offen',
        created_by: profile?.id ?? null,
      })
      if (insertError) throw new Error('Fahndung konnte nicht gespeichert werden.')
      logAudit('Fahndung-PDF hinterlegt', title)
      setShowForm(false)
      setNotice('PDF wurde hinterlegt.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  async function openPdf(item: ZentraleFahndung) {
    const pdf = decodeFahndungPdf(item.note)
    if (!pdf) { setError('Kein PDF hinterlegt.'); return }
    const { data: sessionData } = await supabase.auth.getSession()
    try {
      const response = await fetch(`/files/${pdf.key}`, { headers: { Authorization: `Bearer ${sessionData.session?.access_token ?? ''}` } })
      if (!response.ok) throw new Error()
      const blobUrl = URL.createObjectURL(await response.blob())
      window.open(blobUrl, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch {
      setError('PDF konnte nicht geöffnet werden.')
    }
  }

  async function remove(item: ZentraleFahndung) {
    if (!window.confirm('Fahndung endgültig löschen?')) return
    const result = await supabase.from('zentrale_fahndungen').delete().eq('id', item.id)
    if (result.error) { setError('Eintrag konnte nicht gelöscht werden.'); return }
    logAudit('Fahndung gelöscht', item.beschreibung.slice(0, 80))
    setNotice('Eintrag wurde gelöscht.')
    await load()
  }

  return <div>
    <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" /> Zum Portal</Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Stammdaten &amp; Nachschlagewerke</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Fahndungen</h1><p className="text-sm text-gray-500 mt-1">Nur PDF-Ausschreibungen. Ziehen oder Datei wählen.</p></div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3">
          <div><h2 className="font-bold text-gray-900">Hinterlegte PDFs</h2><p className="text-sm text-gray-500">{items.length} Datei{items.length === 1 ? '' : 'en'}.</p></div>
          {canOperate ? <button type="button" onClick={() => { setShowForm(true); setError('') }} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> PDF</button> : null}
        </div>
        {items.length === 0 ? <Empty text="Keine Fahndungs-PDFs hinterlegt." /> : <div className="divide-y divide-gray-100">{items.map(item => {
          const pdf = decodeFahndungPdf(item.note)
          return <article key={item.id} className="p-4 sm:p-5 flex items-center justify-between gap-3">
            <button type="button" onClick={() => void openPdf(item)} className="text-left min-w-0">
              <p className="font-semibold text-gray-900 truncate">{item.beschreibung}</p>
              <p className="text-xs text-gray-500 mt-0.5">{pdf ? pdf.name : 'Kein PDF'} · {item.status === 'erledigt' ? 'Erledigt' : 'Offen'}</p>
            </button>
            {canOperate ? <button type="button" onClick={() => void remove(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Löschen"><Trash2 className="w-4 h-4" /></button> : null}
          </article>
        })}</div>}
      </section>
    )}
    {showForm ? <Modal title="Fahndungs-PDF hinterlegen" close={() => setShowForm(false)}>
      <FileDrop accept="application/pdf,.pdf" disabled={saving} hint={saving ? 'Lade hoch…' : 'PDF hierher ziehen oder wählen'} onFiles={files => void uploadPdf(files)} />
      {error ? <ErrorMessage text={error} /> : null}
    </Modal> : null}
  </div>
}
