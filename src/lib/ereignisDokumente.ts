import { supabase } from './supabase'
import type { EreignisDokumentRow, IncidentAssistanceOrganisation } from './types'

export type EreignisDokumentArt = 'zmr' | 'abfrage' | 'sonstiges'

export interface EreignisDokument {
  id: string
  ereignisId: string
  art: EreignisDokumentArt
  title: string
  fileKey: string
  fileName: string
  sourceOrganisation: IncidentAssistanceOrganisation
  targetOrganisation: IncidentAssistanceOrganisation | null
  uploadedBy: string
  createdAt: string
}

function fromRow(row: EreignisDokumentRow): EreignisDokument {
  return {
    id: row.id,
    ereignisId: row.ereignis_id,
    art: row.art,
    title: row.title,
    fileKey: row.file_key,
    fileName: row.file_name,
    sourceOrganisation: row.source_organisation,
    targetOrganisation: row.target_organisation,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  }
}

export async function loadEreignisDokumente(ereignisId: string): Promise<EreignisDokument[]> {
  const result = await supabase
    .from('ereignis_dokumente')
    .select('*')
    .eq('ereignis_id', ereignisId)
    .order('created_at', { ascending: true })

  if (result.error) throw new Error('Ereignisdokumente konnten nicht geladen werden.')
  return (result.data ?? []).map(fromRow)
}

export async function registerEreignisDokument(input: {
  ereignisId: string
  art: EreignisDokumentArt
  title: string
  fileKey: string
  fileName: string
  targetOrganisation?: IncidentAssistanceOrganisation | null
  uploadedBy: string
}): Promise<EreignisDokument> {
  const result = await supabase
    .from('ereignis_dokumente')
    .insert({
      ereignis_id: input.ereignisId,
      art: input.art,
      title: input.title,
      file_key: input.fileKey,
      file_name: input.fileName,
      source_organisation: 'Stadtpolizei',
      target_organisation: input.targetOrganisation ?? null,
      uploaded_by: input.uploadedBy,
    })
    .select('*')
    .single()

  if (result.error) throw new Error('Ereignisdokument konnte nicht registriert werden.')
  return fromRow(result.data)
}

export async function uploadEreignisDokument(ereignisId: string, file: File): Promise<{ key: string; name: string }> {
  const { data: sessionData } = await supabase.auth.getSession()
  const response = await fetch('/event-document-upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`,
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Size': String(file.size),
      'X-File-Name': encodeURIComponent(file.name),
      'X-Event-Id': ereignisId,
    },
    body: file,
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(data?.error || 'Ereignisdokument konnte nicht hochgeladen werden.')
  }
  return await response.json() as { key: string; name: string }
}

export async function rollbackUploadedEreignisDokument(ereignisId: string, fileKey: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  try {
    await fetch('/event-document-delete', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`,
        'X-Event-Id': ereignisId,
        'X-File-Key': fileKey,
      },
    })
  } catch {
    // best effort cleanup
  }
}

export async function openEreignisDokument(fileKey: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const response = await fetch(`/files/${fileKey}`, {
    headers: { Authorization: `Bearer ${sessionData.session?.access_token ?? ''}` },
  })
  if (!response.ok) throw new Error('Ereignisdokument konnte nicht geöffnet werden.')
  const blobUrl = URL.createObjectURL(await response.blob())
  window.open(blobUrl, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
}
