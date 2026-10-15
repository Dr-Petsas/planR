import { describe, expect, it } from 'vitest'
import { rechnen } from './kons'
import { pvsPlaene } from './pvs'
import { neuerPlan, STANDARD_EINSTELLUNGEN as einst } from '../store'
import type { Plan, ZahnLeistung } from '../types'

function plan(zaehne: Record<string, ZahnLeistung>, stufe = 0): Plan {
  const p = neuerPlan('T-1', einst)
  return { ...p, datum: '15.10.2026', zaehne, regler: { ...p.regler, stufe, faktor: 2.3 } }
}

describe('Privat-Kons fürs Praxisprogramm', () => {
  it('Kostenvoranschlag Art KO, Gesamtsumme = Summe des Plans, ohne Befund (bleibt der aus DS-Win)', () => {
    const p = plan({ '36': { therapie: 'endo', kanaele: 3, vital: false }, '26': { therapie: 'inlay', flaechen: 3, labor: 'keramik' } }, 2)
    const r = rechnen(p, einst)
    const [kva, ...rest] = pvsPlaene(p, r)
    expect(rest).toEqual([])
    expect(kva).toMatchObject({ planart: 'kva', art: 'KO', datum: '2026-10-15' })
    expect(kva.zaehne).toBeUndefined()
    expect(kva.positionen.map((x) => x.nr)).toContain('2360a')
    expect(kva.positionen.some((x) => x.nr === 'MwSt.')).toBe(false)
    expect(kva.summen.gesamt).toBeCloseTo(r.summe, 2)
    expect(kva.summen.honorar).toBeCloseTo(kva.positionen.filter((x) => x.ebene === 'GOZ' || x.ebene === 'GOAE').reduce((s, x) => s + x.betrag, 0), 2)
  })

  it('GOÄ ohne „Ä“, Zuschläge zum Einfachsatz, Regionen ohne Zahnangabe', () => {
    const p = plan({ '36': { therapie: 'endo', kanaele: 3, vital: true } }, 4)
    const r = rechnen(p, einst)
    const [kva] = pvsPlaene(p, r)
    for (const x of kva.positionen.filter((y) => y.ebene === 'GOAE')) expect(x.nr).toMatch(/^\d+$/)
    for (const x of kva.positionen) expect(x.zahn).toMatch(/^(|OK|UK|OK,UK|[1-4][1-8].*)$/)
    const zuschlag = r.begleit.find((x) => x.ebene === 'ZUSCHLAG')
    if (zuschlag) expect(kva.positionen.find((x) => x.nr === zuschlag.nr)?.faktor).toBe(1)
    expect(kva.summen.gesamt).toBeCloseTo(r.summe, 2)
  })

  it('Inlay-Labor der Praxis als Eigenlabor nach BEB', () => {
    const eigenlabor = [{ nr: '02552', text: 'Inlay Keramik zweiflächig', preis: 140, quelle: 'pvs' as const }]
    const p = plan({ '16': { therapie: 'inlay', flaechen: 2, labor: 'keramik' } })
    const [kva] = pvsPlaene(p, rechnen(p, { ...einst, eigenlabor }))
    expect(kva.positionen.find((x) => x.ebene === 'BEB' && x.nr === '2552')).toMatchObject({ labor: 'eigen', zahn: '16', einzelpreis: 140 })
    expect(kva.summen.laborEigen).toBeGreaterThan(140)
  })
})
