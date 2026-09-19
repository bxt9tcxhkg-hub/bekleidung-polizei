import { ArrowLeft, Building2, Construction, Contact, KeyRound, Phone, Search, Users, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

const REGISTER_TILES: { to: string; label: string; description: string; icon: LucideIcon }[] = [
  { to: '/stammdaten/schluessel', label: 'Schlüssel', description: 'Hinterlegte Schlüssel und Zutrittshinweise.', icon: KeyRound },
  { to: '/stammdaten/kontakte', label: 'Kontakte', description: 'Dienstlich notwendige Kontakte und Rufbereitschaften.', icon: Contact },
  { to: '/stammdaten/telefonnummern', label: 'Wichtige Telefonnummern', description: 'Intern und extern (andere Dienststellen/Behörden).', icon: Phone },
  { to: '/stammdaten/personen', label: 'Personen', description: 'Zentrales Register für Personenhinweise, RSa/RSb, AV/BV & EV und Fahndungen.', icon: Users },
  { to: '/stammdaten/objekte', label: 'Objekte', description: 'Adressen/Gebäude, verknüpft mit AV/BV & EV, Fahndungen, Schlüsseln und Kontakten.', icon: Building2 },
  { to: '/stammdaten/fahndungen', label: 'Fahndungen', description: 'PDF-Ausschreibungen.', icon: Search },
  { to: '/stammdaten/baustellen', label: 'Baustellen', description: 'Streckenkenntnis für die Streife bei gesperrten Straßen.', icon: Construction },
]

export default function StammdatenUebersicht() {
  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4">
        <ArrowLeft className="w-4 h-4" /> Zum Portal
      </Link>
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Stammdaten &amp; Nachschlagewerke</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Register</h1>
        <p className="text-sm text-gray-500 mt-1">Nachschlagewerke für Zentrale, Innendienst und Außendienst.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {REGISTER_TILES.map(tile => {
          const Icon = tile.icon
          return (
            <Link key={tile.to} to={tile.to} className="rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all block">
              <div className="bg-blue-50 p-2.5 rounded-lg w-fit mb-4">
                <Icon className="w-5 h-5 text-blue-700" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">{tile.label}</h2>
              <p className="text-sm text-gray-500 mt-1">{tile.description}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
