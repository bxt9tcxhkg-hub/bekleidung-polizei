import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../components/ZentraleEntryEditor'
import { supabase } from '../../lib/supabase'
import { formatTime } from '../../lib/zentraleShared'
import { EREIGNISSTUFEN, STUFE_META, TELEFONKETTE, formatStamp, noteWithoutStufe, readKette, readStoredStufe, withStufe, writeKette, writeStoredStufe, type Ereignisstufe, type KetteStand } from '../../lib/einsatzSchema'
import { nearbyByLine } from '../../lib/geo'
import type { IncidentReport, ZentraleBaustelle } from '../../lib/types'
import IncidentDocs from './IncidentDocs'

export default function EinsatzArbeitModal({
  item, baustellen, canOperateZentrale, close, openEditIncident, completeIncident,
}: {
  item: IncidentReport
  baustellen: ZentraleBaustelle[]
  canOperateZentrale: boolean
  close: () => void
  openEditIncident: (item: IncidentReport) => void
  completeIncident: (item: IncidentReport) => Promise<void>
}) {
  const [stufe, setStufeState] = useState<Ereignisstufe>(() => readStoredStufe(item.id, item.note))
  const [stand, setStand] = useState<KetteStand>(() => readKette(item.id))
  useEffect(() => {
    setStufeState(readStoredStufe(item.id, item.note))
    setStand(readKette(item.id))
  }, [item.id, item.note])

  async function setStufe(next: Ereignisstufe) {
    writeStoredStufe(item.id, next)
    setStufeState(next)
    await supabase.from('incident_reports').update({ note: withStufe(noteWithoutStufe(item.note), next) || null }).eq('id', item.id)
  }

  function markKette(name: string, field: 'versucht' | 'erreicht') {
    const now = new Date().toISOString()
    setStand(current => {
      const row = { ...current[name] }
      if (row[field]) delete row[field]
      else {
        row[field] = now
        if (field === 'erreicht' && !row.versucht) row.versucht = now
      }
      const next = { ...current, [name]: row }
      writeKette(item.id, next)
      return next
    })
  }

  const meta = STUFE_META[stufe]
  const point = item.location_lat !== null && item.location_lng !== null ? { lat: item.location_lat, lng: item.location_lng } : null
  const nearby = nearbyByLine(point, baustellen)
  const bemerkung = noteWithoutStufe(item.note)

  return <Modal wide title={`${formatTime(item.reported_at)} · ${item.location || 'Ohne Ortsangabe'}`} close={close}>
    <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.summary}</p>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
      {item.caller_phone ? <span>TEL: {item.caller_phone}</span> : null}
      {item.caller_name ? <span>Melder: {item.caller_name}</span> : null}
      {bemerkung ? <span>{bemerkung}</span> : null}
    </div>
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-1.5">Wie stark ist die Bevölkerung betroffen?</p>
      {canOperateZentrale ? <div className="flex flex-wrap gap-1.5">{EREIGNISSTUFEN.map(key => {
        const row = STUFE_META[key]
        return <button key={key} type="button" onClick={() => void setStufe(key)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border" style={{ background: stufe === key ? row.bg : 'white', color: row.color, borderColor: row.color }}>{row.label}</button>
      })}</div> : <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>}
      <p className="text-xs text-gray-600 mt-2"><span className="font-semibold">{meta.label}:</span> {meta.wann} {meta.hint}.</p>
    </div>
    {stufe !== 'klein' ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-bold">Verständigung telefonisch</p>
      <p className="text-xs text-amber-800 mb-2">Versucht = angerufen. Erreicht = Person informiert.</p>
      <div className="space-y-2">{TELEFONKETTE.map(name => {
        const row = stand[name] ?? {}
        return <div key={name} className="rounded-lg bg-white/70 px-2 py-2">
          <p className="font-medium">{name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => markKette(name, 'versucht')} className={`text-xs px-2 py-1 rounded-md border ${row.versucht ? 'bg-amber-100 border-amber-400' : 'border-gray-300 bg-white'}`}>Versucht{row.versucht ? ` ${formatStamp(row.versucht)}` : ''}</button>
            <button type="button" onClick={() => markKette(name, 'erreicht')} className={`text-xs px-2 py-1 rounded-md border ${row.erreicht ? 'bg-green-100 border-green-500' : 'border-gray-300 bg-white'}`}>Erreicht{row.erreicht ? ` ${formatStamp(row.erreicht)}` : ''}</button>
          </div>
        </div>
      })}</div>
      <Link to="/stammdaten/kontakte" className="inline-block text-xs font-semibold text-blue-800 mt-2">Telefonnummern in Kontakten</Link>
    </div> : null}
    <IncidentDocs incidentId={item.id} from="zentrale" canUpload={canOperateZentrale} />
    {nearby.length > 0 ? <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2"><p className="text-sm font-bold text-orange-900">Baustelle in der Nähe</p>{nearby.map(row => <p key={row.id} className="text-sm text-orange-900">{row.titel}</p>)}</div> : null}
    {canOperateZentrale ? <div className="flex flex-wrap gap-2 pt-1">
      <button type="button" onClick={() => { close(); openEditIncident(item) }} className="text-sm font-medium border border-gray-300 px-3 py-2 rounded-lg">Meldung ändern</button>
      {item.status === 'offen' ? <button type="button" onClick={() => void completeIncident(item).then(close)} className="text-sm font-medium text-green-800 border border-green-200 px-3 py-2 rounded-lg">Erledigt</button> : null}
    </div> : null}
  </Modal>
}
