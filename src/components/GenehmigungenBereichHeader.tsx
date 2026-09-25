import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

// Gemeinsame Kopfzeile für die vier Genehmigungen-Bereichsseiten (Bekleidung,
// Ausbildung, Einsatzmittel, Personal) - Rückweg zur Kachel-Übersicht, Muster
// wie StammdatenUebersicht.tsx/-Bereichsseiten ("Zum Portal"). Jeder Bereich
// bekommt exakt dieselbe Behandlung, keiner eine abweichende Kopfzeile.
export default function GenehmigungenBereichHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <Link to="/genehmigungen" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4">
        <ArrowLeft className="w-4 h-4" /> Zu Genehmigungen
      </Link>
      <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Genehmigungen</p>
      <h1 className="text-2xl font-bold text-gray-900 mt-1">{title}</h1>
      <p className="text-sm text-gray-500 mt-1">{description}</p>
    </div>
  )
}
