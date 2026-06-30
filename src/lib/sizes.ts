export interface SizeGroup {
  label: string
  sizes: string[]
}

const NAMED_SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL']

// Prefix format: N44, U22, S88 — letter before the number
const PREFIX_RE = /^[UNS]\d/
// Suffix format: 44N, 22U, 88S — letter after the number
const SUFFIX_RE = /\d[UNS]$/

function extractNum(s: string): number {
  const n = parseFloat(s.replace(/^[A-Za-z]+/, '').replace(/[A-Za-z]+$/, ''))
  return isNaN(n) ? Infinity : n
}

function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const aNum = extractNum(a)
    const bNum = extractNum(b)
    if (isFinite(aNum) && isFinite(bNum)) return aNum - bNum
    const aIdx = NAMED_SIZE_ORDER.indexOf(a.toUpperCase())
    const bIdx = NAMED_SIZE_ORDER.indexOf(b.toUpperCase())
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
    return a.localeCompare(b)
  })
}

export function groupSizes(sizes: string[]): SizeGroup[] | null {
  const hasPrefix = sizes.some(s => PREFIX_RE.test(s))
  const hasSuffix = sizes.some(s => SUFFIX_RE.test(s))
  if (!hasPrefix && !hasSuffix) return null

  let groups: SizeGroup[]
  if (hasPrefix) {
    groups = [
      { label: 'Untersetzt', sizes: sortSizes(sizes.filter(s => /^U\d/.test(s))) },
      { label: 'Normal',     sizes: sortSizes(sizes.filter(s => /^N\d/.test(s) || !PREFIX_RE.test(s))) },
      { label: 'Schlank',    sizes: sortSizes(sizes.filter(s => /^S\d/.test(s))) },
    ]
  } else {
    groups = [
      { label: 'Untersetzt', sizes: sortSizes(sizes.filter(s => s.endsWith('U'))) },
      { label: 'Normal',     sizes: sortSizes(sizes.filter(s => s.endsWith('N') || !SUFFIX_RE.test(s))) },
      { label: 'Schlank',    sizes: sortSizes(sizes.filter(s => s.endsWith('S'))) },
    ]
  }
  return groups.filter(g => g.sizes.length > 0)
}

export function sortedSizes(sizes: string[]): string[] {
  return sortSizes(sizes)
}

export function sizeLabel(s: string, grouped: boolean): string {
  if (!grouped) return s
  if (SUFFIX_RE.test(s)) return s.replace(/[UNS]$/, '')
  if (PREFIX_RE.test(s)) return s.slice(1)
  return s
}
