import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Upload, UserPlus, Warehouse, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { useAuth } from '../../contexts/AuthContext'
import type { PersonalEinsatzmittel, Profile } from '../../lib/types'
import {
  PERSONAL_EM_CATEGORIES,
  PERSONAL_EM_CATEGORY_LABELS,
  PERSONAL_EM_FIELDS,
  PERSONAL_EM_ORG_FILTERS,
  PERSONAL_EM_ORG_FILTER_LABELS,
  canManagePersonalEinsatzmittel,
  emptyPersonalEmFormValues,
  filterActiveOfficersForPersonalEmMatrix,
  formValuesFromRecord,
  formatIsoDate,
  isPersonalEmCategory,
  isPersonalEmInLager,
  officerDisplayName,
  ownPersonalEinsatzmittel,
  personalEmDetailText,
  personalEmFieldKind,
  personalEmFieldLabel,
  personalEmItemsForMatrixCell,
  personalEmLocationLabel,
  personalEmMatrixCellStatus,
  personalEmOfficerLabel,
  toPersonalLagerAssignment,
  validatePersonalEm,
  type PersonalEmCategory,
  type PersonalEmFormValues,
  type PersonalEmOrgFilter,
} from '../../lib/personalEinsatzmittel'
import { VERWAHRUNGSORTE, VERWAHRUNGSORT_LABELS } from '../../lib/verwahrungsort'
import {
  activeEinsatzmittel,
  ausbuchungPayload,
  formatRemovalReason,
  isEinsatzmittelRemoved,
  removedEinsatzmittel,
} from '../../lib/einsatzmittelAusbuchung'
import { PDF_UNASSIGNED_OFFICER, generatePersonalEmPdf } from '../../lib/einsatzPdf'
import { OFFICER_LIST_PROFILE_SELECT, excludeAdminsFromOfficerList } from '../../lib/portalAdmin'
import AusbuchungDialog from './AusbuchungDialog'
import ZuteilungImportDialog from './ZuteilungImportDialog'
import PdfExportButton from './PdfExportButton'

type ViewFilter = 'matrix' | 'lager' | 'ausgebucht'

type OfficerOption = Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active' | 'organisation' | 'roles'> & Pick<Partial<Profile>, 'admin'>

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

const chipClass = (active: boolean) =>
  `text-sm font-medium px-3 py-1.5 rounded-lg transition-all ${
    active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
  }`

function OfficerIdentity({ officer }: { officer: OfficerOption }) {
  const name = officer.name?.trim() || officer.username?.trim() || '—'
  const dn = officer.dienstnummer?.trim() || '—'
  const username = officer.username?.trim() || '—'
  return (
    <div className="min-w-[13rem] max-w-[16rem]">
      <div className="font-medium text-gray-900 truncate">{name}</div>
      <div className="text-xs text-gray-500 truncate">
        DN {dn}
        {' · '}
        {username}
      </div>
    </div>
  )
}

