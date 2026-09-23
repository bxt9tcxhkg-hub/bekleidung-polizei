import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { loadDokumente } from '../../lib/einsatzDokumente'
import { loadPersonenliste } from '../../lib/zmrPersonen'

export default function IncidentDocumentSummary({
  incidentId,
  refreshToken = 0,
  onOpen,
}: {
  incidentId: string
  refreshToken?: number
  onOpen: () => void
}) {
  const [documents, setDocuments] = useState(0)
  const [residents, setResidents] = useState(0)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(false)
    void Promise.all([loadDokumente(incidentId), loadPersonenliste(incidentId, 'haus')])
      .then(([docs, persons]) => {
        if (cancelled) return
        setDocuments(docs.length)
        setResidents(persons.length)
      })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [incidentId, refreshToken])

  return <button type="button" onClick={onOpen} className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left hover:border-blue-300">
    <div className="flex min-w-0 items-center gap-2">
      <FileText className="h-4 w-4 flex-none text-blue-700" />
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Dateien / ZMR</p>
        <p className="mt-0.5 text-xs text-gray-500">{error ? 'Stand konnte nicht geladen werden' : documents + ' Unterlagen · ' + residents + ' Bewohnerdatensätze'}</p>
      </div>
    </div>
    <span className="text-xs font-semibold text-blue-800">Öffnen</span>
  </button>
}
