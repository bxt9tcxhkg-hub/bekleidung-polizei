import type { ZentraleEntry, ZentraleEntryPriority, ZentraleEntryStatus } from './types'

// Reine Hilfswerte/-funktionen für die generischen zentrale_entries-Kategorien,
// getrennt von den Komponenten in ../components/ZentraleEntryEditor.tsx
// (react-refresh erlaubt in einer Komponentendatei keine Objekt-/Funktions-Exports).
export const STATUS_LABEL: Record<ZentraleEntryStatus, string> = { offen: 'Offen', in_bearbeitung: 'In Bearbeitung', erledigt: 'Erledigt' }
export const PRIORITY_LABEL: Record<ZentraleEntryPriority, string> = { normal: 'Normal', hoch: 'Hoch', kritisch: 'Kritisch' }

export interface EntryFormState {
  title: string
  description: string
  priority: ZentraleEntryPriority
  status: ZentraleEntryStatus
  validFrom: string
  validUntil: string
  location: string
  responsible: string
  reference: string
  restricted: boolean
}
export const EMPTY_ENTRY_FORM: EntryFormState = { title: '', description: '', priority: 'normal', status: 'offen', validFrom: '', validUntil: '', location: '', responsible: '', reference: '', restricted: false }

function dateValue(value: string | null) { return value ? value.slice(0, 10) : '' }
export function entryToForm(item: ZentraleEntry): EntryFormState {
  return { title: item.title, description: item.description ?? '', priority: item.priority, status: item.status, validFrom: dateValue(item.valid_from), validUntil: dateValue(item.valid_until), location: item.location ?? '', responsible: item.responsible ?? '', reference: item.reference ?? '', restricted: item.restricted }
}
