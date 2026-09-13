import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { useAuth } from '../../contexts/AuthContext'
import type { PoolEinsatzmittel } from '../../lib/types'
import {
  POOL_EM_CATEGORIES,
  POOL_EM_CATEGORY_LABELS,
  POOL_EM_FIELDS,
  VERWAHRUNGSORTE,
  VERWAHRUNGSORT_LABELS,
  canManagePoolEinsatzmittel,
  canPurchasePoolEinsatzmittel,
  emptyPoolEmFormValues,
  filterPoolItemsForViewer,
  formValuesFromPoolRecord,
  isLagerOrt,
  isPoolEmCategory,
  poolEmDetailText,
  poolEmFieldKind,
  poolEmFieldLabel,
  poolEmLocationLabel,
  sanitizePoolCategoryFilter,
  validatePoolEm,
  visiblePoolEmCategories,
  type PoolEmCategory,
  type PoolEmFormValues,
} from '../../lib/poolEinsatzmittel'
import { formatIsoDate } from '../../lib/personalEinsatzmittel'
import {
  activeEinsatzmittel,
  ausbuchungPayload,
  formatRemovalReason,
  isEinsatzmittelRemoved,
  planCountedAusbuchung,
  poolItemUsesCountedAusbuchung,
  removedEinsatzmittel,
} from '../../lib/einsatzmittelAusbuchung'
import { generatePoolEmPdf } from '../../lib/einsatzPdf'
import AusbuchungDialog from './AusbuchungDialog'
import PdfExportButton from './PdfExportButton'

type CategoryFilter = 'all' | 'ausgebucht' | PoolEmCategory

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

