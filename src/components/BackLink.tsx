import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

// Auffälliger "Zurück"-Link (Pillenform statt reinem Textlink) - einheitlich
// für alle "Zu X"/"Zum Portal"-Rücksprünge im Portal, siehe z. B.
// StammdatenUebersicht.tsx oder GenehmigungenBereichHeader.tsx. Nimmt entweder
// `to` (Navigation) oder `onClick` (z. B. Zustand zurücksetzen wie in
// TrainingProtokoll.tsx) - Optik ist in beiden Fällen identisch.
type BackLinkProps = {
  label: string
  className?: string
} & ({ to: string; onClick?: never } | { to?: never; onClick: () => void })

export default function BackLink({ to, onClick, label, className = '' }: BackLinkProps) {
  const classes = `inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-100 hover:border-blue-300 transition-colors ${className}`.trim()

  if (to) {
    return (
      <Link to={to} className={classes}>
        <ArrowLeft className="w-4 h-4" /> {label}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      <ArrowLeft className="w-4 h-4" /> {label}
    </button>
  )
}
