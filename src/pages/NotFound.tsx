import { useNavigate } from 'react-router-dom'
import { Home, AlertCircle } from 'lucide-react'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4 text-center">
      <AlertCircle className="w-16 h-16 text-gray-300 mb-4" />
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Seite nicht gefunden</h1>
      <p className="text-gray-500 mb-6">Die aufgerufene Seite existiert nicht.</p>
      <button onClick={() => navigate('/')}
        className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white font-medium px-5 py-2.5 rounded-xl transition-colors">
        <Home className="w-4 h-4" /> Zur Startseite
      </button>
    </div>
  )
}
