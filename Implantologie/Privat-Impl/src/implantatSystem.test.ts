import { describe, expect, it } from 'vitest'
import { festVomBlatt, implantateSetzen } from './implantatSystem'
import { planAusBlatt } from './planAusBlatt'
import { kalkulieren } from './engine/berechnung'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from './planNeu'
import { STANDARD_IMPLANTAT } from './components/ImplantatDetails'
import { implantatkoerper } from './data/implantatkoerper'
import blatt from './testdaten/blattImplantat.json'

const E = STANDARD_EINSTELLUNGEN
const mit = (system: string) => ({ ...STANDARD_IMPLANTAT, system })
const netto = (plan: Parameters<typeof kalkulieren>[0]) => kalkulieren(plan, E).material.reduce((s, z) => s + z.betrag, 0)

/**
 * Vorfall 11/2026: In einem eingelesenen Implantat-Kostenvoranschlag stand das Implantatmaterial als feste Zeile vom Blatt.
 * Die Wahl eines anderen Implantatsystems änderte deshalb keinen Preis.
 */
describe('Wahl des Implantatsystems', () => {
  it('ändert im neuen Plan den Materialpreis', () => {
    const plan = { ...neuerPlan(E), zaehne: { '14': { B: 'x', TP: 'I' } } }
    const camlog = implantateSetzen(plan, { '14': mit('camlog') })
    const icx = implantateSetzen(camlog, { '14': mit('medentis-icx') })
    expect(kalkulieren(camlog, E).gesamt).toBeGreaterThan(kalkulieren(icx, E).gesamt)
  })

  /** Der Leser nennt beim Implantat und beim Gingivaformer die Zähne, wie im Plan des Vorfalls. */
  const zeilen = blatt.positionen.map((z, i) => (i === 20 || i === 34 ? { ...z, zahn: '15,13,11' } : z))
  const plan = planAusBlatt(1, blatt.schema, zeilen, E)

  it('lässt die Zeilen vom Blatt stehen, wenn keine den Zahn nennt', () => {
    const ohne = planAusBlatt(1, blatt.schema, blatt.positionen, E)
    expect(festVomBlatt(ohne, '11')).toBe(true)
    expect(festVomBlatt(plan, '11')).toBe(false)
    const neu = implantateSetzen(ohne, { '11': mit('straumann-bl') })
    expect(neu.manuell).toEqual(ohne.manuell)
    expect(neu.entfernt).toEqual(ohne.entfernt)
  })

  it('ändert im eingelesenen Plan den Materialpreis', () => {
    const alle = (system: string) => implantateSetzen(plan, { '11': mit(system), '13': mit(system), '15': mit(system) })
    const straumann = alle('straumann-bl')
    const icx = alle('medentis-icx')
    expect(kalkulieren(straumann, E).gesamt).toBeGreaterThan(kalkulieren(icx, E).gesamt)
    const koerper = kalkulieren(straumann, E).material.filter((z) => z.id.startsWith('mat:koerper:'))
    expect(koerper).toHaveLength(3)
    expect(koerper[0].einzel).toBe(implantatkoerper('straumann-bl').preise.koerper)
  })

  it('zählt das Implantatmaterial vom Blatt nicht doppelt', () => {
    const vorher = plan.manuell.filter((p) => p.ebene === 'MAT' && p.zahn.includes('11'))
    expect(vorher.length).toBeGreaterThan(0)
    const alle = implantateSetzen(plan, { '11': mit('camlog'), '13': mit('camlog'), '15': mit('camlog') })
    expect(alle.manuell.filter((p) => p.ebene === 'MAT' && p.zahn.includes('11'))).toHaveLength(0)
    expect(alle.manuell.length).toBe(plan.manuell.length - vorher.length)
  })

  it('nimmt bei einem einzelnen Zahn nur dessen Anteil aus den Zeilen vom Blatt', () => {
    const einer = implantateSetzen(plan, { '11': mit('camlog') })
    const zeilen = einer.manuell.filter((p) => p.ebene === 'MAT' && p.zahn.includes('13'))
    expect(zeilen.every((p) => p.zahn === '15,13')).toBe(true)
    const alt = plan.manuell.filter((p) => p.ebene === 'MAT' && p.zahn.includes('13')).reduce((s, p) => s + p.anzahl * (p.preis ?? 0), 0)
    const neu = zeilen.reduce((s, p) => s + p.anzahl * (p.preis ?? 0), 0)
    expect(neu).toBeCloseTo((alt * 2) / 3, 1)
    expect(kalkulieren(einer, E).material.filter((z) => z.auto).map((z) => z.zahn)).toEqual(['11', '11', '11'])
  })

  it('lässt den eingelesenen Plan in Ruhe, solange das System gleich bleibt', () => {
    const start = implantateSetzen(plan, { '11': mit('camlog') })
    const laenge = implantateSetzen(start, { '11': { ...mit('camlog'), laenge: 12 } })
    expect(netto(laenge)).toBe(netto(start))
    expect(laenge.manuell).toEqual(start.manuell)
  })

  it('verwirft einen von Hand gesetzten Preis für das Implantat', () => {
    const basis = implantateSetzen({ ...neuerPlan(E), zaehne: { '14': { B: 'x', TP: 'I' } } }, { '14': mit('camlog') })
    const hand = { ...basis, anpassungen: { 'mat:koerper:14': { preis: 1, anzahl: 2 } } }
    const neu = implantateSetzen(hand, { '14': mit('straumann-bl') })
    expect(neu.anpassungen['mat:koerper:14']).toEqual({ anzahl: 2 })
  })
})
