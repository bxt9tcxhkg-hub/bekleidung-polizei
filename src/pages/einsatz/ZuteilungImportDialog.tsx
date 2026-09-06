import { useRef, useState, type ChangeEvent } from 'react'
import { Upload, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import {
  ZUTEILUNG_CSV_TEMPLATE,
  parseZuteilungText,
  planZuteilungImport,
  type ExistingPersonalEmRef,
  type ZuteilungOfficerRef,
} from '../../lib/zuteilungImport'

export default function ZuteilungImportDialog({
  officers,
  existing,
  createdBy,
  onClose,
  onImported,
}: {
  officers: readonly ZuteilungOfficerRef[]
  existing: readonly ExistingPersonalEmRef[]
  createdBy: string | null
  onClose: () => void
  onImported: () => Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState<{ inserted: number; skipped: string[] } | null>(null)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setText(await file.text())
    setSummary(null)
    setError('')
  }

  async function runImport() {
    const parsed = parseZuteilungText(text)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    const plan = planZuteilungImport({
      rows: parsed.file.rows,
      officers,
      existing,
    })
    if (plan.inserts.length === 0 && plan.skipped.length === 0) {
      setError('Keine Zeilen erkannt.')
      return
    }
    setImporting(true)
    setError('')
    let inserted = 0
    const skipped = plan.skipped.map(row => `Zeile ${row.rowIndex}: ${row.reason}`)
    for (const item of plan.inserts) {
      const { error: insertError } = await supabase
        .from('personal_einsatzmittel')
        .insert({ ...item.payload, created_by: createdBy })
      if (insertError) {
        skipped.push(`${item.label}: ${insertError.message || 'Speichern fehlgeschlagen.'}`)
        continue
      }
      inserted += 1
    }
    if (inserted > 0) {
      logAudit('Zuteilung importiert', `${inserted} persönliche Einsatzmittel`)
    }
    setSummary({ inserted, skipped })
    setImporting(false)
    if (inserted > 0) {
      try {
        await onImported()
      } catch {
        setError('Import gespeichert, Liste konnte nicht aktualisiert werden.')
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-900">Import Zuteilung</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Schließen">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          <p className="text-sm text-gray-600">
            JSON oder CSV der Zuteilungsliste. Treffer nur über Dienstnummer oder eindeutigen Namen —
            unbekannte Offiziere werden übersprungen.
          </p>
          <div className="bg-gray-50 rounded-xl p-4 text-xs font-mono text-gray-600 space-y-1">
            <p className="font-semibold text-gray-700 font-sans text-xs mb-2">CSV (Semikolon):</p>
            <p>name;dienstnummer;verwahrungsort;glock_17;glock_26;steyer_m9;pfefferspray_ablauf;schlagstock_eka</p>
            <p>Fenkart Matthias;7;;W-1001;;;Q4/2024;EKA-7</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              <Upload className="w-4 h-4" /> Datei wählen
            </button>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(ZUTEILUNG_CSV_TEMPLATE)}`}
              download="zuteilung-vorlage.csv"
              className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              Vorlage
            </a>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.json"
              className="hidden"
              onChange={event => { void handleFile(event) }}
            />
          </div>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono min-h-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={text}
            onChange={e => { setText(e.target.value); setSummary(null) }}
            placeholder="JSON oder CSV einfügen"
          />
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          {summary && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-700 space-y-1">
              <p>{summary.inserted} Stück angelegt.</p>
              {summary.skipped.map(line => (
                <p key={line} className="text-xs text-amber-800">{line}</p>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50"
          >
            Schließen
          </button>
          <button
            type="button"
            onClick={() => { void runImport() }}
            disabled={importing || !text.trim()}
            className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60"
          >
            {importing ? 'Importiere...' : 'Importieren'}
          </button>
        </div>
      </div>
    </div>
  )
}
