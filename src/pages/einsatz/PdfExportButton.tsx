import { FileText } from 'lucide-react'

export default function PdfExportButton({
  onClick,
  disabled,
  label = 'Als PDF exportieren',
}: {
  onClick: () => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 border border-green-700 text-green-800 bg-white hover:bg-green-50 disabled:opacity-50 text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors flex-shrink-0"
    >
      <FileText className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">PDF</span>
    </button>
  )
}
