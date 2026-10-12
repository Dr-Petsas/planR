import { describe, expect, it } from 'vitest'
import { patientAusFragment } from './patientUebergabe'

const fragment = (o: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(o))
  return `#patient=${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

describe('Patient aus der PlanR-Patientensuche', () => {
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
})
