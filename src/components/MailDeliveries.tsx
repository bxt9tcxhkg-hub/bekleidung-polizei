import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, CheckCircle2, Clock3, Mail, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { MailDelivery, MailDeliveryKind, MailDeliveryStatus } from '../lib/types'

const KIND_LABEL: Record<MailDeliveryKind, string> = { rsa: 'RSa', rsb: 'RSb', vernehmung: 'Vernehmung' }
const STATUS_LABEL: Record<MailDeliveryStatus, string> = {
  offen: 'Offen',
  zugestellt: 'Zugestellt',
  schriftlich_in_kenntnis: 'Schriftlich in Kenntnis gesetzt',
  nicht_angetroffen: 'Nicht angetroffen',
  spaeter_erneut: 'Später erneut versuchen',
  durchgefuehrt: 'Durchgeführt',
}
const STATUS_COLOR: Record<MailDeliveryStatus, string> = {
  offen: 'bg-gray-100 text-gray-700',
  zugestellt: 'bg-green-100 text-green-800',
  schriftlich_in_kenntnis: 'bg-blue-100 text-blue-800',
  nicht_angetroffen: 'bg-amber-100 text-amber-800',
  spaeter_erneut: 'bg-orange-100 text-orange-800',
  durchgefuehrt: 'bg-green-100 text-green-800',
}
// Passende Schnellaktionen je Fall-Art: Postzustellung vs. Vernehmung.
const QUICK_ACTIONS_BY_KIND: Record<MailDeliveryKind, MailDeliveryStatus[]> = {
  rsa: ['zugestellt', 'schriftlich_in_kenntnis', 'nicht_angetroffen', 'spaeter_erneut'],
  rsb: ['zugestellt', 'schriftlich_in_kenntnis', 'nicht_angetroffen', 'spaeter_erneut'],
  vernehmung: ['durchgefuehrt', 'nicht_angetroffen', 'spaeter_erneut'],
}
const inputClass = 'mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500'

