import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Crosshair, Navigation, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import LeafletMap from '../../components/LeafletMap'
import { logAudit } from '../../lib/audit'
import { personDisplayName } from '../../lib/register'
import { supabase } from '../../lib/supabase'
import { assessDistance, distanceNote, firstControlDeadline, hasInitialControl, haversineMeters, MASSNAHME_LABEL, SCHUTZ_SELECT, type Schutzfall } from '../../lib/schutzmassnahmen'

type Point = { lat: number; lng: number; accuracy: number }

export default function AussendienstSchutzmassnahmen() {
  const { profile } = useAuth()
  const [items, setItems] = useState<Schutzfall[]>([])
  const [selected, setSelected] = useState<Schutzfall | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [ownPoint, setOwnPoint] = useState<Point | null>(null)
  const [dangerPoint, setDangerPoint] = useState<Point | null>(null)
  const [protectedPoint, setProtectedPoint] = useState<Point | null>(null)
  const [tapTarget, setTapTarget] = useState<'danger' | 'protected'>('danger')
  const [now] = useState(() => new Date().getTime())

  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('schutzfaelle').select(SCHUTZ_SELECT).eq('status', 'aktiv').gt('ende', new Date().toISOString()).order('ende')
    setLoading(false)
    if (result.error) { setError('Die Schutzmaßnahmen konnten nicht geladen werden.'); return }
    const rows = (result.data ?? []) as unknown as Schutzfall[]
    setItems(rows)
    setSelected(current => rows.find(row => row.id === current?.id) ?? null)
  }, [])
  useEffect(() => { void load() }, [load])

  const circles = useMemo(() => items.flatMap(item => (item.bereiche ?? []).map(area => ({
    lat: area.lat, lng: area.lng, radiusMeters: area.radius_m,
    popup: `${MASSNAHME_LABEL[item.massnahme]} · ${area.bezeichnung}`,
    color: item.massnahme === 'bv_av' ? '#dc2626' : '#7c3aed',
    fillColor: item.massnahme === 'bv_av' ? '#ef4444' : '#8b5cf6',
  }))), [items])

  function locate(callback?: (point: Point) => void) {
    if (!navigator.geolocation) { setError('GPS ist auf diesem Gerät nicht verfügbar.'); return }
    setLocating(true); setError('')
    navigator.geolocation.getCurrentPosition(position => {
      const point = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy }
      setOwnPoint(point); callback?.(point); setLocating(false)
    }, () => { setLocating(false); setError('Standort konnte nicht ermittelt werden. Bitte Standortfreigabe und GPS prüfen.') }, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 })
  }

  const selectedArea = selected?.bereiche?.[0]
  const fixedDistance = ownPoint && selectedArea ? haversineMeters(ownPoint, selectedArea) : null
  const personDistance = dangerPoint && protectedPoint ? haversineMeters(dangerPoint, protectedPoint) : null

  function addMeasurement(text: string) {
    setNote(current => [current.trim(), text].filter(Boolean).join('\n'))
    setNotice('Distanzhinweis wurde in die Kontrollnotiz übernommen.')
  }

  async function saveControl() {
    if (!selected || !profile?.id) return
    setSaving(true); setError('')
    const result = await supabase.from('schutzkontrollen').insert({ schutzfall_id: selected.id, kontrolliert_am: new Date().toISOString(), notiz: note.trim() || null, created_by: profile.id })
    setSaving(false)
    if (result.error) { setError('Die Kontrolle konnte nicht gespeichert werden.'); return }
    logAudit('Schutzmaßnahme kontrolliert', `${MASSNAHME_LABEL[selected.massnahme]} · PAD ${selected.pad_aktenzahl}`)
    setNote(''); setNotice('Kontrolle mit aktueller Uhrzeit gespeichert. Die eigentliche Protokollierung erfolgt im PAD.'); await load()
  }

  return <div className="space-y-5">
    <div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Außendienst</p><h2 className="text-2xl font-bold text-gray-900 mt-1">Schutzmaßnahmen</h2><p className="text-sm text-gray-500 mt-1">Orientierung und knappe Kontrollnotiz – PAD bleibt die offizielle Dokumentation.</p></div>
    {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
    {notice ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div> : null}
    <LeafletMap height={360} markers={ownPoint ? [{ ...ownPoint, popup: `Mein Standort · Genauigkeit ±${Math.round(ownPoint.accuracy)} m` }] : []} circles={circles} />
    <button type="button" onClick={() => locate()} disabled={locating} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"><Navigation className="h-4 w-4" />{locating ? 'Standort wird ermittelt…' : 'Meinen Standort anzeigen'}</button>
    {loading ? <div className="py-8 text-center text-sm text-gray-500">Schutzmaßnahmen werden geladen…</div> : items.length === 0 ? <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">Keine aktiven Schutzmaßnahmen.</div> : <div className="grid gap-3">{items.map(item => {
      const initialDone = hasInitialControl(item)
      const overdue = item.massnahme === 'bv_av' && !initialDone && firstControlDeadline(item).getTime() < now
      return <button type="button" key={item.id} onClick={() => { setSelected(item); setOwnPoint(null); setDangerPoint(null); setProtectedPoint(null); setNote('') }} className="rounded-2xl border border-gray-200 bg-white p-4 text-left hover:border-blue-300">
        <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.massnahme === 'bv_av' ? 'bg-red-100 text-red-800' : 'bg-purple-100 text-purple-800'}`}>{MASSNAHME_LABEL[item.massnahme]}</span>{overdue ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">Erstkontrolle überfällig</span> : null}</div>
        <p className="mt-2 font-semibold text-gray-900">Gefährder: {item.gefaehrder ? personDisplayName(item.gefaehrder) : '—'}</p>
        <p className="mt-1 text-sm text-gray-600">Geschützt: {(item.geschuetzte ?? []).map(row => row.person ? personDisplayName(row.person) : '—').join(', ') || '—'}</p>
        <p className="mt-1 text-xs text-gray-500">PAD {item.pad_aktenzahl} · bis {new Date(item.ende).toLocaleString('de-AT')}</p>
      </button>
    })}</div>}

    {selected ? <section className="rounded-2xl border border-blue-200 bg-white p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-gray-900">{MASSNAHME_LABEL[selected.massnahme]}</h3><p className="text-sm text-gray-500">PAD {selected.pad_aktenzahl}</p></div><ShieldAlert className="h-6 w-6 text-blue-700" /></div>
      {selected.ausnahmen ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"><strong>Ausnahmen beachten:</strong> {selected.ausnahmen}</div> : null}
      {selected.hinweise ? <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700"><strong>Relevante Hinweise:</strong> {selected.hinweise}</div> : null}
      {selected.massnahme === 'bv_av' && selectedArea ? <div className="rounded-xl border border-gray-200 p-3">
        <h4 className="font-semibold text-gray-900">Wohnungs-Schutzbereich prüfen</h4><p className="text-xs text-gray-500 mt-1">{selectedArea.bezeichnung} · fixer Radius 100 m</p>
        <button type="button" onClick={() => locate()} disabled={locating} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-blue-300 px-3 py-2 text-sm font-medium text-blue-800"><Crosshair className="h-4 w-4" /> GPS-Abstand prüfen</button>
        {fixedDistance !== null && ownPoint ? <div className={`mt-3 rounded-lg border p-3 text-sm ${assessDistance(fixedDistance, selectedArea.radius_m, ownPoint.accuracy).color}`}><strong>{Math.round(fixedDistance)} m zum Mittelpunkt</strong> · Genauigkeit ±{Math.round(ownPoint.accuracy)} m<br /><span className="text-xs">Schutzbereich: {assessDistance(fixedDistance, selectedArea.radius_m, ownPoint.accuracy).label}. GPS ist nur eine Orientierung.</span><br /><button type="button" onClick={() => addMeasurement(distanceNote(fixedDistance, ownPoint.accuracy, `zum Schutzbereich „${selectedArea.bezeichnung}“`, selectedArea.radius_m))} className="mt-2 font-semibold underline">In Notiz übernehmen</button></div> : null}
      </div> : null}
      {selected.massnahme === 'bv_av' ? <div className="rounded-xl border border-gray-200 p-3">
        <h4 className="font-semibold text-gray-900">100-m-Annäherung zwischen Personen</h4><p className="text-xs text-gray-500 mt-1">Gefährder- und geschützte Person auf der Karte setzen. Es wird ausschließlich die Luftlinie berechnet; Punkte werden nicht gespeichert.</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setTapTarget('danger'); locate(point => setDangerPoint(point)) }} className="rounded-lg border px-3 py-2 text-sm"><Navigation className="mr-1 inline h-4 w-4" />Mein GPS = Gefährder</button><button type="button" onClick={() => setTapTarget('danger')} className={`rounded-lg border px-3 py-2 text-sm ${tapTarget === 'danger' ? 'border-red-500 bg-red-50' : ''}`}>Gefährder setzen</button><button type="button" onClick={() => setTapTarget('protected')} className={`rounded-lg border px-3 py-2 text-sm ${tapTarget === 'protected' ? 'border-green-500 bg-green-50' : ''}`}>Geschützte Person setzen</button></div>
        <div className="mt-3"><LeafletMap height={280} markers={[...(dangerPoint ? [{ ...dangerPoint, popup: 'Gefährderposition' }] : []), ...(protectedPoint ? [{ ...protectedPoint, popup: 'Position geschützte Person' }] : [])]} lines={dangerPoint && protectedPoint ? [{ points: [[dangerPoint.lat, dangerPoint.lng], [protectedPoint.lat, protectedPoint.lng]], color: '#dc2626', dashed: true }] : []} onMapClick={(lat, lng) => tapTarget === 'danger' ? setDangerPoint({ lat, lng, accuracy: 0 }) : setProtectedPoint({ lat, lng, accuracy: 0 })} /></div>
        {personDistance !== null ? <div className={`mt-3 rounded-lg border p-3 text-sm ${assessDistance(personDistance, 100, (dangerPoint?.accuracy ?? 0) + (protectedPoint?.accuracy ?? 0)).color}`}><strong>Luftlinie ca. {Math.round(personDistance)} m</strong><br /><button type="button" onClick={() => addMeasurement(distanceNote(personDistance, (dangerPoint?.accuracy ?? 0) + (protectedPoint?.accuracy ?? 0), 'zwischen Gefährder und geschützter Person'))} className="mt-2 font-semibold underline">In Notiz übernehmen</button></div> : null}
      </div> : null}
      <div><label className="block text-sm font-medium text-gray-700">Kontrollnotiz (optional)<textarea value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={3000} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Nur das ergänzen, was für die spätere PAD-Protokollierung nötig ist." /></label><p className="mt-1 text-xs text-gray-500">Datum, Uhrzeit und kontrollierende Person werden automatisch übernommen.</p></div>
      <button type="button" onClick={() => void saveControl()} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-700 px-4 py-3 font-semibold text-white disabled:opacity-60"><CheckCircle2 className="h-5 w-5" />{saving ? 'Wird gespeichert…' : 'Kontrolle jetzt speichern'}</button>
    </section> : null}
  </div>
}
