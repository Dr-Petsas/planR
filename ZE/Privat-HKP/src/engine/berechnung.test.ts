import { describe, expect, it } from 'vitest'
import { kalkulieren } from './berechnung'
import { STANDARD_EINSTELLUNGEN, neuerPlan } from '../store'

describe('Eigenlabor-Positionen in der Kalkulation', () => {
  const einst = {
    ...STANDARD_EINSTELLUNGEN,
    eigenlabor: [
      { nr: 'E102', text: 'Kristallisationsbrand', preis: 18.5 },
      { nr: 'E100', text: 'CAD-Konstruktion', preis: 100, ersetzt: '0001' },
    ],
  }
  const plan = {
    ...neuerPlan(1),
    regler: { gozStufe: 0, gozFaktor: 0, laborStufe: 0, laborAufschlag: 20, aus: [] },
    manuell: [
      { id: 'm1', ebene: 'BEB' as const, nr: 'E102', zahn: '14', anzahl: 2 },
      { id: 'm2', ebene: 'BEB' as const, nr: '0001', zahn: 'OK', anzahl: 1 },
      { id: 'm3', ebene: 'BEB' as const, nr: '0002', zahn: 'UK', anzahl: 1 },
    ],
  }

  it('rechnet eigene Nummern und ersetzte BEB-Positionen ohne BEB-Aufschlag', () => {
    const k = kalkulieren(plan, einst)
    const zeile = (nr: string) => k.labor.find((z) => z.nr === nr)!
    expect(zeile('E102')).toMatchObject({ eigen: 'E102', einzel: 18.5, betrag: 37, text: 'Kristallisationsbrand' })
    expect(zeile('0001')).toMatchObject({ eigen: 'E100', einzel: 100, text: 'CAD-Konstruktion' })
    expect(zeile('0002').eigen).toBeUndefined()
    expect(zeile('0002').einzel).toBeCloseTo(12.48)
    expect(k.hinweise.some((h) => h.includes('E102'))).toBe(false)
  })
})

describe('Kronenmaterial in der Kalkulation', () => {
  const plan = {
    ...neuerPlan(1),
    abformung: 'abdruck' as const,
    zaehne: { 16: { B: 'kw', TP: 'KM' }, 14: { B: 'kw', TP: 'K' } },
  }

  it('Standard ohne Wahl: Zirkon und NEM als Laborkosten mit MwSt., Hinweis auf offene Wahl', () => {
    const k = kalkulieren(plan, STANDARD_EINSTELLUNGEN)
    const mat = k.labor.filter((z) => z.material)
    expect(mat.map((z) => [z.zahn, z.betrag])).toEqual([['14', 1.11], ['16', 15]])
    expect(k.labor.at(-1)?.material).toBe(true)
    expect(k.material.some((z) => z.material)).toBe(false)
    expect(k.hinweise.some((h) => h.startsWith('Kronenmaterial nicht gewählt (14 NEM, 16 Zirkon)'))).toBe(true)
  })

  it('Hochgold und Presskeramik; Gewicht und Preis lassen sich anpassen', () => {
    const gewaehlt = { ...plan, werkstoffe: { 14: 'hochgold' as const, 16: 'presskeramik' as const } }
    const k = kalkulieren(gewaehlt, STANDARD_EINSTELLUNGEN)
    expect(k.labor.find((z) => z.id === 'mat:14')).toMatchObject({ anzahl: 2.5, einzel: 140, betrag: 350 })
    expect(k.labor.find((z) => z.id === 'mat:16')?.betrag).toBe(17.5)
    const angepasst = kalkulieren({ ...gewaehlt, anpassungen: { 'mat:14': { anzahl: 2.8, preis: 151.2 } } }, STANDARD_EINSTELLUNGEN)
    expect(angepasst.labor.find((z) => z.id === 'mat:14')?.betrag).toBe(423.36)
    expect(kalkulieren({ ...gewaehlt, entfernt: ['mat:16'] }, STANDARD_EINSTELLUNGEN).labor.some((z) => z.id === 'mat:16')).toBe(false)
  })
})
