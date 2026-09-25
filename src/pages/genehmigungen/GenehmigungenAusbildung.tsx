import { useCallback, useEffect, useState } from 'react'
import { GraduationCap, Target } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type {
  EinsatzTrainingAssignment,
  EinsatzTrainingModule,
  EinsatzTrainingSession,
  SchulungAssignment,
  SchulungModule,
  SchulungSession,
} from '../../lib/types'
import { logAudit } from '../../lib/audit'
import { officerDisplayName } from '../../lib/personalEinsatzmittel'
import { Empty, GenehmigungenBereichHeader } from '../../components/genehmigungenShared'

type ProfileMini = { id: string; name: string | null; dienstnummer: string | null; username: string }
type TrainingAssignmentWithOfficer = EinsatzTrainingAssignment & { officer?: ProfileMini | null }
type SchulungAssignmentWithOfficer = SchulungAssignment & { officer?: ProfileMini | null }

// Modul-Namen sind hier keine generischen Kategorien, sondern konkrete,
// oft ähnlich benannte Termine ("Bundes-ET-Koblach 4. Quartal", "... 1.
// Quartal", ...) - eine flache Liste aus lauter solchen Zeilen lässt sich
// schwer überfliegen. Nach Modul gruppiert (je eine Karte, darunter die
// Vorschläge dieses Moduls) macht auf einen Blick sichtbar, wie viele
// Vorschläge zu welchem konkreten Termin gehören.
function groupAssignmentsByModule<T extends { module_id: string; proposed_at: string }>(
  items: T[],
  modules: { id: string; name: string }[],
) {
  const order: string[] = []
  const byModule = new Map<string, T[]>()
  for (const item of items) {
    if (!byModule.has(item.module_id)) { byModule.set(item.module_id, []); order.push(item.module_id) }
    byModule.get(item.module_id)!.push(item)
  }
  return order.map(moduleId => ({
    moduleId,
    moduleName: modules.find(m => m.id === moduleId)?.name ?? moduleId,
    items: byModule.get(moduleId)!,
  }))
}

// Der Genehmiger braucht direkt in der Liste (nicht erst im Prüfen-Dialog),
// wann das Training/die Schulung stattfinden soll. Ein einzelner Vorschlag
// hat oft schon einen fixen Termin (session_id, z. B. bei Selbstanmeldung
// über die Ausschreibung) - sonst zeigt die Modul-Karte die angekündigten
// Termine dieses Moduls als Orientierung, aus denen der Genehmiger beim
// Prüfen ohnehin wählen muss.
function formatSessionDate(session: { session_date: string; note: string | null }) {
  return new Date(session.session_date).toLocaleDateString('de-AT') + (session.note ? ` · ${session.note}` : '')
}

function itemTerminLabel(sessionId: string | null, sessions: { id: string; session_date: string; note: string | null }[]) {
  if (!sessionId) return null
  const session = sessions.find(s => s.id === sessionId)
  return session ? formatSessionDate(session) : null
}

function moduleTerminLabel(moduleId: string, sessions: { module_id: string | null; session_date: string; note: string | null }[]) {
  const matches = sessions.filter(s => s.module_id === moduleId)
  if (matches.length === 0) return 'Kein Termin angekündigt'
  if (matches.length === 1) return `Termin ${formatSessionDate(matches[0])}`
  return `Termine ${matches.map(formatSessionDate).join(' · ')}`
}

// Zwei Vorschlag-Zuteilungen (Einsatztraining/Schulungen) sind strukturell
// identisch - eine Genehmigung braucht zwingend einen gewählten Termin,
// beides läuft über dieselbe Art RPC (nur der Funktionsname unterscheidet
// sich). Gemeinsam behandelt, um die Sektionen nicht zu duplizieren.
type AssignmentKind = 'training' | 'schulung'

