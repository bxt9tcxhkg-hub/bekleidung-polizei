import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import AblaufvorlagenEinstellungen from '../components/AblaufvorlagenEinstellungen'

export default function SystemeinstellungenAblaufvorlagen() {
  return <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
    <Link to="/portal/systemeinstellungen" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4" /> Zu Systemeinstellungen</Link>
    <div className="mt-5">
      <h1 className="text-2xl font-bold text-gray-900">Ablaufvorlagen</h1>
      <p className="mt-2 text-sm text-gray-600">Maßnahmen und Entscheidungsfragen für neue Ereignisse zentral vorgeben.</p>
    </div>
    <div className="mt-6"><AblaufvorlagenEinstellungen /></div>
  </div>
}
