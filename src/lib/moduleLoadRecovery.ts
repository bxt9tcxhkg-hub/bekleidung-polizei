const RELOAD_MARKER = 'portal:module-reload-at'
const RELOAD_GUARD_MS = 30_000

export function isStaleModuleError(message: string) {
  return [
    'dynamically imported module',
    'javascript mime type',
    'importing a module script failed',
    'chunkloaderror',
    'loading chunk',
  ].some(fragment => message.toLowerCase().includes(fragment))
}

export function installModuleLoadRecovery() {
  window.addEventListener('vite:preloadError', event => {
    const lastReload = Number(window.sessionStorage.getItem(RELOAD_MARKER) ?? 0)
    if (Date.now() - lastReload < RELOAD_GUARD_MS) return

    // Vite meldet diesen Fall, wenn nach einem Deployment noch eine alte
    // Portal-Version auf eine nicht mehr vorhandene, gehashte Datei zeigt.
    event.preventDefault()
    window.sessionStorage.setItem(RELOAD_MARKER, String(Date.now()))
    window.location.reload()
  })

  window.setTimeout(() => {
    window.sessionStorage.removeItem(RELOAD_MARKER)
  }, RELOAD_GUARD_MS)
}
