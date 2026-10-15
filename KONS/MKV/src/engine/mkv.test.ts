import { describe, expect, it } from 'vitest'
import { rechnen } from './mkv'
import { BEMA_13, bemaFuer } from '../data/katalog'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../store'
import { ausKuerzel } from '../components/Zahnschema'
import type { Einstellungen, MkvModell, Plan, ZahnLeistung } from '../types'

const einst: Einstellungen = { ...STANDARD_EINSTELLUNGEN, punktwertFest: { KCH: 1.2 } }

function plan(zaehne: Record<string, ZahnLeistung>, modell: MkvModell = 'gozDifferenz', patch: Partial<Plan['regler']> = {}): Plan {
  const p = neuerPlan('T-1', einst)
  return { ...p, zaehne, regler: { ...p.regler, modell, faktor: 2.3, ...patch } }
}

describe('BEMA 13 seit 01.01.2025', () => {
  it('13a-d mit 33/41/53/63 Punkten, ab vier Flächen 13d', () => {
    expect(BEMA_13.map((b) => b.punkte)).toEqual([33, 41, 53, 63])
    expect(bemaFuer(5).nr).toBe('13d')
  })
})

describe('Mehrkosten = GOZ minus Kassenanteil', () => {
  it('GOZ-Faktor: zweiflächige Kompositfüllung 2080 zum 2,3-fachen minus 13b', () => {
    const r = rechnen(plan({ '36': { therapie: 'komposit', flaechen: 2 } }), einst)
    const z = r.zaehne[0]
    expect(z.zeilen[0].nr).toBe('2080')
    expect(z.privat).toBe(71.92)
    expect(z.kassenanteil).toBe(49.2)
    expect(z.mehrkosten).toBe(22.72)
  })

  it('fester Betrag je Fläche: der Faktor ergibt sich aus dem Betrag', () => {
    const r = rechnen(plan({ '46': { therapie: 'komposit', flaechen: 3 } }, 'proFlaeche', { proFlaeche: 20 }), einst)
    const z = r.zaehne[0]
    expect(z.ziel).toBe(60)
    expect(Math.abs(z.mehrkosten - 60)).toBeLessThan(0.5)
    expect(z.faktor).toBeGreaterThan(1)
  })

  it('fester Betrag je Füllung ist unabhängig von der Flächenzahl', () => {
    const r = rechnen(plan({ '16': { therapie: 'komposit', flaechen: 1 }, '26': { therapie: 'komposit', flaechen: 4 } }, 'proZahn', { proZahn: 50 }), einst)
    for (const z of r.zaehne) expect(Math.abs(z.mehrkosten - 50)).toBeLessThan(0.5)
    expect(r.zaehne[0].faktor).toBeGreaterThan(r.zaehne[1].faktor)
  })

  it('kein Mehrkostenbetrag deckt schon der Kassenanteil das 1,57-fache', () => {
    const r = rechnen(plan({ '36': { therapie: 'komposit', flaechen: 2 } }, 'proZahn', { proZahn: 0 }), einst)
    expect(r.zaehne[0].faktor).toBe(1.57)
    expect(r.zaehne[0].mehrkosten).toBeLessThan(0.05)
  })

  it('Betrag unter dem Einfachsatz: Faktor 1,0 und Warnung', () => {
    const niedrig = { ...einst, punktwertFest: { KCH: 0.3 } }
    const r = rechnen(plan({ '36': { therapie: 'komposit', flaechen: 2 } }, 'proZahn', { proZahn: 0 }), niedrig)
    expect(r.zaehne[0].faktor).toBe(1)
    expect(r.zaehne[0].warnungen.join()).toMatch(/Einfachsatz/)
  })

  it('über 3,5 landet die Position in der Vereinbarung nach § 2 GOZ', () => {
    const r = rechnen(plan({ '36': { therapie: 'komposit', flaechen: 2 } }, 'proFlaeche', { proFlaeche: 60 }), einst)
    expect(r.zaehne[0].faktor).toBeGreaterThan(3.5)
    expect(r.vereinbarung2.map((x) => x.nr)).toContain('2080')
  })
})

