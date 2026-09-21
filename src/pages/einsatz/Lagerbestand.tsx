import { useEffect, useMemo, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { useAuth } from '../../contexts/AuthContext'
import type { PersonalEinsatzmittel, Profile, PoolEinsatzmittel } from '../../lib/types'
import {
  POOL_EM_CATEGORY_LABELS,
  VERWAHRUNGSORTE,
  VERWAHRUNGSORT_LABELS,
  aggregateLagerbestand,
} from '../../lib/poolEinsatzmittel'
import {
  PERSONAL_EM_CATEGORY_LABELS,
  aggregatePersonalLagerbestand,
  canManagePersonalEinsatzmittel,
  officerDisplayName,
  personalEmDetailText,
  personalItemsInLager,
} from '../../lib/personalEinsatzmittel'
import { OFFICER_LIST_PROFILE_SELECT, excludeAdminsFromOfficerList } from '../../lib/portalAdmin'
import { generateLagerbestandPdf } from '../../lib/einsatzPdf'
import PdfExportButton from './PdfExportButton'

type OfficerOption = Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active' | 'organisation' | 'roles'> & Pick<Partial<Profile>, 'admin'>

export default function LagerbestandPanel() {
  const { isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const canManage = canManagePersonalEinsatzmittel({ isStrictAdmin, isGenehmiger, rows: areaRoles })
  const [poolItems, setPoolItems] = useState<PoolEinsatzmittel[]>([])
  const [personalItems, setPersonalItems] = useState<PersonalEinsatzmittel[]>([])
  const [officers, setOfficers] = useState<OfficerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignOfficerId, setAssignOfficerId] = useState('')
  const [assignSaving, setAssignSaving] = useState(false)

  async function load() {
    if (!canManage) {
      setPoolItems([])
      setPersonalItems([])
      setOfficers([])
      setError('')
      setLoading(false)
      return
    }
    setLoading(true)
    const [poolRes, personalRes, officerRes] = await Promise.all([
      supabase.from('pool_einsatzmittel').select('category,verwahrungsort,anzahl,removed_at').is('removed_at', null),
      supabase
        .from('personal_einsatzmittel')
        .select('id,category,verwahrungsort,officer_id,waffennummer,marke,groesse,kaliber,art,service,magazinanzahl,patronen,ablaufdatum,ablauf_mm_yyyy,schutzfristen,removed_at')
        .eq('verwahrungsort', 'lager')
        .is('removed_at', null)
        .order('category'),
      supabase.from('profiles').select(OFFICER_LIST_PROFILE_SELECT).order('name'),
    ])
    const failures: string[] = []
    if (poolRes.error) {
      failures.push('Pool')
      setPoolItems([])
    } else {
      setPoolItems((poolRes.data ?? []) as PoolEinsatzmittel[])
    }
    if (personalRes.error) {
      failures.push('persönliche Einsatzmittel')
      setPersonalItems([])
    } else {
      setPersonalItems((personalRes.data ?? []) as PersonalEinsatzmittel[])
    }
    if (officerRes.error) {
      setOfficers([])
    } else {
      setOfficers(excludeAdminsFromOfficerList((officerRes.data ?? []) as OfficerOption[]).filter(o => o.active))
    }
    setError(failures.length > 0 ? `Lagerbestand konnte nicht vollständig geladen werden (${failures.join(', ')}).` : '')
    setLoading(false)
  }

  function openAssign(item: PersonalEinsatzmittel) {
    setAssigningId(item.id)
    setAssignOfficerId('')
    setError('')
  }

  function closeAssign() {
    setAssigningId(null)
    setAssignOfficerId('')
    setAssignSaving(false)
  }

  async function confirmAssign(item: PersonalEinsatzmittel) {
    if (!canManage || !assignOfficerId) return
    setAssignSaving(true)
    setError('')
    const { error: updateError } = await supabase
      .from('personal_einsatzmittel')
      .update({ officer_id: assignOfficerId, verwahrungsort: null })
      .eq('id', item.id)
    if (updateError) {
      setError(updateError.message || 'Zuweisen fehlgeschlagen.')
      setAssignSaving(false)
      return
    }
    const officer = officers.find(o => o.id === assignOfficerId)
    logAudit('Persönliches Einsatzmittel aus Lager zugewiesen', `${PERSONAL_EM_CATEGORY_LABELS[item.category]} · ${officer ? officerDisplayName(officer) : assignOfficerId}`)
    closeAssign()
    try {
      await load()
    } catch {
      setError('Zugewiesen, Liste konnte nicht aktualisiert werden.')
    }
  }

  useEffect(() => {
    load().catch(() => {
      setError('Lagerbestand konnte nicht geladen werden.')
      setLoading(false)
    })
  }, [canManage])

  const poolRows = useMemo(() => aggregateLagerbestand(poolItems), [poolItems])
  const personalCounts = useMemo(() => aggregatePersonalLagerbestand(personalItems), [personalItems])
  const personalInLager = useMemo(() => personalItemsInLager(personalItems), [personalItems])
  const personalTotal = personalInLager.length

  if (!canManage) {
    return (
      <p className="text-sm text-gray-500">Kein Zugriff auf den Lagerbestand.</p>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Lagerbestand</h2>
          <p className="text-sm text-gray-500 mt-1">
            Stückzahlen je Kategorie und Verwahrungsort. Langwaffen zählen als erfasste Waffen,
            übrige Pool-Kategorien als Summe von Anzahl bzw. Menge. Eingelagerte persönliche
            Einsatzmittel zählen je Zeile (mehrere Waffennummern derselben Kategorie bleiben getrennt).
          </p>
        </div>
        <PdfExportButton
          disabled={loading}
          onClick={() => generateLagerbestandPdf({
            poolRows,
            personalCounts,
            personalItems: personalInLager,
          })}
        />
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" />
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Pool</h3>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Kategorie</th>
                    {VERWAHRUNGSORTE.map(ort => (
                      <th key={ort} className="text-right px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                        {VERWAHRUNGSORT_LABELS[ort]}
                      </th>
                    ))}
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Gesamt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {poolRows.map(row => (
                    <tr key={row.category} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                        {POOL_EM_CATEGORY_LABELS[row.category]}
                      </td>
                      {VERWAHRUNGSORTE.map(ort => (
                        <td key={ort} className="px-4 py-3 text-right tabular-nums text-gray-700">
                          {row.byOrt[ort]}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                        {row.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Persönliche Einsatzmittel im Lager</h3>
            <p className="text-xs text-gray-500 mb-2">
              {personalTotal === 0
                ? 'Keine persönlichen Stücke eingelagert.'
                : `${personalTotal} Stück eingelagert (ohne Polizisten-Zuweisung oder mit Ort Lager).`}
            </p>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Kategorie</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Im Lager</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {personalCounts.map(row => (
                    <tr key={row.category} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                        {PERSONAL_EM_CATEGORY_LABELS[row.category]}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {personalInLager.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Kategorie</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Kennung</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Angaben</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {personalInLager.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                          {PERSONAL_EM_CATEGORY_LABELS[item.category]}
                        </td>
                        <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                          {item.waffennummer?.trim() || item.marke?.trim() || '–'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                          {personalEmDetailText(item) || '–'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {assigningId === item.id ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <select
                                className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white max-w-[10rem]"
                                value={assignOfficerId}
                                onChange={e => setAssignOfficerId(e.target.value)}
                                aria-label="Polizist wählen"
                                autoFocus
                              >
                                <option value="">Bitte wählen</option>
                                {officers.map(o => (
                                  <option key={o.id} value={o.id}>{officerDisplayName(o)}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={!assignOfficerId || assignSaving}
                                onClick={() => { void confirmAssign(item) }}
                                className="bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg"
                              >
                                {assignSaving ? '…' : 'OK'}
                              </button>
                              <button
                                type="button"
                                disabled={assignSaving}
                                onClick={closeAssign}
                                className="text-xs text-gray-500 hover:text-gray-800 px-1.5 py-1.5"
                              >
                                Abbrechen
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openAssign(item)}
                              className="inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-gray-50"
                              title="Polizisten zuweisen"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              Zuweisen
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
