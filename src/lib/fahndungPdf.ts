const PREFIX = 'PDF|'

export function encodeFahndungPdf(key: string, name: string) {
  return `${PREFIX}${key}|${name}`
}

export function decodeFahndungPdf(note: string | null): { key: string; name: string } | null {
  if (!note?.startsWith(PREFIX)) return null
  const rest = note.slice(PREFIX.length)
  const cut = rest.indexOf('|')
  if (cut <= 0) return null
  return { key: rest.slice(0, cut), name: rest.slice(cut + 1) }
}
