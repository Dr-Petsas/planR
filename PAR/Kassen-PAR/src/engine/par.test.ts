import { describe, expect, it } from 'vitest'
import { diagnostizieren } from './diagnose'
import { aitZaehne, berechnen, cptZaehne, subgingivalZaehne, uptFrequenz, uptPlan } from './strecke'
import { leererBefund, neuerPlan } from '../store'
import type { Befund, Diagnose, Einstellungen } from '../types'

const EINST: Einstellungen = {
  praxis: { name: '', strasse: '', plz: '', ort: '', telefon: '', zahnarztNr: '', abrechnungsNr: '', behandler: '' },
  bemaPunktwert: 1.2,
  naechsteNummer: 1,
}

function diag(patch: Partial<Diagnose>): Diagnose {
  return { ...neuerPlan(1).diagnose, ...patch }
}

function mitTasche(zahn: string, st: number, bop = false): Befund {
  const b = leererBefund('2026-01-01')
  b.zaehne[zahn].st = [st, st, st, null, null, null]
  b.zaehne[zahn].bop = [bop, bop, bop, false, false, false]
  return b
}

describe('Grading nach %/Alter', () => {
  it('Grad A bei KA 10 % / 50 Jahre (0,20)', () => {
    expect(diagnostizieren(diag({ alter: 50, knochenabbauProzent: 10 }), leererBefund()).grad).toBe('A')
  })
  it('Grad B bei KA 40 % / 50 Jahre (0,80)', () => {
    expect(diagnostizieren(diag({ alter: 50, knochenabbauProzent: 40 }), leererBefund()).grad).toBe('B')
  })
  it('Grad C bei KA 60 % / 40 Jahre (1,50)', () => {
    expect(diagnostizieren(diag({ alter: 40, knochenabbauProzent: 60 }), leererBefund()).grad).toBe('C')
  })
  it('Raucher ≥ 10 hebt auf Grad C', () => {
    expect(diagnostizieren(diag({ alter: 50, knochenabbauProzent: 10, raucher: 'ab10' }), leererBefund()).grad).toBe('C')
  })
  it('Diabetes HbA1c < 7 hebt A auf mindestens B', () => {
    expect(
      diagnostizieren(diag({ alter: 50, knochenabbauProzent: 10, diabetes: 'hba1c_unter7' }), leererBefund()).grad,
    ).toBe('B')
  })
})

describe('Staging', () => {
  it('Stadium I bei CAL 2 mm', () => {
    expect(diagnostizieren(diag({ calMax: 2 }), leererBefund()).stadium).toBe(1)
  })
  it('Stadium II bei CAL 4 mm', () => {
    expect(diagnostizieren(diag({ calMax: 4 }), leererBefund()).stadium).toBe(2)
  })
  it('Stadium III bei CAL 6 mm', () => {
    expect(diagnostizieren(diag({ calMax: 6 }), leererBefund()).stadium).toBe(3)
  })
  it('Komplexe Rehabilitation ergibt Stadium IV', () => {
    expect(diagnostizieren(diag({ calMax: 4, komplexeReha: true }), leererBefund()).stadium).toBe(4)
  })
  it('Furkation II/III hebt auf mindestens Stadium III', () => {
    expect(diagnostizieren(diag({ calMax: 2, furkationII_III: true }), leererBefund()).stadium).toBe(3)
  })
})

describe('Ausmaß', () => {
  it('lokalisiert bei wenigen betroffenen Zähnen', () => {
    expect(diagnostizieren(diag({}), mitTasche('11', 5)).ausmass).toBe('lokalisiert')
  })
})

describe('AIT-Zählung ein-/mehrwurzelig', () => {
  it('einwurzeliger Zahn mit ST ≥ 4 zählt als AIT a', () => {
    const r = aitZaehne(mitTasche('11', 4))
    expect(r.ein).toContain('11')
    expect(r.mehr).toHaveLength(0)
  })
  it('Molar mit ST ≥ 4 zählt als AIT b', () => {
    const r = aitZaehne(mitTasche('16', 5))
    expect(r.mehr).toContain('16')
  })
  it('ST < 4 ergibt keine AIT', () => {
    expect(aitZaehne(mitTasche('11', 3)).ein).toHaveLength(0)
  })
})

