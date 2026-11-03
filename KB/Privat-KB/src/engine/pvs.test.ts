import { describe, expect, it } from 'vitest'
import { rechnen, vorlageAnwenden } from './kb'
import { pvsPlaene } from './pvs'
import { VORLAGEN } from '../data/katalog'
import { neuerPlan, STANDARD_EINSTELLUNGEN as einst } from '../store'
import type { Plan, Position } from '../types'

const vorlage = (id: string) => VORLAGEN.find((v) => v.id === id)!.pos

function plan(positionen: Position[]): Plan {
  return { ...neuerPlan('PKB-2026-001', einst), datum: '2026-11-03', positionen }
}

describe('Privat-KB fürs Praxisprogramm', () => {
  it('Michigan-Schiene: alle GOZ- und Laborzeilen einzeln, Gesamtsumme = Summe des Plans', () => {
    const p = plan(vorlageAnwenden([], vorlage('michigan'), einst))
    const r = rechnen(p, einst)
    const [kva, ...rest] = pvsPlaene(p, r)
    expect(rest).toEqual([])
    expect(kva).toMatchObject({ planart: 'kva', art: 'ZE', datum: '2026-11-03', titel: 'PlanR Schiene PKB-2026-001' })
    expect(kva.positionen.filter((x) => x.ebene === 'GOZ').map((x) => x.nr)).toEqual(r.honorar.map((z) => z.nr))
    expect(kva.positionen.filter((x) => x.ebene === 'BEB').map((x) => x.nr)).toEqual(r.labor.map((z) => z.nr))
    expect(kva.positionen.find((x) => x.nr === '7010')).toMatchObject({ faktor: p.regler.faktor, art: 'ZE', zahn: '' })
    expect(kva.positionen.find((x) => x.nr === '0002')).toMatchObject({ anzahl: 3, labor: 'fremd', mwst: 0 })
    expect(kva.summen.honorar).toBeCloseTo(r.summeHonorar, 2)
    expect(kva.summen.laborEigen + kva.summen.laborFremd).toBeCloseTo(r.summeLabor, 2)
    expect(kva.summen.gesamt).toBeCloseTo(r.gesamt, 2)
  })

  it('UKPS: Analogleistung mit Text, Fremdlabor-Platzhalter ohne BEB-Nummer als Laborzeile', () => {
    const p = plan(vorlageAnwenden([], vorlage('ukps'), einst))
    const r = rechnen(p, einst)
    const [kva] = pvsPlaene(p, r)
    const analog = kva.positionen.find((x) => x.nr?.endsWith('a'))
    expect(analog).toMatchObject({ ebene: 'GOZ', nr: `${einst.ukpsAnalog}a` })
    expect(analog?.bezeichnung).toMatch(/Unterkieferprotrusionsschiene/)
    expect(kva.positionen.find((x) => x.ebene === 'LABOR')).toMatchObject({ labor: 'fremd', einzelpreis: 480 })
    expect(kva.positionen.length).toBe(r.honorar.length + r.labor.length)
    expect(kva.summen.gesamt).toBeCloseTo(r.gesamt, 2)
  })

  it('Praxismaterial als Eigenlabor, Rabatt nur in der Summe, Funktionsanalyse mit eigenem Faktor', () => {
    const p = plan([
      { id: 'a', ebene: 'GOZ', nr: '8000', anzahl: 1 },
      { id: 'b', ebene: 'LABOR', nr: '7621', anzahl: 1, preis: 200 },
      { id: 'c', ebene: 'MATERIAL', nr: 'Mat.', anzahl: 1, preis: 12.5, text: 'Abformmaterial' },
      { id: 'd', ebene: 'MATERIAL', nr: 'Mat.', anzahl: 1, preis: -20, text: 'Rabatt', ausXml: true },
    ])
    const r = rechnen(p, einst)
    const [kva] = pvsPlaene(p, r)
    expect(kva.positionen.find((x) => x.nr === '8000')?.faktor).toBe(p.regler.faFaktor)
    expect(kva.positionen.find((x) => x.ebene === 'MAT')).toMatchObject({ labor: 'eigen', einzelpreis: 12.5, bezeichnung: 'Abformmaterial' })
    expect(kva.positionen.filter((x) => x.ebene === 'MAT')).toHaveLength(1)
    expect(kva.summen.laborEigen + kva.summen.laborFremd).toBeCloseTo(192.5, 2)
    expect(kva.summen.gesamt).toBeCloseTo(r.gesamt, 2)
  })

  it('ohne GOZ-Leistung kein Plan', () => {
    const p = plan([{ id: 'b', ebene: 'LABOR', nr: '7621', anzahl: 1 }])
    expect(pvsPlaene(p, rechnen(p, einst))).toEqual([])
  })
})
