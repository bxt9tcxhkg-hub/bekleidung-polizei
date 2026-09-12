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
const PlannedArea = lazy(() => import('./pages/PlannedArea'))
const Fleet = lazy(() => import('./pages/Fleet'))
const FleetVehicle = lazy(() => import('./pages/FleetVehicle'))
const Zentrale = lazy(() => import('./pages/Zentrale'))
const Aussendienst = lazy(() => import('./pages/Aussendienst'))
const Innendienst = lazy(() => import('./pages/Innendienst'))
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
          <Route
            element={
              <ProtectedRoute>
                <ZentraleLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/zentrale" element={<Zentrale />} />
          </Route>
          <Route
            element={
              <ProtectedRoute>
                <AussendienstLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/aussendienst" element={<Aussendienst />} />
          </Route>
          <Route
            element={
              <ProtectedRoute>
                <InnendienstLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/innendienst" element={<Innendienst />} />
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
            path="/schulungen"
            element={
              <ProtectedRoute>
                <PortalChrome wide>
                  <Schulungen />
                </PortalChrome>
              </ProtectedRoute>
            }
          />
          <Route path="/planung/schulungen" element={<Navigate to="/schulungen" replace />} />
          <Route
            element={
              <ProtectedRoute>
                <FuhrparkLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/fuhrpark" element={<Fleet />} />
            <Route path="/fuhrpark/:vehicleId" element={<FleetVehicle />} />
          </Route>
          <Route path="/planung/fuhrpark" element={<Navigate to="/fuhrpark" replace />} />
          <Route path="/planung/fuhrpark/:vehicleId" element={<Navigate to="/fuhrpark" replace />} />
          <Route path="/planung/ueberstunden" element={<ProtectedRoute adminOnly><PlannedArea area="ueberstunden" /></ProtectedRoute>} />
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
