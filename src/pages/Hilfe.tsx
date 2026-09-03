import { useCallback, useEffect, useState } from 'react'
import { LifeBuoy, Plus, Send, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { SupportMessage, SupportTicket, SupportTicketStatus } from '../lib/types'
import {
  SUPPORT_BODY_MAX,
  SUPPORT_STATUS_COLORS,
  SUPPORT_STATUS_LABELS,
  SUPPORT_SUBJECT_MAX,
  sortSupportTickets,
  validateSupportBody,
  validateSupportSubject,
} from '../lib/supportTickets'

const FILTERS: Array<SupportTicketStatus | 'all'> = ['all', 'open', 'answered', 'closed']

function formatWhen(value: string | null | undefined): string {
  if (!value) return '–'
  return new Date(value).toLocaleString('de-AT')
}

function authorLabel(message: SupportMessage): string {
  if (message.from_admin) return 'Support'
  return message.profiles?.name || message.profiles?.username || 'Benutzer'
}

export default function Hilfe() {
  const { profile, isAdmin, isStrictAdmin } = useAuth()
  const canManage = isAdmin || isStrictAdmin
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<SupportTicketStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [threadLoading, setThreadLoading] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [subject, setSubject] = useState('')
  const [newBody, setNewBody] = useState('')
  const [reply, setReply] = useState('')
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)

  const loadTickets = useCallback(async () => {
    if (!profile) return
    const query = supabase
      .from('support_tickets')
      .select('*, profiles(id,name,username,dienstnummer)')
      .order('last_message_at', { ascending: false })
    if (!canManage) query.eq('user_id', profile.id)
    const { data, error: loadError } = await query
    if (loadError) throw loadError
    setTickets(sortSupportTickets((data ?? []) as SupportTicket[]))
  }, [profile, canManage])

  const loadMessages = useCallback(async (ticketId: string) => {
    const { data, error: loadError } = await supabase
      .from('support_messages')
      .select('*, profiles(id,name,username)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })
    if (loadError) throw loadError
    setMessages((data ?? []) as SupportMessage[])
  }, [])

  useEffect(() => {
    if (!profile) return
    setLoading(true)
    loadTickets()
      .then(() => setError(''))
      .catch(() => setError('Anfragen konnten nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [profile, loadTickets])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    setThreadLoading(true)
    loadMessages(selectedId)
      .then(() => setError(''))
      .catch(() => setError('Nachrichten konnten nicht geladen werden.'))
      .finally(() => setThreadLoading(false))
  }, [selectedId, loadMessages])

  const selected = tickets.find(t => t.id === selectedId) ?? null
  const visible = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)
  const counts = {
    all: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    answered: tickets.filter(t => t.status === 'answered').length,
    closed: tickets.filter(t => t.status === 'closed').length,
  }

  function resetForm() {
    setShowForm(false)
    setSubject('')
    setNewBody('')
  }

  async function createTicket() {
    if (!profile) return
    setError('')
    const subjectOk = validateSupportSubject(subject)
    if (!subjectOk.ok) { setError(subjectOk.error); return }
    const bodyOk = validateSupportBody(newBody)
    if (!bodyOk.ok) { setError(bodyOk.error); return }

    setSaving(true)
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .insert({ user_id: profile.id, subject: subjectOk.value })
      .select('*, profiles(id,name,username,dienstnummer)')
      .single()

    if (ticketError || !ticket) {
      setError('Anfrage konnte nicht angelegt werden.')
      setSaving(false)
      return
    }

    const created = ticket as SupportTicket
    const { error: messageError } = await supabase.from('support_messages').insert({
      ticket_id: created.id,
      author_id: profile.id,
      body: bodyOk.value,
      from_admin: false,
    })

    if (messageError) {
      setSelectedId(created.id)
      setReply(bodyOk.value)
      setError('Die Nachricht konnte nicht gespeichert werden. Bitte erneut senden.')
    } else {
      setSelectedId(created.id)
      setReply('')
    }

    setFilter('all')
    resetForm()
    try {
      await loadTickets()
      if (!messageError) await loadMessages(created.id)
    } catch {
      setError('Anfrage gespeichert, Liste konnte nicht aktualisiert werden.')
    }
    setSaving(false)
  }

  async function sendReply() {
    if (!profile || !selected) return
    setError('')
    const bodyOk = validateSupportBody(reply)
    if (!bodyOk.ok) { setError(bodyOk.error); return }

    setSaving(true)
    const { error: messageError } = await supabase.from('support_messages').insert({
      ticket_id: selected.id,
      author_id: profile.id,
      body: bodyOk.value,
      from_admin: canManage && selected.user_id !== profile.id,
    })
    if (messageError) {
      setError('Nachricht konnte nicht gesendet werden.')
      setSaving(false)
      return
    }
    setReply('')
    try {
      await Promise.all([loadTickets(), loadMessages(selected.id)])
    } catch {
      setError('Nachricht gesendet, Ansicht konnte nicht aktualisiert werden.')
    }
    setSaving(false)
  }

  async function closeTicket() {
    if (!selected || !canManage) return
    setClosing(true)
    setError('')
    const { error: closeError } = await supabase
      .from('support_tickets')
      .update({ status: 'closed' })
      .eq('id', selected.id)
    if (closeError) setError('Anfrage konnte nicht geschlossen werden.')
    else {
      try {
        await loadTickets()
      } catch {
        setError('Status geändert, Liste konnte nicht aktualisiert werden.')
      }
    }
    setClosing(false)
  }

  const showComposer = selected != null && (canManage || selected.status !== 'closed')

  return (
    <div>
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hilfe</h1>
          <p className="text-gray-500 text-sm mt-1">
            {canManage ? 'Alle Hilfe-Anfragen' : 'Deine Anfragen an die Verwaltung'}
          </p>
          <p className="text-xs text-gray-400 mt-1">Antworten kommen hier in der App, kein Live-Chat.</p>
        </div>
        <button
          onClick={() => { setError(''); setShowForm(true) }}
          className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Neue Anfrage</span>
        </button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === s ? 'bg-blue-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? 'Alle' : SUPPORT_STATUS_LABELS[s]}
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${filter === s ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {counts[s]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden lg:col-span-2 ${selected ? 'hidden lg:block' : ''}`}>
            {visible.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center px-4">
                <LifeBuoy className="w-12 h-12 mb-3 text-gray-300" />
                <p className="font-semibold text-gray-500">Keine Anfragen vorhanden</p>
                <p className="text-sm text-gray-400 mt-1">Neue Anfrage oben rechts anlegen.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {visible.map(ticket => {
                  const active = ticket.id === selectedId
                  return (
                    <li key={ticket.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(ticket.id)}
                        className={`w-full text-left px-4 py-3 transition-colors ${active ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-gray-900 text-sm truncate">{ticket.subject}</p>
                          <span className={`flex-shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SUPPORT_STATUS_COLORS[ticket.status]}`}>
                            {SUPPORT_STATUS_LABELS[ticket.status]}
                          </span>
                        </div>
                        {canManage && (
                          <p className="text-xs text-gray-500 mt-1 truncate">
                            {ticket.profiles?.name || ticket.profiles?.username || '–'}
                            {ticket.profiles?.dienstnummer ? ` · DG ${ticket.profiles.dienstnummer}` : ''}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">{formatWhen(ticket.last_message_at)}</p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className={`bg-white rounded-xl border border-gray-200 flex flex-col min-h-[28rem] lg:col-span-3 ${selected ? '' : 'hidden lg:flex'}`}>
            {!selected ? (
              <div className="flex flex-col items-center justify-center flex-1 py-16 text-center px-4">
                <LifeBuoy className="w-12 h-12 mb-3 text-gray-300" />
                <p className="font-semibold text-gray-500">Keine Anfrage ausgewählt</p>
                <p className="text-sm text-gray-400 mt-1">Wähle links eine Anfrage oder lege eine neue an.</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="lg:hidden text-sm text-blue-700 hover:underline mb-2"
                  >
                    ← Zurück zur Liste
                  </button>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-gray-900 truncate">{selected.subject}</h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {canManage && (selected.profiles?.name || selected.profiles?.username)
                          ? `${selected.profiles?.name || selected.profiles?.username} · `
                          : ''}
                        {formatWhen(selected.created_at)}
                      </p>
                    </div>
                    <span className={`flex-shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SUPPORT_STATUS_COLORS[selected.status]}`}>
                      {SUPPORT_STATUS_LABELS[selected.status]}
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {threadLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-800" /></div>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">Noch keine Nachricht. Bitte den Text unten senden.</p>
                  ) : (
                    messages.map(message => (
                      <div
                        key={message.id}
                        className={`rounded-xl px-3 py-2.5 ${message.from_admin ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-100'}`}
                      >
                        <div className="flex items-baseline justify-between gap-2 mb-1">
                          <p className="text-xs font-semibold text-gray-700">{authorLabel(message)}</p>
                          <p className="text-xs text-gray-400 whitespace-nowrap">{formatWhen(message.created_at)}</p>
                        </div>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{message.body}</p>
                      </div>
                    ))
                  )}
                </div>

                {selected.status === 'closed' && !canManage && (
                  <div className="px-4 py-3 border-t border-gray-200">
                    <p className="text-sm text-gray-500">Diese Anfrage ist geschlossen.</p>
                  </div>
                )}

                {showComposer && (
                  <div className="px-4 py-3 border-t border-gray-200 space-y-3">
                    <textarea
                      rows={3}
                      maxLength={SUPPORT_BODY_MAX}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      placeholder={canManage ? 'Antwort schreiben…' : 'Nachricht schreiben…'}
                    />
                    <div className="flex flex-wrap gap-2 justify-end">
                      {canManage && selected.status !== 'closed' && (
                        <button
                          type="button"
                          onClick={closeTicket}
                          disabled={closing || saving}
                          className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                          Schließen
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={sendReply}
                        disabled={saving || closing}
                        className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60"
                      >
                        <Send className="w-4 h-4" />
                        {canManage ? 'Beantworten' : 'Senden'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Neue Anfrage</h2>
              <button type="button" onClick={resetForm} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Betreff</label>
                <input
                  type="text"
                  maxLength={SUPPORT_SUBJECT_MAX}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Kurz beschreiben"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nachricht</label>
                <textarea
                  rows={5}
                  maxLength={SUPPORT_BODY_MAX}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  value={newBody}
                  onChange={e => setNewBody(e.target.value)}
                  placeholder="Dein Anliegen"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button type="button" onClick={resetForm} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button
                type="button"
                onClick={createTicket}
                disabled={saving}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60"
              >
                Senden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
