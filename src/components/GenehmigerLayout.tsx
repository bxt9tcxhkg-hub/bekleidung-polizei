import { Outlet } from 'react-router-dom'
import PortalChrome from './PortalChrome'

// Hülle für die Genehmigungen-Kachel-Übersicht und ihre vier Bereichsseiten -
// Muster: StammdatenLayout.tsx ("Stammdaten & Nachschlagewerke"). Bewusst
// OHNE Sidebar: der Genehmiger soll seine gesamte Arbeit auf der Kachel-
// Übersicht und ihren Bereichsseiten erledigen (Navigation dorthin über den
// "Zu Genehmigungen"-Rücklink jeder Bereichsseite, siehe
// GenehmigungenBereichHeader.tsx), nicht über eine zusätzliche, dauerhafte
// Sidebar-Navigation, die mit "Freigaben" ohnehin nur wieder hierher führen
// würde.
export default function GenehmigerLayout() {
  return (
    <PortalChrome wide>
      <Outlet />
    </PortalChrome>
  )
}
