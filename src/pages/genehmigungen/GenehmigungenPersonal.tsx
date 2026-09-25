import { useCallback, useEffect, useState } from 'react'
import { Clock3, FileOutput, HelpCircle, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAllPages, supabase } from '../../lib/supabase'
import type { UeberstundenMeldung } from '../../lib/types'
import { logAudit } from '../../lib/audit'
import { formatStunden, formatZeitraum, totalStunden } from '../../lib/ueberstunden'
import { generateUeberstundenPdf } from '../../lib/ueberstundenPdf'
import { officerPrintName } from '../../lib/printDocs'
import { Empty, GenehmigungenBereichHeader } from '../../components/genehmigungenShared'

// Bereichsseite "Personal" (Überstundenmeldungen) - eine der vier gleich
// behandelten Genehmigungen-Bereichsseiten (siehe GenehmigungenUebersicht.tsx).
// Inhaltlich unverändert gegenüber der vormaligen Personal-Sektion in
// Approvals.tsx, nur auf eine eigene Seite ausgelagert. Ueberstunden.tsx
// bleibt für "Meine Meldungen" (jede/r erfasst dort die eigenen) und die
// Monatsübersicht/Sammel-PDF für die Lohnverrechnung - die Entscheidung
// selbst gehört hierher.
export default function GenehmigungenPersonal() {
  const { profile } = useAuth()
  // "kein Selbst-Genehmigen": eigene Meldungen sind ausgeblendet, AUSSER es gibt
  // gar keinen zweiten Genehmiger/Admin/Approver (sonst bliebe die Meldung eines
  // alleinigen Genehmigers für immer auf "eingereicht" stehen).
  const [ueberstundenItems, setUeberstundenItems] = useState<UeberstundenMeldung[]>([])
  // Feste, vom Kommandanten vorgegebene Genehmiger-Kette - nur für den PDF-Ausdruck
  // (voraussichtlicher Genehmiger, bevor entschieden ist), siehe Ueberstunden.tsx.
  const [genehmigerKette, setGenehmigerKette] = useState<{ id: string; name: string; rang: number }[]>([])
  const [ueberstundenDeciding, setUeberstundenDeciding] = useState<{ item: UeberstundenMeldung; status: 'abgelehnt' | 'rueckfrage' } | null>(null)
  const [ueberstundenDecideNote, setUeberstundenDecideNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [ueberstundenRes, otherApproversRes] = await Promise.all([
      // fetchAllPages statt einer einzelnen Abfrage - sonst würde eine ältere
      // eingereichte Meldung bei einer sehr großen Tabelle aus der von PostgREST
      // gedeckelten Standardseite fallen und für den Genehmiger unsichtbar bleiben.
      fetchAllPages<UeberstundenMeldung>((from, to) => supabase.from('ueberstunden_meldungen')
        .select('*, beamter:profiles!ueberstunden_meldungen_beamter_id_fkey(id,name,dienstnummer)')
        .eq('status', 'eingereicht').order('von_datum', { ascending: true }).order('von_zeit', { ascending: true }).order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: UeberstundenMeldung[] | null; error: { message: string } | null }>),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('active', true).neq('id', profile?.id ?? '').overlaps('roles', ['admin', 'genehmiger', 'approver']),
    ])
    if (ueberstundenRes.error) { setLoadError('Überstundenmeldungen konnten nicht geladen werden. Bitte Seite neu laden.'); setUeberstundenItems([]) }
    else {
      setLoadError('')
      const selbstEinzigerGenehmiger = !otherApproversRes.error && (otherApproversRes.count ?? 0) === 0
      setUeberstundenItems(selbstEinzigerGenehmiger ? ueberstundenRes.data : ueberstundenRes.data.filter(item => item.beamter_id !== profile?.id))
    }
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { load().catch(() => setLoadError('Überstundenmeldungen konnten nicht geladen werden.')) }, [load])
  useEffect(() => { void supabase.rpc('genehmiger_kette').then(({ data }) => setGenehmigerKette(data ?? [])) }, [])
  const kettenName = useCallback((id: string | null) => genehmigerKette.find(row => row.id === id)?.name ?? null, [genehmigerKette])

  async function decideUeberstunden(item: UeberstundenMeldung, status: 'genehmigt' | 'abgelehnt' | 'rueckfrage', note: string) {
    if (!profile?.id || processing) return
    setProcessing(item.id)
    setError('')
    const result = await supabase.from('ueberstunden_meldungen')
      .update({ status, genehmiger_id: profile.id, genehmigt_at: new Date().toISOString(), genehmiger_note: note.trim() || null })
      .eq('id', item.id)
      .select('id')
    setProcessing(null)
    if (result.error || !result.data?.length) { setError('Die Entscheidung konnte nicht gespeichert werden.'); return }
    logAudit(
      `Überstundenmeldung ${status === 'genehmigt' ? 'genehmigt' : status === 'abgelehnt' ? 'abgelehnt' : 'zur Rückfrage zurückgelegt'}`,
      `${item.beamter?.name ?? '–'} · ${formatZeitraum(item)}`,
    )
    setUeberstundenDeciding(null); setUeberstundenDecideNote('')
    load()
  }

  function printUeberstundenMeldung(item: UeberstundenMeldung) {
    // Vor der Entscheidung gibt es noch keinen genehmiger-Eintrag - solange wird
    // stattdessen der vom Ersteller gewählte, voraussichtliche Genehmiger gezeigt.
    const genehmigerName = kettenName(item.genehmiger_wahl_id) ? officerPrintName({ name: kettenName(item.genehmiger_wahl_id) }) : null
    generateUeberstundenPdf({
      beamterName: item.beamter?.name ?? '–', bearbeiterName: officerPrintName(profile), genehmigerName,
      vonDatum: item.von_datum, vonZeit: item.von_zeit.slice(0, 5), bisDatum: item.bis_datum, bisZeit: item.bis_zeit.slice(0, 5), grund: item.grund,
      verguetung: item.verguetung,
      stunden: { std_werktag_50: item.std_werktag_50, std_sonn_100: item.std_sonn_100, std_19_22: item.std_19_22, std_22_06: item.std_22_06, std_sonn_200: item.std_sonn_200 },
    })
  }

  return (
    <div>
      <GenehmigungenBereichHeader title="Personal" description="Überstundenmeldungen zur Entscheidung." />

      {loadError && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{loadError}</div>}
      {error && !ueberstundenDeciding && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2"><Clock3 className="w-4 h-4" /> Überstundenmeldungen</h2>
          {ueberstundenItems.length === 0 ? (
            <Empty icon={Clock3} title="Keine offenen Überstundenmeldungen" />
          ) : (
            <div className="space-y-3">
              {ueberstundenItems.map(item => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">{item.beamter?.name ?? '–'}</span>
                        {item.beamter?.dienstnummer ? <span className="text-xs text-gray-500">DNr. {item.beamter.dienstnummer}</span> : null}
                        <span className="text-xs text-gray-400">{formatZeitraum(item)}</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{item.grund}</p>
                      <p className="text-sm font-semibold text-gray-900 mt-1">{formatStunden(totalStunden(item))} Std. gesamt</p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                      <button type="button" onClick={() => printUeberstundenMeldung(item)} className="p-2 text-blue-700 hover:bg-blue-50 rounded-lg" aria-label="Als PDF ausgeben"><FileOutput className="w-4 h-4" /></button>
                      <button type="button" disabled={processing === item.id} onClick={() => void decideUeberstunden(item, 'genehmigt', '')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 border border-green-300 bg-white px-3 py-2 rounded-lg disabled:opacity-60"><ThumbsUp className="w-3.5 h-3.5" /> Genehmigen</button>
                      <button type="button" disabled={processing === item.id} onClick={() => { setUeberstundenDeciding({ item, status: 'rueckfrage' }); setUeberstundenDecideNote('') }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 border border-blue-300 bg-white px-3 py-2 rounded-lg disabled:opacity-60"><HelpCircle className="w-3.5 h-3.5" /> Rückfrage</button>
                      <button type="button" disabled={processing === item.id} onClick={() => { setUeberstundenDeciding({ item, status: 'abgelehnt' }); setUeberstundenDecideNote('') }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 border border-red-300 bg-white px-3 py-2 rounded-lg disabled:opacity-60"><ThumbsDown className="w-3.5 h-3.5" /> Ablehnen</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {ueberstundenDeciding && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{ueberstundenDeciding.status === 'abgelehnt' ? 'Überstundenmeldung ablehnen' : 'Zur Rückfrage zurücklegen'}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{ueberstundenDeciding.item.beamter?.name ?? '–'} · {formatZeitraum(ueberstundenDeciding.item)}</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              <label className="block text-xs font-medium text-gray-600">{ueberstundenDeciding.status === 'abgelehnt' ? 'Begründung (optional)' : 'Was soll geklärt/ergänzt werden? (optional)'}
                <textarea rows={3} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" value={ueberstundenDecideNote} onChange={e => setUeberstundenDecideNote(e.target.value)} autoFocus />
              </label>
              {error && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setUeberstundenDeciding(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button
                onClick={() => void decideUeberstunden(ueberstundenDeciding.item, ueberstundenDeciding.status, ueberstundenDecideNote)}
                disabled={processing === ueberstundenDeciding.item.id}
                className={`flex-1 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60 ${ueberstundenDeciding.status === 'abgelehnt' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-700 hover:bg-blue-800'}`}>
                {ueberstundenDeciding.status === 'abgelehnt' ? 'Ablehnen' : 'Zur Rückfrage zurücklegen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
