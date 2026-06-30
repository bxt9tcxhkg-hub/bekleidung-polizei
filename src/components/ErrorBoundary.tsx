import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4 text-center">
          <AlertTriangle className="w-16 h-16 text-red-300 mb-4" />
          <h1 className="text-xl font-bold text-gray-800 mb-2">Ein Fehler ist aufgetreten</h1>
          <p className="text-gray-500 text-sm mb-6 max-w-sm">{this.state.message}</p>
          <button onClick={() => window.location.reload()}
            className="bg-blue-800 hover:bg-blue-900 text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm">
            Seite neu laden
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
