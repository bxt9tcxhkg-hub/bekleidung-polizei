import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, Download, Ellipsis, FileText, FolderInput, Link as LinkIcon, Plus, Trash2, Upload, X } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { canManagePersonalEinsatzmittel } from '../lib/personalEinsatzmittel'
import { supabase } from '../lib/supabase'
import type { EinsatzMaterial, EinsatzMaterialArea, EinsatzMaterialTab } from '../lib/types'

const MAX_MATERIAL_FILE_SIZE = 100_000_000

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const AREA_LABELS: Record<EinsatzMaterialArea, string> = {
  einsatzmittel: 'Einsatzmittel',
  einsatztraining: 'Einsatztraining',
  schulungen: 'Schulungen',
}

export default function EinsatzMaterials({ fixedArea }: { fixedArea?: EinsatzMaterialArea }) {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const [area, setArea] = useState<EinsatzMaterialArea>(fixedArea ?? 'einsatzmittel')
  const activeArea = fixedArea ?? area
  const schulungenRoles = areaRoles?.find(row => row.area === 'schulungen')?.roles ?? []
  const canManage = activeArea === 'schulungen'
    ? isStrictAdmin || isGenehmiger || (operativeModeActive && (schulungenRoles.includes('sachbearbeiter') || schulungenRoles.includes('admin')))
    : canManagePersonalEinsatzmittel({ isStrictAdmin, isGenehmiger, rows: areaRoles, operativeModeActive })
  const [tabs, setTabs] = useState<EinsatzMaterialTab[]>([])
  const [materials, setMaterials] = useState<EinsatzMaterial[]>([])
  const [activeTabId, setActiveTabId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showTabForm, setShowTabForm] = useState(false)
  const [editingTab, setEditingTab] = useState<EinsatzMaterialTab | null>(null)
  const [tabName, setTabName] = useState('')
  const [tabDescription, setTabDescription] = useState('')
  const [showMaterialForm, setShowMaterialForm] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<EinsatzMaterial | null>(null)
  const [targetTabId, setTargetTabId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [important, setImportant] = useState(false)
  const [published, setPublished] = useState(true)
  const [sourceType, setSourceType] = useState<'file' | 'link'>('file')
  const [externalUrl, setExternalUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (nextArea: EinsatzMaterialArea) => {
    setLoading(true)
    const { data: tabData, error: tabError } = await supabase
      .from('einsatz_material_tabs')
      .select('*')
      .eq('area', nextArea)
      .eq('active', true)
      .order('sort_order')
      .order('name')
    if (tabError) {
      setError('Unterlagen-Kategorien konnten nicht geladen werden.')
      setTabs([])
      setMaterials([])
      setLoading(false)
      return
    }
    const nextTabs = (tabData ?? []) as EinsatzMaterialTab[]
    setTabs(nextTabs)
    setActiveTabId(current => nextTabs.some(tab => tab.id === current) ? current : (nextTabs[0]?.id ?? ''))
    if (nextTabs.length === 0) {
      setMaterials([])
      setLoading(false)
      return
    }
    const { data: materialData, error: materialError } = await supabase
      .from('einsatz_materials')
      .select('*')
      .in('tab_id', nextTabs.map(tab => tab.id))
      .is('archived_at', null)
      .order('important', { ascending: false })
      .order('created_at', { ascending: false })
    if (materialError) {
      setError('Unterlagen konnten nicht geladen werden.')
      setMaterials([])
    } else {
      setError('')
      setMaterials((materialData ?? []) as EinsatzMaterial[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load(activeArea)
  }, [activeArea, load])

  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? null
  const visibleMaterials = useMemo(
    () => materials.filter(item => item.tab_id === activeTabId),
    [materials, activeTabId],
  )

  if (!hasAreaAccess(activeArea === 'schulungen' ? 'schulungen' : 'einsatz_mt')) return <Navigate to="/" replace />

  function startAddTab() {
    setEditingTab(null)
    setTabName('')
    setTabDescription('')
    setError('')
    setShowTabForm(true)
  }

  function startEditTab() {
    if (!activeTab) return
    setEditingTab(activeTab)
    setTabName(activeTab.name)
    setTabDescription(activeTab.description ?? '')
    setError('')
    setShowTabForm(true)
  }

  async function saveTab() {
    const name = tabName.trim()
    if (!name) {
      setError('Bitte einen Namen für den Tab eingeben.')
      return
    }
    setSaving(true)
    const response = editingTab
      ? await supabase.from('einsatz_material_tabs').update({
        name,
        description: tabDescription.trim() || null,
      }).eq('id', editingTab.id)
      : await supabase.from('einsatz_material_tabs').insert({
        area: activeArea,
        name,
        description: tabDescription.trim() || null,
        sort_order: tabs.length,
        created_by: profile?.id ?? null,
      })
    setSaving(false)
    if (response.error) {
      setError(response.error.message.includes('duplicate') ? 'Ein Tab mit diesem Namen existiert bereits.' : 'Tab konnte nicht gespeichert werden.')
      return
    }
    logAudit(editingTab ? 'Unterlagen-Tab bearbeitet' : 'Unterlagen-Tab angelegt', `${AREA_LABELS[activeArea]} · ${name}`)
    setShowTabForm(false)
    setNotice('Tab wurde gespeichert.')
    await load(activeArea)
  }

  async function deleteTab() {
    if (!editingTab) return
    if (!window.confirm(`Tab „${editingTab.name}“ endgültig löschen? Nur leere Tabs können gelöscht werden.`)) return
    const { error: deleteError } = await supabase
      .from('einsatz_material_tabs')
      .delete()
      .eq('id', editingTab.id)
    if (deleteError) {
      setError('Der Tab enthält noch Unterlagen. Bitte diese zuerst verschieben oder löschen.')
      return
    }
    logAudit('Unterlagen-Tab gelöscht', `${AREA_LABELS[activeArea]} · ${editingTab.name}`)
    setShowTabForm(false)
    setNotice('Tab wurde entfernt.')
    await load(activeArea)
  }

  function startAddMaterial() {
    setTitle('')
    setDescription('')
    setImportant(false)
    setPublished(true)
    setSourceType('file')
    setExternalUrl('')
    setFile(null)
    setError('')
    setShowMaterialForm(true)
  }

  async function uploadFile(selectedFile: File): Promise<{ key: string; name: string }> {
    const { data: sessionData } = await supabase.auth.getSession()
    const response = await fetch('/einsatz-upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`,
        'Content-Type': selectedFile.type || 'application/octet-stream',
        'X-File-Size': String(selectedFile.size),
        'X-File-Name': encodeURIComponent(selectedFile.name),
        'X-Material-Area': activeArea,
      },
      body: selectedFile,
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: string } | null
      throw new Error(data?.error || 'Datei konnte nicht hochgeladen werden.')
    }
    return response.json() as Promise<{ key: string; name: string }>
  }

  async function saveMaterial() {
    if (!activeTab) return
    if (!title.trim()) {
      setError('Bitte einen Titel eingeben.')
      return
    }
    if (sourceType === 'file' && !file) {
      setError('Bitte eine Datei auswählen.')
      return
    }
    if (sourceType === 'link' && !/^https:\/\//i.test(externalUrl.trim())) {
      setError('Bitte einen gültigen HTTPS-Link eingeben.')
      return
    }
    if (file && file.size > MAX_MATERIAL_FILE_SIZE) {
      setError('Datei zu groß (max. 100 MB).')
      return
    }

    setSaving(true)
    try {
      const uploaded = sourceType === 'file' && file ? await uploadFile(file) : null
      const { error: insertError } = await supabase.from('einsatz_materials').insert({
        tab_id: activeTab.id,
        title: title.trim(),
        description: description.trim() || null,
        file_key: uploaded?.key ?? null,
        file_name: uploaded?.name ?? null,
        mime_type: file?.type || null,
        file_size: file?.size ?? null,
        external_url: sourceType === 'link' ? externalUrl.trim() : null,
        published,
        important,
        created_by: profile?.id ?? null,
      })
      if (insertError) throw insertError
      logAudit('Unterlage hochgeladen', `${AREA_LABELS[activeArea]} · ${activeTab.name} · ${title.trim()}`)
      setShowMaterialForm(false)
      setNotice('Unterlage wurde gespeichert.')
      await load(activeArea)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unterlage konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  async function openMaterial(item: EinsatzMaterial) {
    if (item.external_url) {
      window.open(item.external_url, '_blank', 'noopener,noreferrer')
      return
    }
    if (!item.file_key) return
    const { data: sessionData } = await supabase.auth.getSession()
    try {
      const response = await fetch(`/files/${item.file_key}`, {
        headers: { Authorization: `Bearer ${sessionData.session?.access_token ?? ''}` },
      })
      if (!response.ok) throw new Error()
      const blobUrl = URL.createObjectURL(await response.blob())
      window.open(blobUrl, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch {
      setError('Unterlage konnte nicht geöffnet werden.')
    }
  }

  function startManageMaterial(item: EinsatzMaterial) {
    setEditingMaterial(item)
    setTargetTabId(item.tab_id)
    setError('')
  }

  async function moveMaterial() {
    if (!editingMaterial || targetTabId === editingMaterial.tab_id) return
    setSaving(true)
    const { error: moveError } = await supabase.rpc('move_einsatz_material', {
      p_material_id: editingMaterial.id,
      p_target_tab_id: targetTabId,
    })
    setSaving(false)
    if (moveError) {
      setError(moveError.message || 'Unterlage konnte nicht verschoben werden.')
      return
    }
    const target = tabs.find(tab => tab.id === targetTabId)
    logAudit('Einsatz-Unterlage verschoben', `${editingMaterial.title} → ${target?.name ?? 'anderer Tab'}`)
    setEditingMaterial(null)
    setNotice('Unterlage wurde verschoben.')
    setActiveTabId(targetTabId)
    await load(activeArea)
  }

  async function deleteMaterial() {
    if (!editingMaterial) return
    if (!window.confirm(`Unterlage „${editingMaterial.title}“ endgültig löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.`)) return
    setSaving(true)
    const { data: sessionData } = await supabase.auth.getSession()
    const response = await fetch('/einsatz-material-delete', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`,
        'X-Material-Id': editingMaterial.id,
      },
    })
    setSaving(false)
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: string } | null
      setError(data?.error || 'Unterlage konnte nicht gelöscht werden.')
      return
    }
    logAudit('Unterlage gelöscht', `${AREA_LABELS[activeArea]} · ${editingMaterial.title}`)
    setEditingMaterial(null)
    setNotice('Unterlage wurde endgültig gelöscht.')
    await load(activeArea)
  }

  return (
    <div>
      {fixedArea === 'schulungen' ? <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-5"><ArrowLeft className="w-4 h-4" /> Zurück zum Portal</Link> : null}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{fixedArea === 'schulungen' ? 'Schulungen' : 'Unterlagen'}</h1>
          <p className="text-gray-500 text-sm mt-1">{fixedArea === 'schulungen' ? 'Schulungsunterlagen, Rechtsinformationen und Arbeitshilfen' : 'Dienstanweisungen und Schulungsmaterial'}</p>
        </div>
        {canManage && activeTab ? (
          <button type="button" onClick={startAddMaterial} className="flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl">
            <Upload className="w-4 h-4" /> Unterlage hinzufügen
          </button>
        ) : null}
      </div>

      {!fixedArea ? <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        {(['einsatzmittel', 'einsatztraining'] as EinsatzMaterialArea[]).map(id => (
          <button key={id} type="button" onClick={() => { setArea(id); setActiveTabId('') }} className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-all ${area === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {AREA_LABELS[id]}
          </button>
        ))}
      </div> : null}

      {error && !showTabForm && !showMaterialForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
      {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}

      <div className="flex items-center gap-2 mb-5 max-w-full overflow-x-auto pb-1">
        {tabs.map(tab => (
          <button key={tab.id} type="button" onClick={() => setActiveTabId(tab.id)} className={`text-sm font-medium px-4 py-2 rounded-xl whitespace-nowrap border transition-colors ${activeTabId === tab.id ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {tab.name}
          </button>
        ))}
        {canManage ? (
          <>
            {activeTab ? <button type="button" onClick={startEditTab} className="p-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-900" aria-label="Aktiven Tab bearbeiten"><Ellipsis className="w-4 h-4" /></button> : null}
            <button type="button" onClick={startAddTab} className="p-2.5 rounded-xl border border-gray-200 bg-white text-blue-700 hover:bg-blue-50" aria-label="Neuen Tab anlegen"><Plus className="w-4 h-4" /></button>
          </>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : !activeTab ? (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
          <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-gray-600">Noch keine Kategorie vorhanden</p>
          {canManage ? <button type="button" onClick={startAddTab} className="mt-3 text-sm font-medium text-blue-800">Ersten Tab anlegen</button> : null}
        </div>
      ) : (
        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="font-semibold text-gray-900">{activeTab.name}</h2>
            {activeTab.description ? <p className="text-xs text-gray-500 mt-0.5">{activeTab.description}</p> : null}
          </div>
          {visibleMaterials.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-500">In diesem Tab sind noch keine Unterlagen veröffentlicht.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {visibleMaterials.map(item => (
                <article key={item.id} className="px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="bg-blue-50 text-blue-700 p-2.5 rounded-lg flex-shrink-0">
                      {item.external_url ? <LinkIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2 items-center">
                        <h3 className="font-medium text-gray-900">{item.title}</h3>
                        {item.important ? <span className="text-xs font-medium bg-red-50 text-red-700 px-2 py-0.5 rounded-full">Wichtig</span> : null}
                        {canManage && !item.published ? <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Entwurf</span> : null}
                      </div>
                      {item.description ? <p className="text-sm text-gray-500 mt-1">{item.description}</p> : null}
                      <p className="text-xs text-gray-400 mt-1">{item.file_name || 'Externer Link'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button type="button" onClick={() => { void openMaterial(item) }} className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-50">
                      <Download className="w-4 h-4" /> Öffnen
                    </button>
                    {canManage ? <button type="button" onClick={() => startManageMaterial(item)} className="p-2.5 text-blue-700 hover:bg-blue-50 rounded-lg" aria-label="Unterlage verschieben oder löschen"><Ellipsis className="w-4 h-4" /></button> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {showTabForm ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editingTab ? 'Tab bearbeiten' : 'Neuen Tab anlegen'}</h2>
              <button type="button" onClick={() => setShowTabForm(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <label className="block text-xs font-medium text-gray-600">Name *<input className={`${inputClass} mt-1`} maxLength={40} value={tabName} onChange={event => setTabName(event.target.value)} /></label>
              <label className="block text-xs font-medium text-gray-600">Beschreibung<textarea className={`${inputClass} mt-1 min-h-20 resize-y`} maxLength={300} value={tabDescription} onChange={event => setTabDescription(event.target.value)} /></label>
              {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
            </div>
            <div className="flex flex-wrap gap-3 px-6 py-4 border-t">
              {editingTab ? <button type="button" onClick={() => { void deleteTab() }} className="mr-auto text-red-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-red-50">Tab löschen</button> : null}
              <button type="button" onClick={() => setShowTabForm(false)} className="border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg">Abbrechen</button>
              <button type="button" disabled={saving} onClick={() => { void saveTab() }} className="bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-lg">{saving ? 'Speichern…' : 'Speichern'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {showMaterialForm ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Unterlage hinzufügen</h2>
              <button type="button" onClick={() => setShowMaterialForm(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <label className="block text-xs font-medium text-gray-600">Titel *<input className={`${inputClass} mt-1`} maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label>
              <label className="block text-xs font-medium text-gray-600">Beschreibung<textarea className={`${inputClass} mt-1 min-h-20 resize-y`} maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} /></label>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                <button type="button" onClick={() => setSourceType('file')} className={`text-sm font-medium px-4 py-1.5 rounded-lg ${sourceType === 'file' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Datei</button>
                <button type="button" onClick={() => setSourceType('link')} className={`text-sm font-medium px-4 py-1.5 rounded-lg ${sourceType === 'link' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Link</button>
              </div>
              {sourceType === 'file' ? (
                <label className="block text-xs font-medium text-gray-600">Datei *<input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png" className={`${inputClass} mt-1`} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
              ) : (
                <label className="block text-xs font-medium text-gray-600">HTTPS-Link *<input type="url" className={`${inputClass} mt-1`} placeholder="https://…" value={externalUrl} onChange={event => setExternalUrl(event.target.value)} /></label>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={important} onChange={event => setImportant(event.target.checked)} /> Als wichtig kennzeichnen</label>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={published} onChange={event => setPublished(event.target.checked)} /> Für Benutzer veröffentlichen</label>
              {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button type="button" onClick={() => setShowMaterialForm(false)} className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2.5 rounded-lg">Abbrechen</button>
              <button type="button" disabled={saving} onClick={() => { void saveMaterial() }} className="flex-1 bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg">{saving ? 'Speichern…' : 'Speichern'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {editingMaterial ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-bold text-gray-900">Unterlage verwalten</h2>
                <p className="text-xs text-gray-500 mt-0.5 truncate max-w-sm">{editingMaterial.title}</p>
              </div>
              <button type="button" onClick={() => setEditingMaterial(null)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <label className="block text-xs font-medium text-gray-600">In einen anderen Tab verschieben
                <select className={`${inputClass} mt-1`} value={targetTabId} onChange={event => setTargetTabId(event.target.value)}>
                  {tabs.map(tab => <option key={tab.id} value={tab.id}>{tab.name}</option>)}
                </select>
              </label>
              {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
            </div>
            <div className="flex flex-wrap gap-3 px-6 py-4 border-t">
              <button type="button" disabled={saving} onClick={() => { void deleteMaterial() }} className="mr-auto flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50 disabled:opacity-60"><Trash2 className="w-4 h-4" /> Endgültig löschen</button>
              <button type="button" onClick={() => setEditingMaterial(null)} className="border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg">Abbrechen</button>
              <button type="button" disabled={saving || targetTabId === editingMaterial.tab_id} onClick={() => { void moveMaterial() }} className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg"><FolderInput className="w-4 h-4" /> Verschieben</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
