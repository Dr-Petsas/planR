import { describe, expect, it } from 'vitest'
import type { Einstellungen, Plan, Regler, ZahnLeistung } from '../types'
import { STANDARD_EINSTELLUNGEN, STANDARD_REGLER } from '../store'
import { kalkulieren } from './berechnung'
import { planen } from './planung'
import { gozEinzel } from './listen'

const einst: Einstellungen = STANDARD_EINSTELLUNGEN

function plan(zaehne: Record<string, ZahnLeistung>, regler: Partial<Regler> = {}): Plan {
  return {
    nummer: 'MKV-TEST',
    datum: '2026-10-06',
    patient: { name: 'Test', geburtsdatum: '', kasse: '', versichertennr: '' },
    zaehne,
    regler: { ...STANDARD_REGLER, ...regler },
    anpassungen: [],
    manuell: [],
    entfernt: [],
    bemerkung: '',
  }
}

describe('Füllungs-Modell', () => {
  const f3 = { '16': { therapie: 'fuellung', flaechen: 3 } as ZahnLeistung }

  it('pauschal: Mehrkosten = Pauschale je Füllung', () => {
    const k = kalkulieren(plan(f3, { fuellungModell: 'pauschal', fuellungPauschale: 100 }), einst)
    expect(k.mehrkostenGesamt).toBe(100)
  })

  it('pro Fläche: Mehrkosten = Flächen × Betrag', () => {
    const k = kalkulieren(plan(f3, { fuellungModell: 'proFlaeche', fuellungProFlaeche: 40 }), einst)
    expect(k.mehrkostenGesamt).toBe(120)
  })

  it('GOZ-Differenz: Mehrkosten = GOZ − Kassenanteil', () => {
    const k = kalkulieren(plan(f3, { fuellungModell: 'gozDifferenz', gozFaktor: 2.3 }), einst)
    const g = k.gruppen[0]
    expect(g.gozSumme).toBeCloseTo(gozEinzel('2100', 2.3), 2) // dreiflächig → GOZ 2100
    expect(g.kassenanteil).toBe(einst.kassenanteile.F3)
    expect(g.mehrkosten).toBeCloseTo(Math.max(0, g.gozSumme - g.kassenanteil), 2)
  })

  it('Flächenzahl bestimmt die GOZ-Nummer', () => {
    const { positionen } = planen(plan({ '14': { therapie: 'fuellung', flaechen: 2 } }))
    expect(positionen.find((p) => p.ebene === 'GOZ')?.nr).toBe('2080') // zweiflächig
  })
})

describe('Verlangensleistung', () => {
  it('Versiegelung: komplett privat, kein Kassenanteil', () => {
    const k = kalkulieren(plan({ '15': { therapie: 'versiegelung' } }), einst)
    const g = k.gruppen[0]
    expect(g.art).toBe('verlangen')
    expect(g.kassenanteil).toBe(0)
    expect(g.gozSumme).toBeCloseTo(gozEinzel('2000', STANDARD_REGLER.gozFaktor), 2)
    expect(g.mehrkosten).toBe(g.gozSumme)
  })
})

describe('Endodontie', () => {
  it('Kassen-Endo: Mehrkosten = GOZ − Kassenanteil, mit BEMA-Positionen', () => {
    const k = kalkulieren(plan({ '36': { therapie: 'endo', kanaele: 3, elektrometrie: true, mikroskop: true } }), einst)
    const g = k.gruppen[0]
    expect(g.art).toBe('mehrkosten')
    expect(g.positionen.some((p) => p.kassen)).toBe(true)
    expect(g.kassenanteil).toBeGreaterThan(0)
    expect(g.mehrkosten).toBeCloseTo(Math.max(0, g.gozSumme - g.kassenanteil), 2)
  })

  it('Privat-Endo (WV): kein Kassenanteil', () => {
    const k = kalkulieren(plan({ '36': { therapie: 'endoPrivat', kanaele: 2 } }), einst)
    const g = k.gruppen[0]
    expect(g.art).toBe('verlangen')
    expect(g.kassenanteil).toBe(0)
    expect(g.mehrkosten).toBe(g.gozSumme)
  })
})

describe('Inlay', () => {
  it('Keramik-Inlay: Material fließt in die Privatleistung ein', () => {
    const k = kalkulieren(plan({ '26': { therapie: 'inlay', flaechen: 2, material: 'keramik-inlay' } }), einst)
    const g = k.gruppen[0]
    expect(g.positionen.some((p) => p.ebene === 'MAT')).toBe(true)
    expect(g.gozSumme).toBeGreaterThan(gozEinzel('2160', STANDARD_REGLER.gozFaktor))
  })
})

describe('Bearbeitung', () => {
  it('entfernte Position fällt aus der Summe', () => {
    const p = plan({ '15': { therapie: 'versiegelung' } })
    const vorher = kalkulieren(p, einst).gruppen[0].gozSumme
    const { positionen } = planen(p)
    const key = positionen[0].key
    const k = kalkulieren({ ...p, entfernt: [key] }, einst)
    expect(k.gruppen.length).toBe(0)
    expect(vorher).toBeGreaterThan(0)
  })

  it('manuelle GOZ-Position zählt voll als Mehrkosten', () => {
    const p = plan({})
    p.manuell = [{ key: 'manuell#1040', gruppe: 'manuell', ebene: 'GOZ', nr: '1040', anzahl: 2, faktor: 2.3, auto: false }]
    const k = kalkulieren(p, einst)
    expect(k.gruppen[0].kategorie).toBe('manuell')
    expect(k.mehrkostenGesamt).toBeCloseTo(gozEinzel('1040', 2.3) * 2, 2)
  })
})
