export interface SizeGroup {
  label: string
  sizes: string[]
}

export function groupSizes(sizes: string[]): SizeGroup[] | null {
  if (!sizes.some(s => /\d[UNS]$/.test(s))) return null
  const groups: SizeGroup[] = [
    { label: 'Untersetzt', sizes: sizes.filter(s => s.endsWith('U')) },
    { label: 'Normal',     sizes: sizes.filter(s => s.endsWith('N') || !/[UNS]$/.test(s)) },
    { label: 'Schlank',    sizes: sizes.filter(s => s.endsWith('S')) },
  ]
  return groups.filter(g => g.sizes.length > 0)
}

export function sizeLabel(s: string, grouped: boolean): string {
  return grouped ? s.replace(/[UNS]$/, '') : s
}
