/**
 * Schutz gegen Ladezustände, die nie enden: Ein hängender Request (Netzwerk,
 * RLS, o. Ä.) löst normalerweise weder resolve noch reject aus, wodurch ein
 * `await Promise.all([...])` in einer `load()`-Funktion für immer offen
 * bleibt und der Spinner nie verschwindet - auch nicht nach F5, wenn der
 * gleiche Request erneut hängt.
 *
 * `withTimeout` bricht das clientseitige Warten nach `ms` Millisekunden mit
 * einem `LoadTimeoutError` ab, damit der Aufrufer den Ladezustand in einem
 * `finally` sicher beenden und eine verständliche Fehlermeldung zeigen kann.
 * Der ursprüngliche Request wird dadurch nicht abgebrochen (kein
 * AbortController über den Supabase-Client verfügbar), läuft im Hintergrund
 * also weiter - das UI hängt aber nicht mehr fest.
 */

export const DEFAULT_LOAD_TIMEOUT_MS = 15000

export class LoadTimeoutError extends Error {
  constructor(message = 'Zeitüberschreitung beim Laden.') {
    super(message)
    this.name = 'LoadTimeoutError'
  }
}

export function withTimeout<T>(promise: PromiseLike<T>, ms: number = DEFAULT_LOAD_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LoadTimeoutError()), ms)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export function isLoadTimeoutError(error: unknown): error is LoadTimeoutError {
  return error instanceof LoadTimeoutError
}

/** Einheitliche Fehlermeldung für eine fehlgeschlagene load()-Funktion. */
export function loadErrorMessage(error: unknown, fallback: string): string {
  return isLoadTimeoutError(error)
    ? `${error.message} Bitte erneut versuchen.`
    : fallback
}
