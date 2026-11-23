/**
 * Golden-Master-Schutz fuer die Privat-ZE-Abrechnung (ZE/Privat-HKP).
 * Friert reale Privat-Kostenvoranschläge mit exakten GOZ-/BEB-Positionen und Euro-Summen ein.
 */
import { describe, expect, it } from 'vitest'
import { kalkulieren } from './berechnung'
import { STANDARD_EINSTELLUNGEN, neuerPlan } from '../store'

function kurz(k: ReturnType<typeof kalkulieren>) {
  return {
    goz: k.honorar.map((z) => `${z.nr}${z.zahn ? `@${z.zahn}` : ''}×${z.anzahl}@${z.faktor ?? ''}=${z.betrag.toFixed(2)}`),
    laborAnzahl: k.labor.length,
    summen: {
      honorar: k.summeHonorar,
      labor: k.summeLaborNetto,
      material: k.summeMaterial,
      mwst: k.mwst,
      gesamt: k.gesamt,
    },
  }
}

describe('Golden Master: Privat-HKP Abrechnungsstabilität', () => {
  it('1. Vollkeramik-Brücke 14–16 + Krone 26 (Zirkon, Standard-Einstellungen)', () => {
    const plan = {
      ...neuerPlan(1),
      abformung: 'abdruck' as const,
      zaehne: {
        14: { B: 'kw', TP: 'BM' },
        15: { B: 'f', TP: 'BM' },
        16: { B: 'kw', TP: 'BM' },
        26: { B: 'kw', TP: 'KM' },
      },
      werkstoffe: { 14: 'zirkon' as const, 15: 'zirkon' as const, 16: 'zirkon' as const, 26: 'zirkon' as const },
    }
    const k = kalkulieren(plan, STANDARD_EINSTELLUNGEN)
    expect(k.honorar.some((z) => z.nr === '34')).toBe(false)
    expect(kurz(k)).toMatchInlineSnapshot(`
      {
        "goz": [
          "0010×1@2.3=12.94",
          "0030×1@2.3=25.87",
          "2210@26×1@2.3=217.06",
          "2270@26×1@2.3=34.93",
          "2290@14×1@2.3=23.28",
          "2290@16×1@2.3=23.28",
          "2290@26×1@2.3=23.28",
          "3×1@2.3=20.11",
          "5070@16-14×1@2.3=51.74",
          "6×1@2.3=13.41",
        ],
        "laborAnzahl": 15,
        "summen": {
          "gesamt": 1611.12,
          "honorar": 445.9,
          "labor": 1088.99,
          "material": 0,
          "mwst": 76.23,
        },
      }
    `)
  })

  it('2. GOZ-Faktor-Steigerung und BEB-Aufschlag erhöhen die Endsumme deterministisch', () => {
    const basis = {
      ...neuerPlan(1),
      abformung: 'abdruck' as const,
      zaehne: { 26: { B: 'kw', TP: 'KM' } },
      werkstoffe: { 26: 'zirkon' as const },
      regler: { gozStufe: 0, gozFaktor: 0, laborStufe: 0, laborAufschlag: 0, aus: [] },
    }
    const hoch = {
      ...basis,
      regler: { gozStufe: 1, gozFaktor: 3.5, laborStufe: 0, laborAufschlag: 25, aus: [] },
    }
    const k0 = kalkulieren(basis, STANDARD_EINSTELLUNGEN)
    const k1 = kalkulieren(hoch, STANDARD_EINSTELLUNGEN)
    expect(k1.gesamt).toBeGreaterThan(k0.gesamt)
    expect({ basis: kurz(k0), hoch: kurz(k1) }).toMatchInlineSnapshot()
  })
})
