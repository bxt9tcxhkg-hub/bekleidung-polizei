export const MAX_MATERIAL_FILE_SIZE = 100_000_000

export function uploadSize(headers: Headers): number | null {
  const raw = headers.get('X-File-Size') ?? headers.get('Content-Length')
  if (!raw || !/^\d+$/.test(raw)) return null
  const size = Number(raw)
  const transportSize = headers.get('Content-Length')
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_MATERIAL_FILE_SIZE) return null
  if (transportSize !== null && Number(transportSize) !== size) return null
  return size
}

/** Validate actual bytes as well as the untrusted client declaration. */
export function countUploadBytes(expected: number): TransformStream<Uint8Array, Uint8Array> {
  let received = 0
  return new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength
      if (received > expected || received > MAX_MATERIAL_FILE_SIZE) throw new Error('Dateigröße überschritten')
      controller.enqueue(chunk)
    },
    flush() {
      if (received !== expected) throw new Error('Datei unvollständig')
    },
  })
}
