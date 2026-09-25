import { describe, expect, it } from 'vitest'
import { wunschfristAblaufdatum, wunschfristAbgelaufen } from './dienstplanWunsch'

describe('wunschfristAblaufdatum', () => {
  it('zieht die Frist-Tage vom Monatsbeginn ab', () => {
    const ablauf = wunschfristAblaufdatum('2026-11', 14)
    expect(ablauf.getFullYear()).toBe(2026)
    expect(ablauf.getMonth()).toBe(9) // Oktober (0-indiziert)
    expect(ablauf.getDate()).toBe(18)
  })

  it('funktioniert auch mit YYYY-MM-DD', () => {
    expect(wunschfristAblaufdatum('2026-11-01', 14).getTime()).toBe(wunschfristAblaufdatum('2026-11', 14).getTime())
  })
})

describe('wunschfristAbgelaufen', () => {
  it('ist am Ablaufdatum selbst noch NICHT abgelaufen', () => {
    expect(wunschfristAbgelaufen('2026-11', 14, new Date(2026, 9, 18))).toBe(false)
  })

  it('ist am Tag nach dem Ablaufdatum abgelaufen', () => {
    expect(wunschfristAbgelaufen('2026-11', 14, new Date(2026, 9, 19))).toBe(true)
  })

  it('ist deutlich vor der Frist nicht abgelaufen', () => {
    expect(wunschfristAbgelaufen('2026-11', 14, new Date(2026, 8, 1))).toBe(false)
  })
})
