import { describe, expect, it } from 'vitest'
import type { Plan, Zahn } from '../types'
import { STANDARD_EINSTELLUNGEN, STANDARD_GLOBAL, STANDARD_REGLER, neuerPlan } from '../store'
import { kalkulieren } from './berechnung'
import { pvsPlaene } from './pvs'

function plan(zaehne: Record<string, Zahn>, global: Partial<Plan['global']> = {}): Plan {
  const p = neuerPlan(3)
  return { ...p, datum: '15.10.2026', zaehne, implantate: {}, regionen: {}, global: { ...STANDARD_GLOBAL, ...global }, regler: { ...STANDARD_REGLER } }
}

describe('Implantologie fürs Praxisprogramm', () => {
  it('Kostenvoranschlag Art IM: GOZ und GOÄ einzeln, Material und Labor brutto, Gesamt = Plan', () => {
    const p = plan({ '36': { B: 'f', TP: 'I' } }, { bildgebung: 'opg+dvt' })
    const k = kalkulieren(p, STANDARD_EINSTELLUNGEN)
    const [kva, ...rest] = pvsPlaene(p, k)
    expect(rest).toEqual([])
    expect(kva).toMatchObject({ planart: 'kva', art: 'IM', datum: '2026-10-15', zaehne: { '36': { B: 'f' } } })
    expect(kva.positionen.filter((x) => x.ebene === 'GOZ').map((x) => x.nr)).toEqual(expect.arrayContaining(['9010', '0530']))
    expect(kva.positionen.filter((x) => x.ebene === 'GOAE').map((x) => x.nr)).toEqual(expect.arrayContaining(['5370', '5000']))
    expect(kva.positionen.filter((x) => x.ebene === 'GOZ' || x.ebene === 'GOAE').every((x) => x.art === 'IM' || x.art === 'ZE')).toBe(true)
    expect(kva.summen.honorar).toBeCloseTo(k.summeGoz + k.summeGoae, 2)
    expect(kva.summen.gesamt).toBeCloseTo(k.gesamt, 2)
  })

  it('Analogleistungen als „NNNNa“ mit Leistungstext', () => {
    const p = { ...plan({ '36': { B: 'f', TP: 'I' } }), regler: { ...STANDARD_REGLER, analogStufe: 4 } }
    const k = kalkulieren(p, STANDARD_EINSTELLUNGEN)
    const analog = [...k.honorarGoz, ...k.honorarGoae].filter((z) => z.analog)
    const [kva] = pvsPlaene(p, k)
    for (const z of analog) expect(kva.positionen).toContainEqual(expect.objectContaining({ nr: `${z.nr}a`, bezeichnung: z.text }))
  })

  it('Begründung über dem Schwellenwert geht mit (DENS: Faktorerklärung)', () => {
    const p = { ...plan({ '36': { B: 'f', TP: 'I' } }), regler: { ...STANDARD_REGLER, gozFaktor: 3, analogStufe: 4 } }
    const k = kalkulieren(p, STANDARD_EINSTELLUNGEN)
    const [kva] = pvsPlaene(p, k)
    const gesteigert = kva.positionen.filter((x) => x.ebene === 'GOZ' && !x.nr?.endsWith('a') && (x.faktor ?? 0) > 2.3)
    expect(gesteigert.length).toBeGreaterThan(0)
    for (const x of gesteigert) expect(x.begruendung).toMatch(/\S{3}/)
    const analog = kva.positionen.filter((x) => x.nr?.endsWith('a'))
    expect(analog.length).toBeGreaterThan(0)
    expect(analog.filter((x) => x.begruendung)).toEqual([])
  })
})
