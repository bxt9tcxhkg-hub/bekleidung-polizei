import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatTime } from '../../lib/zentraleShared'
import { ENTSCHEIDUNGSPUNKTE, EREIGNISSTUFEN, STUFE_META, noteWithoutStufe, readStoredStufe, telefonketteFuer, withStufe, writeStoredStufe, type Ereignisstufe } from '../../lib/einsatzSchema'
import type { IncidentReport, ZentraleKontakt } from '../../lib/types'

export default function EinsaetzeBoard({
  title, items, canOperate, onEdit, onComplete, onDelete, showComplete,
}: {
  title: string
  items: IncidentReport[]
  canOperate: boolean
  onEdit: (item: IncidentReport) => void
  onComplete: (item: IncidentReport) => Promise<void>
  onDelete: (item: IncidentReport) => Promise<void>
  showComplete: boolean
}) {
  const [view, setView] = useState<'uebersicht' | 'detail'>('uebersicht')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [kontakte, setKontakte] = useState<ZentraleKontakt[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [levels, setLevels] = useState<Record<string, Ereignisstufe>>({})

  useEffect(() => {
    void supabase.from('zentrale_kontakte').select('*').order('name').then(result => {
      setKontakte((result.data ?? []) as ZentraleKontakt[])
    })
  }, [])

  useEffect(() => {
    setLevels(current => {
      const next = { ...current }
      for (const item of items) {
        if (!next[item.id]) next[item.id] = readStoredStufe(item.id, item.note)
      }
      return next
    })
  }, [items])

  const chosen = useMemo(() => items.filter(item => selected[item.id]), [items, selected])
  function toggle(id: string) { setSelected(current => ({ ...current, [id]: !current[id] })) }
  function toggleAll() {
    if (chosen.length === items.length) setSelected({})
    else setSelected(Object.fromEntries(items.map(item => [item.id, true])))
  }

  function stufeOf(item: IncidentReport): Ereignisstufe {
    return levels[item.id] ?? readStoredStufe(item.id, item.note)
  }

  async function setStufe(item: IncidentReport, stufe: Ereignisstufe, event: { stopPropagation: () => void }) {
    event.stopPropagation()
    writeStoredStufe(item.id, stufe)
    setLevels(current => ({ ...current, [item.id]: stufe }))
    setExpanded(item.id)
    const note = withStufe(noteWithoutStufe(item.note), stufe)
    await supabase.from('incident_reports').update({ note: note || null }).eq('id', item.id)
  }

  function printSelected() {
    const list = chosen.length ? chosen : (expanded ? items.filter(item => item.id === expanded) : items)
    const html = list.map(item => {
      const meta = STUFE_META[stufeOf(item)]
      return `<article style="break-inside:avoid;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #ddd">
        <h2>${formatTime(item.reported_at)} – ${item.location || 'Ohne Ortsangabe'}</h2>
        <p><strong>${meta.label}</strong> · ${item.status}</p>
        <p>${item.summary}</p>
        <p>Melder: ${item.caller_name || '–'} · Tel: ${item.caller_phone || '–'}</p>
      </article>`
    }).join('')
    const popup = window.open('', '_blank')
    if (!popup) return
    popup.document.write(`<!doctype html><title>${title}</title><body style="font-family:sans-serif;padding:24px"><h1>${title}</h1>${html}</body>`)
    popup.document.close()
    popup.print()
  }

  return <section>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{items.length} Einsätze. Stufe Standard: Kleinereignis.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setView('uebersicht')} className={`text-sm px-3 py-2 rounded-lg border ${view === 'uebersicht' ? 'bg-white text-blue-800 border-blue-800' : 'border-gray-300'}`}>Übersicht</button>
        <button type="button" onClick={() => setView('detail')} className={`text-sm px-3 py-2 rounded-lg border ${view === 'detail' ? 'bg-white text-blue-800 border-blue-800' : 'border-gray-300'}`}>Detail</button>
        <button type="button" onClick={printSelected} className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-300"><Printer className="w-4 h-4" /> Drucken{chosen.length ? ` (${chosen.length})` : ''}</button>
      </div>
    </div>
    {items.length === 0 ? <p className="text-sm text-gray-500 rounded-2xl border border-gray-200 bg-white px-4 py-8 text-center">Keine Einsätze in dieser Liste.</p> : (
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-2 border-b bg-gray-50 flex items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={items.length > 0 && chosen.length === items.length} onChange={toggleAll} /> Alle</label>
          <span className="text-gray-500">{chosen.length} ausgewählt</span>
        </div>
        <div className="divide-y">
          {items.map(item => {
            const stufe = stufeOf(item)
            const meta = STUFE_META[stufe]
            const open = view === 'detail' || expanded === item.id
            return <article key={item.id} className="p-4">
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1" checked={!!selected[item.id]} onChange={() => toggle(item.id)} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded(current => current === item.id ? null : item.id)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                    <span className="font-bold text-gray-900">{formatTime(item.reported_at)}</span>
                    <span className="text-xs text-gray-500">{item.status === 'erledigt' ? 'Abgeschlossen' : item.status === 'weitergegeben' ? 'An BP' : 'Offen'}</span>
                  </div>
                  <p className="font-semibold text-gray-900 mt-1">{item.location || 'Ohne Ortsangabe'}</p>
                  <p className="text-sm text-gray-700 mt-0.5 line-clamp-2">{item.summary}</p>
                </button>
                {canOperate ? <div className="flex flex-col gap-1 shrink-0">
                  <button type="button" onClick={() => onEdit(item)} className="text-xs font-medium text-blue-700 border border-blue-200 px-2.5 py-1.5 rounded-lg">Bearbeiten</button>
                  {showComplete && item.status === 'offen' ? <button type="button" onClick={() => void onComplete(item)} className="text-xs font-medium text-green-700 border border-green-200 px-2.5 py-1.5 rounded-lg">Abschließen</button> : null}
                  <button type="button" onClick={() => void onDelete(item)} className="text-xs font-medium text-red-700 border border-red-200 px-2.5 py-1.5 rounded-lg">Löschen</button>
                </div> : null}
              </div>
              {open ? <div className="mt-3 ml-7 space-y-3">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.summary}</p>
                <p className="text-xs text-gray-500">Melder: {item.caller_name || '–'} · Tel: {item.caller_phone || '–'}</p>
                {canOperate ? <div className="flex flex-wrap gap-1.5">{EREIGNISSTUFEN.map(key => {
                  const row = STUFE_META[key]
                  return <button key={key} type="button" onClick={event => void setStufe(item, key, event)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border" style={{ background: stufe === key ? row.bg : 'white', color: row.color, borderColor: row.color }}>{row.label}</button>
                })}</div> : null}
                <p className="text-xs text-gray-600">{meta.hint} · {meta.dienstbetrieb}</p>
                {stufe !== 'klein' ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="font-bold">Verständigung telefonisch</p>
                  <ul className="mt-1 list-disc pl-5">{telefonketteFuer(stufe).map(name => {
                    const match = kontakte.find(row => (row.funktion || '').toLowerCase().includes(name.toLowerCase().slice(0, 8)) || (row.name || '').toLowerCase().includes(name.toLowerCase().slice(0, 8)))
                    return <li key={name}>{name}{match ? ` – ${match.name}${match.telefon ? ` (${match.telefon})` : ''}` : ''}</li>
                  })}</ul>
                  {stufe === 'gross' || stufe === 'katastrophe' ? <><p className="font-bold mt-2">Entscheidung</p><ul className="list-disc pl-5">{ENTSCHEIDUNGSPUNKTE.map(itemName => <li key={itemName}>{itemName}</li>)}</ul></> : null}
                  <Link to="/stammdaten/kontakte" className="inline-block text-xs font-semibold text-blue-800 mt-2">Kontakte bearbeiten</Link>
                </div> : null}
              </div> : null}
            </article>
          })}
        </div>
      </div>
    )}
  </section>
}
