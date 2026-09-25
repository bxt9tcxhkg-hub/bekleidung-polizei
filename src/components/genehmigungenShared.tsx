import { CheckCircle, XCircle } from 'lucide-react'

// Von allen vier Genehmigungen-Bereichsseiten gemeinsam genutzte Bausteine
// (Bekleidung/Ausbildung/Einsatzmittel/Personal) - vormals Teil der einen
// großen Approvals.tsx, jetzt hier ausgelagert, damit keine der vier Seiten
// diese Anzeige-Bausteine dupliziert.

export function Empty({ icon: Icon, title, subtitle }: { icon: typeof CheckCircle; title: string; subtitle?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-center">
      <Icon className="w-12 h-12 mb-3 text-gray-300" />
      <p className="font-semibold text-gray-500">{title}</p>
      {subtitle ? <p className="text-sm text-gray-400 mt-1">{subtitle}</p> : null}
    </div>
  )
}

export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {head.map((label, i) => <th key={i} className={`text-left px-5 py-3 font-semibold text-gray-600 ${i === head.length - 1 ? 'text-right' : ''}`}>{label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((cells, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {cells.map((cell, j) => <td key={j} className="px-5 py-4 text-gray-700 align-top">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Actions({ disabled, onApprove, onReject }: { disabled: boolean; onApprove: () => void; onReject: () => void }) {
  return (
    <div className="flex items-center gap-2 justify-end">
      <button onClick={onApprove} disabled={disabled}
        className="flex items-center gap-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
        <CheckCircle className="w-3.5 h-3.5" /> Freigeben
      </button>
      <button onClick={onReject} disabled={disabled}
        className="flex items-center gap-1.5 text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
        <XCircle className="w-3.5 h-3.5" /> Ablehnen
      </button>
    </div>
  )
}

// Gemeinsamer Seitenkopf für die vier Genehmigungen-Bereichsseiten - Rückweg
// zur Kachel-Übersicht + Titel/Untertitel, damit jeder Bereich gleich behandelt
// wird (kein Bereich bekommt eine abweichende Kopfzeile).
export { default as GenehmigungenBereichHeader } from './GenehmigungenBereichHeader'
