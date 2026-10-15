import { describe, expect, it } from 'vitest'
import { kalkulieren } from './berechnung'
import { pvsPlaene } from './pvs'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../store'
import type { Zahn } from '../types'

const plan = (zaehne: Record<string, Zahn>) => ({ ...neuerPlan(7), datum: '15.10.2026', zaehne, abformung: 'abdruck' as const })

describe('Privat-ZE fürs Praxisprogramm', () => {
  it('Kostenvoranschlag Art ZE: GOZ einzeln, Labor und Material brutto in der Summe, Gesamt = Plan', () => {
    const p = plan({ '16': { B: 'kw', TP: 'KM' }, '15': { B: 'f', TP: 'BM' }, '14': { B: 'kw', TP: 'KM' }, '17': { B: '', TP: '' } })
    const k = kalkulieren(p, STANDARD_EINSTELLUNGEN)
    const [kva, ...rest] = pvsPlaene(p, k)
    expect(rest).toEqual([])
    expect(kva).toMatchObject({ planart: 'kva', art: 'ZE', datum: '2026-10-15', titel: expect.stringContaining('PlanR Privat-ZE') })
    expect(kva.zaehne).toEqual({ '14': { B: 'kw' }, '15': { B: 'f' }, '16': { B: 'kw' }, '17': { B: '' } })
    expect(kva.positionen.filter((x) => x.ebene === 'GOZ').map((x) => x.nr)).toEqual(expect.arrayContaining(['5010', '5070']))
    expect(kva.positionen.find((x) => x.nr === '5010')).toMatchObject({ faktor: expect.any(Number), art: 'ZE' })
    expect(kva.summen.honorar).toBeCloseTo(k.summeHonorar, 2)
    expect(kva.summen.laborEigen + kva.summen.laborFremd).toBeCloseTo(k.summeLaborNetto + k.mwst + k.summeMaterial, 2)
    expect(kva.summen.gesamt).toBeCloseTo(k.gesamt, 2)
  })

  it('Implantatkrone: Implantatleistungen als Art IM, Labor der Praxis als Eigenlabor', () => {
    const eigenlabor = [{ nr: '02101', text: 'Krone gegossen NEM', preis: 99, quelle: 'pvs' as const }]
    const p = plan({ '36': { B: 'i', TP: 'SKM' }, '26': { B: '', TP: 'K' } })
    const [kva] = pvsPlaene(p, kalkulieren(p, { ...STANDARD_EINSTELLUNGEN, eigenlabor }))
    expect(kva.positionen.filter((x) => x.ebene === 'GOZ' && x.nr?.startsWith('22')).every((x) => x.art === 'ZE')).toBe(true)
    expect(kva.positionen.filter((x) => x.ebene === 'GOZ' && /^90/.test(x.nr ?? '')).every((x) => x.art === 'IM')).toBe(true)
    expect(kva.positionen.find((x) => x.ebene === 'BEB' && x.nr === '2101')).toMatchObject({ labor: 'eigen', einzelpreis: 99 })
  })

  it('Begründung über dem Schwellenwert geht mit', () => {
    const p0 = plan({ '16': { B: 'kw', TP: 'KM' } })
    const p = { ...p0, regler: { ...p0.regler, gozFaktor: 3 } }
    const [kva] = pvsPlaene(p, kalkulieren(p, STANDARD_EINSTELLUNGEN))
    const goz = kva.positionen.filter((x) => x.ebene === 'GOZ')
    expect(goz.length).toBeGreaterThan(0)
    for (const x of goz) expect(x.faktor! > 2.3 ? x.begruendung : 'ohne').toMatch(/\S{3}/)
  })

  it('ohne Honorar kein Plan', () => {
    const p = plan({})
    expect(pvsPlaene(p, kalkulieren(p, STANDARD_EINSTELLUNGEN))).toEqual([])
  })
})
