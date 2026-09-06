import { describe, expect, it } from 'vitest'
import {
  AUTH_EMAIL_DOMAIN,
  FEURSTEIN_MARTIN_EMAIL,
  foldGermanAscii,
  isFeursteinMartinException,
  officerAuthEmail,
  provisionalUsernameFromEmail,
  splitOfficerName,
} from './officerAuthEmail'
import { knownRosterImportUsers } from './officerRoster'

describe('foldGermanAscii', () => {
  it('faltet Umlaute wie für SMTP vorgesehen', () => {
    expect(foldGermanAscii('Müller')).toBe('Mueller')
    expect(foldGermanAscii('Fässler')).toBe('Faessler')
    expect(foldGermanAscii('Alge-Faißt')).toBe('Alge-Faisst')
    expect(foldGermanAscii('Jörg')).toBe('Joerg')
    expect(foldGermanAscii('Griß')).toBe('Griss')
    expect(foldGermanAscii('ÄÖÜß')).toBe('AeOeUess')
  })
})

describe('officerAuthEmail', () => {
  it('baut Vorname.Nachname@dornbirn.at und behält Bindestriche', () => {
    expect(officerAuthEmail({
      vorname: 'Hans-Peter',
      nachname: 'Schwendinger',
      dienstnummer: '1',
    })).toBe('Hans-Peter.Schwendinger@dornbirn.at')
    expect(officerAuthEmail({
      vorname: 'Julian',
      nachname: 'Müller',
    })).toBe('Julian.Mueller@dornbirn.at')
    expect(officerAuthEmail({
      vorname: 'Ludwig',
      nachname: 'Alge-Faißt',
    })).toBe('Ludwig.Alge-Faisst@dornbirn.at')
  })

  it('nimmt Feurstein Martin / DN 3 als einzige Ausnahme', () => {
    expect(officerAuthEmail({
      vorname: 'Martin',
      nachname: 'Feurstein',
      dienstnummer: '3',
    })).toBe(FEURSTEIN_MARTIN_EMAIL)
    expect(officerAuthEmail({
      vorname: 'Martin',
      nachname: 'Feurstein',
    })).toBe(FEURSTEIN_MARTIN_EMAIL)
    expect(isFeursteinMartinException({
      vorname: 'Martin',
      nachname: 'Feurstein',
      dienstnummer: '3',
    })).toBe(true)
    expect(officerAuthEmail({
      vorname: 'Andreas',
      nachname: 'Gisinger',
      dienstnummer: '2',
    })).toBe('Andreas.Gisinger@dornbirn.at')
  })

  it('zerlegt den Anzeigenamen Vorname Nachname', () => {
    expect(splitOfficerName('Hans-Peter Schwendinger')).toEqual({
      vorname: 'Hans-Peter',
      nachname: 'Schwendinger',
    })
    expect(officerAuthEmail({ name: 'Irmgard Fässler', dienstnummer: '70' }))
      .toBe('Irmgard.Faessler@dornbirn.at')
  })

  it('erzeugt für die Seed-Liste eindeutige dornbirn.at-Adressen', () => {
    const users = knownRosterImportUsers()
    const emails = users.map(u => u.email)
    expect(emails.every(email => email.endsWith(`@${AUTH_EMAIL_DOMAIN}`))).toBe(true)
    expect(new Set(emails).size).toBe(emails.length)
    expect(users.find(u => u.dienstnummer === '3')?.email).toBe(FEURSTEIN_MARTIN_EMAIL)
    expect(users.find(u => u.dienstnummer === '1')?.email).toBe('Hans-Peter.Schwendinger@dornbirn.at')
    expect(provisionalUsernameFromEmail(FEURSTEIN_MARTIN_EMAIL)).toBe('martin.feurstein2')
    expect(provisionalUsernameFromEmail('Hans-Peter.Schwendinger@dornbirn.at')).toBe('hans-peter.schwendinger')
  })
})
