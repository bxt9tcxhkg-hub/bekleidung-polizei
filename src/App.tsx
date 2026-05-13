import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Shop from './pages/Shop'
import MyOrders from './pages/MyOrders'
import UserProfile from './pages/UserProfile'
import Products from './pages/Products'
import Orders from './pages/Orders'
import Quarters from './pages/Quarters'
import ShoeRefunds from './pages/ShoeRefunds'
import Users from './pages/Users'
import AuditLog from './pages/AuditLog'
import Approvals from './pages/Approvals'
import Budgets from './pages/Budgets'
import Lager from './pages/Lager'
import Analyse from './pages/Analyse'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* Alle Rollen */}
            <Route index element={<Dashboard />} />

            {/* Benutzer */}
            <Route path="warenkorb" element={<Shop />} />
            <Route path="meine-bestellungen" element={<MyOrders />} />
            <Route path="profil" element={<UserProfile />} />

            {/* Genehmiger */}
            <Route path="genehmigungen" element={<ProtectedRoute genehmigerOnly><Approvals /></ProtectedRoute>} />
            <Route path="schuherstattungen" element={<ProtectedRoute genehmigerOnly><ShoeRefunds /></ProtectedRoute>} />
            <Route path="budgets" element={<ProtectedRoute genehmigerOnly><Budgets /></ProtectedRoute>} />

            {/* Sachbearbeiter */}
            <Route path="bestellungen" element={<ProtectedRoute sachbearbeiterOnly><Orders /></ProtectedRoute>} />
            <Route path="produkte" element={<ProtectedRoute sachbearbeiterOnly><Products /></ProtectedRoute>} />
            <Route path="quartale" element={<ProtectedRoute sachbearbeiterOnly><Quarters /></ProtectedRoute>} />
            <Route path="benutzer" element={<ProtectedRoute sachbearbeiterOnly><Users /></ProtectedRoute>} />
            <Route path="auditlog" element={<ProtectedRoute sachbearbeiterOnly><AuditLog /></ProtectedRoute>} />
            <Route path="lager" element={<ProtectedRoute sachbearbeiterOnly><Lager /></ProtectedRoute>} />
            <Route path="analyse" element={<ProtectedRoute staffOnly><Analyse /></ProtectedRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
