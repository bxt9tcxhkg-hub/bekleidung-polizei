export interface SizeGroup {
  label: string
  sizes: string[]
}

const NAMED_SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL']

function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const aNum = parseFloat(a.replace(/[A-Z]+$/i, ''))
    const bNum = parseFloat(b.replace(/[A-Z]+$/i, ''))
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum
    const aIdx = NAMED_SIZE_ORDER.indexOf(a.toUpperCase())
    const bIdx = NAMED_SIZE_ORDER.indexOf(b.toUpperCase())
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
    return a.localeCompare(b)
  })
}

export function groupSizes(sizes: string[]): SizeGroup[] | null {
  if (!sizes.some(s => /\d[UNS]$/.test(s))) return null
  const groups: SizeGroup[] = [
    { label: 'Untersetzt', sizes: sortSizes(sizes.filter(s => s.endsWith('U'))) },
    { label: 'Normal',     sizes: sortSizes(sizes.filter(s => s.endsWith('N') || !/[UNS]$/.test(s))) },
    { label: 'Schlank',    sizes: sortSizes(sizes.filter(s => s.endsWith('S'))) },
  ]
  return groups.filter(g => g.sizes.length > 0)
}

export function sortedSizes(sizes: string[]): string[] {
  return sortSizes(sizes)
}

export function sizeLabel(s: string, grouped: boolean): string {
  return grouped ? s.replace(/[UNS]$/, '') : s
}
