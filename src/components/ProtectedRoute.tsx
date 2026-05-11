import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  children: React.ReactNode
  adminOnly?: boolean
  sachbearbeiterOnly?: boolean
  genehmigerOnly?: boolean
}

export default function ProtectedRoute({ children, adminOnly = false, sachbearbeiterOnly = false, genehmigerOnly = false }: Props) {
  const { user, loading, isSachbearbeiter, isGenehmiger } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-800" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if ((adminOnly || sachbearbeiterOnly) && !isSachbearbeiter) return <Navigate to="/" replace />
  if (genehmigerOnly && !isGenehmiger) return <Navigate to="/" replace />

  return <>{children}</>
}