function formatDateTime(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/**
 * Register für schwer erreichbare Personen (RSa/RSb-Zustellungen und Vernehmungen),
 * nach Person gruppiert, mit Schnellaktionen. Der Akteneigentümer ist automatisch,
 * wer den Eintrag erfasst hat. Ablauf: Feld-Aktion setzen (verschwindet aus der
 * offenen Liste, bleibt für den Eigentümer als Rückmeldung sichtbar) → der
 * Eigentümer schließt den Akt endgültig, danach ist er ganz weg. Unabhängig vom
 * heutigen Dienst nutzbar — kein Erfordernis, "im operativen Dienst" zu sein.
 */
export default function MailDeliveries({ onlyOpen = false }: { onlyOpen?: boolean }) {
  const { profile, isStrictAdmin, areaRoles } = useAuth()
  const canManage = isStrictAdmin || (areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []).some(role => ['sachbearbeiter', 'admin'].includes(role))
  const [items, setItems] = useState<MailDelivery[]>([])
  const [closedItems, setClosedItems] = useState<MailDelivery[]>([])
  const [showClosed, setShowClosed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ personName: '', birthDate: '', kind: 'rsb' as MailDeliveryKind, behoerdenAktenzahl: '', eigeneGeschaeftszahl: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [openResult, closedResult] = await Promise.all([
      supabase.from('mail_deliveries').select('*, akteneigentuemer:profiles!mail_deliveries_akteneigentuemer_id_fkey(id,name,dienstnummer)').is('closed_at', null).order('created_at', { ascending: false }),
      canManage ? supabase.from('mail_deliveries').select('*, akteneigentuemer:profiles!mail_deliveries_akteneigentuemer_id_fkey(id,name,dienstnummer)').not('closed_at', 'is', null).order('closed_at', { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
    ])
    if (openResult.error) setError('Die Übersicht konnte nicht geladen werden.')
    else setError('')
    setItems((openResult.data ?? []) as unknown as MailDelivery[])
    setClosedItems((closedResult.data ?? []) as unknown as MailDelivery[])
    setLoading(false)
  }, [canManage])
  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => onlyOpen ? items.filter(item => item.status === 'offen' || item.status === 'spaeter_erneut') : items, [items, onlyOpen])
  const groups = useMemo(() => {
    const byPerson = new Map<string, MailDelivery[]>()
    for (const item of visible) {
      const key = item.person_name.trim().toLocaleLowerCase('de-AT')
      const list = byPerson.get(key) ?? []
      list.push(item)
      byPerson.set(key, list)
    }
    return [...byPerson.entries()]
      .map(([, list]) => ({ personName: list[0].person_name, items: list, hasOpen: list.some(item => item.status === 'offen' || item.status === 'spaeter_erneut') }))
      .sort((a, b) => (a.hasOpen === b.hasOpen ? a.personName.localeCompare(b.personName, 'de-AT') : a.hasOpen ? -1 : 1))
  }, [visible])

  function openForm() { setForm({ personName: '', birthDate: '', kind: 'rsb', behoerdenAktenzahl: '', eigeneGeschaeftszahl: '', note: '' }); setShowForm(true); setError('') }
  async function save() {
    if (!profile?.id || !form.personName.trim()) { setError('Bitte den Namen der Person angeben.'); return }
    setSaving(true)
    // Akteneigentümer wird serverseitig automatisch auf den Ersteller gesetzt (kein manueller Schritt).
    const { error: insertError } = await supabase.from('mail_deliveries').insert({
      person_name: form.personName.trim(), person_birth_date: form.birthDate || null, kind: form.kind,
      behoerden_aktenzahl: form.behoerdenAktenzahl.trim() || null, eigene_geschaeftszahl: form.eigeneGeschaeftszahl.trim() || null,
      note: form.note.trim() || null, created_by: profile.id,
    })
    setSaving(false)
    if (insertError) { setError('Der Eintrag konnte nicht angelegt werden.'); return }
    setShowForm(false); await load()
  }
  async function quickAction(item: MailDelivery, status: MailDeliveryStatus) {
    setBusyId(item.id); setError('')
    const { error: rpcError } = await supabase.rpc('record_mail_delivery_action', { p_id: item.id, p_status: status })
    setBusyId(null)
    if (rpcError) { setError('Die Rückmeldung konnte nicht gespeichert werden.'); return }
    await load()
  }
  async function closeItem(item: MailDelivery) {
    setBusyId(item.id); setError('')
    const { error: rpcError } = await supabase.rpc('close_mail_delivery', { p_id: item.id })
    setBusyId(null)
    if (rpcError) { setError('Der Akt konnte nicht geschlossen werden.'); return }
    await load()
  }
  async function remove(item: MailDelivery) {
    if (!window.confirm(`Eintrag zu „${item.person_name}“ endgültig löschen?`)) return
    const { error: deleteError } = await supabase.from('mail_deliveries').delete().eq('id', item.id)
    if (deleteError) { setError('Der Eintrag konnte nicht gelöscht werden.'); return }
    await load()
  }

  if (loading) return <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-700" /></div>

  if (showClosed) return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-gray-500">Vom Akteneigentümer geschlossene Akten (Archiv, letzte 100).</p><button type="button" onClick={() => setShowClosed(false)} className="text-sm font-semibold text-red-700">Zurück zur Übersicht</button></div>
    {closedItems.length === 0 ? <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"><Archive className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">Noch keine geschlossenen Akten.</p></div> : <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">{closedItems.map(item => <article key={item.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-900 text-white">{KIND_LABEL[item.kind]}</span><span className="font-semibold text-gray-900">{item.person_name}</span><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[item.status]}`}>{STATUS_LABEL[item.status]}</span></div><p className="text-xs text-gray-500 mt-1">Geschlossen {formatDateTime(item.closed_at)}</p></article>)}</div>}
  </div>

  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-gray-500">Nach Person gruppiert · unabhängig vom heutigen Dienst nutzbar.</p><div className="flex gap-2">{canManage ? <button type="button" onClick={() => setShowClosed(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-300 px-3 py-2 rounded-lg"><Archive className="w-3.5 h-3.5" /> Erledigte</button> : null}<button type="button" onClick={openForm} className="inline-flex items-center gap-2 bg-red-700 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Eintrag</button></div></div>
    {error && !showForm ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
    {groups.length === 0 ? <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"><Mail className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{onlyOpen ? 'Keine offenen Fälle.' : 'Noch keine Einträge erfasst.'}</p></div> : <div className="space-y-3">
      {groups.map(group => <section key={group.personName} className="rounded-2xl border border-gray-200 bg-white overflow-hidden"><div className="px-4 sm:px-5 py-3 border-b bg-gray-50"><h3 className="font-bold text-gray-900">{group.personName}</h3></div><div className="divide-y divide-gray-100">
        {group.items.map(item => {
          const isOwner = profile?.id === item.akteneigentuemer_id
          const canClose = item.status !== 'offen' && (isOwner || canManage)
          return <article key={item.id} className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-900 text-white">{KIND_LABEL[item.kind]}</span><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[item.status]}`}>{STATUS_LABEL[item.status]}</span>{isOwner ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">Eigene Akte</span> : null}</div><p className="text-sm text-gray-700 mt-2">{item.behoerden_aktenzahl ? <>Behördenaktenzahl: <span className="font-medium">{item.behoerden_aktenzahl}</span></> : null}{item.behoerden_aktenzahl && item.eigene_geschaeftszahl ? ' · ' : ''}{item.eigene_geschaeftszahl ? <>GZ: <span className="font-medium">{item.eigene_geschaeftszahl}</span></> : null}</p><p className="text-xs text-gray-500 mt-1">Akteneigentümer: {item.akteneigentuemer?.name ?? '–'}{item.last_action_at ? ` · zuletzt ${formatDateTime(item.last_action_at)}` : ''}</p>{item.note ? <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.note}</p> : null}</div>{canManage ? <button type="button" onClick={() => void remove(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0" aria-label="Eintrag löschen"><Trash2 className="w-4 h-4" /></button> : null}</div>
            <div className="flex flex-wrap gap-2 mt-3">{QUICK_ACTIONS_BY_KIND[item.kind].map(status => <button key={status} type="button" disabled={busyId === item.id || item.status === status} onClick={() => void quickAction(item, status)} className="text-xs font-medium border border-gray-300 px-3 py-1.5 rounded-lg disabled:opacity-40 hover:bg-gray-50">{STATUS_LABEL[status]}</button>)}{canClose ? <button type="button" disabled={busyId === item.id} onClick={() => void closeItem(item)} className="text-xs font-semibold border border-green-300 text-green-800 bg-green-50 px-3 py-1.5 rounded-lg disabled:opacity-40 hover:bg-green-100">Akt erledigt – schließen</button> : null}</div>
          </article>
        })}
      </div></section>)}
    </div>}

    {showForm ? <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[94vh] overflow-y-auto"><div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 sm:px-6 py-4 border-b"><h2 className="font-bold text-gray-900">Neuer Eintrag</h2><button type="button" onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button></div><div className="px-5 sm:px-6 py-4 space-y-4">
      <label className="block text-xs font-medium text-gray-600">Person *<input className={inputClass} value={form.personName} onChange={event => setForm(current => ({ ...current, personName: event.target.value }))} /></label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block text-xs font-medium text-gray-600">Geburtsdatum<input type="date" className={inputClass} value={form.birthDate} onChange={event => setForm(current => ({ ...current, birthDate: event.target.value }))} /></label>
        <label className="block text-xs font-medium text-gray-600">Art<select className={inputClass} value={form.kind} onChange={event => setForm(current => ({ ...current, kind: event.target.value as MailDeliveryKind }))}><option value="rsb">RSb</option><option value="rsa">RSa</option><option value="vernehmung">Vernehmung</option></select></label>
        <label className="block text-xs font-medium text-gray-600">Behördenaktenzahl<input className={inputClass} value={form.behoerdenAktenzahl} onChange={event => setForm(current => ({ ...current, behoerdenAktenzahl: event.target.value }))} /></label>
        <label className="block text-xs font-medium text-gray-600">Eigene Geschäftszahl<input className={inputClass} value={form.eigeneGeschaeftszahl} onChange={event => setForm(current => ({ ...current, eigeneGeschaeftszahl: event.target.value }))} /></label>
      </div>
      <p className="text-xs text-gray-500 -mt-2">Du wirst automatisch als Akteneigentümer:in eingetragen.</p>
      <label className="block text-xs font-medium text-gray-600">Bemerkung<textarea className={`${inputClass} min-h-20 resize-y`} value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></label>
      {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
      <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setShowForm(false)} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button><button type="button" disabled={saving} onClick={() => void save()} className="bg-red-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button></div>
    </div></div></div> : null}
  </div>
}