describe('Subgingivale Instrumentierung (UPT e/f)', () => {
  it('ST 4 mit BOP zählt', () => {
    expect(subgingivalZaehne(mitTasche('11', 4, true)).ein).toContain('11')
  })
  it('ST 4 ohne BOP zählt nicht', () => {
    expect(subgingivalZaehne(mitTasche('11', 4, false)).ein).toHaveLength(0)
  })
  it('ST 5 ohne BOP zählt (≥ 5 mm)', () => {
    expect(subgingivalZaehne(mitTasche('11', 5, false)).ein).toContain('11')
  })
})

describe('CPT-Zählung bei Resttaschen ≥ 6 mm', () => {
  it('Molar mit ST 6 zählt als CPT b', () => {
    expect(cptZaehne(mitTasche('36', 6)).mehr).toContain('36')
  })
})

describe('UPT-Frequenz je Grad', () => {
  it('Grad A: 2 Sitzungen, kein UPT d, 1× UPT g', () => {
    expect(uptFrequenz('A')).toEqual({ sitzungen: 2, d: 0, g: 1, abstandMon: 10 })
  })
  it('Grad B: 4 Sitzungen, 2× UPT d', () => {
    expect(uptFrequenz('B')).toMatchObject({ sitzungen: 4, d: 2, g: 1 })
  })
  it('Grad C: 6 Sitzungen, 4× UPT d', () => {
    expect(uptFrequenz('C')).toMatchObject({ sitzungen: 6, d: 4, g: 1 })
  })
})

describe('UPT-Zeitplan', () => {
  it('Grad B hat UPT g genau einmal (3. Sitzung) und UPT d zweimal', () => {
    const plan = uptPlan('B')
    expect(plan).toHaveLength(4)
    expect(plan.filter((t) => t.leistungen.includes('UPT g'))).toHaveLength(1)
    expect(plan.filter((t) => t.leistungen.includes('UPT d'))).toHaveLength(2)
    expect(plan.find((t) => t.leistungen.includes('UPT g'))!.index).toBe(3)
  })
  it('Grad C UPT g frühestens ab Monat 10', () => {
    const g = uptPlan('C').find((t) => t.leistungen.includes('UPT g'))!
    expect(g.monatAbStart).toBeGreaterThanOrEqual(10)
  })
})

describe('Komplette Strecke', () => {
  it('enthält Grundleistungen und UPT-a entsprechend der Frequenz', () => {
    const plan = neuerPlan(1)
    plan.befunde.initial = mitTasche('11', 5)
    plan.diagnose = diag({ alter: 40, knochenabbauProzent: 60 }) // Grad C
    const d = diagnostizieren(plan.diagnose, plan.befunde.initial)
    const { positionen, summe } = berechnen(plan, EINST, d)
    const nummern = positionen.map((p) => p.nr)
    expect(nummern).toContain('04')
    expect(nummern).toContain('4')
    expect(nummern).toContain('ATG')
    expect(nummern).toContain('MHU')
    expect(nummern).toContain('BEV a')
    expect(positionen.find((p) => p.nr === 'UPT a')!.anzahl).toBe(6)
    expect(summe).toBeGreaterThan(0)
  })
  it('CPT nur bei aktiviertem chirurgischem Vorgehen', () => {
    const plan = neuerPlan(1)
    plan.befunde.initial = mitTasche('36', 6)
    const d = diagnostizieren(plan.diagnose, plan.befunde.initial)
    expect(berechnen(plan, EINST, d).positionen.some((p) => p.nr.startsWith('CPT'))).toBe(false)
    plan.mitCPT = true
    expect(berechnen(plan, EINST, d).positionen.some((p) => p.nr === 'CPT b')).toBe(true)
  })
})
