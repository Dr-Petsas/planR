import { describe, expect, it } from 'vitest'
import { leererPlan } from './store/plan'
import { planAusSchema } from './probeImport'

describe('Probe-Import in den HKP-Planer', () => {
  it('setzt Befund und Therapie und rechnet Positionen', () => {
    const { plan } = planAusSchema(leererPlan().einstellungen, {
      B: { '14': 'ww', '15': 'f', '16': 'ww' },
      TP: { '14': 'KM', '15': 'E', '16': '-KM' },
    })
    expect(plan.patient.name).toBe('')
    expect(plan.patient.vorname).toBe('')
    expect(plan.zaehne['15'].B).toBe('f')
    expect(plan.zaehne['14'].TP).toBe('KM')
    expect(plan.zaehne['16'].TP).toBe('KM')
    expect(plan.zaehne['16'].bAnfang || plan.zaehne['16'].bEnde).toBe(true)
    expect(plan.positionen.length).toBeGreaterThan(0)
    expect(plan.zaehne['14'].R).not.toBe('')
  })

  it('übernimmt die Regelzeile vom Blatt und die GOZ- und Laborpositionen', () => {
    const { plan } = planAusSchema(leererPlan().einstellungen, {
      B: { '16': 'ww' },
      R: { '16': 'KV' },
      TP: { '16': 'KM' },
    }, [
      { ebene: 'GOZ', nr: '2210', zahn: '16', anzahl: 1, faktor: 3.5 },
      { ebene: 'BEL', nr: '1021', zahn: '16', anzahl: 1, betrag: 18.4 },
      { ebene: 'BEB', nr: '2281', zahn: '16', anzahl: 1 },
    ])
    expect(plan.zaehne['16'].R).toBe('KV')
    expect(plan.zaehne['16'].TP).toBe('KM')
    expect(plan.positionen.some((p) => p.ebene === 'GOZ' && p.nr === '2210' && p.faktor === 3.5)).toBe(true)
    expect(plan.positionen.some((p) => p.ebene === 'BEL' && p.nr === '1021')).toBe(true)
    expect(plan.positionen.some((p) => p.ebene === 'BEB' && p.nr === '2281')).toBe(true)
    expect(plan.positionen.some((p) => p.ebene === 'BEMA' && p.zahn === '16' && (p.nr === '20a' || p.nr === '20b' || p.nr === '20c'))).toBe(false)
  })

  it('ohne Therapieplanung trägt die Regelversorgung ein', () => {
    const { plan } = planAusSchema(leererPlan().einstellungen, {
      B: { '26': 'ww' },
    })
    expect(plan.zaehne['26'].B).toBe('ww')
    expect(plan.zaehne['26'].TP).toBe('')
    expect(plan.zaehne['26'].R).not.toBe('')
    expect(plan.positionen.some((p) => p.ebene === 'BEMA' || p.ebene === 'GOZ')).toBe(true)
  })
})
