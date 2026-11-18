import { describe, expect, it } from 'vitest'
import { gleicheNummer, isoDatum, nummerAusSuche, patientPerNummer, stammdatenAusPvs } from './pvsPatient'

describe('Stammdaten aus der Bridge', () => {
  it('DENS: Anrede, Anschrift und Kasse', () => {
    expect(stammdatenAusPvs({
      title: 'Frau', firstName: 'Anna', lastName: 'Berger', birthDate: '1961-04-02', street: 'Hauptstr. 1',
      postalCode: '50667', city: 'Köln', insurance: 'AOK Rheinland', insuranceIk: '104212059', insuranceNumber: 'A123456789',
    })).toEqual({
      anrede: 'Frau', titel: '', vorname: 'Anna', name: 'Berger', geburtsdatum: '1961-04-02', strasse: 'Hauptstr. 1',
      plz: '50667', ort: 'Köln', kasse: 'AOK Rheinland', kassenNr: '104212059', versichertenNr: 'A123456789', email: '',
    })
  })

  it('Titel und E-Mail für den Versand', () => {
    expect(stammdatenAusPvs({ title: 'Herr Dr. med.', email: 'k.meier@example.de' })).toMatchObject({ anrede: 'Herr', titel: 'Dr. med.', email: 'k.meier@example.de' })
    expect(stammdatenAusPvs({ salutation: 'Frau', title: 'Prof. Dr.' })).toMatchObject({ anrede: 'Frau', titel: 'Prof. Dr.' })
    expect(stammdatenAusPvs({ email: 'kein-mail' }).email).toBe('')
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

describe('Patientennummer', () => {
  it('erkennt die Nummer im Suchfeld', () => {
    expect(nummerAusSuche('12043')).toBe('12043')
    expect(nummerAusSuche(' Patienten 12043 ')).toBe('12043')
    expect(nummerAusSuche('Nr. 00123')).toBe('00123')
    expect(nummerAusSuche('#77')).toBe('77')
    expect(nummerAusSuche('Patientennummer: 5')).toBe('5')
  })
  it('Name, Datum oder zwei Zahlen sind keine Nummernsuche', () => {
    expect(nummerAusSuche('Müller 12043')).toBe('')
    expect(nummerAusSuche('02.04.1961')).toBe('')
    expect(nummerAusSuche('12 43')).toBe('')
    expect(nummerAusSuche('Berger')).toBe('')
    expect(nummerAusSuche('1234567890')).toBe('')
  })
  it('führende Nullen zählen nicht', () => {
    expect(gleicheNummer('00123', '123')).toBe(true)
    expect(gleicheNummer('1230', '123')).toBe(false)
    expect(gleicheNummer('', '0')).toBe(false)
  })
  it('Einzelabruf zuerst, sonst genau passende Zeile der Suche', async () => {
    const direkt = await patientPerNummer('123', async () => ({ lastName: 'Berger' }), async () => [])
    expect(direkt).toEqual([{ lastName: 'Berger', id: '123' }])
    const ueberSuche = await patientPerNummer('123', async () => null,
      async () => [{ id: '00123', lastName: 'A' }, { id: '1234', lastName: 'B' }, { id: '5123', lastName: 'C' }])
    expect(ueberSuche).toEqual([{ id: '00123', lastName: 'A' }])
  })
})
