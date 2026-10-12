import { describe, expect, it } from 'vitest'
import { isoDatum, stammdatenAusPvs } from './pvsPatient'

describe('Stammdaten aus der Bridge', () => {
  it('DENS: Anrede, Anschrift und Kasse', () => {
    expect(stammdatenAusPvs({
      title: 'Frau', firstName: 'Anna', lastName: 'Berger', birthDate: '1961-04-02', street: 'Hauptstr. 1',
      postalCode: '50667', city: 'Köln', insurance: 'AOK Rheinland', insuranceIk: '104212059', insuranceNumber: 'A123456789',
    })).toEqual({
      anrede: 'Frau', vorname: 'Anna', name: 'Berger', geburtsdatum: '1961-04-02', strasse: 'Hauptstr. 1',
      plz: '50667', ort: 'Köln', kasse: 'AOK Rheinland', kassenNr: '104212059', versichertenNr: 'A123456789',
    })
  })

  it('DS-Win: PLZ und Ort in einem Feld, keine Kasse', () => {
    const p = stammdatenAusPvs({ firstName: 'Max', lastName: 'Muster', birthDate: '02.03.1970', street: 'Weg 2', postalCodeAndCity: '41460 Neuss' })
    expect(p).toMatchObject({ anrede: '', geburtsdatum: '1970-03-02', plz: '41460', ort: 'Neuss', kasse: '', kassenNr: '' })
  })

  it('ungültige Werte bleiben leer', () => {
    expect(stammdatenAusPvs({ title: 'Dr.', insuranceIk: '12', birthDate: 'unbekannt', firstName: 3 })).toMatchObject({ anrede: '', kassenNr: '', geburtsdatum: '', vorname: '' })
    expect(isoDatum('19700302')).toBe('1970-03-02')
    expect(stammdatenAusPvs({ postalCodeAndCity: 'Wien' }).ort).toBe('Wien')
  })
})
