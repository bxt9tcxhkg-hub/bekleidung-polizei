import { describe, expect, it } from 'vitest'
import { kontaktTelefonnummern } from './kontaktTelefon'

describe('kontaktTelefonnummern', () => {
  it('ordnet mehrere Nummern eindeutig zu und behält die alte Nummer ohne vermuteten Typ', () => {
    expect(kontaktTelefonnummern({
      telefon: ' 05572 1234 ',
      telefon_buero: '05572 5678',
      telefon_diensthandy: ' 0676 9876 ',
      telefon_privathandy: '0664 1111',
    })).toEqual([
      { art: 'Büro', nummer: '05572 5678' },
      { art: 'Diensthandy', nummer: '0676 9876' },
      { art: 'Privathandy', nummer: '0664 1111' },
      { art: 'Weitere Nummer', nummer: '05572 1234' },
    ])
  })

  it('zeigt keine leeren Nummern als Anrufziel', () => {
    expect(kontaktTelefonnummern({ telefon: null, telefon_buero: ' ', telefon_diensthandy: null, telefon_privathandy: null })).toEqual([])
  })
})
