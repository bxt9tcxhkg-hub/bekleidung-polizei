import { supabase } from './supabase'

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

export function readDokumente(incidentId: string): EinsatzDokument[] {
  try {
    const raw = localStorage.getItem(storageKey(incidentId))
    if (!raw) return []
    return JSON.parse(raw) as EinsatzDokument[]
  } catch {
    return []
  }
}

export function writeDokumente(incidentId: string, docs: EinsatzDokument[]) {
  try {
    localStorage.setItem(storageKey(incidentId), JSON.stringify(docs))
  } catch { /* ignore */ }
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
