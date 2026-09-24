import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { kontaktTelefonnummern } from '../../lib/kontaktTelefon'
import { nummerFuerArt } from '../../lib/verstaendigungsregeln'
import { telHref } from '../../lib/ereignisKontakte'
import { formatTime } from '../../lib/zentraleShared'
import { EREIGNISSTUFEN, STUFE_META, type Ereignisstufe } from '../../lib/einsatzSchema'
import { loadEreignisContexts, setIncidentEreignisDimension } from '../../lib/ereignis'
import type { EreignisVerstaendigungsschritt, EreignisEntscheidungsschritt, IncidentReport, ZentraleKontakt } from '../../lib/types'

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
  const [eventIds, setEventIds] = useState<Record<string, string>>({})
  const [stepsByEvent, setStepsByEvent] = useState<Record<string, EreignisVerstaendigungsschritt[]>>({})
  const [decisionsByEvent, setDecisionsByEvent] = useState<Record<string, EreignisEntscheidungsschritt[]>>({})

  useEffect(() => {
    void supabase.from('zentrale_kontakte').select('*').order('name').then(result => {
      setKontakte((result.data ?? []) as ZentraleKontakt[])
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadEreignisContexts(items.map(item => item.id))
      .then(async contexts => {
        if (cancelled) return
        setLevels(Object.fromEntries(items.map(item => [item.id, contexts[item.id]?.dimension ?? 'klein'])))
        setEventIds(Object.fromEntries(Object.entries(contexts).map(([id, ctx]) => [id, ctx.id])))
        const ids = [...new Set(Object.values(contexts).map(ctx => ctx.id))]
        if (!ids.length) { setStepsByEvent({}); setDecisionsByEvent({}); return }
        const [result, decisions] = await Promise.all([
          supabase.from('ereignis_verstaendigungsschritte').select('*').in('ereignis_id', ids).order('sortierung'),
          supabase.from('ereignis_entscheidungsschritte').select('*').in('ereignis_id', ids).order('sortierung'),
        ])
        if (result.error) throw result.error
        if (decisions.error) throw decisions.error
        if (!cancelled) setStepsByEvent((result.data ?? []).reduce<Record<string, EreignisVerstaendigungsschritt[]>>((byId, row) => {
          ;(byId[row.ereignis_id] ??= []).push(row)
          return byId
        }, {}))
        if (!cancelled) setDecisionsByEvent((decisions.data ?? []).reduce<Record<string, EreignisEntscheidungsschritt[]>>((byId, row) => {
          ;(byId[row.ereignis_id] ??= []).push(row)
          return byId
        }, {}))
      })
      .catch(() => { if (!cancelled) { setLevels({}); setStepsByEvent({}); setDecisionsByEvent({}) } })
    return () => { cancelled = true }
  }, [items])

  const chosen = useMemo(() => items.filter(item => selected[item.id]), [items, selected])
  function toggle(id: string) { setSelected(current => ({ ...current, [id]: !current[id] })) }
  function toggleAll() {
    if (chosen.length === items.length) setSelected({})
    else setSelected(Object.fromEntries(items.map(item => [item.id, true])))
  }

  function stufeOf(item: IncidentReport): Ereignisstufe {
    return levels[item.id] ?? 'klein'
  }

  async function setStufe(item: IncidentReport, stufe: Ereignisstufe, event: { stopPropagation: () => void }) {
    event.stopPropagation()
    setExpanded(item.id)
    const saved = await setIncidentEreignisDimension(item.id, stufe)
    setLevels(current => ({ ...current, [item.id]: saved?.dimension ?? 'klein' }))
    if (saved) {
      setEventIds(current => ({ ...current, [item.id]: saved.id }))
      const result = await supabase.from('ereignis_verstaendigungsschritte').select('*').eq('ereignis_id', saved.id).order('sortierung')
      if (!result.error) setStepsByEvent(current => ({ ...current, [saved.id]: result.data ?? [] }))
      const decisions = await supabase.from('ereignis_entscheidungsschritte').select('*').eq('ereignis_id', saved.id).order('sortierung')
      if (!decisions.error) setDecisionsByEvent(current => ({ ...current, [saved.id]: decisions.data ?? [] }))
    }
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
              <p className="ml-7 mt-2 text-sm text-gray-700">Melder: {item.caller_name || 'Nicht erfasst'} · Telefon: {item.caller_phone ? <a href={telHref(item.caller_phone)} className="text-blue-800 underline" onClick={event => event.stopPropagation()}>{item.caller_phone}</a> : 'Nicht erfasst'}</p>
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
                  <ul className="mt-1 list-disc pl-5">{(stepsByEvent[eventIds[item.id]] ?? []).map(step => {
                    const match = kontakte.find(row => row.id === step.kontakt_id)
                    const nummer = match ? nummerFuerArt(match, step.telefon_art) : null
                    const verfuegbareNummern = match ? (step.telefon_art ? (nummer ? [{ art: 'Bevorzugt', nummer }] : []) : kontaktTelefonnummern(match)) : []
                    return <li key={step.schluessel}>{step.bezeichnung}{match ? ` – ${match.name}` : ' – Kontakt fehlt'}{match && !verfuegbareNummern.length ? ' · Rufnummer fehlt' : null}{verfuegbareNummern.map(({ art, nummer: value }) => <span key={art}> · <a href={telHref(value)} className="text-blue-800 underline" onClick={event => event.stopPropagation()}>{art}: {value}</a></span>)}</li>
                  })}</ul>
                  {stufe === 'gross' || stufe === 'katastrophe' ? <><p className="font-bold mt-2">Entscheidung</p><ul className="list-disc pl-5">{(decisionsByEvent[eventIds[item.id]] ?? []).map(row => <li key={row.schluessel}>{row.bezeichnung}</li>)}</ul></> : null}
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