describe('Grenzen der Mehrkostenregelung', () => {
  it('Austausch intakter Füllung: kein Kassenanteil, komplett privat', () => {
    const r = rechnen(plan({ '36': { therapie: 'komposit', flaechen: 2, austausch: true } }, 'proFlaeche'), einst)
    expect(r.zaehne[0].kassenanteil).toBe(0)
    expect(r.zaehne[0].kasse).toBeNull()
    expect(r.zaehne[0].ziel).toBeUndefined()
    expect(r.zaehne[0].warnungen.join()).toMatch(/§ 28 Abs. 2 S. 5/)
  })

  it('Frontzahn: adhäsiv ist Kassenleistung, nur Mehrfarbentechnik ist mehrkostenfähig', () => {
    const k = rechnen(plan({ '11': { therapie: 'komposit', flaechen: 2 } }), einst)
    const m = rechnen(plan({ '11': { therapie: 'mehrfarben', flaechen: 2 } }), einst)
    expect(k.zaehne[0].warnungen.join()).toMatch(/Mehrfarbentechnik/)
    expect(m.zaehne[0].warnungen).toEqual([])
  })
})

describe('Einlage- und Goldhämmerfüllungen', () => {
  it('Keramik-Inlay mit adhäsiver Befestigung 2197 und Labor', () => {
    const r = rechnen(plan({ '26': { therapie: 'inlay', flaechen: 3, labor: 'keramik', anaesthesie: true } }), einst)
    const nrn = r.zaehne[0].zeilen.map((x) => x.nr)
    expect(nrn).toEqual(['2170', '2197', 'Labor', '0090', 'MwSt.'])
    expect(r.zaehne[0].kasse?.nr).toBe('13c')
    const z = r.zaehne[0].zeilen
    expect(z[4].summe).toBeCloseTo(z[2].summe * 0.07, 2)
  })

  it('Gold-Inlay ohne 2197, Goldhämmerfüllung analog', () => {
    const g = rechnen(plan({ '26': { therapie: 'inlay', flaechen: 2, labor: 'gold' } }), einst)
    expect(g.zaehne[0].zeilen.map((x) => x.nr)).toEqual(['2160', 'Labor', 'MwSt.'])
    const h = rechnen(plan({ '26': { therapie: 'goldhaemmer', flaechen: 1 } }), einst)
    expect(h.zaehne[0].zeilen[0]).toMatchObject({ nr: '2150a', ebene: 'ANALOG' })
  })

  it('Laborregler verschiebt den Laborpreis', () => {
    const z = { '26': { therapie: 'inlay', flaechen: 2, labor: 'keramik' } as ZahnLeistung }
    const lab = (k: number) => rechnen(plan(z, 'gozDifferenz', { laborKlasse: k }), einst).zaehne[0].zeilen.find((x) => x.ebene === 'LABOR')!.summe
    expect(lab(0)).toBeLessThan(lab(1))
    expect(lab(2)).toBeGreaterThan(lab(1))
  })
})

describe('Kofferdam und Kürzel', () => {
  it('Kofferdam je Kieferhälfte bzw. Frontzahnbereich, nicht je Zahn', () => {
    const r = rechnen(plan({
      '16': { therapie: 'komposit', flaechen: 2, kofferdam: true },
      '17': { therapie: 'komposit', flaechen: 1, kofferdam: true },
      '26': { therapie: 'komposit', flaechen: 1, kofferdam: true },
    }), einst)
    expect(r.begleit).toHaveLength(1)
    expect(r.begleit[0]).toMatchObject({ nr: '2040', anzahl: 2 })
    expect(r.mehrkosten).toBeCloseTo(r.zaehne.reduce((s, z) => s + z.mehrkosten, 0) + r.begleit[0].summe, 2)
  })

  it('Kürzel mit Flächenzahl: K3, I5 wird auf drei Flächen begrenzt, letzte Ziffer zählt', () => {
    expect(ausKuerzel('k3')).toMatchObject({ therapie: 'komposit', flaechen: 3 })
    expect(ausKuerzel('I5')).toMatchObject({ therapie: 'inlay', flaechen: 3, labor: 'keramik' })
    expect(ausKuerzel('K24', { therapie: 'komposit', flaechen: 2 })).toMatchObject({ flaechen: 4 })
    expect(ausKuerzel('X')).toBe('unbekannt')
    expect(ausKuerzel('')).toBeNull()
  })
})

