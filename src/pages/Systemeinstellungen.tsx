import { useEffect, useState } from 'react'
import { ArrowLeft, ContactRound, PhoneIncoming } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { integrationSupabase, type PortalIntegrationSettings } from '../lib/integrations'

const fieldClass = 'mt-1 block w-full max-w-xl rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100'
const empty = (value: string) => value.trim() || null

export default function Systemeinstellungen() {
  const { profile } = useAuth()
  const [outlook, setOutlook] = useState<PortalIntegrationSettings | null>(null)
  const [rainbow, setRainbow] = useState<PortalIntegrationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'outlook' | 'rainbow' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      const { data: rawData, error: loadError } = await integrationSupabase.from('portal_integration_settings').select('*')
      const data = rawData as unknown as PortalIntegrationSettings[] | null
      if (!active) return
      if (loadError || !data || data.length !== 2) setError('Die Systemeinstellungen konnten nicht geladen werden. Bitte Datenbankmigration und Administratorrechte prüfen.')
      else {
        setOutlook(data.find(row => row.id === 'outlook') ?? null)
        setRainbow(data.find(row => row.id === 'rainbow') ?? null)
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [])

  async function save(id: 'outlook' | 'rainbow') {
    const current = id === 'outlook' ? outlook : rainbow
    if (!current || !profile) return
    setSaving(id)
    setError('')
    setNotice('')
    const changes = id === 'outlook'
      ? {
          outlook_source: current.outlook_source,
          outlook_mailbox: current.outlook_source === 'postfach' ? empty(current.outlook_mailbox ?? '') : null,
          outlook_folder_id: current.outlook_source === 'postfach' ? empty(current.outlook_folder_id ?? '') : null,
          updated_by: profile.id,
        }
      : { rainbow_called_number: empty(current.rainbow_called_number ?? ''), updated_by: profile.id }
    const { data: rawData, error: saveError } = await integrationSupabase.from('portal_integration_settings').update(changes as never).eq('id', id).select('*').single()
    const data = rawData as unknown as PortalIntegrationSettings | null
    setSaving(null)
    if (saveError || !data) {
      setError('Die Einstellungen konnten nicht gespeichert werden. Bitte Berechtigung und Eingaben prüfen.')
      return
    }
    if (id === 'outlook') setOutlook(data)
    else setRainbow(data)
    setNotice(`${id === 'outlook' ? 'Outlook' : 'Rainbow'}: Vorbereitung gespeichert. Die Anbindung ist noch nicht aktiv.`)
  }

  return <div className="mx-auto max-w-4xl py-6 px-4 sm:px-6">
    <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4" /> Zu Mein Bereich</Link>
    <h1 className="mt-5 text-2xl font-bold text-gray-900">Systemeinstellungen</h1>
    <p className="mt-2 text-sm text-gray-600">Vorbereitung für die spätere Anbindung durch die Stadt-IT. Hier werden nur nicht geheime Angaben gespeichert. Kontakte und Anrufe werden derzeit nicht automatisch übernommen.</p>
    {error ? <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
    {notice ? <div role="status" className="mt-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</div> : null}
    {loading ? <p className="mt-8 text-sm text-gray-500">Einstellungen laden…</p> : outlook && rainbow ? <div className="mt-6 space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="outlook-title">
        <div className="flex items-center gap-3"><ContactRound className="h-6 w-6 text-blue-700" /><h2 id="outlook-title" className="text-lg font-semibold">Outlook-Kontakte</h2><span className="ml-auto rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-900">Nicht verbunden</span></div>
        <p className="mt-2 text-sm text-gray-600">Quelle für eine spätere Synchronisation mit Microsoft Graph festlegen. Bestehende Portal-Kontakte bleiben eigenständig.</p>
        <label className="mt-4 block text-sm font-medium text-gray-700">Kontaktquelle
          <select className={fieldClass} value={outlook.outlook_source ?? 'postfach'} onChange={event => setOutlook({ ...outlook, outlook_source: event.target.value as 'postfach' | 'organisationskontakte' })}>
            <option value="postfach">Kontakte eines dienstlichen Postfachs</option><option value="organisationskontakte">Organisationskontakte</option>
          </select>
        </label>
        {outlook.outlook_source === 'postfach' ? <div className="mt-4 space-y-4">
          <label className="block text-sm font-medium text-gray-700">Postfachadresse (optional)<input type="email" maxLength={255} autoComplete="off" className={fieldClass} value={outlook.outlook_mailbox ?? ''} onChange={event => setOutlook({ ...outlook, outlook_mailbox: event.target.value })} placeholder="zentrale@beispiel.at" /></label>
          <label className="block text-sm font-medium text-gray-700">Kontaktordner-ID (optional)<input maxLength={255} autoComplete="off" className={fieldClass} value={outlook.outlook_folder_id ?? ''} onChange={event => setOutlook({ ...outlook, outlook_folder_id: event.target.value })} /></label>
        </div> : null}
        <p className="mt-4 text-xs text-gray-500">Für die Freigabe und den sicheren Zugriff auf Microsoft Graph ist die Stadt-IT zuständig. Zugangsdaten gehören nicht in dieses Formular.</p>
        <button type="button" disabled={saving !== null} onClick={() => void save('outlook')} className="mt-5 rounded-lg bg-blue-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving === 'outlook' ? 'Speichern…' : 'Vorbereitung speichern'}</button>
      </section>
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="rainbow-title">
        <div className="flex items-center gap-3"><PhoneIncoming className="h-6 w-6 text-blue-700" /><h2 id="rainbow-title" className="text-lg font-semibold">Rainbow-Telefonie</h2><span className="ml-auto rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-900">Nicht verbunden</span></div>
        <p className="mt-2 text-sm text-gray-600">Rufnummer der Zentrale für eine spätere Zuordnung eingehender Anrufe vormerken.</p>
        <label className="mt-4 block text-sm font-medium text-gray-700">Angerufene Rufnummer (optional)<input type="tel" maxLength={50} autoComplete="off" className={fieldClass} value={rainbow.rainbow_called_number ?? ''} onChange={event => setRainbow({ ...rainbow, rainbow_called_number: event.target.value })} placeholder="+43 …" /></label>
        <p className="mt-4 text-xs text-gray-500">Die Rainbow-Ereignisanbindung muss durch die Stadt-IT eingerichtet und geprüft werden. Persönliche Zugriffstoken und Passwörter hier nicht eintragen.</p>
        <button type="button" disabled={saving !== null} onClick={() => void save('rainbow')} className="mt-5 rounded-lg bg-blue-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving === 'rainbow' ? 'Speichern…' : 'Vorbereitung speichern'}</button>
      </section>
    </div> : null}
  </div>
}
