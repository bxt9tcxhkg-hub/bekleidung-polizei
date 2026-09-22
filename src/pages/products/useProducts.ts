import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import type { Product } from '../../lib/types'
import { parseCsv, parseFileToProducts } from '../../lib/productImport'
import { sizesForMode } from '../../lib/sizes'
import type { ProductSizeMode } from '../../lib/types'
import { emptyProduct, type ConfirmDelete, type OrgFilter, type ProductFormData } from './constants'
import { loadErrorMessage, withTimeout } from '../../lib/loadTimeout'

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [orgFilter, setOrgFilter] = useState<OrgFilter>('all')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<ProductFormData>(emptyProduct())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importOrg, setImportOrg] = useState<'Stadtpolizei' | 'Parkaufsicht'>('Stadtpolizei')
  const [importRows, setImportRows] = useState<ProductFormData[]>([])
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState<{ ok: number; err: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [customSizeInput, setCustomSizeInput] = useState('')
  const [sizeGuideModal, setSizeGuideModal] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('products').select('*').order('name')
    setProducts(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load().catch(() => setError('Produkte konnten nicht geladen werden.')) }, [])

  const filtered = products.filter(p =>
    (orgFilter === 'all' || p.organisation === orgFilter) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.article_number.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase()))
  )

  function openNew() {
    setForm(emptyProduct())
    setEditId(null)
    setError('')
    setShowForm(true)
  }

  function openEdit(p: Product) {
    setForm({ article_number: p.article_number, name: p.name, category: p.category, sub_category: p.sub_category ?? null, gender: p.gender ?? 'unisex', sizes: p.sizes, price: p.price, needs_tailoring: p.needs_tailoring, size_guide: p.size_guide ?? null, organisation: p.organisation ?? 'Stadtpolizei', active: p.active, min_quantity: p.min_quantity ?? 0, bezugsart: p.bezugsart ?? 'massa', size_mode: p.size_mode ?? 'sizes', orderable_in_shop: p.orderable_in_shop ?? true })
    setEditId(p.id)
    setError('')
    setShowForm(true)
  }

  async function save() {
    setError('')
    if (!form.article_number || !form.name) { setError('Artikelnummer und Name sind Pflichtfelder.'); return }
    setSaving(true)
    try {
      const payload = { ...form, size_guide: form.size_guide?.trim() || null }
      const result = editId
        ? await withTimeout(supabase.from('products').update(payload).eq('id', editId))
        : await withTimeout(supabase.from('products').insert(payload))
      if (result.error) { setError(result.error.message); return }
      logAudit(editId ? 'Produkt bearbeitet' : 'Produkt angelegt', form.name)
      setShowForm(false)
      load()
    } catch (err) {
      setError(loadErrorMessage(err, 'Speichern fehlgeschlagen.'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(p: Product) {
    const { error: toggleError } = await supabase.from('products').update({ active: !p.active }).eq('id', p.id)
    if (toggleError) { setError('Status konnte nicht geändert werden.'); return }
    logAudit(p.active ? 'Produkt deaktiviert' : 'Produkt aktiviert', p.name)
    load()
  }

  async function confirmAndDelete() {
    if (!confirmDelete) return
    setError('')
    setDeleting(true)
    try {
      if (confirmDelete.mode === 'single') {
        const p = confirmDelete.product
        const { error: delError } = await withTimeout(supabase.from('products').delete().eq('id', p.id))
        if (delError) {
          if (delError.code === '23503') {
            const { error: deactError } = await withTimeout(supabase.from('products').update({ active: false }).eq('id', p.id))
            if (!deactError) logAudit('Produkt deaktiviert', p.name)
            setError(deactError
              ? `„${p.name}" wird noch verwendet und konnte weder gelöscht noch deaktiviert werden.`
              : `„${p.name}" wird bereits in Bestellungen oder im Lager verwendet und kann nicht gelöscht werden – das Produkt wurde stattdessen deaktiviert.`)
          } else {
            setError(`Löschen fehlgeschlagen: ${delError.message}`)
          }
        } else {
          logAudit('Produkt gelöscht', p.name)
        }
      } else {
        const ids = filtered.map(p => p.id)
        const { error: delError } = await withTimeout(supabase.from('products').delete().in('id', ids))
        if (delError) {
          if (delError.code === '23503') {
            const { error: deactError } = await withTimeout(supabase.from('products').update({ active: false }).in('id', ids))
            if (!deactError) logAudit('Produkte deaktiviert', `${ids.length} Produkte`)
            setError(deactError
              ? 'Einige Produkte werden noch verwendet und konnten weder gelöscht noch deaktiviert werden.'
              : 'Einige Produkte werden bereits in Bestellungen oder im Lager verwendet und können nicht gelöscht werden – sie wurden stattdessen deaktiviert.')
          } else {
            setError(`Löschen fehlgeschlagen: ${delError.message}`)
          }
        } else {
          logAudit('Produkte gelöscht', `${ids.length} Produkte`)
        }
      }
      load()
    } catch (err) {
      setError(loadErrorMessage(err, 'Löschen fehlgeschlagen.'))
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const isExcel = file.name.match(/\.(xlsx|xls|ods)$/i)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        let rawRows: Record<string, string>[]
        if (isExcel) {
          const wb = XLSX.read(ev.target?.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          rawRows = (XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[])
            .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), String(v ?? '')])))
        } else {
          rawRows = parseCsv(ev.target?.result as string)
        }
        const rows = parseFileToProducts(rawRows)
        if (rows.length === 0) { setImportError('Keine gültigen Zeilen gefunden. Spalten prüfen.'); return }
        setImportError('')
        setImportRows(rows)
        setImportDone(null)
      } catch {
        setImportError('Datei konnte nicht gelesen werden.')
      }
    }
    if (isExcel) reader.readAsArrayBuffer(file)
    else reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  async function runImport() {
    setImporting(true)
    setImportError('')
    let ok = 0
    const failures: string[] = []
    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i]
      const { error: rowError } = await supabase
        .from('products')
        .upsert({ ...row, organisation: importOrg }, { onConflict: 'article_number,organisation' })
      if (rowError) failures.push(`Zeile ${i + 1} („${row.name}")`); else ok++
    }
    setImporting(false)
    setImportDone({ ok, err: failures.length })
    if (ok > 0) logAudit('Produkte importiert', `${ok} Produkte`)
    if (failures.length > 0) {
      setImportError(`Fehler bei ${failures.length} Zeile${failures.length !== 1 ? 'n' : ''}: ${failures.join(', ')}`)
    } else {
      setImportRows([])
    }
    load()
  }

  function toggleSize(size: string) {
    setForm(f => ({
      ...f,
      sizes: f.sizes.includes(size) ? f.sizes.filter(s => s !== size) : [...f.sizes, size],
    }))
  }

  function addCustomSize() {
    const val = customSizeInput.trim()
    if (!val || form.sizes.includes(val)) { setCustomSizeInput(''); return }
    setForm(f => ({ ...f, sizes: [...f.sizes, val] }))
    setCustomSizeInput('')
  }

  function setSizeMode(mode: ProductSizeMode) {
    setForm(f => ({ ...f, size_mode: mode, sizes: sizesForMode(mode, f.sizes) }))
  }

  function openImport() {
    setShowImport(true)
    setImportRows([])
    setImportDone(null)
    setImportError('')
    setImportOrg('Stadtpolizei')
  }

  return {
    search,
    setSearch,
    orgFilter,
    setOrgFilter,
    loading,
    showForm,
    editId,
    form,
    setForm,
    saving,
    error,
    showImport,
    importOrg,
    setImportOrg,
    importRows,
    importError,
    importing,
    importDone,
    confirmDelete,
    setConfirmDelete,
    deleting,
    customSizeInput,
    setCustomSizeInput,
    sizeGuideModal,
    setSizeGuideModal,
    fileRef,
    filtered,
    openNew,
    openEdit,
    save,
    toggleActive,
    confirmAndDelete,
    handleFile,
    runImport,
    toggleSize,
    addCustomSize,
    setSizeMode,
    openImport,
    setShowForm,
    setShowImport,
  }
}
