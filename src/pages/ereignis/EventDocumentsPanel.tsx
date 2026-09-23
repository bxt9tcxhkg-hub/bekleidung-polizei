import { useEffect, useState } from 'react'
import {
  loadEreignisDokumente,
  openEreignisDokument,
  type EreignisDokument,
} from '../../lib/ereignisDokumente'
import type { IncidentAssistanceOrganisation } from '../../lib/types'

export default function EventDocumentsPanel({
  ereignisId,
  organisation,
}: {
  ereignisId: string
  organisation: Exclude<IncidentAssistanceOrganisation, 'Stadtpolizei'>
}) {
  const [documents, setDocuments] = useState<EreignisDokument[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void loadEreignisDokumente(ereignisId)
      .then(rows => {
        if (!cancelled) {
          setDocuments(rows.filter(doc => !doc.targetOrganisation || doc.targetOrganisation === organisation))
          setError('')
        }
      })
      .catch(() => { if (!cancelled) setError('Bereitgestellte Dokumente konnten nicht geladen werden.') })
    return () => { cancelled = true }
  }, [ereignisId, organisation])

  return <section className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-800">Bereitgestellte Daten / Dokumente</p>
      <p className="mt-1 text-xs text-gray-500">Ergebnisse, die von der Stadtpolizei-Zentrale für dieses Ereignis bereitgestellt wurden.</p>
    </div>

    {documents.length === 0 ? <p className="text-xs text-gray-500">Noch keine Dokumente bereitgestellt.</p> : <div className="space-y-1.5">
      {documents.map(doc => <button
        key={doc.id}
        type="button"
        onClick={() => void openEreignisDokument(doc.fileKey).catch(() => setError('Dokument konnte nicht geöffnet werden.'))}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-left hover:border-blue-300"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{doc.title}</p>
          <p className="truncate text-xs text-gray-500">{doc.fileName} · {doc.sourceOrganisation}</p>
        </div>
        <span className="text-xs font-semibold text-blue-800">Öffnen</span>
      </button>)}
    </div>}

    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </section>
}
