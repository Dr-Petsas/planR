import { describe, expect, it } from 'vitest'
import {
  anschrift, anschriftLesen, leererPatient, mitPatient, mitZentralerPraxis, nameTrennen, patientAusFragment, patientMigrieren, patientName, praxisMigrieren,
  standardPraxis,
} from './stammdaten'

describe('Zentraler Praxiskopf', () => {
  it('füllt leere Felder und den Vorgabenamen, eigene Einträge bleiben', () => {
    const zentral = { name: 'Zahnarztpraxis Dr. Petsas', strasse: 'Luise-Rainer-Str. 6-10', telefon: '0211 1', fremd: 'x' }
    const p = mitZentralerPraxis({ ...standardPraxis(), telefon: '0211 999' }, zentral)
    expect(p.name).toBe('Zahnarztpraxis Dr. Petsas')
    expect(p.strasse).toBe('Luise-Rainer-Str. 6-10')
    expect(p.telefon).toBe('0211 999')
    expect('fremd' in p).toBe(false)
    expect(mitZentralerPraxis({ ...standardPraxis(), name: 'Praxis Muster' }, zentral).name).toBe('Praxis Muster')
  })
})

const fragment = (o: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(o))
  return `#patient=${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

describe('Patient aus der PlanR-Übersicht', () => {
  it('übernimmt Name, Anschrift und Kasse mit Umlauten', () => {
    expect(patientAusFragment(fragment({ anrede: 'Frau', vorname: 'Jürgen', name: 'Müller', geburtsdatum: '1961-04-02', ort: 'Köln', kassenNr: '104212059' })))
      .toEqual({ anrede: 'Frau', vorname: 'Jürgen', name: 'Müller', geburtsdatum: '1961-04-02', ort: 'Köln', kassenNr: '104212059' })
  })

  it('verwirft Fremdes und Ungültiges', () => {
    expect(patientAusFragment(fragment({ name: 'Berger', anrede: 'Dr.', geburtsdatum: '2.3.70', status: '9', x: 'y' }))).toEqual({ name: 'Berger' })
    expect(patientAusFragment(fragment({ ort: 'Köln' }))).toBeNull()
    expect(patientAusFragment('#patient=%%%')).toBeNull()
    expect(patientAusFragment('#patient=bm9wZQ')).toBeNull()
    expect(patientAusFragment('')).toBeNull()
  })

  it('setzt den Patienten in den neuen Plan', () => {
    const plan = { nummer: 'X', patient: leererPatient() }
    expect(mitPatient(plan, { name: 'Berger', geburtsdatum: '1970-03-02' }).patient).toMatchObject({ name: 'Berger', geburtsdatum: '1970-03-02', kassenart: 'primaer' })
    expect(mitPatient(plan, null)).toBe(plan)
  })
})

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