export function OwnerNotifications({ userId }: { userId: string }) {
  const [items, setItems] = useState<MailDelivery[]>([])
  const load = useCallback(async () => {
    const result = await supabase.from('mail_deliveries').select('*').eq('akteneigentuemer_id', userId).eq('owner_notified', false).is('closed_at', null).order('last_action_at', { ascending: false })
    setItems((result.data ?? []) as MailDelivery[])
  }, [userId])
  useEffect(() => { void load() }, [load])
  async function acknowledge(item: MailDelivery) {
    await supabase.from('mail_deliveries').update({ owner_notified: true }).eq('id', item.id)
    await load()
  }
  if (items.length === 0) return null
  return <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:p-5"><h2 className="font-bold text-blue-900 flex items-center gap-2"><Clock3 className="w-4 h-4" /> Rückmeldungen zu eigenen Akten</h2><div className="space-y-2 mt-3">{items.map(item => <div key={item.id} className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2"><p className="text-sm text-blue-900"><span className="font-semibold">{item.person_name}</span> · {STATUS_LABEL[item.status]}</p><button type="button" onClick={() => void acknowledge(item)} className="text-xs font-medium text-blue-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Gesehen</button></div>)}</div><p className="text-xs text-blue-700 mt-3">Zum endgültigen Abschließen den Akt in der Übersicht öffnen und „Akt erledigt“ wählen.</p></section>
}
