import { ArrowLeft, BellRing, BookOpenCheck, Car, ContactRound, Database, GraduationCap, KeyRound, ListChecks, ListTree, Phone, ScrollText, ShieldCheck, Shirt, Users, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

type Kachel = { to: string; titel: string; beschreibung: string; icon: LucideIcon }

const GRUPPEN: { titel: string; beschreibung: string; kacheln: Kachel[] }[] = [
  {
    titel: 'Zentrale und Ereignisse',
    beschreibung: 'Vorgaben, die unmittelbar in der operativen Arbeit verwendet werden.',
    kacheln: [
      { to: '/portal/systemeinstellungen/funktionskontakte', titel: 'Funktionskontakte', beschreibung: 'Bürgermeister, Rechtsabteilung und weitere Funktionen konkreten Kontakten zuordnen.', icon: ContactRound },
      { to: '/portal/systemeinstellungen/verstaendigungen', titel: 'Verständigungsschema', beschreibung: 'Schritte je Ereignisstufe, Reihenfolge und Pflichtstatus festlegen.', icon: BellRing },
      { to: '/portal/systemeinstellungen/einsatzgruende', titel: 'Einsatzgründe', beschreibung: 'Auswahl, Reihenfolge, Sichtbarkeit und Hinweis-Umkreis verwalten.', icon: ListChecks },
      { to: '/portal/systemeinstellungen/ablaufvorlagen', titel: 'Ablaufvorlagen', beschreibung: 'Maßnahmen und Entscheidungsfragen für neue Ereignisse vorgeben.', icon: ListTree },
      { to: '/portal/systemeinstellungen/telefonnummern', titel: 'Wichtige Telefonnummern', beschreibung: 'Festlegen, welche konkrete Nummer in den operativen Bereichen erscheint.', icon: Phone },
    ],
  },
  {
    titel: 'Benutzer und Stammdaten',
    beschreibung: 'Zugänge und gemeinsam verwendete Nachschlagewerke.',
    kacheln: [
      { to: '/portal/benutzer', titel: 'Benutzer und Rechte', beschreibung: 'Benutzer, Organisationen, Rollen und Bereichsrechte verwalten.', icon: Users },
      { to: '/portal/systemeinstellungen/kontakte', titel: 'Kontakte', beschreibung: 'Personen, Stellen und deren Büro-, Dienst- und Privatnummern pflegen.', icon: ContactRound },
      { to: '/stammdaten', titel: 'Register', beschreibung: 'Schlüssel, Personen, Objekte, Baustellen und weitere Stammdaten.', icon: Database },
      { to: '/auditlog', titel: 'Auditlog', beschreibung: 'Nachvollziehen, wer administrative Änderungen durchgeführt hat.', icon: ScrollText },
    ],
  },
  {
    titel: 'Fachbereiche',
    beschreibung: 'Die fachliche Verwaltung bleibt im jeweils zuständigen Bereich.',
    kacheln: [
      { to: '/fuhrpark', titel: 'Fuhrpark', beschreibung: 'Fahrzeuge, Verantwortliche, Fülllisten und Fristen.', icon: Car },
      { to: '/schulungen', titel: 'Schulungen', beschreibung: 'Module, Termine, Unterlagen und Zuteilungen.', icon: GraduationCap },
      { to: '/einsatz', titel: 'Einsatzmittel und Training', beschreibung: 'Einsatzmittel, Lager, Training und Kontrollbehelfe.', icon: ShieldCheck },
      { to: '/budgets', titel: 'Bekleidung und Budgets', beschreibung: 'Budgets, Grundausstattung und Bestellvorgaben.', icon: Shirt },
      { to: '/innendienst/gebuehren', titel: 'Innendienst und Gebühren', beschreibung: 'Gebührenordnung und fachliche Innendienst-Vorgaben.', icon: BookOpenCheck },
      { to: '/stammdaten/schluessel', titel: 'Schlüsselverwaltung', beschreibung: 'Schlüsselnummern, Verwahrorte und zugehörige Objekte.', icon: KeyRound },
    ],
  },
]

export default function Systemeinstellungen() {
  return <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
    <Link to="/" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4" /> Zu Mein Bereich</Link>
    <h1 className="mt-5 text-2xl font-bold text-gray-900">Systemeinstellungen</h1>
    <p className="mt-2 text-sm text-gray-600">Wählen Sie den Bereich, den Sie tatsächlich konfigurieren oder verwalten möchten.</p>

    <div className="mt-7 space-y-8">
      {GRUPPEN.map(gruppe => <section key={gruppe.titel}>
        <h2 className="text-lg font-bold text-gray-900">{gruppe.titel}</h2>
        <p className="mt-1 text-sm text-gray-500">{gruppe.beschreibung}</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gruppe.kacheln.map(kachel => {
            const Icon = kachel.icon
            return <Link key={kachel.to} to={kachel.to} className="rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-blue-300 hover:shadow-sm">
              <div className="mb-4 w-fit rounded-lg bg-blue-50 p-2.5"><Icon className="h-5 w-5 text-blue-700" /></div>
              <h3 className="text-base font-semibold text-gray-900">{kachel.titel}</h3>
              <p className="mt-1 text-sm text-gray-500">{kachel.beschreibung}</p>
            </Link>
          })}
        </div>
      </section>)}
    </div>
  </div>
}
