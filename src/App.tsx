import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import EinsatzLayout from './components/EinsatzLayout'
import ZentraleLayout from './components/ZentraleLayout'
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
const ZentraleBaustellenPage = lazy(() => import('./pages/zentrale/ZentraleBaustellenPage'))
const ZentraleAvBv = lazy(() => import('./pages/zentrale/ZentraleAvBv'))
const ZentralePersonenhinweise = lazy(() => import('./pages/zentrale/ZentralePersonenhinweise'))
const ZentralePersonen = lazy(() => import('./pages/zentrale/ZentralePersonen'))
const ZentraleObjekte = lazy(() => import('./pages/zentrale/ZentraleObjekte'))
const ZentraleFahndungen = lazy(() => import('./pages/zentrale/ZentraleFahndungen'))
const ZentraleSchluessel = lazy(() => import('./pages/zentrale/ZentraleSchluessel'))
const ZentraleKontakte = lazy(() => import('./pages/zentrale/ZentraleKontakte'))
const ZentraleAlarmierung = lazy(() => import('./pages/zentrale/ZentraleAlarmierung'))
const ZentraleUnterlagen = lazy(() => import('./pages/zentrale/ZentraleUnterlagen'))
const ZentraleStrassenzustand = lazy(() => import('./pages/zentrale/ZentraleStrassenzustand'))
const AussendienstShell = lazy(() => import('./pages/aussendienst/AussendienstShell'))
const AussendienstUebersicht = lazy(() => import('./pages/aussendienst/AussendienstUebersicht'))
const AussendienstEinsaetze = lazy(() => import('./pages/aussendienst/AussendienstEinsaetze'))
const AussendienstKontrollauftraege = lazy(() => import('./pages/aussendienst/AussendienstKontrollauftraege'))
const AussendienstHinweise = lazy(() => import('./pages/aussendienst/AussendienstHinweise'))
const AussendienstFahrzeug = lazy(() => import('./pages/aussendienst/AussendienstFahrzeug'))
const InnendienstShell = lazy(() => import('./pages/innendienst/InnendienstShell'))
const InnendienstUebersicht = lazy(() => import('./pages/innendienst/InnendienstUebersicht'))
const InnendienstBescheide = lazy(() => import('./pages/innendienst/InnendienstBescheide'))
const InnendienstUebergabePage = lazy(() => import('./pages/innendienst/InnendienstUebergabePage'))
const InnendienstGebuehrenPage = lazy(() => import('./pages/innendienst/InnendienstGebuehrenPage'))
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
              <Route path="/zentrale/baustellen" element={<ZentraleBaustellenPage />} />
            </Route>
            <Route path="/zentrale/av-bv-ev" element={<ZentraleAvBv />} />
            <Route path="/zentrale/personenhinweise" element={<ZentralePersonenhinweise />} />
            <Route path="/zentrale/personen" element={<ZentralePersonen />} />
            <Route path="/zentrale/objekte" element={<ZentraleObjekte />} />
            <Route path="/zentrale/fahndungen" element={<ZentraleFahndungen />} />
            <Route path="/zentrale/schluessel" element={<ZentraleSchluessel />} />
            <Route path="/zentrale/kontakte" element={<ZentraleKontakte />} />
            <Route path="/zentrale/alarmierung" element={<ZentraleAlarmierung />} />
            <Route path="/zentrale/unterlagen" element={<ZentraleUnterlagen />} />
            <Route path="/zentrale/strassenzustand" element={<ZentraleStrassenzustand />} />
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
              <Route path="/aussendienst/kontrollauftraege" element={<AussendienstKontrollauftraege />} />
              <Route path="/aussendienst/hinweise" element={<AussendienstHinweise />} />
              <Route path="/aussendienst/fahrzeug" element={<AussendienstFahrzeug />} />
            </Route>
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
            </Route>
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

            {/* Genehmiger */}
            <Route path="genehmigungen" element={<ProtectedRoute genehmigerOnly><Approvals /></ProtectedRoute>} />
            <Route path="schuherstattungen" element={<ProtectedRoute genehmigerOnly><ShoeRefunds /></ProtectedRoute>} />
            <Route path="budgets" element={<ProtectedRoute genehmigerOnly><Budgets /></ProtectedRoute>} />

            {/* Sachbearbeiter */}
            <Route path="bestellungen" element={<ProtectedRoute sachbearbeiterOnly><Orders /></ProtectedRoute>} />
            <Route path="produkte" element={<ProtectedRoute sachbearbeiterOnly><Products /></ProtectedRoute>} />
            <Route path="quartale" element={<ProtectedRoute sachbearbeiterOnly><Quarters /></ProtectedRoute>} />
            <Route path="lager" element={<ProtectedRoute sachbearbeiterOnly><Lager /></ProtectedRoute>} />
            <Route path="analyse" element={<ProtectedRoute staffOnly><Analyse /></ProtectedRoute>} />
            <Route path="grundausstattung" element={<ProtectedRoute sachbearbeiterOnly><Grundausstattung /></ProtectedRoute>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  )
}
