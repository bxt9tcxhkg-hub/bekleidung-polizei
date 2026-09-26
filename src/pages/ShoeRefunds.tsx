import { useEffect, useState } from 'react'
import { CalendarClock, Pencil, Plus, X, Footprints, Check, Ban, Clock } from 'lucide-react'
import BackLink from '../components/BackLink'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { DEFAULT_SHOE_CAP, existingCapIdForDate } from '../lib/budget'
import { logAudit } from '../lib/audit'
import { fmtEUR } from '../lib/format'
import type { ShoeRefund, ShoeRefundCap, ShoeRefundStatus, Profile } from '../lib/types'

const today = () => new Date().toISOString().split('T')[0]

const STATUS_LABEL: Record<ShoeRefundStatus, string> = {
  pending: 'Ausstehend',
  approved: 'Genehmigt',
  rejected: 'Abgelehnt',
}

const STATUS_STYLE: Record<ShoeRefundStatus, string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-600',
}

const STATUS_ICON: Record<ShoeRefundStatus, React.ReactNode> = {
  pending: <Clock className="w-3 h-3" />,
  approved: <Check className="w-3 h-3" />,
  rejected: <Ban className="w-3 h-3" />,
}

export default function ShoeRefunds() {
  const { profile, isAdmin, isGenehmiger } = useAuth()
  const canManage = isAdmin || isGenehmiger
  const [refunds, setRefunds] = useState<ShoeRefund[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ user_id: '', amount: '', refund_date: new Date().toISOString().split('T')[0], note: '' })
  const [userSearch, setUserSearch] = useState('')
  const [userDropdown, setUserDropdown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<ShoeRefundStatus | 'all'>('all')

  // Maximalbetrag - vormals auf Budgets.tsx ("Budgetverwaltung"), jetzt direkt
  // hier auf der Schuherstattungen-Verwaltung, da er ausschließlich diesen
  // Bereich betrifft.
  const [caps, setCaps] = useState<ShoeRefundCap[]>([])
  const [showCapForm, setShowCapForm] = useState(false)
  const [capForm, setCapForm] = useState({ amount: '', valid_from: today(), note: '' })
  const [capSaving, setCapSaving] = useState(false)

  async function load() {
    setLoading(true)
    const query = supabase
      .from('shoe_refunds')
      .select('*, profiles!shoe_refunds_user_id_fkey(id,name,username,dienstnummer), creator:profiles!shoe_refunds_created_by_fkey(id,name), reviewer:profiles!shoe_refunds_reviewed_by_fkey(id,name)')
      .order('created_at', { ascending: false })
    if (!canManage) query.eq('user_id', profile!.id)
    const { data } = await query
    setRefunds((data ?? []) as ShoeRefund[])
    setLoading(false)
  }

  useEffect(() => {
    async function init() {
      const tasks: PromiseLike<unknown>[] = [load().catch(() => setError('Schuherstattungen konnten nicht geladen werden.'))]
      if (canManage) {
        tasks.push(
          supabase.from('profiles').select('*').eq('active', true).order('name').then(({ data }) => setUsers(data ?? [])),
          supabase.from('shoe_refund_caps').select('*').order('valid_from', { ascending: false }).order('created_at', { ascending: false })
            .then(({ data }) => setCaps((data ?? []) as ShoeRefundCap[])),
        )
      }
      await Promise.all(tasks)
    }
    if (profile) init()
  }, [profile, isAdmin, isGenehmiger, canManage])

  // caps ist valid_from absteigend sortiert: erster Eintrag <= heute ist der aktuelle,
  // der LETZTE Eintrag > heute ist die nächste anstehende Änderung.
  const currentCap = caps.find(c => c.valid_from <= today())
  const futureCaps = caps.filter(c => c.valid_from > today())
  const scheduledCap = futureCaps.length > 0 ? futureCaps[futureCaps.length - 1] : undefined
  const maxRefund = Number(currentCap?.cap_amount ?? DEFAULT_SHOE_CAP)

  async function saveCap() {
    const val = parseFloat(capForm.amount.replace(',', '.'))
    if (isNaN(val) || val < 0) return
    setCapSaving(true)
    const existingId = existingCapIdForDate(caps, capForm.valid_from)
    const { error } = existingId
      ? await supabase.from('shoe_refund_caps').update({
          cap_amount: val,
          note: capForm.note || null,
        }).eq('id', existingId)
      : await supabase.from('shoe_refund_caps').insert({
          cap_amount: val,
          valid_from: capForm.valid_from,
          note: capForm.note || null,
          created_by: profile!.id,
        })
    setCapSaving(false)
    if (error) { setError(`Maximalbetrag konnte nicht gespeichert werden: ${error.message}`); return }
    logAudit('Schuherstattungs-Deckel geändert', `${fmtEUR(val)} ab ${capForm.valid_from}`)
    setError('')
    setShowCapForm(false)
    setCapForm({ amount: '', valid_from: today(), note: '' })
    const { data } = await supabase.from('shoe_refund_caps').select('*').order('valid_from', { ascending: false }).order('created_at', { ascending: false })
    setCaps((data ?? []) as ShoeRefundCap[])
  }

  function selectUser(u: Profile) {
    setForm(f => ({ ...f, user_id: u.id }))
    setUserSearch(u.name || u.username || '')
    setUserDropdown(false)
  }

  const filteredUsers = userSearch.trim().length > 0
    ? users.filter(u =>
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.dienstnummer ?? '').includes(userSearch)
      )
    : users

  async function create() {
    setError('')
    const uid = canManage ? form.user_id : profile!.id
    if (!uid || !form.amount || !form.refund_date) { setError('Pflichtfelder fehlen.'); return }
    const amount = parseFloat(form.amount)
    if (isNaN(amount) || amount <= 0) { setError('Bitte einen gültigen Betrag größer 0 eingeben.'); return }
    setSaving(true)
    const { error } = await supabase.from('shoe_refunds').insert({
      user_id: uid,
      amount,
      approved_amount: Math.min(amount, maxRefund),
      refund_date: form.refund_date,
      note: form.note || null,
      created_by: profile!.id,
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
    })
    if (error) setError(error.message)
    else {
      const benutzername = canManage ? (users.find(u => u.id === uid)?.name ?? '?') : (profile!.name ?? profile!.username)
      logAudit('Schuherstattung angelegt', `${benutzername}: ${fmtEUR(amount)}`)
      setShowForm(false)
      setForm({ user_id: '', amount: '', refund_date: new Date().toISOString().split('T')[0], note: '' })
      setUserSearch('')
      load()
    }
    setSaving(false)
  }

  const visibleRefunds = statusFilter === 'all' ? refunds : refunds.filter(r => r.status === statusFilter)

  const counts = {
    all: refunds.length,
    pending: refunds.filter(r => r.status === 'pending').length,
    approved: refunds.filter(r => r.status === 'approved').length,
    rejected: refunds.filter(r => r.status === 'rejected').length,
  }

  function resetForm() {
    setShowForm(false)
    setForm({ user_id: '', amount: '', refund_date: new Date().toISOString().split('T')[0], note: '' })
    setUserSearch('')
    setError('')
  }

  return (
    <div>
      {canManage && <BackLink to="/genehmigungen/bekleidung" label="Zu Bekleidung" className="mb-4" />}
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schuherstattungen</h1>
          <p className="text-gray-500 text-sm mt-1">{canManage ? 'Alle Schuhkostenerstattungen' : 'Meine Schuhkostenerstattungen'}</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors flex-shrink-0"
          title="Neue Erstattung"
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Neue Erstattung</span>
        </button>
      </div>

      {/* Maximalbetrag - gleiche Karten-Gestaltung wie die Gesamtanpassung auf
          der Budgetverwaltung (Icon+Titel links, "Anpassen"-Button rechts). */}
      {canManage && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-teal-100 p-2 rounded-lg"><Footprints className="w-4 h-4 text-teal-700" /></div>
              <div>
                <p className="font-semibold text-gray-900">Schuherstattung Maximalbetrag</p>
                <p className="text-xs text-gray-500">Globale Obergrenze für alle Benutzer</p>
              </div>
            </div>
            <button onClick={() => { setShowCapForm(true); setCapForm({ amount: String(currentCap?.cap_amount ?? DEFAULT_SHOE_CAP), valid_from: today(), note: currentCap?.note ?? '' }) }}
              className="flex items-center gap-1.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
              <Pencil className="w-4 h-4" /> Anpassen
            </button>
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-3xl font-bold text-gray-900">{fmtEUR(Number(currentCap?.cap_amount ?? DEFAULT_SHOE_CAP))}</p>
              {currentCap
                ? <p className="text-xs text-gray-400 mt-0.5">gültig seit {new Date(currentCap.valid_from).toLocaleDateString('de-AT')}</p>
                : <p className="text-xs text-gray-400 mt-0.5">kein Eintrag — Standard {fmtEUR(DEFAULT_SHOE_CAP)}</p>}
            </div>
            {scheduledCap && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <CalendarClock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">Geplante Änderung</p>
                  <p className="text-xs text-amber-700">{fmtEUR(Number(scheduledCap.cap_amount))} ab {new Date(scheduledCap.valid_from).toLocaleDateString('de-AT')}</p>
                  {scheduledCap.note && <p className="text-xs text-amber-600 italic mt-0.5">{scheduledCap.note}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s ? 'bg-blue-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? 'Alle' : STATUS_LABEL[s]}
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${statusFilter === s ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {counts[s]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          {visibleRefunds.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Footprints className="w-12 h-12 mb-3 text-gray-300" />
              <p className="font-semibold text-gray-500">Keine Erstattungen vorhanden</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {canManage && <th className="text-left px-4 py-3 font-semibold text-gray-600">Benutzer</th>}
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Datum</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Betrag</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Genehmigt</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                  {canManage && <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Notiz</th>}
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRefunds.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    {canManage && (
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{r.profiles?.name}</p>
                        <p className="text-xs text-gray-400">{r.profiles?.dienstnummer ? `DNr. ${r.profiles.dienstnummer}` : ''}</p>
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-700">{new Date(r.refund_date).toLocaleDateString('de-AT')}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtEUR(Number(r.amount))}</td>
                    <td className={`px-4 py-3 text-right font-medium hidden sm:table-cell ${r.status === 'rejected' ? 'text-gray-400' : 'text-green-700'}`}>
                      {r.status === 'rejected' ? '–' : fmtEUR(Number(r.approved_amount))}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                        {STATUS_ICON[r.status]}
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    {canManage && <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{r.note ?? '–'}</td>}
                    {canManage && (
                      <td className="px-4 py-3">
                        {/* Entscheidung erfolgt zentral auf der Seite "Genehmigungen" (Freigaben), nicht mehr hier. */}
                        {r.status === 'pending' ? (
                          <p className="text-xs text-amber-700 text-right whitespace-nowrap">→ Freigaben</p>
                        ) : (
                          <p className="text-xs text-gray-400 text-right whitespace-nowrap">{r.reviewer?.name ?? '–'}</p>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Neue Schuherstattung</h2>
              <button onClick={resetForm} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {canManage && (
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Benutzer *</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Name oder Dienstnummer eingeben..."
                    value={userSearch}
                    onChange={e => { setUserSearch(e.target.value); setUserDropdown(true); if (!e.target.value) setForm(f => ({ ...f, user_id: '' })) }}
                    onFocus={() => setUserDropdown(true)}
                    onBlur={() => setTimeout(() => setUserDropdown(false), 150)}
                  />
                  {userDropdown && filteredUsers.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                      {filteredUsers.map(u => (
                        <li key={u.id}>
                          <button type="button" onMouseDown={() => selectUser(u)}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors">
                            <p className="text-sm font-medium text-gray-900">{u.name || u.username}</p>
                            {u.dienstnummer && <p className="text-xs text-gray-400">DNr. {u.dienstnummer}</p>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {form.user_id && <p className="text-xs text-green-600 mt-1">✓ Benutzer ausgewählt</p>}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Erstattungsdatum *</label>
                <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.refund_date} onChange={e => setForm(f => ({ ...f, refund_date: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rechnungsbetrag (€) *</label>
                <input type="number" step="0.01" min="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                {form.amount && !isNaN(parseFloat(form.amount)) && (() => {
                  const amt = parseFloat(form.amount)
                  const approved = Math.min(amt, maxRefund)
                  const selfPay = amt - approved
                  return (
                    <div className={`mt-2 px-3 py-2 rounded-lg text-xs space-y-0.5 ${selfPay > 0 ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>
                      <p>Erstattet: <strong>{fmtEUR(approved)}</strong></p>
                      {selfPay > 0 && <p>Eigenanteil: <strong>{fmtEUR(selfPay)}</strong></p>}
                    </div>
                  )
                })()}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notiz</label>
                <textarea rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optionale Notiz..." />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={resetForm} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={create} disabled={saving} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCapForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Schuherstattung anpassen</h2>
              <p className="text-xs text-gray-500 mt-1">Neuer Maximalbetrag mit Gültigkeitsdatum</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Maximalbetrag (€)</label>
                <input type="number" step="0.01" min="0" autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={capForm.amount} onChange={e => setCapForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Gültig ab</label>
                <input type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={capForm.valid_from} onChange={e => setCapForm(f => ({ ...f, valid_from: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notiz (optional)</label>
                <input type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={capForm.note} onChange={e => setCapForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="z. B. Anpassung laut Beschluss 2027" />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowCapForm(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={saveCap} disabled={!capForm.amount || capSaving}
                className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">
                {capSaving ? 'Wird gespeichert...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
