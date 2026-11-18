import { describe, expect, it } from 'vitest'
import { KB_VORLAGEN, kbEntwurf, kbVersorgungSatz } from './index'

const nrn = (r: ReturnType<typeof kbEntwurf>) => (r.status === 'ok' ? r.plan.positionen.map((p) => `${p.ebene} ${p.nr} x${p.anzahl}`) : [])

describe('kbEntwurf', () => {
  it('fragt ohne Vorlage nach der Schiene', () => {
    expect(kbEntwurf({})).toMatchObject({ status: 'rueckfrage', grund: 'vorlage' })
    expect(kbEntwurf({ vorlagen: ['gibtsnicht'] })).toMatchObject({ status: 'rueckfrage' })
  })

  it('Knirscherschiene: Positionen der Vorlage, Summe aus der Engine', () => {
    const r = kbEntwurf({ vorlagen: ['knirscher'] }, { patient: { vorname: 'Eva', name: 'Muster' } })
    if (r.status !== 'ok') throw new Error('kein Entwurf')
    expect(nrn(r)).toEqual(['GOZ 0010 x1', 'GOAE 3 x1', 'GOAE 6 x1', 'GOAE 34 x1', 'GOZ 7010 x1', 'LABOR 0002 x2', 'LABOR 0402 x1', 'LABOR 7604 x1', 'LABOR 0732 x2'])
    expect(r.plan.patient.name).toBe('Muster')
    expect(r.plan.vorlagen).toEqual(['knirscher'])
    expect(r.zusammenfassung.summe).toBe(r.rechnung.gesamt)
    expect(r.zusammenfassung.summe).toBeCloseTo(r.zusammenfassung.honorar + r.zusammenfassung.labor, 2)
    expect(r.zusammenfassung.honorar).toBeGreaterThan(0)
    expect('regler' in r.ablagePlan).toBe(false)
    expect(kbVersorgungSatz(r.zusammenfassung)).toBe('Knirscherschiene weich')
  })

  it('Intraoralscan stellt Modelle und Abformung um', () => {
    const r = kbEntwurf({ vorlagen: ['michigan'], abformung: 'scan' })
    if (r.status !== 'ok') throw new Error('kein Entwurf')
    expect(r.plan.abformung).toBe('scan')
    expect(nrn(r)).toContain('LABOR 2960 x1')
    expect(nrn(r).some((x) => x.startsWith('LABOR 0002'))).toBe(false)
    expect(kbVersorgungSatz(r.zusammenfassung)).toBe('Adjustierte Aufbissschiene, mit Intraoralscan')
  })

  it('digitale Schiene und UKPS schalten selbst auf Scan, mehrere Vorlagen zählen zusammen', () => {
    const d = kbEntwurf({ vorlagen: ['digital'] })
    expect(d.status === 'ok' && d.plan.abformung).toBe('scan')
    const u = kbEntwurf({ vorlagen: ['ukps-resmed', 'ukps-titration'] })
    if (u.status !== 'ok') throw new Error('kein Entwurf')
    expect(u.zusammenfassung.titel).toEqual(['UKPS ResMed Narval', 'Nachadaption und Kontrollen'])
    expect(u.zusammenfassung.summe).toBeGreaterThan(400)
  })

  it('jede Vorlage des Planers lässt sich rechnen', () => {
    for (const v of KB_VORLAGEN) {
      const r = kbEntwurf({ vorlagen: [v.id] })
      expect(r.status, v.id).toBe('ok')
      if (r.status === 'ok') expect(r.zusammenfassung.summe, v.id).toBeGreaterThan(0)
    }
  })
})