export default function PersonalEinsatzmittelPanel() {
  const { profile, isStrictAdmin, areaRoles } = useAuth()
  const canManage = canManagePersonalEinsatzmittel({ isStrictAdmin, rows: areaRoles })

  const [items, setItems] = useState<PersonalEinsatzmittel[]>([])
  const [officers, setOfficers] = useState<OfficerOption[]>([])
  const [orgFilter, setOrgFilter] = useState<PersonalEmOrgFilter>('polizei')
  const [view, setView] = useState<ViewFilter>('matrix')
  const [pdfOfficerId, setPdfOfficerId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [category, setCategory] = useState<PersonalEmCategory>('schutzweste')
  const [officerId, setOfficerId] = useState('')
  const [verwahrungsort, setVerwahrungsort] = useState('')
  const [values, setValues] = useState<PersonalEmFormValues>(emptyPersonalEmFormValues())
  const [saving, setSaving] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [ausbuchungItem, setAusbuchungItem] = useState<PersonalEinsatzmittel | null>(null)
  const [ausbuchungReason, setAusbuchungReason] = useState('')
  const [ausbuchungSaving, setAusbuchungSaving] = useState(false)
  const [cellPicker, setCellPicker] = useState<{
    officer: OfficerOption
    category: PersonalEmCategory
    items: PersonalEinsatzmittel[]
  } | null>(null)

  async function load() {
    setLoading(true)
    if (!canManage && !profile?.id) {
      setItems([])
      setOfficers([])
      setLoading(false)
      return
    }

    let emQuery = supabase
      .from('personal_einsatzmittel')
      .select(`*, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`)
      .order('created_at', { ascending: false })
    if (!canManage && profile?.id) {
      emQuery = emQuery.eq('officer_id', profile.id)
    }

    if (!canManage) {
      const { data, error: loadError } = await emQuery
      if (loadError) {
        setError('Einsatzmittel konnten nicht geladen werden.')
        setItems([])
      } else {
        setError('')
        setItems(ownPersonalEinsatzmittel((data ?? []) as PersonalEinsatzmittel[], profile?.id))
      }
      setOfficers(profile ? [{
        id: profile.id,
        name: profile.name,
        dienstnummer: profile.dienstnummer,
        username: profile.username,
        active: profile.active,
        organisation: profile.organisation,
        roles: profile.roles,
        admin: profile.admin,
      }] : [])
      setLoading(false)
      return
    }

    const [{ data, error: loadError }, { data: profileRows }] = await Promise.all([
      emQuery,
      supabase
        .from('profiles')
        .select(OFFICER_LIST_PROFILE_SELECT)
        .order('name'),
    ])
    if (loadError) {
      setError('Einsatzmittel konnten nicht geladen werden.')
      setItems([])
    } else {
      setError('')
      setItems((data ?? []) as PersonalEinsatzmittel[])
    }
    setOfficers((profileRows ?? []) as OfficerOption[])
    setLoading(false)
  }

  useEffect(() => {
    load().catch(() => {
      setError('Einsatzmittel konnten nicht geladen werden.')
      setLoading(false)
    })
  }, [canManage, profile?.id])

  const scopedItems = useMemo(
    () => (canManage ? items : ownPersonalEinsatzmittel(items, profile?.id)),
    [canManage, items, profile?.id],
  )

  const activeItems = useMemo(() => activeEinsatzmittel(scopedItems), [scopedItems])

  const matrixOfficers = useMemo(
    () => filterActiveOfficersForPersonalEmMatrix(officers, orgFilter),
    [officers, orgFilter],
  )

  const listItems = useMemo(() => {
    if (view === 'ausgebucht') return removedEinsatzmittel(scopedItems)
    if (view === 'lager') {
      if (!canManage) return []
      return activeItems.filter(item => isPersonalEmInLager(item) || !item.officer_id)
    }
    return []
  }, [scopedItems, activeItems, view, canManage])

  const ownListItems = useMemo(() => {
    if (view === 'ausgebucht') return removedEinsatzmittel(scopedItems)
    return activeItems
  }, [scopedItems, activeItems, view])

  const officerChoices = useMemo(() => {
    const active = excludeAdminsFromOfficerList(officers.filter(o => o.active))
    const current = officers.find(o => o.id === officerId)
    if (current && !active.some(o => o.id === current.id)) return [current, ...active]
    return active
  }, [officers, officerId])

  const pdfOfficerChoices = useMemo(() => {
    const byId = new Map<string, OfficerOption>()
    let hasUnassigned = false
    for (const item of activeItems) {
      if (!item.officer_id) {
        hasUnassigned = true
        continue
      }
      if (byId.has(item.officer_id)) continue
      const fromList = officers.find(o => o.id === item.officer_id)
      const fromItem = item.officer
      byId.set(item.officer_id, fromList ?? {
        id: item.officer_id,
        name: fromItem?.name ?? '–',
        dienstnummer: fromItem?.dienstnummer ?? null,
        username: fromItem?.username ?? '',
        active: fromItem?.active ?? true,
        organisation: fromItem?.organisation ?? '',
        roles: fromItem?.roles ?? [],
        admin: fromItem?.admin,
      })
    }
    const list = excludeAdminsFromOfficerList([...byId.values()]).sort((a, b) =>
      officerDisplayName(a).localeCompare(officerDisplayName(b), 'de'),
    )
    return { list, hasUnassigned }
  }, [activeItems, officers])

  function exportPersonalPdf() {
    if (!canManage) {
      generatePersonalEmPdf(scopedItems, {
        officerId: profile?.id ?? null,
        officerLabel: profile ? officerDisplayName(profile) : null,
      })
      return
    }
    const officer = pdfOfficerChoices.list.find(o => o.id === pdfOfficerId)
    generatePersonalEmPdf(scopedItems, {
      officerId: pdfOfficerId || null,
      officerLabel: pdfOfficerId === PDF_UNASSIGNED_OFFICER
        ? 'nicht zugewiesen'
        : officer
          ? officerDisplayName(officer)
          : null,
    })
  }

  function openNew(preset?: { officerId?: string; category?: PersonalEmCategory }) {
    setCellPicker(null)
    setEditId(null)
    setCategory(preset?.category ?? 'schutzweste')
    setOfficerId(preset?.officerId ?? '')
    setVerwahrungsort('')
    setValues(emptyPersonalEmFormValues())
    setError('')
    setShowForm(true)
  }

  function openEdit(item: PersonalEinsatzmittel) {
    if (isEinsatzmittelRemoved(item)) return
    setCellPicker(null)
    setEditId(item.id)
    setCategory(item.category)
    setOfficerId(item.officer_id ?? '')
    setVerwahrungsort(item.verwahrungsort ?? '')
    setValues(formValuesFromRecord(item))
    setError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
    setSaving(false)
  }

  function openCell(officer: OfficerOption, cellCategory: PersonalEmCategory) {
    if (!canManage) return
    const cellItems = personalEmItemsForMatrixCell(activeItems, officer.id, cellCategory)
    if (cellItems.length === 0) {
      openNew({ officerId: officer.id, category: cellCategory })
      return
    }
    if (cellItems.length === 1) {
      openEdit(cellItems[0])
      return
    }
    setCellPicker({ officer, category: cellCategory, items: cellItems })
  }

  async function save() {
    if (!canManage) return
    const result = validatePersonalEm({ category, officer_id: officerId, verwahrungsort, values })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSaving(true)
    setError('')
    if (editId) {
      const { error: updateError } = await supabase
        .from('personal_einsatzmittel')
        .update(result.payload)
        .eq('id', editId)
      if (updateError) {
        setError(updateError.message || 'Speichern fehlgeschlagen.')
        setSaving(false)
        return
      }
      logAudit('Persönliches Einsatzmittel bearbeitet', `${PERSONAL_EM_CATEGORY_LABELS[result.payload.category]}`)
    } else {
      const { error: insertError } = await supabase
        .from('personal_einsatzmittel')
        .insert({ ...result.payload, created_by: profile?.id ?? null })
      if (insertError) {
        setError(insertError.message || 'Anlegen fehlgeschlagen.')
        setSaving(false)
        return
      }
      logAudit('Persönliches Einsatzmittel angelegt', `${PERSONAL_EM_CATEGORY_LABELS[result.payload.category]}`)
    }
    closeForm()
    try {
      await load()
    } catch {
      setError('Gespeichert, Liste konnte nicht aktualisiert werden.')
    }
  }

  function openAusbuchung(item: PersonalEinsatzmittel) {
    if (!canManage || isEinsatzmittelRemoved(item)) return
    setCellPicker(null)
    closeForm()
    setAusbuchungItem(item)
    setAusbuchungReason('')
    setError('')
  }

  async function confirmAusbuchung() {
    if (!canManage || !ausbuchungItem) return
    const result = ausbuchungPayload({ reason: ausbuchungReason, removedBy: profile?.id ?? null })
    if (!result.ok || !result.payload) {
      setError(result.ok ? 'Ausbuchung fehlgeschlagen.' : result.error)
      return
    }
    setAusbuchungSaving(true)
    setError('')
    const { error: updateError } = await supabase
      .from('personal_einsatzmittel')
      .update(result.payload)
      .eq('id', ausbuchungItem.id)
      .is('removed_at', null)
    if (updateError) {
      setError(updateError.message || 'Ausbuchen fehlgeschlagen.')
      setAusbuchungSaving(false)
      return
    }
    logAudit('Persönliches Einsatzmittel ausgebucht', PERSONAL_EM_CATEGORY_LABELS[ausbuchungItem.category])
    setAusbuchungItem(null)
    setAusbuchungSaving(false)
    try {
      await load()
    } catch {
      setError('Ausgebucht, Liste konnte nicht aktualisiert werden.')
    }
  }

  async function moveToLager(item: PersonalEinsatzmittel) {
    if (!canManage || isEinsatzmittelRemoved(item)) return
    if (isPersonalEmInLager(item) && !item.officer_id) return
    if (!window.confirm(`«${PERSONAL_EM_CATEGORY_LABELS[item.category]}» ins Lager stellen? Die Zuweisung an den Polizisten wird aufgehoben.`)) return
    setCellPicker(null)
    closeForm()
    const { error: updateError } = await supabase
      .from('personal_einsatzmittel')
      .update(toPersonalLagerAssignment())
      .eq('id', item.id)
    if (updateError) {
      setError(updateError.message || 'Einlagern fehlgeschlagen.')
      return
    }
    logAudit('Persönliches Einsatzmittel eingelagert', PERSONAL_EM_CATEGORY_LABELS[item.category])
    try {
      await load()
    } catch {
      setError('Eingelagert, Liste konnte nicht aktualisiert werden.')
    }
  }

  function openAssign(item: PersonalEinsatzmittel) {
    openEdit(item)
    setOfficerId(item.officer_id ?? '')
    setVerwahrungsort(item.verwahrungsort ?? '')
  }

  function cellTitle(cellItems: PersonalEinsatzmittel[]): string {
    if (cellItems.length === 0) return canManage ? 'Zuweisen' : 'Keine Zuweisung'
    return cellItems
      .map(item => {
        const detail = personalEmDetailText(item) || 'zugewiesen'
        const lager = isPersonalEmInLager(item) ? ' · Lager' : ''
        return `${detail}${lager}`
      })
      .join('\n')
  }

  const editingItem = editId ? items.find(item => item.id === editId) ?? null : null

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Persönliche Einsatzmittel</h2>
          <p className="text-sm text-gray-500 mt-1">
            {canManage
              ? 'Matrix: Offizier × Kategorie. Zuweisung oder Einlagerung (z. B. nach Austritt).'
              : 'Ihre zugewiesenen Einsatzmittel'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          {canManage && (
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 bg-white"
              value={pdfOfficerId}
              onChange={e => setPdfOfficerId(e.target.value)}
              aria-label="PDF nach Polizist filtern"
            >
              <option value="">Alle Polizisten</option>
              {pdfOfficerChoices.hasUnassigned && (
                <option value={PDF_UNASSIGNED_OFFICER}>nicht zugewiesen</option>
              )}
              {pdfOfficerChoices.list.map(o => (
                <option key={o.id} value={o.id}>{officerDisplayName(o)}</option>
              ))}
            </select>
          )}
          <PdfExportButton onClick={exportPersonalPdf} />
          {canManage && (
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg hover:bg-gray-50"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import Zuteilung</span>
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={() => openNew()}
              className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Zuweisen</span>
            </button>
          )}
        </div>
      </div>

      {error && !showForm && !ausbuchungItem && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {canManage && (
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit max-w-full flex-wrap" role="group" aria-label="Organisation">
            {PERSONAL_EM_ORG_FILTERS.map(id => (
              <button
                key={id}
                type="button"
                onClick={() => setOrgFilter(id)}
                className={chipClass(orgFilter === id)}
              >
                {PERSONAL_EM_ORG_FILTER_LABELS[id]}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit max-w-full flex-wrap" role="group" aria-label="Ansicht">
          <button type="button" onClick={() => setView('matrix')} className={chipClass(view === 'matrix' || (!canManage && view === 'lager'))}>
            {canManage ? 'Übersicht' : 'Meine Einsatzmittel'}
          </button>
          {canManage && (
            <button type="button" onClick={() => setView('lager')} className={chipClass(view === 'lager')}>
              Lager / ohne Zuweisung
            </button>
          )}
          <button type="button" onClick={() => setView('ausgebucht')} className={chipClass(view === 'ausgebucht')}>
            Ausgebucht
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" />
        </div>
      ) : !canManage ? (
        ownListItems.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-8">
            <p className="text-sm text-gray-500">
              {view === 'ausgebucht'
                ? 'Keine ausgebuchten persönlichen Einsatzmittel.'
                : 'Keine persönlichen Einsatzmittel zugewiesen.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {ownListItems.map(item => (
              <article key={item.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <h3 className="font-medium text-gray-900">{PERSONAL_EM_CATEGORY_LABELS[item.category]}</h3>
                <p className="text-sm text-gray-500 mt-1">{personalEmLocationLabel(item.verwahrungsort)}</p>
                <p className="text-sm text-gray-700 mt-1">
                  {view === 'ausgebucht'
                    ? `${formatIsoDate(item.removed_at)} · ${formatRemovalReason(item.removal_reason)}`
                    : (personalEmDetailText(item) || 'zugewiesen')}
                </p>
              </article>
            ))}
          </div>
        )
      ) : view === 'matrix' ? (
        matrixOfficers.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-8">
            <p className="text-sm text-gray-500">Keine aktiven Personen für diesen Filter.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-auto max-h-[70vh]">
              <table className="text-sm border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-30 bg-gray-50 border-b border-gray-200 text-left px-4 py-3 font-semibold text-gray-600 shadow-[1px_0_0_0_rgba(229,231,235,1)]">
                      Person
                    </th>
                    {PERSONAL_EM_CATEGORIES.map(id => (
                      <th
                        key={id}
                        className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 text-left px-2 py-3 font-semibold text-gray-600 min-w-[8.5rem] max-w-[10.5rem] whitespace-normal leading-snug"
                      >
                        {PERSONAL_EM_CATEGORY_LABELS[id]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixOfficers.map(officer => (
                    <tr key={officer.id} className="group">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-4 py-2 border-b border-gray-100 shadow-[1px_0_0_0_rgba(229,231,235,1)] align-top">
                        <OfficerIdentity officer={officer} />
                      </td>
                      {PERSONAL_EM_CATEGORIES.map(id => {
                        const cellItems = personalEmItemsForMatrixCell(activeItems, officer.id, id)
                        const status = personalEmMatrixCellStatus(cellItems)
                        return (
                          <td key={id} className="px-1 py-1 border-b border-gray-100 align-top">
                            <button
                              type="button"
                              onClick={() => openCell(officer, id)}
                              title={cellTitle(cellItems)}
                              aria-label={`${officerDisplayName(officer)}, ${PERSONAL_EM_CATEGORY_LABELS[id]}: ${status.text}`}
                              className={`w-full min-h-[2.75rem] text-left px-2 py-2 rounded-md text-xs leading-snug ${
                                canManage ? 'hover:bg-blue-50 cursor-pointer' : 'cursor-default'
                              } ${status.count === 0 ? 'text-gray-400' : 'text-gray-800'} ${
                                status.inLager ? 'bg-amber-50' : ''
                              }`}
                            >
                              {status.text}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : listItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-8">
          <p className="text-sm text-gray-500">
            {view === 'ausgebucht'
              ? 'Keine ausgebuchten persönlichen Einsatzmittel.'
              : 'Keine persönlichen Einsatzmittel im Lager oder ohne Zuweisung.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Kategorie</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Polizist</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Verwahrungsort</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">
                  {view === 'ausgebucht' ? 'Ausbuchung' : 'Angaben'}
                </th>
                {canManage && view !== 'ausgebucht' && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {listItems.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {PERSONAL_EM_CATEGORY_LABELS[item.category]}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{personalEmOfficerLabel(item.officer, item.officer_id)}</td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                    {personalEmLocationLabel(item.verwahrungsort)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                    {view === 'ausgebucht'
                      ? `${formatIsoDate(item.removed_at)} · ${formatRemovalReason(item.removal_reason)}`
                      : (personalEmDetailText(item) || '–')}
                  </td>
                  {canManage && view !== 'ausgebucht' && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {!(isPersonalEmInLager(item) && !item.officer_id) && (
                          <button
                            type="button"
                            onClick={() => { void moveToLager(item) }}
                            className="p-2 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900"
                            title="Ins Lager stellen"
                          >
                            <Warehouse className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!item.officer_id && (
                          <button
                            type="button"
                            onClick={() => openAssign(item)}
                            className="p-2 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900"
                            title="Polizisten zuweisen"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                          </button>
                        )}
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

      {cellPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-bold text-gray-900">{PERSONAL_EM_CATEGORY_LABELS[cellPicker.category]}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{officerDisplayName(cellPicker.officer)}</p>
              </div>
              <button type="button" onClick={() => setCellPicker(null)} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Schließen">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="divide-y divide-gray-100">
              {cellPicker.items.map(item => (
                <li key={item.id} className="px-6 py-3 flex items-start justify-between gap-3">
                  <div className="text-sm text-gray-700">
                    <p>{personalEmDetailText(item) || 'zugewiesen'}</p>
                    {isPersonalEmInLager(item) && <p className="text-xs text-amber-700 mt-1">Lager</p>}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 flex-shrink-0">
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
                        onClick={() => { void moveToLager(item) }}
                        className="p-2 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900"
                        title="Ins Lager stellen"
                      >
                        <Warehouse className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openAusbuchung(item)}
                        className="px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md"
                      >
                        Ausbuchen
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {canManage && (
              <div className="px-6 py-4 border-t">
                <button
                  type="button"
                  onClick={() => openNew({ officerId: cellPicker.officer.id, category: cellPicker.category })}
                  className="flex items-center gap-2 text-sm font-medium text-blue-800 hover:text-blue-900"
                >
                  <Plus className="w-4 h-4" />
                  Weitere zuweisen
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showForm && canManage && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editId ? 'Zuweisung bearbeiten' : 'Neue Zuweisung'}</h2>
              <button type="button" onClick={closeForm} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="em-category">Kategorie *</label>
                <select
                  id="em-category"
                  className={inputClass}
                  value={category}
                  onChange={e => {
                    const next = e.target.value
                    if (isPersonalEmCategory(next)) setCategory(next)
                  }}
                >
                  {PERSONAL_EM_CATEGORIES.map(id => (
                    <option key={id} value={id}>{PERSONAL_EM_CATEGORY_LABELS[id]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="em-officer">
                  Polizist{verwahrungsort ? '' : ' *'}
                </label>
                <select
                  id="em-officer"
                  className={inputClass}
                  value={officerId}
                  onChange={e => setOfficerId(e.target.value)}
                >
                  <option value="">{verwahrungsort ? 'nicht zugewiesen' : 'Bitte wählen'}</option>
                  {officerChoices.map(o => (
                    <option key={o.id} value={o.id}>
                      {officerDisplayName(o)}{o.active ? '' : ' (inaktiv)'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="em-ort">
                  Verwahrungsort{officerId ? '' : ' *'}
                </label>
                <select
                  id="em-ort"
                  className={inputClass}
                  value={verwahrungsort}
                  onChange={e => setVerwahrungsort(e.target.value)}
                >
                  <option value="">{officerId ? 'Beim Polizisten' : 'Bitte wählen'}</option>
                  {VERWAHRUNGSORTE.map(ort => (
                    <option key={ort} value={ort}>{VERWAHRUNGSORT_LABELS[ort]}</option>
                  ))}
                </select>
              </div>
              {PERSONAL_EM_FIELDS[category].map(field => {
                const kind = personalEmFieldKind(field)
                const label = personalEmFieldLabel(field, category)
                return (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={`em-${field}`}>{label}</label>
                    <input
                      id={`em-${field}`}
                      className={inputClass}
                      type={kind === 'date' ? 'date' : kind === 'integer' ? 'number' : 'text'}
                      min={kind === 'integer' ? 0 : undefined}
                      step={kind === 'integer' ? 1 : undefined}
                      inputMode={kind === 'integer' ? 'numeric' : kind === 'month_year' ? 'numeric' : undefined}
                      placeholder={kind === 'month_year' ? 'MM/JJJJ' : undefined}
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
            <div className="flex flex-wrap gap-3 px-6 py-4 border-t">
              {canManage && editingItem && (
                <div className="flex items-center gap-2 mr-auto">
                  {!(isPersonalEmInLager(editingItem) && !editingItem.officer_id) && (
                    <button
                      type="button"
                      onClick={() => { void moveToLager(editingItem) }}
                      className="text-sm font-medium text-gray-600 hover:text-gray-900 px-2 py-2"
                    >
                      Ins Lager
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openAusbuchung(editingItem)}
                    className="text-sm font-medium text-red-700 hover:text-red-800 px-2 py-2"
                  >
                    Ausbuchen
                  </button>
                </div>
              )}
              <button type="button" onClick={closeForm} className="flex-1 min-w-[7rem] border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => { void save() }}
                disabled={saving}
                className="flex-1 min-w-[7rem] bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60"
              >
                {saving ? 'Speichern...' : editId ? 'Speichern' : 'Anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && canManage && (
        <ZuteilungImportDialog
          officers={excludeAdminsFromOfficerList(officers)}
          existing={items}
          createdBy={profile?.id ?? null}
          onClose={() => setShowImport(false)}
          onImported={load}
        />
      )}

      {ausbuchungItem && canManage && (
        <AusbuchungDialog
          itemLabel={PERSONAL_EM_CATEGORY_LABELS[ausbuchungItem.category]}
          reason={ausbuchungReason}
          onReasonChange={setAusbuchungReason}
          onCancel={() => { setAusbuchungItem(null); setAusbuchungSaving(false) }}
          onConfirm={() => { void confirmAusbuchung() }}
          saving={ausbuchungSaving}
          error={error && ausbuchungItem ? error : ''}
        />
      )}
    </div>
  )
}
