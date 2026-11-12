import { describe, expect, it } from 'vitest'
import { leererPlan } from './store/plan'
import { planAusSchema, zuschussAbgleich } from './probeImport'
import { berechnen, type Listen } from './engine/berechnung'
import { STANDARD_LISTEN } from './store/preislisten'
import type { HkpPlan, Preisliste } from './types'

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

  // Testplan 1, so gelesen: Lückenschluss )( an 26 kam als x an, im Oberkiefer steht auf dem Blatt keine Regelversorgung.
  const testplan1 = {
    B: { '11': 'k', '12': 'k', '18': 'f', '21': 'k', '22': 'k', '26': 'x', '35': 'k', '36': 'k', '38': 'f', '46': 'f', '47': 'f', '48': 'f' },
    R: { '34': 'H', '45': 'H', '46': 'E', '47': 'E' },
    TP: { '46': 'SKM', '47': 'SKM' },
  }

  it('erfindet im Oberkiefer keine Brücke, wenn dort auf dem Blatt keine Regelversorgung steht', () => {
    const { plan, hinweise } = planAusSchema(leererPlan().einstellungen, testplan1)
    for (const z of ['25', '26', '27']) expect(plan.zaehne[z].R).toBe('')
    expect(plan.positionen.some((p) => ['25', '26', '27'].includes(p.zahn))).toBe(false)
    expect(hinweise.some((h) => h.startsWith('Oberkiefer: auf dem Blatt weder Regelversorgung noch Therapie') && h.includes('26 B'))).toBe(true)
    expect(Object.fromEntries(Object.entries(plan.zaehne).filter(([, z]) => z.R).map(([n, z]) => [n, z.R]))).toEqual(testplan1.R)
  })

  it('liest x als Lückenschluss, wenn nur so die Regelzeile vom Blatt herauskommt', () => {
    const { plan, hinweise } = planAusSchema(leererPlan().einstellungen, {
      B: { '25': 'ww', '26': 'x', '27': 'ww', '46': 'f', '47': 'f', '48': 'f' },
      R: { '25': 'KV', '27': 'K', '34': 'H', '45': 'H', '46': 'E', '47': 'E' },
      TP: { '25': 'KM', '27': 'KM', '46': 'SKM', '47': 'SKM' },
    })
    expect(plan.zaehne['26'].B).toBe(')(')
    expect(plan.zaehne['26'].R).toBe('')
    expect(hinweise.some((h) => h.startsWith('Zahn 26: „x“ gelesen') && h.includes('„)(“'))).toBe(true)
  })

  it('lässt ein echtes x stehen, wenn das Blatt die Brücke trägt', () => {
    const { plan, hinweise } = planAusSchema(leererPlan().einstellungen, {
      B: { '11': 'k', '12': 'x', '13': 'k' },
      R: { '11': 'KV', '12': 'BV', '13': 'KV' },
      TP: { '11': 'KM', '12': 'BM', '13': 'KM' },
    })
    expect(plan.zaehne['12'].B).toBe('x')
    expect(plan.zaehne['12'].R).toBe('BV')
    expect(hinweise.some((h) => h.startsWith('Zahn 12: „x“ gelesen'))).toBe(false)
    expect(hinweise.some((h) => h.startsWith('Regelversorgung weicht'))).toBe(false)
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

describe('Festzuschuss vom Blatt als Gegenprobe', () => {
  const liste = <T extends Preisliste['typ']>(typ: T, id: string) => STANDARD_LISTEN.find((l) => l.typ === typ && l.id === id) as Preisliste<T>
  const LISTEN: Listen = {
    bema: liste('bema', 'bema-2026'), goz: liste('goz', 'goz-2012'), bel: liste('bel2', 'bel2-bayern-2026'),
    beb: liste('beb', 'beb-itz-2024'), fz: liste('festzuschuss', 'fz-2026'),
  }
  const { plan } = planAusSchema(leererPlan().einstellungen, { B: { '14': 'ww', '15': 'f', '16': 'ww' }, R: { '14': 'KV', '15': 'BV', '16': 'KV' }, TP: { '14': 'KM', '15': 'BM', '16': 'KM' } })
  const bei = (zuschuss: HkpPlan['zuschuss']) => berechnen({ ...plan, zuschuss }, LISTEN).summen.festzuschuss

  it('bleibt still, wenn der Festzuschuss passt oder nicht gelesen wurde', () => {
    expect(bei(plan.zuschuss)).toBeGreaterThan(0)
    expect(zuschussAbgleich(plan, LISTEN, { festzuschuss: bei(plan.zuschuss) }).hinweise).toEqual([])
    expect(zuschussAbgleich(plan, LISTEN, {}).hinweise).toEqual([])
    expect(zuschussAbgleich(leererPlan(), LISTEN, { festzuschuss: 571.29 }).hinweise).toEqual([])
  })

  it('übernimmt die Bonusstufe, zu der der Festzuschuss vom Blatt passt', () => {
    const r = zuschussAbgleich(plan, LISTEN, { festzuschuss: bei({ bonus: '70', haertefall: false }) })
    expect(r.plan.zuschuss).toEqual({ bonus: '70', haertefall: false })
    expect(r.hinweise[0]).toContain('70 %')
  })

  it('meldet einen Festzuschuss, der zu keiner Stufe passt', () => {
    const r = zuschussAbgleich(plan, LISTEN, { festzuschuss: bei(plan.zuschuss) + 123.45 })
    expect(r.plan).toBe(plan)
    expect(r.hinweise[0]).toContain('Festzuschuss weicht vom Blatt ab')
  })
})
