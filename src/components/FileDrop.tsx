import { useState, type ReactNode } from 'react'

export default function FileDrop({
  onFiles,
  accept,
  disabled,
  hint = 'Datei hierher ziehen oder tippen',
  children,
}: {
  onFiles: (files: FileList | File[]) => void
  accept?: string
  disabled?: boolean
  hint?: string
  children?: ReactNode
}) {
  const [over, setOver] = useState(false)

  function take(list: FileList | null) {
    if (!list || list.length === 0 || disabled) return
    onFiles(list)
  }

  return (
    <label
      className={`block rounded-xl border-2 border-dashed px-3 py-6 text-center cursor-pointer ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      } ${over ? 'border-blue-600 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}
      onDragEnter={event => { event.preventDefault(); if (!disabled) setOver(true) }}
      onDragOver={event => { event.preventDefault(); if (!disabled) setOver(true) }}
      onDragLeave={event => { event.preventDefault(); setOver(false) }}
      onDrop={event => {
        event.preventDefault()
        setOver(false)
        take(event.dataTransfer.files)
      }}
    >
      <p className="text-sm text-gray-700">{hint}</p>
      <p className="text-xs text-gray-500 mt-1">Ziehen oder Datei wählen. Kein Ordner nötig.</p>
      {children}
      <input
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={event => {
          take(event.target.files)
          event.target.value = ''
        }}
      />
    </label>
  )
}
