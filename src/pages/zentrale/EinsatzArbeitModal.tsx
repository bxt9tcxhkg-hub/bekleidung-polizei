import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../components/ZentraleEntryEditor'
import { supabase } from '../../lib/supabase'
import { formatTime } from '../../lib/zentraleShared'
import { EREIGNISSTUFEN, STUFE_META, TELEFONKETTE, formatStamp, noteWithoutStufe, readKette, readStoredStufe, withStufe, writeKette, writeStoredStufe, type Ereignisstufe, type KetteStand } from '../../lib/einsatzSchema'
import type { IncidentReport, OperationalPerson } from '../../lib/types'
import IncidentDocs from './IncidentDocs'
import EinsatzParteien from './EinsatzParteien'

type Tab = 'checkliste' | 'parteien' | 'dateien'

export default function EinsatzArbeitModal({
  item, canOperateZentrale, close, openEditIncident, completeIncident, persons, onPersonCreated, createdBy,
}: {
  item: IncidentReport
  canOperateZentrale: boolean
  close: () => void
  openEditIncident: (item: IncidentReport) => void
  completeIncident: (item: IncidentReport) => Promise<void>
  persons: OperationalPerson[]
  onPersonCreated: (person: OperationalPerson) => void
  createdBy: string | null
}) {
  const [tab, setTab] = useState<Tab>('checkliste')
  const [stufe, setStufeState] = useState<Ereignisstufe>(() => readStoredStufe(item.id, item.note))
  const [stand, setStand] = useState<KetteStand>(() => readKette(item.id))
  useEffect(() => {
    setStufeState(readStoredStufe(item.id, item.note))
    setStand(readKette(item.id))
    setTab('checkliste')
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
  const tabClass = (id: Tab) => `px-3 py-2 text-sm font-semibold rounded-t-lg border-b-2 ${tab === id ? 'border-blue-800 text-blue-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`

  return <Modal wide title={`${formatTime(item.reported_at)} · ${item.location || 'Ohne Ortsangabe'}`} close={close}>
    <p className="text-sm text-gray-800 line-clamp-3">{item.summary}</p>
    <p className="text-xs text-gray-500">Melder: {item.caller_name || '–'} · Tel: {item.caller_phone || '–'}</p>
    <div className="flex gap-1 border-b border-gray-200">
      <button type="button" className={tabClass('checkliste')} onClick={() => setTab('checkliste')}>Checkliste</button>
      <button type="button" className={tabClass('parteien')} onClick={() => setTab('parteien')}>Parteien</button>
      <button type="button" className={tabClass('dateien')} onClick={() => setTab('dateien')}>Dateien & Listen</button>
    </div>
    {tab === 'checkliste' ? <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-1.5">Wie stark ist die Bevölkerung betroffen?</p>
        {canOperateZentrale ? <div className="flex flex-wrap gap-1.5">{EREIGNISSTUFEN.map(key => {
          const row = STUFE_META[key]
          return <button key={key} type="button" onClick={() => void setStufe(key)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border" style={{ background: stufe === key ? row.bg : 'white', color: row.color, borderColor: row.color }}>{row.label}</button>
        })}</div> : <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>}
        <p className="text-xs text-gray-600 mt-2"><span className="font-semibold">{meta.label}:</span> {meta.wann}</p>
      </div>
      {stufe === 'klein' ? <p className="text-sm text-gray-600">Kleinereignis: keine Telefonkette.</p> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
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
      </div>}
    </div> : tab === 'parteien' ? <EinsatzParteien incidentId={item.id} incidentLocation={{ location: item.location, lat: item.location_lat, lng: item.location_lng }} persons={persons} onPersonCreated={onPersonCreated} createdBy={createdBy} canOperate={canOperateZentrale} /> : <IncidentDocs incidentId={item.id} from="zentrale" canUpload={canOperateZentrale} />}
    {canOperateZentrale ? <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
      <button type="button" onClick={() => { close(); openEditIncident(item) }} className="text-sm font-medium border border-gray-300 px-3 py-2 rounded-lg">Meldung ändern</button>
      {item.status === 'offen' ? <button type="button" onClick={() => void completeIncident(item).then(close)} className="text-sm font-medium text-green-800 border border-green-200 px-3 py-2 rounded-lg">Erledigt</button> : null}
    </div> : null}
  </Modal>
}
