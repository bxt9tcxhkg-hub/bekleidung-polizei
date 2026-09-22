import { supabase } from './supabase'
import type { EinsatzDokumentRow } from './types'

export const DOK_ARTEN = ['ausweis', 'zmr', 'abfrage', 'sonstiges'] as const
export type DokArt = (typeof DOK_ARTEN)[number]

export const DOK_ART_LABEL: Record<DokArt, string> = {
  ausweis: 'Ausweis / Lichtbild',
  zmr: 'ZMR-Auszug',
  abfrage: 'Abfrage / Register',
  sonstiges: 'Sonstiges',
}

export interface EinsatzDokument {
  id: string
  incidentId: string
  art: DokArt
  title: string
  fileKey: string
  fileName: string
  from: 'zentrale' | 'streife'
  at: string
}

function storageKey(incidentId: string) {
  return `einsatz-dokumente:${incidentId}`
}

function fromRow(row: EinsatzDokumentRow): EinsatzDokument {
  return {
    id: row.id,
    incidentId: row.incident_id,
    art: row.art,
    title: row.title,
    fileKey: row.file_key,
    fileName: row.file_name,
    from: row.source,
    at: row.created_at,
  }
}

function readLegacyDokumente(incidentId: string): EinsatzDokument[] {
  try {
    const raw = localStorage.getItem(storageKey(incidentId))
    if (!raw) return []
    return JSON.parse(raw) as EinsatzDokument[]
  } catch {
    return []
  }
}

function clearLegacyDokumente(incidentId: string) {
  try { localStorage.removeItem(storageKey(incidentId)) } catch { /* ignore */ }
}

/**
 * Übernimmt einmalig alte Metadaten, die vor der serverseitigen Umstellung
 * nur im Browser-localStorage lagen. Der eigentliche Dateiinhalt war bereits
 * zentral gespeichert; nur die Zuordnung wird nachgezogen.
 */
export async function migrateLegacyDokumente(incidentId: string, userId: string): Promise<void> {
  const legacy = readLegacyDokumente(incidentId)
  if (legacy.length === 0) return

  const rows = legacy.map(doc => ({
    id: doc.id || crypto.randomUUID(),
    incident_id: incidentId,
    art: doc.art,
    title: doc.title || DOK_ART_LABEL[doc.art],
    file_key: doc.fileKey,
    file_name: doc.fileName,
    source: doc.from,
    uploaded_by: userId,
    created_at: doc.at || new Date().toISOString(),
  }))

  const result = await supabase
    .from('einsatz_dokumente')
    .upsert(rows, { onConflict: 'file_key', ignoreDuplicates: true })

  if (result.error) throw new Error('Alte Dokumentzuordnungen konnten nicht übernommen werden.')
  clearLegacyDokumente(incidentId)
}

export async function loadDokumente(incidentId: string, migrateForUserId?: string | null): Promise<EinsatzDokument[]> {
  if (migrateForUserId) await migrateLegacyDokumente(incidentId, migrateForUserId)

  const result = await supabase
    .from('einsatz_dokumente')
    .select('*')
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: true })

  if (result.error) throw new Error('Einsatzunterlagen konnten nicht geladen werden.')
  return (result.data ?? []).map(fromRow)
}

export async function registerEinsatzdokument({
  incidentId,
  art,
  title,
  fileKey,
  fileName,
  from,
  uploadedBy,
}: {
  incidentId: string
  art: DokArt
  title: string
  fileKey: string
  fileName: string
  from: 'zentrale' | 'streife'
  uploadedBy: string
}): Promise<EinsatzDokument> {
  const result = await supabase
    .from('einsatz_dokumente')
    .insert({
      incident_id: incidentId,
      art,
      title,
      file_key: fileKey,
      file_name: fileName,
      source: from,
      uploaded_by: uploadedBy,
    })
    .select('*')
    .single()

  if (result.error) throw new Error('Dokumentzuordnung konnte nicht gespeichert werden.')
  return fromRow(result.data)
}

export async function uploadEinsatzdokument(incidentId: string, file: File): Promise<{ key: string; name: string }> {
  const { data: sessionData } = await supabase.auth.getSession()
  const response = await fetch('/incident-document-upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`,
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Size': String(file.size),
      'X-File-Name': encodeURIComponent(file.name),
      'X-Incident-Id': incidentId,
    },
    body: file,
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(data?.error || 'Datei konnte nicht hochgeladen werden.')
  }
  return await response.json() as { key: string; name: string }
}

async function deleteUploadedFile(incidentId: string, fileKey: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const response = await fetch('/incident-document-delete', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`,
      'X-Incident-Id': incidentId,
      'X-File-Key': fileKey,
    },
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(data?.error || 'Unterlage konnte nicht gelöscht werden.')
  }
}

export async function rollbackUploadedEinsatzdokument(incidentId: string, fileKey: string): Promise<void> {
  try { await deleteUploadedFile(incidentId, fileKey) } catch { /* best effort cleanup */ }
}

export async function deleteEinsatzdokument(incidentId: string, doc: EinsatzDokument): Promise<void> {
  await deleteUploadedFile(incidentId, doc.fileKey)

  const result = await supabase
    .from('einsatz_dokumente')
    .delete()
    .eq('id', doc.id)
    .eq('incident_id', incidentId)

  if (result.error) throw new Error('Datei wurde entfernt, aber die Dokumentzuordnung konnte nicht bereinigt werden.')
}

export async function openEinsatzdokument(fileKey: string) {
  const { data: sessionData } = await supabase.auth.getSession()
  const response = await fetch(`/files/${fileKey}`, {
    headers: { Authorization: `Bearer ${sessionData.session?.access_token ?? ''}` },
  })
  if (!response.ok) throw new Error('Dokument konnte nicht geöffnet werden.')
  const blobUrl = URL.createObjectURL(await response.blob())
  window.open(blobUrl, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
}
