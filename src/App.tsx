import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import GenehmigerLayout from './components/GenehmigerLayout'
import EinsatzLayout from './components/EinsatzLayout'
import ZentraleLayout from './components/ZentraleLayout'
import StammdatenLayout from './components/StammdatenLayout'
import AussendienstLayout from './components/AussendienstLayout'
import InnendienstLayout from './components/InnendienstLayout'
import RsaRsbLayout from './components/RsaRsbLayout'
import FuhrparkLayout from './components/FuhrparkLayout'
import SchulungenLayout from './components/SchulungenLayout'
import PortalChrome from './components/PortalChrome'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import Portal from './pages/Portal'
import Dashboard from './pages/Dashboard'
import Shop from './pages/Shop'
import MyOrders from './pages/MyOrders'
import UserProfile from './pages/UserProfile'
import NotFound from './pages/NotFound'

// Admin-/Verwaltungsseiten werden erst bei Bedarf geladen (Code-Splitting)
const Products = lazy(() => import('./pages/Products'))
const Orders = lazy(() => import('./pages/Orders'))
const Quarters = lazy(() => import('./pages/Quarters'))
const ShoeRefunds = lazy(() => import('./pages/ShoeRefunds'))
const AuditLog = lazy(() => import('./pages/AuditLog'))
const Approvals = lazy(() => import('./pages/Approvals'))
const Budgets = lazy(() => import('./pages/Budgets'))
const Lager = lazy(() => import('./pages/Lager'))
const Analyse = lazy(() => import('./pages/Analyse'))
const Grundausstattung = lazy(() => import('./pages/Grundausstattung'))
const Hilfe = lazy(() => import('./pages/Hilfe'))
const EinsatzDashboard = lazy(() => import('./pages/EinsatzDashboard'))
const Einsatzmittel = lazy(() => import('./pages/Einsatzmittel'))
const Einsatztraining = lazy(() => import('./pages/einsatz/Einsatztraining'))
const EinsatzMaterials = lazy(() => import('./pages/EinsatzMaterials'))
const Schulungen = lazy(() => import('./pages/Schulungen'))
const PortalUsers = lazy(() => import('./pages/PortalUsers'))
const Systemeinstellungen = lazy(() => import('./pages/Systemeinstellungen'))
const SystemeinstellungenFunktionskontakte = lazy(() => import('./pages/SystemeinstellungenFunktionskontakte'))
const SystemeinstellungenVerstaendigungen = lazy(() => import('./pages/SystemeinstellungenVerstaendigungen'))
const SystemeinstellungenEinsatzgruende = lazy(() => import('./pages/SystemeinstellungenEinsatzgruende'))
const SystemeinstellungenAblaufvorlagen = lazy(() => import('./pages/SystemeinstellungenAblaufvorlagen'))
const Ueberstunden = lazy(() => import('./pages/Ueberstunden'))
const Fleet = lazy(() => import('./pages/Fleet'))
const FleetVehicle = lazy(() => import('./pages/FleetVehicle'))
const FleetOpenItems = lazy(() => import('./pages/FleetOpenItems'))
const FleetMaengel = lazy(() => import('./pages/FleetMaengel'))
const FleetPflege = lazy(() => import('./pages/FleetPflege'))
const FleetWerkstatt = lazy(() => import('./pages/FleetWerkstatt'))
const FleetFristen = lazy(() => import('./pages/FleetFristen'))
const FleetDokumente = lazy(() => import('./pages/FleetDokumente'))
const ZentraleShell = lazy(() => import('./pages/zentrale/ZentraleShell'))
const ZentraleUebersicht = lazy(() => import('./pages/zentrale/ZentraleUebersicht'))
const ZentraleEinsaetze = lazy(() => import('./pages/zentrale/ZentraleEinsaetze'))
const ZentraleLagePage = lazy(() => import('./pages/zentrale/ZentraleLagePage'))
const ZentraleAvBv = lazy(() => import('./pages/zentrale/ZentraleAvBv'))
const StammdatenUebersicht = lazy(() => import('./pages/stammdaten/StammdatenUebersicht'))
const StammdatenPersonen = lazy(() => import('./pages/stammdaten/StammdatenPersonen'))
const StammdatenObjekte = lazy(() => import('./pages/stammdaten/StammdatenObjekte'))
const StammdatenFahndungen = lazy(() => import('./pages/stammdaten/StammdatenFahndungen'))
const StammdatenBaustellen = lazy(() => import('./pages/stammdaten/StammdatenBaustellen'))
const StammdatenSchluessel = lazy(() => import('./pages/stammdaten/StammdatenSchluessel'))
const StammdatenKontakte = lazy(() => import('./pages/stammdaten/StammdatenKontakte'))
const StammdatenTelefonnummern = lazy(() => import('./pages/stammdaten/StammdatenTelefonnummern'))
const ZentraleAlarmierung = lazy(() => import('./pages/zentrale/ZentraleAlarmierung'))
const ZentraleUnterlagen = lazy(() => import('./pages/zentrale/ZentraleUnterlagen'))
const ZentraleStrassenzustand = lazy(() => import('./pages/zentrale/ZentraleStrassenzustand'))
const AussendienstShell = lazy(() => import('./pages/aussendienst/AussendienstShell'))
const AussendienstUebersicht = lazy(() => import('./pages/aussendienst/AussendienstUebersicht'))
const AussendienstEinsaetze = lazy(() => import('./pages/aussendienst/AussendienstEinsaetze'))
const KontrollauftraegePage = lazy(() => import('./pages/aussendienst/KontrollauftraegePage'))
const AussendienstHinweise = lazy(() => import('./pages/aussendienst/AussendienstHinweise'))
const AussendienstFahrzeug = lazy(() => import('./pages/aussendienst/AussendienstFahrzeug'))
const AussendienstKontrollbehelfe = lazy(() => import('./pages/aussendienst/AussendienstKontrollbehelfe'))
const AussendienstSchutzmassnahmen = lazy(() => import('./pages/aussendienst/AussendienstSchutzmassnahmen'))
const InnendienstShell = lazy(() => import('./pages/innendienst/InnendienstShell'))
const InnendienstUebersicht = lazy(() => import('./pages/innendienst/InnendienstUebersicht'))
const InnendienstBescheide = lazy(() => import('./pages/innendienst/InnendienstBescheide'))
const InnendienstUebergabePage = lazy(() => import('./pages/innendienst/InnendienstUebergabePage'))
const InnendienstGebuehrenPage = lazy(() => import('./pages/innendienst/InnendienstGebuehrenPage'))
const InnendienstUnterlagen = lazy(() => import('./pages/innendienst/InnendienstUnterlagen'))
const RsaRsb = lazy(() => import('./pages/RsaRsb'))

