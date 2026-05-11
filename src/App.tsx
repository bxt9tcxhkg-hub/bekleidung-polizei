import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Orders from './pages/Orders'
import Quarters from './pages/Quarters'
import TailorJobs from './pages/TailorJobs'
import ShoeRefunds from './pages/ShoeRefunds'
import Users from './pages/Users'
import AuditLog from './pages/AuditLog'

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
            <Route index element={<Dashboard />} />
            <Route path="bestellungen" element={<Orders />} />
            <Route path="produkte" element={<Products />} />
            <Route path="quartale" element={<ProtectedRoute adminOnly><Quarters /></ProtectedRoute>} />
            <Route path="schneiderjobs" element={<ProtectedRoute adminOnly><TailorJobs /></ProtectedRoute>} />
            <Route path="schuherstattungen" element={<ShoeRefunds />} />
            <Route path="benutzer" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
            <Route path="auditlog" element={<ProtectedRoute adminOnly><AuditLog /></ProtectedRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
