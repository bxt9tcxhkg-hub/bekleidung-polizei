import type { Product } from '../../lib/types'

export type ProductFormData = Omit<Product, 'id' | 'created_at'>
export type OrgFilter = 'all' | 'Stadtpolizei' | 'Parkaufsicht'
export type ConfirmDelete =
  | { mode: 'single'; product: Product }
  | { mode: 'all' }

export const SIZES_COMMON = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '44', '46', '48', '50', '52', '54', '56']
export const CATEGORIES_BY_ORG: Record<string, string[]> = {
  Stadtpolizei: ['Einsatzuniform', 'Repräsentationsuniform', 'Kopfbedeckung', 'Schuhe & Stiefel', 'Accessoires', 'Motorrad'],
  Parkaufsicht: ['Einsatzuniform', 'Kopfbedeckung', 'Schuhe & Stiefel', 'Accessoires'],
}

export const SUB_CATEGORIES_BY_ORG: Record<string, Record<string, string[]>> = {
  Stadtpolizei: {
    Einsatzuniform: ['Jacken', 'Hosen', 'Hemden & Blusen', 'Funktionshemden', 'Strickware', 'Unterbekleidung'],
    Repräsentationsuniform: ['Jacken & Mäntel', 'Hosen & Röcke', 'Hemden & Blusen'],
    Kopfbedeckung: ['Kappen & Baretts', 'Zubehör'],
    'Schuhe & Stiefel': ['Schuhe', 'Stiefel', 'Zubehör'],
    Accessoires: ['Handschuhe', 'Socken', 'Gürtel & Krawatten', 'Sonstiges'],
    Motorrad: ['Funktionshemden'],
  },
  Parkaufsicht: {
    Einsatzuniform: ['Jacken', 'Hosen', 'Hemden & Blusen', 'Strickware'],
    Kopfbedeckung: ['Kappen & Baretts', 'Zubehör'],
    'Schuhe & Stiefel': ['Schuhe', 'Stiefel'],
    Accessoires: ['Handschuhe', 'Socken', 'Gürtel & Krawatten', 'Sonstiges'],
  },
}

export const GENDER_LABELS: Record<string, string> = { male: 'Herren (HR)', female: 'Damen (DA)', unisex: 'Unisex' }

export const BEZUGSART_LABELS: Record<string, string> = { massa: 'Massa', eigenbeschaffung: 'Eigenbeschaffung' }
export const SIZE_MODE_LABELS: Record<string, string> = { sizes: 'Größen', universal: 'Universalgröße', none: 'Keine Größenangabe' }

export const emptyProduct = (): ProductFormData => ({
  article_number: '',
  name: '',
  category: CATEGORIES_BY_ORG['Stadtpolizei'][0],
  sub_category: null,
  gender: 'unisex',
  sizes: [],
  price: 0,
  needs_tailoring: false,
  size_guide: null,
  organisation: 'Stadtpolizei',
  active: true,
  min_quantity: 0,
  bezugsart: 'massa',
  size_mode: 'sizes',
})
