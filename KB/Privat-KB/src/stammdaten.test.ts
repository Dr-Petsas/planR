import { describe, expect, it } from 'vitest'
import {
  anschrift, anschriftLesen, leererPatient, nameTrennen, patientMigrieren, patientName, praxisMigrieren, standardPraxis,
} from './stammdaten'

describe('Anmeldedaten', () => {
  it('liest den alten MKV/Kons-Stand mit vollem Namen', () => {
    const p = patientMigrieren({ name: 'Hans Peter Meier', geburtsdatum: '1960-02-01', kasse: 'AOK', kassennummer: '108310400', versichertennr: 'A123', kassenart: 'ersatz' })
    expect(p).toMatchObject({ vorname: 'Hans Peter', name: 'Meier', kassenNr: '108310400', versichertenNr: 'A123', kassenart: 'ersatz' })
  })

  it('liest Privat-Kons (versicherung) und Privat-ZE (plzOrt, kostentraeger)', () => {
    expect(patientMigrieren({ name: 'Meier, Anna', versicherung: 'Allianz' })).toMatchObject({ vorname: 'Anna', name: 'Meier', kasse: 'Allianz' })
    expect(patientMigrieren({ anrede: 'Frau', vorname: 'Anna', name: 'Meier', strasse: 'Hauptstr. 1', plzOrt: '80331 München', kostentraeger: 'DKV' }))
      .toMatchObject({ plz: '80331', ort: 'München', kasse: 'DKV', strasse: 'Hauptstr. 1' })
  })

  it('liest PAR (kostentraegerkennung) und HKP (anschrift)', () => {
    expect(patientMigrieren({ vorname: 'A', name: 'B', kostentraegerkennung: '101575519', kassennummer: '99' }).kassenNr).toBe('101575519')
    expect(patientMigrieren({ vorname: 'A', name: 'von der Heide', anschrift: 'Weg 2, 10115 Berlin' }))
      .toMatchObject({ name: 'von der Heide', strasse: 'Weg 2', plz: '10115', ort: 'Berlin' })
  })

  it('lässt einen aktuellen Stand unverändert', () => {
    const p = { ...leererPatient(), vorname: 'Anna', name: 'Meier', plz: '1', ort: 'X', kassenNr: 'K', status: '1000000' }
    expect(patientMigrieren(p)).toEqual(p)
    expect(patientMigrieren(null)).toEqual(leererPatient())
  })

  it('liest alte Praxis-Stände und übernimmt die alte KZV-Wahl', () => {
    expect(praxisMigrieren({ name: 'P', plzOrt: '80331 München', behandler: 'Dr. X' }, '11'))
      .toMatchObject({ plz: '80331', ort: 'München', zahnarzt: 'Dr. X', kzvNr: '11' })
    expect(praxisMigrieren(undefined)).toEqual(standardPraxis())
  })

  it('setzt Namen und Anschrift zusammen', () => {
    expect(patientName({ vorname: 'Anna', name: 'Meier' })).toBe('Anna Meier')
    expect(anschrift({ strasse: 'Weg 2', plz: '10115', ort: 'Berlin' })).toBe('Weg 2, 10115 Berlin')
    expect(anschriftLesen('Weg 2\n10115 Berlin')).toEqual({ strasse: 'Weg 2', plz: '10115', ort: 'Berlin' })
    expect(nameTrennen('Meier')).toEqual({ vorname: '', name: 'Meier' })
  })
})
