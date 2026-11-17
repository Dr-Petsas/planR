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
    // Netto je Laborzeile plus deren MwSt.-Satz ergibt die Laborsumme (DENS rechnet so je Laborposition).
    const lab = kva.positionen.filter((x) => x.ebene === 'BEB' || x.ebene === 'MAT' || x.ebene === 'LABOR')
    expect(lab.length).toBeGreaterThan(0)
    expect(lab.reduce((s, x) => s + x.betrag * (1 + x.mwst! / 100), 0)).toBeCloseTo(kva.summen.laborEigen + kva.summen.laborFremd, 1)
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

  it('Begründung für Faktoren über 2,3: Standard je Leistungsgruppe, eigener Text je Nummer, nur oberhalb der Schwelle', () => {
    const p = plan({ '46': { therapie: 'komposit', flaechen: 3, faktor: 3 }, '36': { therapie: 'endo', kanaele: 3, vital: false, faktor: 2.8 }, '16': { therapie: 'komposit', flaechen: 1 } })
    const eigen = 'Kavitätenrand distal tief subgingival, Kofferdam nur mit Ligatur haltbar.'
    const r = rechnen({ ...p, begruendungen: { '2410': eigen } }, einst)
    const [kva] = pvsPlaene(p, r)
    const goz = (nr: string, zahn: string) => kva.positionen.find((x) => x.ebene === 'GOZ' && x.nr === nr && x.zahn === zahn)
    expect(goz('2100', '46')?.begruendung).toMatch(/Mehrschichttechnik/)
    expect(goz('2060', '16')?.begruendung).toBeUndefined()
    expect(r.begruendungen.find((b) => b.nr === '2410')).toMatchObject({ faktor: 2.8, text: eigen, eigen: true })
    expect(r.begruendungen.find((b) => b.nr === '2100')).toMatchObject({ faktor: 3, eigen: false })
    for (const x of kva.positionen) {
      if (x.ebene === 'GOZ' && (x.faktor ?? 0) > 2.3) expect(x.begruendung?.length).toBeGreaterThan(0)
      expect((x.begruendung ?? '').length).toBeLessThanOrEqual(274)
    }
  })

  it('Inlay-Labor der Praxis als Eigenlabor nach BEB', () => {
    const eigenlabor = [{ nr: '02552', text: 'Inlay Keramik zweiflächig', preis: 140, quelle: 'pvs' as const }]
    const p = plan({ '16': { therapie: 'inlay', flaechen: 2, labor: 'keramik' } })
    const [kva] = pvsPlaene(p, rechnen(p, { ...einst, eigenlabor }))
    expect(kva.positionen.find((x) => x.ebene === 'BEB' && x.nr === '2552')).toMatchObject({ labor: 'eigen', zahn: '16', einzelpreis: 140 })
    expect(kva.summen.laborEigen).toBeGreaterThan(140)
  })
})
