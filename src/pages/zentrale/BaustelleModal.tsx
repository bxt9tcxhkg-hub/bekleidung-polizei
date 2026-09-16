import { type Dispatch, type SetStateAction } from 'react'
import LeafletMap, { type MapLine, type MapMarker } from '../../components/LeafletMap'
import { Actions, Area, ErrorMessage, Field, Modal } from '../../components/ZentraleEntryEditor'
import type { BaustelleFormState } from '../../lib/zentraleShared'
import type { ZentraleBaustelle } from '../../lib/types'

export function BaustelleModal({ form, setForm, editing, canOperate, saving, error, locating, routing, locateStart, locateEnd, onMapClick, close, save }: { form: BaustelleFormState; setForm: Dispatch<SetStateAction<BaustelleFormState>>; editing: ZentraleBaustelle | null; canOperate: boolean; saving: boolean; error: string; locating: 'start' | 'end' | null; routing: boolean; locateStart: () => Promise<void>; locateEnd: () => Promise<void>; onMapClick: (lat: number, lng: number) => void; close: () => void; save: () => Promise<void> }) {
  const patch = (values: Partial<BaustelleFormState>) => setForm(current => ({ ...current, ...values }))
  const hasStart = form.startLat !== null && form.startLng !== null
  const hasEnd = form.endLat !== null && form.endLng !== null
  const markers: MapMarker[] = hasStart && !hasEnd ? [{ lat: form.startLat as number, lng: form.startLng as number, popup: 'Startpunkt' }] : []
  const lines: MapLine[] = hasStart && hasEnd ? [{ points: form.path && form.path.length >= 2 ? form.path : [[form.startLat as number, form.startLng as number], [form.endLat as number, form.endLng as number]] }] : []
  return <Modal title={editing ? 'Baustelle bearbeiten' : 'Baustelle melden'} close={close}>
    <Field label="Bezeichnung *" value={form.titel} onChange={value => patch({ titel: value })} />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div><Field label="Startpunkt (Adresse)" value={form.startAddress} onChange={value => patch({ startAddress: value })} /><button type="button" disabled={!form.startAddress.trim() || locating === 'start'} onClick={() => void locateStart()} className="mt-1 text-xs font-semibold text-blue-700 disabled:opacity-50">{locating === 'start' ? 'Suche…' : 'Punkt suchen'}</button></div>
      <div><Field label="Endpunkt (Adresse)" value={form.endAddress} onChange={value => patch({ endAddress: value })} /><button type="button" disabled={!form.endAddress.trim() || locating === 'end'} onClick={() => void locateEnd()} className="mt-1 text-xs font-semibold text-blue-700 disabled:opacity-50">{locating === 'end' ? 'Suche…' : 'Punkt suchen'}</button></div>
    </div>
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => patch({ drawMode: !form.drawMode })} className={`text-xs font-semibold ${form.drawMode ? 'text-blue-700' : 'text-gray-500'}`}>{form.drawMode ? '✓ Punkte per Klick auf der Karte setzen (erst Start, dann Ende)' : 'Alternativ: Punkte per Klick auf der Karte setzen'}</button>
        {hasStart && hasEnd ? <span className="text-xs text-gray-400">{routing ? 'Route entlang der Straße wird berechnet…' : (form.path ? 'Folgt dem Straßenverlauf' : 'Straßenverlauf nicht verfügbar – zeigt Luftlinie')}</span> : null}
      </div>
      <div className="mt-2"><LeafletMap height={220} markers={markers} lines={lines} onMapClick={onMapClick} /></div>
    </div>
    <Field label="Gültig bis (optional)" type="date" value={form.gueltigBis} onChange={value => patch({ gueltigBis: value })} />
    <Area label="Bemerkung (optional)" value={form.note} onChange={value => patch({ note: value })} />
    {!canOperate ? <p className="text-xs text-gray-500">Die Meldung wird als „ungeprüft“ gespeichert, bis ein Sachbearbeiter, Genehmiger oder diensthabender Zentralist sie bestätigt.</p> : null}
    {error ? <ErrorMessage text={error} /> : null}
    <Actions saving={saving} close={close} save={save} />
  </Modal>
}
