import type { ReactNode } from 'react'
import BackLink from './BackLink'

// Gemeinsame Kopfzeile für die vier Genehmigungen-Bereichsseiten (Bekleidung,
// Ausbildung, Einsatzmittel, Personal) - Rückweg zur Kachel-Übersicht, Muster
// wie StammdatenUebersicht.tsx/-Bereichsseiten ("Zum Portal"). Jeder Bereich
// bekommt exakt dieselbe Behandlung, keiner eine abweichende Kopfzeile.
// `links`: optionale Verwaltungswerkzeuge des Bereichs, die kein eigener
// Entscheidungs-Posteingang sind (z. B. Budgetverwaltung/Schuherstattungen bei
// Bekleidung) - gehören nicht in die Sidebar (sonst zweite, konkurrierende
// Navigation neben "Freigaben"), aber sollen von der Bereichsseite aus
// erreichbar bleiben.
export default function GenehmigungenBereichHeader({ title, description, links }: { title: string; description: string; links?: ReactNode }) {
  return (
    <div className="mb-6">
      <BackLink to="/genehmigungen" label="Zu Genehmigungen" className="mb-4" />
      <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Genehmigungen</p>
      <h1 className="text-2xl font-bold text-gray-900 mt-1">{title}</h1>
      <p className="text-sm text-gray-500 mt-1">{description}</p>
      {links ? <div className="flex flex-wrap gap-2 mt-3">{links}</div> : null}
    </div>
  )
}