const PageSpinner = () => (
  <div className="flex justify-center py-16">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" />
  </div>
)

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Portal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/benutzer"
            element={
              <ProtectedRoute genehmigerOnly>
                <PortalUsers />
              </ProtectedRoute>
            }
          />
          <Route path="/portal/systemeinstellungen" element={<ProtectedRoute adminOnly><PortalChrome wide><Systemeinstellungen /></PortalChrome></ProtectedRoute>} />
          <Route path="/portal/systemeinstellungen/funktionskontakte" element={<ProtectedRoute adminOnly><PortalChrome wide><SystemeinstellungenFunktionskontakte /></PortalChrome></ProtectedRoute>} />
          <Route path="/portal/systemeinstellungen/verstaendigungen" element={<ProtectedRoute adminOnly><PortalChrome wide><SystemeinstellungenVerstaendigungen /></PortalChrome></ProtectedRoute>} />
          <Route path="/portal/systemeinstellungen/einsatzgruende" element={<ProtectedRoute adminOnly><PortalChrome wide><SystemeinstellungenEinsatzgruende /></PortalChrome></ProtectedRoute>} />
          <Route path="/portal/systemeinstellungen/ablaufvorlagen" element={<ProtectedRoute adminOnly><PortalChrome wide><SystemeinstellungenAblaufvorlagen /></PortalChrome></ProtectedRoute>} />
          <Route path="/portal/systemeinstellungen/kontakte" element={<ProtectedRoute adminOnly><PortalChrome wide><StammdatenKontakte context={{ areaLabel: 'Systemeinstellungen', backTo: '/portal/systemeinstellungen', backLabel: 'Zu Systemeinstellungen', allowManage: true }} /></PortalChrome></ProtectedRoute>} />
          <Route path="/portal/systemeinstellungen/telefonnummern" element={<ProtectedRoute adminOnly><PortalChrome wide><StammdatenTelefonnummern context={{ areaLabel: 'Systemeinstellungen', backTo: '/portal/systemeinstellungen', backLabel: 'Zu Systemeinstellungen', allowManage: true }} /></PortalChrome></ProtectedRoute>} />
          <Route
            path="/einsatz"
            element={
              <ProtectedRoute>
                <EinsatzLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<EinsatzDashboard />} />
            <Route path="einsatzmittel" element={<Einsatzmittel />} />
            <Route path="training" element={<Einsatztraining />} />
            <Route path="unterlagen" element={<EinsatzMaterials />} />
          </Route>
          <Route path="/benutzer" element={<Navigate to="/portal/benutzer" replace />} />
          <Route path="/zentrale/rsa-rsb" element={<Navigate to="/rsa-rsb" replace />} />
          <Route
            element={
              <ProtectedRoute>
                <ZentraleLayout />
              </ProtectedRoute>
            }
          >
            <Route element={<ZentraleShell />}>
              <Route path="/zentrale" element={<ZentraleUebersicht />} />
              <Route path="/zentrale/einsaetze" element={<ZentraleEinsaetze />} />
              <Route path="/zentrale/lage" element={<ZentraleLagePage />} />
            </Route>
            <Route path="/zentrale/av-bv-ev" element={<ZentraleAvBv />} />
            <Route path="/zentrale/kontrollauftraege" element={<KontrollauftraegePage />} />
            <Route path="/zentrale/alarmierung" element={<ZentraleAlarmierung />} />
            <Route path="/zentrale/unterlagen" element={<ZentraleUnterlagen />} />
            <Route path="/zentrale/strassenzustand" element={<ZentraleStrassenzustand />} />
            <Route path="/zentrale/kontakte" element={<StammdatenKontakte context={{ areaLabel: 'Zentrale', backTo: '/zentrale', backLabel: 'Zur Zentrale' }} />} />
          </Route>
          <Route path="/zentrale/schluessel" element={<Navigate to="/stammdaten/schluessel" replace />} />
          <Route path="/zentrale/personen" element={<Navigate to="/stammdaten/personen" replace />} />
          <Route path="/zentrale/objekte" element={<Navigate to="/stammdaten/objekte" replace />} />
          <Route path="/zentrale/fahndungen" element={<Navigate to="/stammdaten/fahndungen" replace />} />
          <Route path="/zentrale/baustellen" element={<Navigate to="/stammdaten/baustellen" replace />} />
          <Route
            element={
              <ProtectedRoute>
                <StammdatenLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/stammdaten" element={<StammdatenUebersicht />} />
            <Route path="/stammdaten/schluessel" element={<StammdatenSchluessel />} />
            <Route path="/stammdaten/kontakte" element={<StammdatenKontakte />} />
            <Route path="/stammdaten/telefonnummern" element={<StammdatenTelefonnummern />} />
            <Route path="/stammdaten/personen" element={<StammdatenPersonen />} />
            <Route path="/stammdaten/objekte" element={<StammdatenObjekte />} />
            <Route path="/stammdaten/fahndungen" element={<StammdatenFahndungen />} />
            <Route path="/stammdaten/baustellen" element={<StammdatenBaustellen />} />
          </Route>
          <Route
            element={
              <ProtectedRoute>
                <AussendienstLayout />
              </ProtectedRoute>
            }
          >
            <Route element={<AussendienstShell />}>
              <Route path="/aussendienst" element={<AussendienstUebersicht />} />
              <Route path="/aussendienst/einsaetze" element={<AussendienstEinsaetze />} />
              <Route path="/aussendienst/kontrollauftraege" element={<KontrollauftraegePage />} />
              <Route path="/aussendienst/rsa-rsb" element={<RsaRsb />} />
              <Route path="/aussendienst/hinweise" element={<AussendienstHinweise />} />
              <Route path="/aussendienst/fahrzeug" element={<AussendienstFahrzeug />} />
              <Route path="/aussendienst/kontrollbehelfe" element={<AussendienstKontrollbehelfe />} />
              <Route path="/aussendienst/schutzmassnahmen" element={<AussendienstSchutzmassnahmen />} />
            </Route>
            <Route path="/aussendienst/personen" element={<StammdatenPersonen context={{ areaLabel: 'Außendienst', backTo: '/aussendienst', backLabel: 'Zum Außendienst' }} />} />
          </Route>
          <Route
            element={
              <ProtectedRoute>
                <InnendienstLayout />
              </ProtectedRoute>
            }
          >
            <Route element={<InnendienstShell />}>
              <Route path="/innendienst" element={<InnendienstUebersicht />} />
              <Route path="/innendienst/bescheide" element={<InnendienstBescheide />} />
              <Route path="/innendienst/uebergabe" element={<InnendienstUebergabePage />} />
              <Route path="/innendienst/gebuehren" element={<InnendienstGebuehrenPage />} />
              <Route path="/innendienst/unterlagen" element={<InnendienstUnterlagen />} />
            </Route>
            <Route path="/innendienst/telefonnummern" element={<StammdatenTelefonnummern context={{ areaLabel: 'Innendienst', backTo: '/innendienst', backLabel: 'Zum Innendienst' }} />} />
          </Route>
          <Route
            element={
              <ProtectedRoute>
                <RsaRsbLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/rsa-rsb" element={<RsaRsb />} />
          </Route>
          <Route path="/planung/zentrale" element={<Navigate to="/zentrale" replace />} />
          <Route path="/planung/innendienst" element={<Navigate to="/innendienst" replace />} />
          <Route path="/planung/aussendienst" element={<Navigate to="/aussendienst" replace />} />
          <Route
            element={
              <ProtectedRoute>
                <SchulungenLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/schulungen" element={<Schulungen />} />
          </Route>
          <Route path="/planung/schulungen" element={<Navigate to="/schulungen" replace />} />
          <Route
            element={
              <ProtectedRoute>
                <FuhrparkLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/fuhrpark" element={<Fleet />} />
            <Route path="/fuhrpark/offen" element={<FleetOpenItems />} />
            <Route path="/fuhrpark/maengel" element={<FleetMaengel />} />
            <Route path="/fuhrpark/pflege" element={<FleetPflege />} />
            <Route path="/fuhrpark/werkstatt" element={<FleetWerkstatt />} />
            <Route path="/fuhrpark/fristen" element={<FleetFristen />} />
            <Route path="/fuhrpark/dokumente" element={<FleetDokumente />} />
            <Route path="/fuhrpark/:vehicleId" element={<FleetVehicle />} />
          </Route>
          <Route path="/planung/fuhrpark" element={<Navigate to="/fuhrpark" replace />} />
          <Route path="/planung/fuhrpark/:vehicleId" element={<Navigate to="/fuhrpark" replace />} />
          <Route path="/ueberstunden" element={<ProtectedRoute><Ueberstunden /></ProtectedRoute>} />
          <Route path="/planung/ueberstunden" element={<Navigate to="/ueberstunden" replace />} />
          <Route
            path="/profil"
            element={
              <ProtectedRoute>
                <PortalChrome>
                  <UserProfile />
                </PortalChrome>
              </ProtectedRoute>
            }
          />
          <Route
            path="/hilfe"
            element={
              <ProtectedRoute>
                <PortalChrome wide>
                  <Hilfe />
                </PortalChrome>
              </ProtectedRoute>
            }
          />
          <Route
            path="/auditlog"
            element={
              <ProtectedRoute adminOnly>
                <PortalChrome wide>
                  <AuditLog />
                </PortalChrome>
              </ProtectedRoute>
            }
          />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* Alle Rollen — Bekleidung */}
            <Route path="dashboard" element={<Dashboard />} />

            {/* Benutzer */}
            <Route path="warenkorb" element={<Shop />} />
            <Route path="meine-bestellungen" element={<MyOrders />} />

            {/* Sachbearbeiter */}
            <Route path="bestellungen" element={<ProtectedRoute sachbearbeiterOnly><Orders /></ProtectedRoute>} />
            <Route path="produkte" element={<ProtectedRoute sachbearbeiterOnly><Products /></ProtectedRoute>} />
            <Route path="quartale" element={<ProtectedRoute sachbearbeiterOnly><Quarters /></ProtectedRoute>} />
            <Route path="lager" element={<ProtectedRoute sachbearbeiterOnly><Lager /></ProtectedRoute>} />
            <Route path="analyse" element={<ProtectedRoute staffOnly><Analyse /></ProtectedRoute>} />
            <Route path="grundausstattung" element={<ProtectedRoute sachbearbeiterOnly><Grundausstattung /></ProtectedRoute>} />
          </Route>
          <Route
            element={
              <ProtectedRoute>
                <GenehmigerLayout />
              </ProtectedRoute>
            }
          >
            {/* Portalweite Genehmiger-Werkzeuge, unabhängig vom Bekleidung-Layout
                (siehe GenehmigerLayout.tsx) - "Freigaben" bündelt offene Fälle aus
                allen Bereichen, nicht nur Bekleidung. */}
            <Route path="/genehmigungen" element={<ProtectedRoute genehmigerOnly><Approvals /></ProtectedRoute>} />
            <Route path="/schuherstattungen" element={<ProtectedRoute genehmigerOnly><ShoeRefunds /></ProtectedRoute>} />
            <Route path="/budgets" element={<ProtectedRoute genehmigerOnly><Budgets /></ProtectedRoute>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  )
}
