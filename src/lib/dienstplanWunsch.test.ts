import { describe, expect, it } from 'vitest'
import { kontingentVerbrauch, laengsteSlotFolge, monatsKontingent, wunschfristAblaufdatum, wunschfristAbgelaufen } from './dienstplanWunsch'

describe('monatsKontingent', () => {
  it('ergibt 18 bei Vollzeit (Beschäftigungsgrad 111)', () => {
    expect(monatsKontingent(111)).toBe(18)
  })

  it('skaliert linear mit dem Beschäftigungsgrad und rundet', () => {
    expect(monatsKontingent(55.5)).toBe(9)
    expect(monatsKontingent(74)).toBe(12) // 18 * 74/111 = 12 genau
  })
})

describe('kontingentVerbrauch', () => {
  it('ein ganzer freier Tag (frei_tag + frei_nacht) kostet 2 Einheiten', () => {
    const eintraege = [{ datum: '2026-10-05', wunsch: 'frei_tag' as const }, { datum: '2026-10-05', wunsch: 'frei_nacht' as const }]
    expect(kontingentVerbrauch(eintraege)).toBe(2)
  })

  it('ein Urlaubstag kostet nur 1 Einheit, obwohl er ganztägig blockiert', () => {
    expect(kontingentVerbrauch([{ datum: '2026-10-05', wunsch: 'urlaub' as const }])).toBe(1)
  })

  it('Gerichtsverhandlung/Schulverkehrserziehung-Termin/Personalvertretung-Sitzung zählen nicht gegen das Kontingent', () => {
    const eintraege = [
      { datum: '2026-10-05', wunsch: 'gerichtsverhandlung' as const },
      { datum: '2026-10-06', wunsch: 'schulverkehrserziehung' as const },
      { datum: '2026-10-07', wunsch: 'personalvertretung' as const },
    ]
    expect(kontingentVerbrauch(eintraege)).toBe(0)
  })
})

describe('laengsteSlotFolge', () => {
  it('ist 0 ohne Wünsche', () => {
    expect(laengsteSlotFolge([])).toBe(0)
  })

  it('zählt frei_tag + frei_nacht desselben Tages als 2 aufeinanderfolgende Slots', () => {
    const eintraege = [{ datum: '2026-10-05', wunsch: 'frei_tag' as const }, { datum: '2026-10-05', wunsch: 'frei_nacht' as const }]
    expect(laengsteSlotFolge(eintraege)).toBe(2)
  })

  it('ein Urlaubstag zählt wie 2 aufeinanderfolgende Slots (ganztägig)', () => {
    expect(laengsteSlotFolge([{ datum: '2026-10-05', wunsch: 'urlaub' as const }])).toBe(2)
  })

  it('drei komplette freie Tage in Folge ergeben eine Kette von 6 Slots', () => {
    const eintraege = ['2026-10-05', '2026-10-06', '2026-10-07'].flatMap(datum => [
      { datum, wunsch: 'frei_tag' as const },
      { datum, wunsch: 'frei_nacht' as const },
    ])
    expect(laengsteSlotFolge(eintraege)).toBe(6)
  })

  it('unterbricht die Kette bei einer Lücke', () => {
    const eintraege = [
      { datum: '2026-10-05', wunsch: 'frei_tag' as const },
      { datum: '2026-10-05', wunsch: 'frei_nacht' as const },
      { datum: '2026-10-08', wunsch: 'frei_tag' as const },
    ]
    expect(laengsteSlotFolge(eintraege)).toBe(2)
  })

  it('Gerichtsverhandlung/Schulverkehrserziehung-Termin/Personalvertretung-Sitzung zählen nicht in die "max. 6 am Stück"-Regel', () => {
    const eintraege = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map(datum => ({ datum, wunsch: 'gerichtsverhandlung' as const }))
    expect(laengsteSlotFolge(eintraege)).toBe(0)
  })
})

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