describe('Aufbau, Stift und Privatvereinbarung (§ 8 Abs. 7 BMV-Z)', () => {
  it('adhäsiver Aufbau: GOZ 2180 + 2197 gegen BEMA 13 nach Flächen, kein fester Betrag', () => {
    const r = rechnen(plan({ '36': { therapie: 'aufbau', flaechen: 2 } }, 'proZahn', { proZahn: 40 }), einst)
    const z = r.zaehne[0]
    expect(z.zeilen.map((x) => x.nr)).toEqual(['2180', '2197'])
    expect(z.kasse?.nr).toBe('13b')
    expect(z.ziel).toBeUndefined()
    expect(z.faktor).toBe(2.3)
    expect(ausKuerzel('A5')).toMatchObject({ therapie: 'aufbau', flaechen: 4 })
  })

  it('Glasfaserstift ist keine MKV: eigene Privatvereinbarung, nicht in den Mehrkosten', () => {
    const ohne = rechnen(plan({ '36': { therapie: 'aufbau', flaechen: 3 } }), einst)
    const mit = rechnen(plan({ '36': { therapie: 'aufbau', flaechen: 3, stift: true } }), einst)
    expect(mit.mehrkosten).toBe(ohne.mehrkosten)
    expect(mit.privat7.map((x) => x.nr)).toEqual(['2195', '2197', 'Mat.'])
    expect(mit.privat7[2].summe).toBe(18)
    expect(mit.zaehne[0].zeilen.map((x) => x.nr)).toEqual(['2180', '2197'])
    expect(mit.privat7Summe).toBeGreaterThan(0)
    expect(mit.zaehne[0].hinweise.some((h) => h.includes('§ 8 Abs. 7'))).toBe(true)
  })

  it('plastischer Aufbau 2180 + 2197 liegt unter 13c – mehrschichtig analog 2120 ergibt Mehrkosten', () => {
    const plastisch = rechnen(plan({ '36': { therapie: 'aufbau', flaechen: 3 } }), einst).zaehne[0]
    expect(plastisch.mehrkosten).toBe(0)
    expect(plastisch.warnungen.some((w) => w.includes('analog 2120'))).toBe(true)
    const schicht = rechnen(plan({ '36': { therapie: 'aufbau', flaechen: 3, mehrschicht: true } }), einst).zaehne[0]
    expect(schicht.zeilen.map((x) => x.nr)).toEqual(['2120a', '2197'])
    expect(schicht.mehrkosten).toBeGreaterThan(0)
  })

  it('Frontzahn: adhäsiver Aufbau ist Kassenleistung', () => {
    expect(rechnen(plan({ '11': { therapie: 'aufbau', flaechen: 2 } }), einst).zaehne[0].warnungen.some((w) => w.includes('Kassenleistung'))).toBe(true)
  })

  it('besondere Maßnahmen und Kofferdam je Region mit Hinweis auf BEMA 12', () => {
    const r = rechnen(plan({ '36': { therapie: 'komposit', flaechen: 2, bmf: true, kofferdam: true }, '37': { therapie: 'komposit', flaechen: 1, bmf: true } }), einst)
    expect(r.begleit.map((b) => `${b.nr} x${b.anzahl}`)).toEqual(['2030 x1', '2040 x1'])
    expect(r.hinweise.some((h) => h.includes('BEMA 12'))).toBe(true)
  })

  it('Inlay: Provisorium privat; 0080, 1020 und 2197 neben Komposit nur als Privatvereinbarung', () => {
    const p = plan({ '16': { therapie: 'inlay', flaechen: 2, labor: 'keramik', provisorium: true }, '26': { therapie: 'komposit', flaechen: 2 } })
    const r = rechnen({ ...p, privat: { oberflaeche: true, fluorid: true, adhaesivKomposit: true } }, einst)
    expect(r.zaehne[0].zeilen.map((x) => x.nr)).toContain('2260')
    expect(r.privat7.map((x) => `${x.nr}${x.zahn ? ' ' + x.zahn : ''} x${x.anzahl}`)).toEqual(['0080 x2', '1020 x1', '2197 26 x1'])
    expect(r.hinweise.some((h) => h.includes('strittig'))).toBe(true)
  })

  it('Inlay-Labor einzeln nach BEB, wenn der Praxiskatalog das Inlay führt; Modelle je Kiefer, nicht je Zahn', () => {
    const eigenlabor = [{ nr: '02552', text: 'Inlay aus Keramik, gefräst, zweiflächig', preis: 140, quelle: 'pvs' as const }]
    const zwei = { '16': { therapie: 'inlay', flaechen: 2, labor: 'keramik' }, '17': { therapie: 'inlay', flaechen: 2, labor: 'keramik' } } as const
    const r = rechnen(plan(zwei), { ...einst, eigenlabor })
    const labor = r.zaehne[0].zeilen.filter((x) => x.ebene === 'LABOR')
    expect(labor.map((x) => x.nr)).toEqual(['BEB 2552', 'MwSt.'])
    expect(labor[0].einzel).toBe(140)
    expect(r.begleit.map((x) => `${x.nr} ${x.zahn ?? ''}`.trim())).toEqual(['BEB 0021 OK', 'BEB 0001 UK', 'BEB 0402', 'MwSt.'])
    expect(r.mehrkosten).toBeCloseTo(r.zaehne.reduce((s, z) => s + z.mehrkosten, 0) + r.begleit.reduce((s, x) => s + x.summe, 0), 2)
    const pauschal = rechnen(plan({ '16': { therapie: 'inlay', flaechen: 2, labor: 'keramik' } }), einst)
    expect(pauschal.zaehne[0].zeilen.filter((x) => x.ebene === 'LABOR').map((x) => x.nr)).toEqual(['Labor', 'MwSt.'])
    expect(pauschal.hinweise.some((h) => h.includes('Abdruck angenommen'))).toBe(true)
  })

  it('Intraoralscan: GOZ 0065 je Kieferhälfte bzw. Front plus Gegenkiefer, digitaler Laborablauf', () => {
    const eigenlabor = [{ nr: '02551', text: 'Inlay aus Keramik, gefräst, einflächig', preis: 120, quelle: 'pvs' as const }]
    const p = { ...plan({ '36': { therapie: 'inlay', flaechen: 1, labor: 'keramik' } }), abformung: 'scan' as const }
    const r = rechnen(p, { ...einst, eigenlabor })
    expect(r.begleit.find((x) => x.nr === '0065')).toMatchObject({ anzahl: 2 })
    expect(r.zaehne[0].zeilen.filter((x) => x.ebene === 'LABOR').map((x) => x.nr)).toEqual(
      ['BEB 2551', 'BEB 0013', 'BEB 0017', 'BEB 0904', 'BEB 0905', 'BEB 0909', 'BEB 0911', 'BEB 0906', 'MwSt.'])
    expect(r.begleit.filter((x) => x.ebene === 'LABOR').map((x) => x.nr)).toEqual(['BEB 0009', 'BEB 0009', 'BEB 0007', 'BEB 0901', 'BEB 0902', 'BEB 0903', 'MwSt.'])
  })
})
