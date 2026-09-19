export interface SizeGroup {
  label: string
  sizes: string[]
}

/** Fixer Größenwert für Artikel ohne echte Größenauswahl (z. B. Schuhbänder). */
export const UNIVERSAL_SIZE = 'Uni'

/** Ob für diesen Größenmodus überhaupt eine Größe angezeigt/abgefragt werden soll. */
export function hasSizeChoice(sizeMode: 'sizes' | 'universal' | 'none'): boolean {
  return sizeMode === 'sizes'
}

/** `sizes`-Array passend zum gewählten Größenmodus (für Formular/Import). */
export function sizesForMode(sizeMode: 'sizes' | 'universal' | 'none', currentSizes: string[]): string[] {
  if (sizeMode === 'universal') return [UNIVERSAL_SIZE]
  if (sizeMode === 'none') return []
  return currentSizes
}

const NAMED_SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL']

// U/N/S prefix: Untersetzt / Normal / Schlank (male trousers)
const UNS_RE = /^[UNS]\d/
// K/L prefix: Kurz / Lang (female trousers — N is shared with UNS)
const KL_RE = /^[KL]\d/
// Suffix U/N/S
const SUFFIX_RE = /\d[UNS]$/
// Jacket: 44I or 44II (Länge I / Länge II, nicht Weite)
const JACKET_RE = /^\d+I{1,2}$/

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
  // Jacket format: 44I / 44II → Länge I / Länge II
  if (sizes.some(s => JACKET_RE.test(s))) {
    return [
      { label: 'Länge I',  sizes: sortSizes(sizes.filter(s => /^\d+I$/.test(s))) },
      { label: 'Länge II', sizes: sortSizes(sizes.filter(s => /^\d+II$/.test(s))) },
    ].filter(g => g.sizes.length > 0)
  }

  // U/S prefix present → Untersetzt / Normal / Schlank
  if (sizes.some(s => /^[US]\d/.test(s))) {
    return [
      { label: 'Untersetzt', sizes: sortSizes(sizes.filter(s => /^U\d/.test(s))) },
      { label: 'Normal',     sizes: sortSizes(sizes.filter(s => /^N\d/.test(s) || !UNS_RE.test(s))) },
      { label: 'Schlank',    sizes: sortSizes(sizes.filter(s => /^S\d/.test(s))) },
    ].filter(g => g.sizes.length > 0)
  }

  // K/L prefix present → Kurz / Normal / Lang (female trousers)
  if (sizes.some(s => KL_RE.test(s))) {
    return [
      { label: 'Kurz',   sizes: sortSizes(sizes.filter(s => /^K\d/.test(s))) },
      { label: 'Normal', sizes: sortSizes(sizes.filter(s => /^N\d/.test(s))) },
      { label: 'Lang',   sizes: sortSizes(sizes.filter(s => /^L\d/.test(s))) },
    ].filter(g => g.sizes.length > 0)
  }

  // Suffix U/N/S
  if (sizes.some(s => SUFFIX_RE.test(s))) {
    return [
      { label: 'Untersetzt', sizes: sortSizes(sizes.filter(s => s.endsWith('U'))) },
      { label: 'Normal',     sizes: sortSizes(sizes.filter(s => s.endsWith('N') || !SUFFIX_RE.test(s))) },
      { label: 'Schlank',    sizes: sortSizes(sizes.filter(s => s.endsWith('S'))) },
    ].filter(g => g.sizes.length > 0)
  }

  return null
}

export function sortedSizes(sizes: string[]): string[] {
  return sortSizes(sizes)
}

export function sizeLabel(s: string, grouped: boolean): string {
  if (!grouped) return s
  if (SUFFIX_RE.test(s)) return s.replace(/[UNS]$/, '')
  if (UNS_RE.test(s) || KL_RE.test(s)) return s.slice(1)
  if (JACKET_RE.test(s)) return s.replace(/I+$/, '')
  return s
}
