import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
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
const Einsatz = lazy(() => import('./pages/Einsatz'))
const PortalUsers = lazy(() => import('./pages/PortalUsers'))

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
                <Einsatz />
              </ProtectedRoute>
            }
          />
          <Route path="/benutzer" element={<Navigate to="/portal/benutzer" replace />} />
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
            <Route path="profil" element={<UserProfile />} />
            <Route path="hilfe" element={<Hilfe />} />

            {/* Genehmiger */}
            <Route path="genehmigungen" element={<ProtectedRoute genehmigerOnly><Approvals /></ProtectedRoute>} />
            <Route path="schuherstattungen" element={<ProtectedRoute genehmigerOnly><ShoeRefunds /></ProtectedRoute>} />
            <Route path="budgets" element={<ProtectedRoute genehmigerOnly><Budgets /></ProtectedRoute>} />

            {/* Sachbearbeiter */}
            <Route path="bestellungen" element={<ProtectedRoute sachbearbeiterOnly><Orders /></ProtectedRoute>} />
            <Route path="produkte" element={<ProtectedRoute sachbearbeiterOnly><Products /></ProtectedRoute>} />
            <Route path="quartale" element={<ProtectedRoute sachbearbeiterOnly><Quarters /></ProtectedRoute>} />
            <Route path="auditlog" element={<ProtectedRoute sachbearbeiterOnly><AuditLog /></ProtectedRoute>} />
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
