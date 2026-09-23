import { useCallback, useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { generateNamenslistePdf } from '../../lib/einsatzNamenslistePdf'
import { officerPrintName } from '../../lib/printDocs'
import {
  addPersonen,
  loadPersonenliste,
  sortiertNachTopNr,
} from '../../lib/zmrPersonen'
import type { NamenslistePerson } from '../../lib/types'

/**
 * Polizei-Sicht auf bereitgestellte Bewohnerdaten.
 *
 * PAD bleibt für die Stadtpolizei das führende Einsatz- und Protokollsystem.
 * Deshalb werden hier bewusst KEINE Vor-Ort-Feststellungen, Maßnahmen,
 * Anwesenheits-/Evakuierungsstatus, Befragungen oder Unterkunftsdaten geführt.
 *
 * Die generischen Listen-/Statusmodelle bleiben in lib/zmrPersonen.ts und der
 * Datenbank erhalten, damit andere Organisationen (z. B. Feuerwehr/Krisenstab)
 * später eigene protokollierende Arbeitsoberflächen darauf aufbauen können.
 */
export default function IncidentNamensliste({
  incidentId,
  incidentTitel,
  canOperate = true,
  mode = 'feld',
  onChanged,
}: {
  incidentId: string
  incidentTitel: string
  canOperate?: boolean
  mode?: 'zentrale' | 'feld'
  onChanged?: () => void
}) {
  const { profile } = useAuth()
  const isZentrale = mode === 'zentrale'
  const [personen, setPersonen] = useState<NamenslistePerson[]>([])
  const [neuerName, setNeuerName] = useState('')
  const [manuellOffen, setManuellOffen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      setPersonen(await loadPersonenliste(incidentId, 'haus'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bewohnerdaten konnten nicht geladen werden.')
    }
  }, [incidentId])

  useEffect(() => { void load() }, [load])

  async function onAddManual() {
    if (!isZentrale || !canOperate || !neuerName.trim() || !profile?.id) return
    setBusy(true)
    setError('')
    try {
      const gespeichert = await addPersonen(incidentId, 'haus', [{ name: neuerName.trim() }], profile.id)
      setPersonen(current => sortiertNachTopNr([...current, ...gespeichert]))
      setNeuerName('')
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Person konnte nicht ergänzt werden.')
    } finally {
      setBusy(false)
    }
  }

  function drucken() {
    generateNamenslistePdf({
      incidentTitel,
      listenart: 'haus',
      personen,
      erstelltVon: officerPrintName(profile),
    })
  }

  return <div className="space-y-3">
    <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-900">Bewohnerdaten / ZMR</p>
      <p className="mt-1 text-xs text-blue-900">
        {isZentrale
          ? 'Die Zentrale stellt hier ausschließlich Bewohnerdaten aus ZMR/Abfragen als Informationsgrundlage bereit. Einsatzverlauf, Feststellungen und Rückmeldungen werden im PAD dokumentiert.'
          : 'Nur Informationsgrundlage aus ZMR/Abfragen. Feststellungen vor Ort, Maßnahmen und Rückmeldungen werden im PAD dokumentiert.'}
      </p>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-bold text-gray-900">{personen.length} Bewohnerdatensätze</p>
      <button
        type="button"
        onClick={drucken}
        disabled={personen.length === 0}
        className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 px-2 py-1.5 text-xs font-semibold text-blue-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Printer className="h-3.5 w-3.5" /> PDF
      </button>
    </div>

    {personen.length === 0 ? <p className="text-xs text-gray-500">
      {isZentrale
        ? 'Noch keine Bewohnerdaten. ZMR-/Abfrageergebnis hochladen oder bei Bedarf eine fehlende Person ergänzen.'
        : 'Noch keine Bewohnerdaten von der Zentrale bereitgestellt.'}
    </p> : <ul className="space-y-1.5">
      {personen.map(person => <li key={person.id} className="rounded-lg border border-gray-100 bg-white p-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-900">{person.name}</span>
          {person.wohnung ? <span className="text-gray-500">Top {person.wohnung}</span> : null}
          {person.geboren ? <span className="text-gray-500">* {person.geboren}</span> : null}
        </div>
      </li>)}
    </ul>}

    {isZentrale && canOperate ? <div className="border-t border-gray-100 pt-2">
      <button
        type="button"
        onClick={() => setManuellOffen(current => !current)}
        className="text-xs font-medium text-gray-600 hover:text-blue-800"
      >
        {manuellOffen ? 'Manuelle Ergänzung schließen' : '+ Fehlende Person ergänzen'}
      </button>
      {manuellOffen ? <>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            className="max-w-xs flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs"
            placeholder="Zusätzliche Person"
            value={neuerName}
            onChange={event => setNeuerName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void onAddManual() }}
          />
          <button
            type="button"
            onClick={() => void onAddManual()}
            disabled={busy || !neuerName.trim()}
            className="rounded-md border border-blue-200 px-2 py-1.5 text-xs font-semibold text-blue-800 disabled:opacity-60"
          >
            Hinzufügen
          </button>
        </div>
        <p className="mt-1 text-[11px] text-gray-500">Nur zur Ergänzung der bereitgestellten Datenbasis, nicht zur Dokumentation einer Feststellung vor Ort.</p>
      </> : null}
    </div> : null}

    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>
}