// Bereichsseite "Ausbildung" - eine der vier gleich behandelten Genehmigungen-
// Bereichsseiten (siehe GenehmigungenUebersicht.tsx). Bündelt bewusst zwei
// fachlich getrennte Systeme (Einsatztraining und Schulungen - je eigene
// Module/Termine/Tabellen) auf einer Seite, aber klar als zwei Gruppen mit
// eigenem Titel/Icon dargestellt statt als eine gemeinsame Liste.
export default function GenehmigungenAusbildung() {
  const [trainingModules, setTrainingModules] = useState<EinsatzTrainingModule[]>([])
  const [trainingSessions, setTrainingSessions] = useState<EinsatzTrainingSession[]>([])
  // null = (noch) nicht geladen bzw. Abfrage fehlgeschlagen - dann keine Belegung
  // anzeigen, statt fälschlich "0 Anmeldungen" zu behaupten.
  const [trainingRegistrationCounts, setTrainingRegistrationCounts] = useState<Record<string, number> | null>(null)
  const [trainingAssignments, setTrainingAssignments] = useState<TrainingAssignmentWithOfficer[]>([])
  const [schulungModules, setSchulungModules] = useState<SchulungModule[]>([])
  const [schulungSessions, setSchulungSessions] = useState<SchulungSession[]>([])
  const [schulungRegistrationCounts, setSchulungRegistrationCounts] = useState<Record<string, number> | null>(null)
  const [schulungAssignments, setSchulungAssignments] = useState<SchulungAssignmentWithOfficer[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [reviewingAssignment, setReviewingAssignment] = useState<{ kind: AssignmentKind; item: TrainingAssignmentWithOfficer | SchulungAssignmentWithOfficer } | null>(null)
  const [reviewSessionId, setReviewSessionId] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [tModRes, tSessRes, tRegRes, tAssignRes, sModRes, sSessRes, sRegRes, sAssignRes] = await Promise.all([
      supabase.from('einsatz_training_modules').select('*'),
      supabase.from('einsatz_training_sessions').select('*').eq('announced', true).order('session_date', { ascending: true }),
      // Nur Anmeldungen zu aktuell angekündigten Terminen zählen (statt der gesamten
      // Historie) - das bleibt praktisch klein. count:'exact' zusätzlich, um eine vom
      // PostgREST-Antwortlimit abgeschnittene Antwort zu erkennen (count > Anzahl der
      // zurückgegebenen Zeilen) statt sie stillschweigend als vollständig zu behandeln.
      supabase.from('einsatz_training_registrations').select('session_id, einsatz_training_sessions!inner(announced)', { count: 'exact' }).eq('einsatz_training_sessions.announced', true),
      supabase
        .from('einsatz_training_assignments')
        .select('*, officer:profiles!officer_id(id,name,dienstnummer,username)')
        .eq('status', 'vorschlag')
        .order('proposed_at', { ascending: true }),
      supabase.from('schulungen_module').select('*'),
      supabase.from('schulungen_sessions').select('*').eq('announced', true).order('session_date', { ascending: true }),
      supabase.from('schulungen_registrations').select('session_id, schulungen_sessions!inner(announced)', { count: 'exact' }).eq('schulungen_sessions.announced', true),
      supabase
        .from('schulungen_assignments')
        .select('*, officer:profiles!officer_id(id,name,dienstnummer,username)')
        .eq('status', 'vorschlag')
        .order('proposed_at', { ascending: true }),
    ])
    const failed: string[] = []
    if (tModRes.error) failed.push('Trainingsmodule')
    else setTrainingModules((tModRes.data ?? []) as EinsatzTrainingModule[])
    // Anders als bei den übrigen Listen: eine veraltete Terminliste ist hier gefährlicher
    // als eine leere. Sie entscheidet mit (reviewSessionValid), ob "Genehmigen" einen
    // Termin akzeptiert - ein seit dem letzten erfolgreichen Laden nicht mehr angekündigter
    // oder einem anderen Modul zugeordneter Termin würde sonst als gültige Option
    // stehen bleiben. Eine leere Liste blockiert stattdessen sicher jede Genehmigung,
    // ohne (anders als bei den Vorschlags-/Antragslisten) irgendein offenes Element zu
    // verstecken - die Zuteilungsvorschläge selbst bleiben ja unverändert sichtbar.
    if (tSessRes.error) { failed.push('Trainings-Termine'); setTrainingSessions([]) }
    else setTrainingSessions((tSessRes.data ?? []) as EinsatzTrainingSession[])
    const tRegTruncated = !tRegRes.error && tRegRes.count != null && tRegRes.count > (tRegRes.data?.length ?? 0)
    if (tRegRes.error || tRegTruncated) { failed.push('Trainings-Anmeldungen'); setTrainingRegistrationCounts(null) }
    else setTrainingRegistrationCounts(
      (tRegRes.data ?? []).reduce<Record<string, number>>((acc, r) => { acc[r.session_id] = (acc[r.session_id] ?? 0) + 1; return acc }, {}),
    )
    if (tAssignRes.error) failed.push('Trainings-Zuteilungsvorschläge')
    else setTrainingAssignments((tAssignRes.data ?? []) as TrainingAssignmentWithOfficer[])
    if (sModRes.error) failed.push('Schulungsmodule')
    else setSchulungModules((sModRes.data ?? []) as SchulungModule[])
    if (sSessRes.error) { failed.push('Schulungs-Termine'); setSchulungSessions([]) }
    else setSchulungSessions((sSessRes.data ?? []) as SchulungSession[])
    const sRegTruncated = !sRegRes.error && sRegRes.count != null && sRegRes.count > (sRegRes.data?.length ?? 0)
    if (sRegRes.error || sRegTruncated) { failed.push('Schulungs-Anmeldungen'); setSchulungRegistrationCounts(null) }
    else setSchulungRegistrationCounts(
      (sRegRes.data ?? []).reduce<Record<string, number>>((acc, r) => { acc[r.session_id] = (acc[r.session_id] ?? 0) + 1; return acc }, {}),
    )
    if (sAssignRes.error) failed.push('Schulungs-Zuteilungsvorschläge')
    else setSchulungAssignments((sAssignRes.data ?? []) as SchulungAssignmentWithOfficer[])
    setLoadError(failed.length > 0 ? `Nicht alles konnte geladen werden (${failed.join(', ')}). Bitte Seite neu laden.` : '')
    setLoading(false)
  }, [])

  useEffect(() => { load().catch(() => setLoadError('Freigaben konnten nicht geladen werden.')) }, [load])

  function openAssignmentReview(kind: AssignmentKind, item: TrainingAssignmentWithOfficer | SchulungAssignmentWithOfficer) {
    setReviewingAssignment({ kind, item })
    // Bei einer Selbstanmeldung über die Ausschreibung ist der Termin schon
    // festgelegt (session_id ist gesetzt) - der Genehmiger bestätigt/lehnt dann
    // nur noch ab, statt selbst einen Termin wählen zu müssen. Vorauswählen,
    // bleibt aber änderbar.
    setReviewSessionId(item.session_id ?? '')
    setReviewNote('')
    setError('')
  }

  async function reviewAssignment(approve: boolean) {
    if (!reviewingAssignment) return
    if (approve && !reviewSessionValid) { setError('Bitte einen Termin für die Einteilung wählen.'); return }
    const { kind, item } = reviewingAssignment
    setProcessing(item.id)
    setError('')
    const rpcName = kind === 'training' ? 'decide_training_assignment' : 'decide_schulung_assignment'
    const modules = kind === 'training' ? trainingModules : schulungModules
    const moduleName = modules.find(m => m.id === item.module_id)?.name ?? item.module_id
    const { error: err } = await supabase.rpc(rpcName, { p_assignment_id: item.id, p_approve: approve, p_session_id: approve ? reviewSessionId : null, p_note: reviewNote.trim() || null })
    setProcessing(null)
    if (err) { setError(err.message || 'Entscheidung fehlgeschlagen.'); return }
    logAudit(
      approve ? `${kind === 'training' ? 'Trainingsvorschlag' : 'Schulungsvorschlag'} genehmigt` : `${kind === 'training' ? 'Trainingsvorschlag' : 'Schulungsvorschlag'} abgelehnt`,
      `${officerDisplayName(item.officer)} · ${moduleName}`,
    )
    setReviewingAssignment(null)
    load()
  }

  const assignmentSessions = reviewingAssignment
    ? (reviewingAssignment.kind === 'training' ? trainingSessions : schulungSessions).filter(s => s.module_id === reviewingAssignment.item.module_id)
    : []
  // Belegung fürs jeweils gewählte Modul - null, solange die Anmeldungen (noch) nicht
  // geladen werden konnten (Fehler oder erkannte Truncation). In dem Fall NICHT
  // stillschweigend "keine Option ist voll" annehmen (das würde exakt die Lücke wieder
  // öffnen, die diese Anzeige schließen soll) - stattdessen gilt jeder Termin als nicht
  // prüfbar und "Genehmigen" bleibt gesperrt, bis die Belegung wieder bekannt ist.
  const assignmentRegistrationCounts = reviewingAssignment
    ? (reviewingAssignment.kind === 'training' ? trainingRegistrationCounts : schulungRegistrationCounts)
    : null
  const assignmentOccupancyUnknown = !!reviewingAssignment && assignmentRegistrationCounts == null
  function sessionIsFull(s: EinsatzTrainingSession | SchulungSession) {
    return assignmentOccupancyUnknown || (s.capacity != null && !!assignmentRegistrationCounts && (assignmentRegistrationCounts[s.id] ?? 0) >= s.capacity)
  }
  // Ein vorbelegter session_id (Selbstanmeldung) kann fehlen, wenn die Termin-Abfrage
  // fehlgeschlagen ist oder der Termin inzwischen nicht mehr angekündigt ist. Dann taucht
  // er in assignmentSessions nicht auf, obwohl reviewSessionId noch einen (unsichtbaren)
  // Wert trägt - "Genehmigen" darf dann nicht aktiv sein, sonst würde ein Termin bestätigt,
  // den der Genehmiger gar nicht einsehen kann. Ebenso, wenn der Termin zwar sichtbar,
  // aber laut geladener Belegung bereits voll ist (oder die Belegung insgesamt unbekannt ist).
  const selectedAssignmentSession = assignmentSessions.find(s => s.id === reviewSessionId)
  const reviewSessionValid = !!selectedAssignmentSession && !sessionIsFull(selectedAssignmentSession)
  const assignmentModuleName = reviewingAssignment
    ? (reviewingAssignment.kind === 'training' ? trainingModules : schulungModules).find(m => m.id === reviewingAssignment.item.module_id)?.name ?? reviewingAssignment.item.module_id
    : ''
  const trainingGroups = groupAssignmentsByModule(trainingAssignments, trainingModules)
  const schulungGroups = groupAssignmentsByModule(schulungAssignments, schulungModules)

  return (
    <div>
      <GenehmigungenBereichHeader title="Ausbildung" description="Trainings- und Schulungs-Zuteilungsvorschläge entscheiden." />

      {loadError && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{loadError}</div>}
      {error && !reviewingAssignment && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Einsatztraining und Schulungen bleiben bewusst auf einer Seite (bei zwei
              Vorschlägen je Zuteilung reicht das aus), aber klar als zwei getrennte
              Spalten mit eigenem Titel und Icon - dieselben Icons wie im Einsatz-/
              Schulungen-Bereich selbst (Target/GraduationCap), damit "Modul" nicht
              wie eine einzige gemeinsame Liste wirkt. */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><Target className="w-4 h-4 text-blue-700" /> Einsatztraining</h2>
            {trainingGroups.length === 0 ? (
              <Empty icon={Target} title="Keine offenen Trainingsvorschläge" />
            ) : (
              <div className="space-y-3">
                {trainingGroups.map(group => (
                  <div key={group.moduleId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                      <p className="font-semibold text-gray-900">{group.moduleName}</p>
                      <p className="text-xs text-gray-500">{group.items.length} Vorschlag{group.items.length === 1 ? '' : 'e'} · {moduleTerminLabel(group.moduleId, trainingSessions)}</p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {group.items.map(item => {
                        const eigenerTermin = itemTerminLabel(item.session_id, trainingSessions)
                        return (
                          <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">{officerDisplayName(item.officer)}</p>
                              <p className="text-xs text-gray-400">{eigenerTermin ? `Termin ${eigenerTermin}` : `Vorgeschlagen am ${new Date(item.proposed_at).toLocaleDateString('de-AT')}, noch kein Termin gewählt`}</p>
                            </div>
                            <button type="button" onClick={() => openAssignmentReview('training', item)} className="flex-shrink-0 text-xs font-semibold text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg">Prüfen</button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 lg:border-l lg:border-gray-200 lg:pl-8">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><GraduationCap className="w-4 h-4 text-blue-700" /> Schulungen</h2>
            {schulungGroups.length === 0 ? (
              <Empty icon={GraduationCap} title="Keine offenen Schulungsvorschläge" />
            ) : (
              <div className="space-y-3">
                {schulungGroups.map(group => (
                  <div key={group.moduleId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                      <p className="font-semibold text-gray-900">{group.moduleName}</p>
                      <p className="text-xs text-gray-500">{group.items.length} Vorschlag{group.items.length === 1 ? '' : 'e'} · {moduleTerminLabel(group.moduleId, schulungSessions)}</p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {group.items.map(item => {
                        const eigenerTermin = itemTerminLabel(item.session_id, schulungSessions)
                        return (
                          <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">{officerDisplayName(item.officer)}</p>
                              <p className="text-xs text-gray-400">{eigenerTermin ? `Termin ${eigenerTermin}` : `Vorgeschlagen am ${new Date(item.proposed_at).toLocaleDateString('de-AT')}, noch kein Termin gewählt`}</p>
                            </div>
                            <button type="button" onClick={() => openAssignmentReview('schulung', item)} className="flex-shrink-0 text-xs font-semibold text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg">Prüfen</button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {reviewingAssignment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{reviewingAssignment.kind === 'training' ? 'Trainingsvorschlag' : 'Schulungsvorschlag'} prüfen</h2>
              <p className="text-sm text-gray-500 mt-0.5">{officerDisplayName(reviewingAssignment.item.officer)} · {assignmentModuleName}</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              <label className="block text-xs font-medium text-gray-600">Termin für die Einteilung (bei Genehmigung erforderlich)
                <select className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={reviewSessionId} onChange={e => setReviewSessionId(e.target.value)}>
                  <option value="">– Termin wählen –</option>
                  {assignmentSessions.map(s => {
                    const count = assignmentRegistrationCounts?.[s.id] ?? 0
                    const occupancy = s.capacity != null && assignmentRegistrationCounts ? ` · ${count}/${s.capacity}${sessionIsFull(s) ? ' · voll' : ''}` : ''
                    return <option key={s.id} value={s.id} disabled={sessionIsFull(s)}>{new Date(s.session_date).toLocaleDateString('de-AT')}{s.note ? ` · ${s.note}` : ''}{occupancy}</option>
                  })}
                </select>
                {assignmentSessions.length === 0 ? <span className="text-xs text-amber-700 mt-1 block">Für dieses Modul ist aktuell kein angekündigter Termin vorhanden.</span>
                  : assignmentOccupancyUnknown ? <span className="text-xs text-amber-700 mt-1 block">Belegung konnte nicht ermittelt werden - Genehmigen ist vorübergehend nicht möglich. Bitte Seite neu laden.</span>
                  : null}
              </label>
              <label className="block text-xs font-medium text-gray-600">Bemerkung (optional)
                <textarea rows={2} maxLength={500} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" value={reviewNote} onChange={e => setReviewNote(e.target.value)} />
              </label>
              {error && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setReviewingAssignment(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={() => void reviewAssignment(false)} disabled={processing === reviewingAssignment.item.id} className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">Ablehnen</button>
              <button onClick={() => void reviewAssignment(true)} disabled={processing === reviewingAssignment.item.id || !reviewSessionValid} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">Genehmigen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
