import { describe, expect, it } from 'vitest'
import { rechnen } from './mkv'
import { pvsPlaene } from './pvs'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../store'
import type { Einstellungen, Plan, ZahnLeistung } from '../types'

const einst: Einstellungen = { ...STANDARD_EINSTELLUNGEN, punktwertFest: { KCH: 1.2 } }

function plan(zaehne: Record<string, ZahnLeistung>, patch: Partial<Plan> = {}): Plan {
  const p = neuerPlan('T-1', einst)
  return { ...p, datum: '15.10.2026', zaehne, regler: { ...p.regler, modell: 'gozDifferenz', faktor: 2.3 }, ...patch }
}

describe('Füllungs-MKV fürs Praxisprogramm', () => {
  it('Komposit: Hauptleistung als Mehrkostenleistung, BEMA 13 als Kassenanteil, Summe = Mehrkosten des Plans', () => {
    const p = plan({ '36': { therapie: 'komposit', flaechen: 3 }, '46': { therapie: 'komposit', flaechen: 1, kofferdam: true } })
    const r = rechnen(p, einst)
    const [mkv, ...rest] = pvsPlaene(p, r)
    expect(rest).toEqual([])
    expect(mkv).toMatchObject({ format: 'planr-plan', planart: 'mkv', art: 'KO', datum: '2026-10-15', zaehne: { '36': { TP: 'F3' }, '46': { TP: 'F1' } } })
    expect(mkv.positionen.filter((x) => x.mkv).map((x) => [x.nr, x.zahn])).toEqual([['2060', '46'], ['2100', '36']])
    const bema = mkv.positionen.filter((x) => x.ebene === 'BEMA')
    expect(bema.map((x) => x.nr)).toEqual(['13a', '13c'])
    for (const b of bema) expect(b.betrag).toBeCloseTo(b.punkte! * b.punktwert!, 2)
    expect(mkv.positionen.map((x) => x.nr)).toContain('2040')
    expect(mkv.summen.honorar).toBeCloseTo(mkv.positionen.filter((x) => x.ebene === 'GOZ').reduce((s, x) => s + x.betrag, 0), 2)
    expect(mkv.summen.gesamt).toBeCloseTo(r.mehrkosten, 2)
  })

  it('Faktor über 2,3: Mehrkostenleistung mit Begründung, eigener Text je Nummer', () => {
    const p = plan({ '36': { therapie: 'komposit', flaechen: 3, kofferdam: true } })
    const hoch = { ...p, regler: { ...p.regler, faktor: 3 }, begruendungen: { '2040': 'Kofferdam bei stark geneigtem Zahn nur mit Zusatzklammer.' } }
    const r = rechnen(hoch, einst)
    const [mkv] = pvsPlaene(hoch, r)
    expect(mkv.positionen.find((x) => x.mkv)?.begruendung).toMatch(/Mehrschichttechnik/)
    expect(mkv.positionen.find((x) => x.nr === '2040')?.begruendung).toBe('Kofferdam bei stark geneigtem Zahn nur mit Zusatzklammer.')
    expect(r.begruendungen.map((b) => [b.nr, b.eigen])).toEqual([['2100', false], ['2040', true]])
    const [normal] = pvsPlaene(p, rechnen(p, einst))
    expect(normal.positionen.some((x) => x.begruendung)).toBe(false)
  })

  it('Keramik-Inlay: Labor mit MwSt. in der Laborsumme, Kürzel Y, Gold-Inlay Kürzel I', () => {
    const p = plan({ '26': { therapie: 'inlay', flaechen: 3, labor: 'keramik' }, '27': { therapie: 'inlay', flaechen: 2, labor: 'gold' } })
    const r = rechnen(p, einst)
    const [mkv] = pvsPlaene(p, r)
    expect(mkv.zaehne).toEqual({ '26': { TP: 'Y3' }, '27': { TP: 'I2' } })
    expect(mkv.positionen.some((x) => x.nr === 'MwSt.')).toBe(false)
    const labor = r.zaehne.flatMap((z) => z.zeilen).filter((x) => x.ebene === 'LABOR').reduce((s, x) => s + x.summe, 0)
    expect(mkv.summen.laborEigen + mkv.summen.laborFremd).toBeCloseTo(labor, 2)
    expect(mkv.summen.gesamt).toBeCloseTo(r.mehrkosten, 2)
    const lab = mkv.positionen.filter((x) => x.ebene === 'BEB' || x.ebene === 'MAT' || x.ebene === 'LABOR')
    expect(lab.reduce((s, x) => s + x.betrag * (1 + x.mwst! / 100), 0)).toBeCloseTo(labor, 1)
  })

  it('Austausch und Glasfaserstift: eigener Kostenvoranschlag nach § 8 Abs. 7 BMV-Z', () => {
    const p = plan({ '16': { therapie: 'komposit', flaechen: 2, austausch: true }, '15': { therapie: 'aufbau', flaechen: 3, stift: true, mehrschicht: true } })
    const r = rechnen(p, einst)
    const plaene = pvsPlaene(p, r)
    expect(plaene.map((x) => x.planart)).toEqual(['mkv', 'kva'])
    const kva = plaene[1]
    expect(kva.art).toBe('KO')
    expect(kva.positionen.filter((x) => x.ebene === 'GOZ').map((x) => `${x.nr} ${x.zahn}`)).toEqual(['2080 16', '2195 15', '2197 15'])
    expect(kva.positionen.find((x) => x.ebene === 'MAT')).toMatchObject({ labor: 'eigen', zahn: '15' })
    const austausch = r.zaehne.find((z) => z.zahn === '16')!.privat
    expect(kva.summen.gesamt).toBeCloseTo(austausch + r.privat7Summe, 2)
  })

  it('ohne Mehrkosten (GOZ unter dem Kassenanteil) keine Mehrkostenvereinbarung', () => {
    const p = plan({ '36': { therapie: 'komposit', flaechen: 1, faktor: 1 } })
    const r = rechnen(p, einst)
    expect(r.zaehne[0].mehrkosten).toBe(0)
    expect(pvsPlaene(p, r)).toEqual([])
  })
})
