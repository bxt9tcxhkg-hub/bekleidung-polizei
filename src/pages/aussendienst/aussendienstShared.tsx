import type { Dispatch, SetStateAction } from 'react'
import { CheckCircle2, Circle, Pencil, Trash2 } from 'lucide-react'
import { Actions, Area, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import { DISPOSITION_LABEL, formatTime } from '../../lib/zentraleShared'
import { ZIELFUNKTION_LABEL, type AuftragFormState, type BaustelleReportState } from '../../lib/aussendienstShared'
import type { IncidentDisposition, KontrollauftragZielfunktion, ZentraleEntry } from '../../lib/types'

// Von AussendienstShell.tsx und den Außendienst-Unterseiten (Einsätze,
// Kontrollaufträge, Operative Hinweise, Fahrzeug - jetzt eigenständige
// Sidebar-Seiten statt Tabs) gemeinsam genutzte Darstellungsbausteine.

export function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"><CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{text}</p></div> }

export function EntryOrIncidentList({ kind, entries, incidents, canManage, onEdit, onToggleErledigt }: { kind: 'entries' | 'incidents'; entries?: ZentraleEntry[]; incidents?: { id: string; reported_at: string; location: string | null; summary: string; disposition: IncidentDisposition; status: string; note: string | null }[]; canManage?: boolean; onEdit?: (item: ZentraleEntry) => void; onToggleErledigt?: (item: ZentraleEntry) => Promise<void> }) {
  if (kind === 'incidents') {
    if (!incidents || incidents.length === 0) return <Empty text="Heute wurden noch keine Meldungen erfasst." />
    return <div className="space-y-3">{incidents.map(item => <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-gray-900">{formatTime(item.reported_at)}</span><span className={`text-xs font-semibold px-2 py-1 rounded-full ${item.status === 'weitergegeben' ? 'bg-blue-100 text-blue-800' : item.status === 'erledigt' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{item.status === 'weitergegeben' ? 'An BP weitergegeben' : item.status === 'erledigt' ? 'Erledigt' : 'Offen'}</span></div><p className="font-semibold text-gray-900 mt-2">{item.location || 'Ohne Ortsangabe'}</p><p className="text-sm text-gray-700 mt-1">{item.summary}</p><p className="text-xs text-gray-500 mt-2">{DISPOSITION_LABEL[item.disposition]}</p></article>)}</div>
  }
  const list = entries ?? []
  if (list.length === 0) return <Empty text="Keine Einträge vorhanden." />
  return <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">{list.map(item => {
    const erledigt = item.status === 'erledigt'
    return <article key={item.id} className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3 min-w-0">
      {onToggleErledigt ? <button type="button" onClick={() => void onToggleErledigt(item)} className={`mt-0.5 flex-shrink-0 ${erledigt ? 'text-green-600' : 'text-gray-300 hover:text-gray-400'}`} aria-label={erledigt ? 'Als offen markieren' : 'Als erledigt markieren'}>{erledigt ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}</button> : null}
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className={`font-semibold ${erledigt ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{item.title}</h3><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.priority === 'kritisch' ? 'bg-red-100 text-red-800' : item.priority === 'hoch' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>{item.priority}</span>{item.target_function ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">{ZIELFUNKTION_LABEL[item.target_function]}</span> : null}</div>{item.description ? <p className={`text-sm mt-2 whitespace-pre-wrap ${erledigt ? 'text-gray-400' : 'text-gray-600'}`}>{item.description}</p> : null}<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">{item.location ? <span>Ort: {item.location}</span> : null}{item.valid_from ? <span>Ab: {new Date(item.valid_from).toLocaleDateString('de-AT')}</span> : null}{item.valid_until ? <span>Bis: {new Date(item.valid_until).toLocaleDateString('de-AT')}</span> : null}{erledigt && item.erledigt_at ? <span>Erledigt um {formatTime(item.erledigt_at)} (Gedankenstütze, kein Nachweis)</span> : null}</div></div></div>{canManage && onEdit ? <button type="button" onClick={() => onEdit(item)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex-shrink-0" aria-label="Eintrag bearbeiten"><Pencil className="w-4 h-4" /></button> : null}</div></article>
  })}</div>
}

export function AuftragModal({ auftrag, setAuftrag, editing, saving, error, close, save, remove }: { auftrag: AuftragFormState; setAuftrag: Dispatch<SetStateAction<AuftragFormState>>; editing: ZentraleEntry | null; saving: boolean; error: string; close: () => void; save: () => Promise<void>; remove: () => Promise<void> }) {
  const patch = (values: Partial<AuftragFormState>) => setAuftrag(current => ({ ...current, ...values }))
  return <Modal title={editing ? 'Kontrollauftrag bearbeiten' : 'Kontrollauftrag anlegen'} close={close}>
    <Field label="Bezeichnung *" value={auftrag.title} onChange={value => patch({ title: value })} />
    <Area label="Welche Kontrollen sind durchzuführen" value={auftrag.description} onChange={value => patch({ description: value })} />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Ort" value={auftrag.location} onChange={value => patch({ location: value })} />
      <label className="text-xs font-medium text-gray-600">Zielfunktion<select className={inputClass} value={auftrag.targetFunction} onChange={event => patch({ targetFunction: event.target.value as KontrollauftragZielfunktion })}>{Object.entries(ZIELFUNKTION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <Field label="Von" type="date" value={auftrag.validFrom} onChange={value => patch({ validFrom: value })} />
      <Field label="Bis" type="date" value={auftrag.validUntil} onChange={value => patch({ validUntil: value })} />
    </div>
    {error ? <ErrorMessage text={error} /> : null}
    <div className="flex flex-wrap gap-3 pt-2">{editing ? <button type="button" disabled={saving} onClick={() => void remove()} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /> Endgültig löschen</button> : <span className="mr-auto" />}<Actions saving={saving} close={close} save={save} /></div>
  </Modal>
}

// Rein textuelle Meldung ohne Kartenzeichnen - die genaue Streckenmarkierung
// (und Bestätigung) erfolgt in der Zentrale, siehe zentraleShared.tsx BaustelleModal.
export function BaustelleReportModal({ report, setReport, saving, error, close, save }: { report: BaustelleReportState; setReport: Dispatch<SetStateAction<BaustelleReportState>>; saving: boolean; error: string; close: () => void; save: () => Promise<void> }) {
  const patch = (values: Partial<BaustelleReportState>) => setReport(current => ({ ...current, ...values }))
  return <Modal title="Baustelle melden" close={close}>
    <Field label="Bezeichnung *" value={report.titel} onChange={value => patch({ titel: value })} />
    <Field label="Standort (Straße/Adresse) *" value={report.startAddress} onChange={value => patch({ startAddress: value })} />
    <Field label="Bis (optional, bei längerem Streckenabschnitt)" value={report.endAddress} onChange={value => patch({ endAddress: value })} />
    <Area label="Bemerkung (optional)" value={report.note} onChange={value => patch({ note: value })} />
    <p className="text-xs text-gray-500">Die Meldung wird als „ungeprüft“ gespeichert, bis die Zentrale sie bestätigt.</p>
    {error ? <ErrorMessage text={error} /> : null}
    <Actions saving={saving} close={close} save={save} />
  </Modal>
}
