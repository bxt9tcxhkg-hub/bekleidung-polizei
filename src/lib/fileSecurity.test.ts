import { afterEach, describe, expect, it, vi } from 'vitest'
import { canManageBekleidung, canReadFile, isAuthenticated } from '../../functions/_auth'
import { countUploadBytes, MAX_MATERIAL_FILE_SIZE, uploadSize } from '../../functions/_upload'

const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'test' }
const request = new Request('https://portal.invalid/files/test', { headers: { Authorization: 'Bearer test' } })
afterEach(() => vi.unstubAllGlobals())

describe('file authorization', () => {
  it('rejects inactive users with an otherwise valid token', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ id: 'test-user' })).mockResolvedValueOnce(Response.json([]))
    vi.stubGlobal('fetch', fetcher)
    expect(await isAuthenticated(request, env)).toBe(false)
    expect(fetcher.mock.calls[1][0]).toContain('active=eq.true')
  })
  it('accepts an active profile and rejects an invalid token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ id: 'test-user' })).mockResolvedValueOnce(Response.json([{ id: 'test-user' }])))
    expect(await isAuthenticated(request, env)).toBe(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
    expect(await isAuthenticated(request, env)).toBe(false)
  })
  it('denies unknown folders without querying the database', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(await canReadFile(request, env, 'uploads/secret.pdf')).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('checks the concrete invoice and denies hidden records', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json([])).mockResolvedValueOnce(Response.json([{ id: 'invoice' }]))
    vi.stubGlobal('fetch', fetcher)
    expect(await canReadFile(request, env, 'vorrechnungen/one.pdf')).toBe(false)
    expect(await canReadFile(request, env, 'vorrechnungen/two.pdf')).toBe(true)
    expect(fetcher.mock.calls[1][0]).toContain(encodeURIComponent('/files/vorrechnungen/two.pdf'))
  })
  it('respects material RLS and archived status', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json([]))
    vi.stubGlobal('fetch', fetcher)
    expect(await canReadFile(request, env, 'einsatz-unterlagen/secret.pdf')).toBe(false)
    expect(fetcher.mock.calls[0][0]).toContain('archived_at=is.null')
  })
  it('authorizes Schulungsdateien through the concrete material record', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json([{ id: 'material' }]))
    vi.stubGlobal('fetch', fetcher)
    expect(await canReadFile(request, env, 'schulungs-unterlagen/info.pdf')).toBe(true)
    expect(fetcher.mock.calls[0][0]).toContain(encodeURIComponent('schulungs-unterlagen/info.pdf'))
  })
  it('rejects invoice uploads for ordinary users and failed authorization requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(Response.json(false))))
    expect(await canManageBekleidung(request, env)).toBe(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await canManageBekleidung(request, env)).toBe(false)
  })
})

describe('streamed upload boundaries', () => {
  it('accepts up to exactly 100 MB without a forbidden browser header', () => {
    expect(uploadSize(new Headers({ 'X-File-Size': String(MAX_MATERIAL_FILE_SIZE) }))).toBe(MAX_MATERIAL_FILE_SIZE)
    expect(uploadSize(new Headers({ 'X-File-Size': String(MAX_MATERIAL_FILE_SIZE + 1) }))).toBeNull()
  })
  it('rejects missing, malformed and inconsistent lengths', () => {
    for (const size of ['', '0', '-1', 'NaN', '1.2', '3x']) expect(uploadSize(new Headers({ 'X-File-Size': size }))).toBeNull()
    expect(uploadSize(new Headers({ 'X-File-Size': '3', 'Content-Length': '4' }))).toBeNull()
  })
  async function readUpload(expected: number, sizes: number[]) {
    const source = new ReadableStream<Uint8Array>({ start(controller) {
      for (const size of sizes) controller.enqueue(new Uint8Array(size))
      controller.close()
    } })
    return new Response(source.pipeThrough(countUploadBytes(expected))).arrayBuffer()
  }
  it('accepts exact bytes and rejects overrun and truncated bodies', async () => {
    expect((await readUpload(5, [2, 3])).byteLength).toBe(5)
    await expect(readUpload(5, [2, 4])).rejects.toThrow('überschritten')
    await expect(readUpload(5, [2, 2])).rejects.toThrow('unvollständig')
  })
})