export default function PoolEinsatzmittelPanel() {
  const { profile, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const canManage = canManagePoolEinsatzmittel({ isStrictAdmin, isGenehmiger, rows: areaRoles, operativeModeActive })
  const canPurchase = canPurchasePoolEinsatzmittel({ isStrictAdmin, isGenehmiger })

  const [items, setItems] = useState<PoolEinsatzmittel[]>([])
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [pdfOrt, setPdfOrt] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [category, setCategory] = useState<PoolEmCategory>('langwaffe_stg77')
  const [verwahrungsort, setVerwahrungsort] = useState('')
  const [lagerNotiz, setLagerNotiz] = useState('')
  const [values, setValues] = useState<PoolEmFormValues>(emptyPoolEmFormValues())
  const [saving, setSaving] = useState(false)
  const [ausbuchungItem, setAusbuchungItem] = useState<PoolEinsatzmittel | null>(null)
  const [ausbuchungReason, setAusbuchungReason] = useState('')
  const [ausbuchungQty, setAusbuchungQty] = useState('')
  const [ausbuchungSaving, setAusbuchungSaving] = useState(false)

  async function load() {
    setLoading(true)
    let query = supabase
      .from('pool_einsatzmittel')
      .select('*')
      .order('created_at', { ascending: false })
    if (!canManage) {
      query = query.neq('category', 'munition')
    }
    const { data, error: loadError } = await query
    if (loadError) {
      setError('Pool-Einsatzmittel konnten nicht geladen werden.')
      setItems([])
    } else {
      setError('')
      setItems(filterPoolItemsForViewer((data ?? []) as PoolEinsatzmittel[], canManage))
    }
    setLoading(false)
  }

  useEffect(() => {
    load().catch(() => {
      setError('Pool-Einsatzmittel konnten nicht geladen werden.')
      setLoading(false)
    })
  }, [canManage])

  const scopedItems = useMemo(() => filterPoolItemsForViewer(items, canManage), [items, canManage])
  const categoryChips = visiblePoolEmCategories(canManage)
  const safeFilter = sanitizePoolCategoryFilter(filter, canManage)

  const visible = useMemo(() => {
    if (safeFilter === 'ausgebucht') return removedEinsatzmittel(scopedItems)
    const active = activeEinsatzmittel(scopedItems)
    return safeFilter === 'all' ? active : active.filter(item => item.category === safeFilter)
  }, [scopedItems, safeFilter])

  const pdfOrtChoices = useMemo(() => {
    const used = new Set(activeEinsatzmittel(scopedItems).map(item => item.verwahrungsort))
    return VERWAHRUNGSORTE.filter(ort => used.has(ort))
  }, [scopedItems])

  function openNew() {
    setEditId(null)
    setCategory('langwaffe_stg77')
    setVerwahrungsort('')
    setLagerNotiz('')
    setValues(emptyPoolEmFormValues())
    setError('')
    setShowForm(true)
  }

  function openEdit(item: PoolEinsatzmittel) {
    if (isEinsatzmittelRemoved(item)) return
    setEditId(item.id)
    setCategory(item.category)
    setVerwahrungsort(item.verwahrungsort)
    setLagerNotiz(item.lager_notiz ?? '')
    setValues(formValuesFromPoolRecord(item))
    setError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
    setSaving(false)
  }

  async function save() {
    if (editId ? !canManage : !canPurchase) return
    const result = validatePoolEm({ category, verwahrungsort, values, lagerNotiz })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSaving(true)
    setError('')
    if (editId) {
      const { error: updateError } = await supabase
        .from('pool_einsatzmittel')
        .update(result.payload)
        .eq('id', editId)
      if (updateError) {
        setError(updateError.message || 'Speichern fehlgeschlagen.')
        setSaving(false)
        return
      }
      logAudit('Pool-Einsatzmittel bearbeitet', `${POOL_EM_CATEGORY_LABELS[result.payload.category]}`)
    } else {
      const { error: insertError } = await supabase
        .from('pool_einsatzmittel')
        .insert({ ...result.payload, created_by: profile?.id ?? null })
      if (insertError) {
        setError(insertError.message || 'Anlegen fehlgeschlagen.')
        setSaving(false)
        return
      }
      logAudit('Pool-Einsatzmittel angelegt', `${POOL_EM_CATEGORY_LABELS[result.payload.category]}`)
    }
    closeForm()
    try {
      await load()
    } catch {
      setError('Gespeichert, Liste konnte nicht aktualisiert werden.')
    }
  }

  function openAusbuchung(item: PoolEinsatzmittel) {
    if (!canManage || isEinsatzmittelRemoved(item)) return
    setAusbuchungItem(item)
    setAusbuchungReason('')
    setAusbuchungQty('')
    setError('')
  }

  async function confirmAusbuchung() {
    if (!canManage || !ausbuchungItem) return
    const counted = poolItemUsesCountedAusbuchung(ausbuchungItem)
    let nextAnzahl: number | null = ausbuchungItem.anzahl
    let remove = !counted
    if (counted) {
      const plan = planCountedAusbuchung({ currentAnzahl: ausbuchungItem.anzahl, qtyRaw: ausbuchungQty })
      if (!plan.ok) {
        setError(plan.error)
        return
      }
      nextAnzahl = plan.payload.nextAnzahl
      remove = plan.payload.mode === 'remove'
    }
    const result = ausbuchungPayload({ reason: ausbuchungReason, removedBy: profile?.id ?? null })
    if (!result.ok || !result.payload) {
      setError(result.ok ? 'Ausbuchung fehlgeschlagen.' : result.error)
      return
    }
    setAusbuchungSaving(true)
    setError('')
    const update = remove
      ? { ...result.payload, anzahl: nextAnzahl }
      : { anzahl: nextAnzahl }
    const { error: updateError } = await supabase
      .from('pool_einsatzmittel')
      .update(update)
      .eq('id', ausbuchungItem.id)
      .is('removed_at', null)
    if (updateError) {
      setError(updateError.message || 'Ausbuchen fehlgeschlagen.')
      setAusbuchungSaving(false)
      return
    }
    logAudit(
      remove ? 'Pool-Einsatzmittel ausgebucht' : 'Pool-Einsatzmittel Anzahl verringert',
      POOL_EM_CATEGORY_LABELS[ausbuchungItem.category],
    )
    setAusbuchungItem(null)
    setAusbuchungSaving(false)
    try {
      await load()
    } catch {
      setError('Ausgebucht, Liste konnte nicht aktualisiert werden.')
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pool-Einsatzmittel</h2>
          <p className="text-sm text-gray-500 mt-1">
            {canPurchase
              ? 'Gemeinsame Ausrüstung mit Verwahrungsort'
              : canManage
                ? 'Neue Einsatzmittel bitte über „Beschaffung“ beantragen.'
                : 'Nur Leserecht'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 bg-white"
            value={pdfOrt}
            onChange={e => setPdfOrt(e.target.value)}
            aria-label="PDF nach Verwahrungsort filtern"
          >
            <option value="">Alle Verwahrungsorte</option>
            {pdfOrtChoices.map(ort => (
              <option key={ort} value={ort}>{VERWAHRUNGSORT_LABELS[ort]}</option>
            ))}
          </select>
          <PdfExportButton onClick={() => generatePoolEmPdf(scopedItems, { verwahrungsort: pdfOrt || null })} />
          {canPurchase && (
            <button
              type="button"
              onClick={openNew}
              className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Neuer Eintrag</span>
            </button>
          )}
        </div>
      </div>

      {error && !showForm && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit max-w-full flex-wrap">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-all ${
            safeFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Alle
        </button>
        <button
          type="button"
          onClick={() => setFilter('ausgebucht')}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-all ${
            safeFilter === 'ausgebucht' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Ausgebucht
        </button>
        {categoryChips.map(id => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-all ${
              safeFilter === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {POOL_EM_CATEGORY_LABELS[id]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-8">
          <p className="text-sm text-gray-500">
            {safeFilter === 'ausgebucht' ? 'Keine ausgebuchten Pool-Einsatzmittel.' : 'Keine Pool-Einsatzmittel erfasst.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Kategorie</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Verwahrungsort</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">
                  {safeFilter === 'ausgebucht' ? 'Ausbuchung' : 'Angaben'}
                </th>
                {canManage && safeFilter !== 'ausgebucht' && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {POOL_EM_CATEGORY_LABELS[item.category]}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {poolEmLocationLabel(item.verwahrungsort, item.lager_notiz)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                    {safeFilter === 'ausgebucht'
                      ? `${formatIsoDate(item.removed_at)} · ${formatRemovalReason(item.removal_reason)}`
                      : (poolEmDetailText(item) || '–')}
                  </td>
                  {canManage && safeFilter !== 'ausgebucht' && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="p-2 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900"
                          title="Bearbeiten"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openAusbuchung(item)}
                          className="px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md"
                          title="Aus Bestand entfernen"
                        >
                          Ausbuchen
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && canManage && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editId ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</h2>
              <button type="button" onClick={closeForm} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="pool-category">Kategorie *</label>
                <select
                  id="pool-category"
                  className={inputClass}
                  value={category}
                  onChange={e => {
                    const next = e.target.value
                    if (isPoolEmCategory(next)) setCategory(next)
                  }}
                >
                  {POOL_EM_CATEGORIES.map(id => (
                    <option key={id} value={id}>{POOL_EM_CATEGORY_LABELS[id]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="pool-ort">Verwahrungsort *</label>
                <select
                  id="pool-ort"
                  className={inputClass}
                  value={verwahrungsort}
                  onChange={e => setVerwahrungsort(e.target.value)}
                >
                  <option value="">Bitte wählen</option>
                  {VERWAHRUNGSORTE.map(id => (
                    <option key={id} value={id}>{VERWAHRUNGSORT_LABELS[id]}</option>
                  ))}
                </select>
              </div>
              {isLagerOrt(verwahrungsort) && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="pool-lager-notiz">
                    Lager-Notiz
                  </label>
                  <input
                    id="pool-lager-notiz"
                    className={inputClass}
                    type="text"
                    value={lagerNotiz}
                    onChange={e => setLagerNotiz(e.target.value)}
                    placeholder="optional, z. B. Regal oder Fach"
                  />
                </div>
              )}
              {POOL_EM_FIELDS[category].map(field => {
                const kind = poolEmFieldKind(field)
                const label = poolEmFieldLabel(field, category)
                return (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={`pool-${field}`}>{label}</label>
                    <input
                      id={`pool-${field}`}
                      className={inputClass}
                      type={kind === 'date' ? 'date' : kind === 'integer' ? 'number' : 'text'}
                      min={kind === 'integer' ? 0 : undefined}
                      step={kind === 'integer' ? 1 : undefined}
                      inputMode={kind === 'integer' ? 'numeric' : undefined}
                      value={values[field]}
                      onChange={e => setValues(v => ({ ...v, [field]: e.target.value }))}
                    />
                  </div>
                )
              })}
              {error && showForm && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button type="button" onClick={closeForm} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => { void save() }}
                disabled={saving}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60"
              >
                {saving ? 'Speichern...' : editId ? 'Speichern' : 'Anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {ausbuchungItem && canManage && (
        <AusbuchungDialog
          itemLabel={POOL_EM_CATEGORY_LABELS[ausbuchungItem.category]}
          reason={ausbuchungReason}
          onReasonChange={setAusbuchungReason}
          onCancel={() => { setAusbuchungItem(null); setAusbuchungSaving(false) }}
          onConfirm={() => { void confirmAusbuchung() }}
          saving={ausbuchungSaving}
          error={error && ausbuchungItem ? error : ''}
          counted={
            poolItemUsesCountedAusbuchung(ausbuchungItem) && ausbuchungItem.anzahl != null
              ? { currentAnzahl: ausbuchungItem.anzahl, qty: ausbuchungQty, onQtyChange: setAusbuchungQty }
              : undefined
          }
        />
      )}
    </div>
  )
}
