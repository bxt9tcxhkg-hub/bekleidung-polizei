import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Download, Ellipsis, FileText, Folder, FolderInput, Link as LinkIcon, Plus, Trash2, Upload, X } from 'lucide-react'
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

/** Pfad von der obersten Ebene bis zu diesem Ordner (für Breadcrumb/Verschieben-Auswahl). */
function tabPath(tab: EinsatzMaterialTab, byId: Map<string, EinsatzMaterialTab>): EinsatzMaterialTab[] {
  const path: EinsatzMaterialTab[] = []
  let cursor: EinsatzMaterialTab | undefined = tab
  while (cursor) { path.unshift(cursor); cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined }
  return path
}

export default function EinsatzMaterials({ fixedArea }: { fixedArea?: EinsatzMaterialArea }) {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const [area, setArea] = useState<EinsatzMaterialArea>(fixedArea ?? 'einsatzmittel')
  const activeArea = fixedArea ?? area
  const schulungenRoles = areaRoles?.find(row => row.area === 'schulungen')?.roles ?? []
  const canManage = activeArea === 'schulungen'
    ? isStrictAdmin || isGenehmiger || schulungenRoles.includes('sachbearbeiter') || schulungenRoles.includes('admin')
    : canManagePersonalEinsatzmittel({ isStrictAdmin, isGenehmiger, rows: areaRoles })
  // Alle Ordner des Bereichs flach geladen (nicht nur die oberste Ebene) -
  // Kind-/Pfadbeziehungen werden clientseitig über parent_id aufgebaut, damit
  // beliebig tiefe Verschachtelung ohne rekursive Abfragen navigierbar ist.
  const [tabs, setTabs] = useState<EinsatzMaterialTab[]>([])
  const [materials, setMaterials] = useState<EinsatzMaterial[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
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
      setError('Unterlagen-Ordner konnten nicht geladen werden.')
      setTabs([])
      setMaterials([])
      setLoading(false)
      return
    }
    const nextTabs = (tabData ?? []) as EinsatzMaterialTab[]
    setTabs(nextTabs)
    setCurrentFolderId(current => current && nextTabs.some(tab => tab.id === current) ? current : null)
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

  const tabsById = useMemo(() => new Map(tabs.map(tab => [tab.id, tab])), [tabs])
  const currentTab = currentFolderId ? tabsById.get(currentFolderId) ?? null : null
  const breadcrumb = useMemo(() => currentTab ? tabPath(currentTab, tabsById) : [], [currentTab, tabsById])
  const childTabs = useMemo(() => tabs
    .filter(tab => tab.parent_id === currentFolderId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'de-AT')), [tabs, currentFolderId])
  const visibleMaterials = useMemo(
    () => currentFolderId ? materials.filter(item => item.tab_id === currentFolderId) : [],
    [materials, currentFolderId],
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
    if (!currentTab) return
    setEditingTab(currentTab)
    setTabName(currentTab.name)
    setTabDescription(currentTab.description ?? '')
    setError('')
    setShowTabForm(true)
  }

  async function saveTab() {
    const name = tabName.trim()
    if (!name) {
      setError('Bitte einen Namen für den Ordner eingeben.')
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
        parent_id: currentFolderId,
        name,
        description: tabDescription.trim() || null,
        sort_order: childTabs.length,
        created_by: profile?.id ?? null,
      })
    setSaving(false)
    if (response.error) {
      setError(response.error.message.includes('duplicate') ? 'Ein Ordner mit diesem Namen existiert hier bereits.' : 'Ordner konnte nicht gespeichert werden.')
      return
    }
    logAudit(editingTab ? 'Unterlagen-Ordner bearbeitet' : 'Unterlagen-Ordner angelegt', `${AREA_LABELS[activeArea]} · ${name}`)
    setShowTabForm(false)
    setNotice('Ordner wurde gespeichert.')
    await load(activeArea)
  }

  async function deleteTab() {
    if (!editingTab) return
    const hasChildren = tabs.some(tab => tab.parent_id === editingTab.id)
    const hasMaterials = materials.some(item => item.tab_id === editingTab.id)
    if (hasChildren || hasMaterials) {
      setError('Dieser Ordner enthält noch Unterordner oder Unterlagen. Bitte zuerst leeren.')
      return
    }
    if (!window.confirm(`Ordner „${editingTab.name}“ endgültig löschen?`)) return
    const { error: deleteError } = await supabase
      .from('einsatz_material_tabs')
      .delete()
      .eq('id', editingTab.id)
    if (deleteError) {
      setError('Der Ordner konnte nicht gelöscht werden.')
      return
    }
    logAudit('Unterlagen-Ordner gelöscht', `${AREA_LABELS[activeArea]} · ${editingTab.name}`)
    setShowTabForm(false)
    setCurrentFolderId(editingTab.parent_id)
    setNotice('Ordner wurde entfernt.')
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
    if (!currentTab) return
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
        tab_id: currentTab.id,
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
      logAudit('Unterlage hochgeladen', `${AREA_LABELS[activeArea]} · ${currentTab.name} · ${title.trim()}`)
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
    const target = tabsById.get(targetTabId)
    logAudit('Einsatz-Unterlage verschoben', `${editingMaterial.title} → ${target ? tabPath(target, tabsById).map(tab => tab.name).join(' / ') : 'anderer Ordner'}`)
    setEditingMaterial(null)
    setNotice('Unterlage wurde verschoben.')
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
        {canManage && currentTab ? (
          <button type="button" onClick={startAddMaterial} className="flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl">
            <Upload className="w-4 h-4" /> Unterlage hinzufügen
          </button>
        ) : null}
      </div>

      {!fixedArea ? <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        {(['einsatzmittel', 'einsatztraining'] as EinsatzMaterialArea[]).map(id => (
          <button key={id} type="button" onClick={() => { setArea(id); setCurrentFolderId(null) }} className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-all ${area === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {AREA_LABELS[id]}
          </button>
        ))}
      </div> : null}

      {error && !showTabForm && !showMaterialForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
      {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}

      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-4 flex-wrap">
        <button type="button" onClick={() => setCurrentFolderId(null)} className={`hover:underline ${!currentTab ? 'font-semibold text-gray-900' : ''}`}>{AREA_LABELS[activeArea]}</button>
        {breadcrumb.map((tab, index) => <span key={tab.id} className="flex items-center gap-1.5">
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <button type="button" onClick={() => setCurrentFolderId(tab.id)} className={`hover:underline ${index === breadcrumb.length - 1 ? 'font-semibold text-gray-900' : ''}`}>{tab.name}</button>
        </span>)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-xs text-gray-500">{currentTab?.description ?? ''}</p>
        {canManage ? <div className="flex items-center gap-2">
          {currentTab ? <button type="button" onClick={startEditTab} className="p-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-900" aria-label="Ordner bearbeiten"><Ellipsis className="w-4 h-4" /></button> : null}
          <button type="button" onClick={startAddTab} className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-blue-700 hover:bg-blue-50 text-sm font-medium"><Plus className="w-4 h-4" /> Unterordner</button>
        </div> : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : childTabs.length === 0 && visibleMaterials.length === 0 && !currentTab ? (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
          <Folder className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-gray-600">Noch kein Ordner vorhanden</p>
          {canManage ? <button type="button" onClick={startAddTab} className="mt-3 text-sm font-medium text-blue-800">Ersten Ordner anlegen</button> : null}
        </div>
      ) : (
        <div className="space-y-5">
          {childTabs.length > 0 ? <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {childTabs.map(tab => <button key={tab.id} type="button" onClick={() => setCurrentFolderId(tab.id)} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left hover:border-blue-300 hover:bg-blue-50">
              <Folder className="w-5 h-5 text-blue-700 flex-shrink-0" />
              <span className="min-w-0 truncate text-sm font-medium text-gray-900">{tab.name}</span>
            </button>)}
          </div> : null}
          {currentTab ? <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {visibleMaterials.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-gray-500">In diesem Ordner sind noch keine Unterlagen veröffentlicht.</div>
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
          </section> : null}
        </div>
      )}

      {showTabForm ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editingTab ? 'Ordner bearbeiten' : 'Neuen Unterordner anlegen'}</h2>
              <button type="button" onClick={() => setShowTabForm(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <label className="block text-xs font-medium text-gray-600">Name *<input className={`${inputClass} mt-1`} maxLength={40} value={tabName} onChange={event => setTabName(event.target.value)} /></label>
              <label className="block text-xs font-medium text-gray-600">Beschreibung<textarea className={`${inputClass} mt-1 min-h-20 resize-y`} maxLength={300} value={tabDescription} onChange={event => setTabDescription(event.target.value)} /></label>
              {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
            </div>
            <div className="flex flex-wrap gap-3 px-6 py-4 border-t">
              {editingTab ? <button type="button" onClick={() => { void deleteTab() }} className="mr-auto text-red-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-red-50">Ordner löschen</button> : null}
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
              <label className="block text-xs font-medium text-gray-600">In einen anderen Ordner verschieben
                <select className={`${inputClass} mt-1`} value={targetTabId} onChange={event => setTargetTabId(event.target.value)}>
                  {tabs.map(tab => <option key={tab.id} value={tab.id}>{tabPath(tab, tabsById).map(item => item.name).join(' / ')}</option>)}
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
