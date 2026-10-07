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
    expect(nrn).toEqual(['2170', '2197', 'Labor', '0090'])
    expect(r.zaehne[0].kasse?.nr).toBe('13c')
  })

  it('Gold-Inlay ohne 2197, Goldhämmerfüllung analog', () => {
    const g = rechnen(plan({ '26': { therapie: 'inlay', flaechen: 2, labor: 'gold' } }), einst)
    expect(g.zaehne[0].zeilen.map((x) => x.nr)).toEqual(['2160', 'Labor'])
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
