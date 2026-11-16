import { describe, expect, it } from 'vitest'
import { leererPlan } from './store/plan'
import { hkpAnwenden, schalter } from './kiPlan'
import { rechnen } from './clara'
import type { HkpPlan } from './types'
import type { KiSchritt } from './planKi'

const zahn = (z: string, felder: Record<string, string | boolean>): KiSchritt => ({ op: 'zahn', zahn: z, felder })
const sch = (name: string, wert: string | boolean): KiSchritt => ({ op: 'schalter', name, wert })

/** Krone auf 16 (Befund ww), fertig gerechnet. */
function mitKrone(): HkpPlan {
  const r = hkpAnwenden(leererPlan(), [zahn('16', { befund: 'ww' })])
  expect(r.nicht).toEqual([])
  return r.plan
}

describe('KI-Zeile: Angaben im Kassen-HKP', () => {
  it('Bonus und Härtefall ändern den Zuschuss, nicht das Zahnschema', () => {
    const p = mitKrone()
    const r = hkpAnwenden(p, [sch('bonus', '75'), sch('haertefall', true)])
    expect(r.nicht).toEqual([])
    expect(r.plan.zuschuss).toEqual({ bonus: '75', haertefall: true })
    expect(r.plan.zaehne).toEqual(p.zaehne)
    expect(r.plan.positionen).toEqual(p.positionen)
    expect(hkpAnwenden(r.plan, [sch('bonus', '75')]).nicht[0]).toContain('schon')
    expect(hkpAnwenden(p, [sch('bonus', '80')]).nicht[0]).toContain('kenne ich nicht')
  })

  it('Versorgungsart lässt sich festlegen und wieder dem Planer überlassen', () => {
    const r = hkpAnwenden(mitKrone(), [sch('versorgungsart', 'gleichartig')])
    expect(r.plan.versorgungsart).toBe('gleichartig')
    expect(hkpAnwenden(r.plan, [sch('versorgungsart', 'auto')]).plan.versorgungsart).toBe('auto')
  })

  it('Intraoralscan und Eigenlabor laufen über die Ausführung des Planers', () => {
    const p = mitKrone()
    const r = hkpAnwenden(p, [sch('abformung', 'scan'), sch('labor', 'praxis')])
    expect(r.nicht).toEqual([])
    expect(r.plan.abformung).toBe('scan')
    expect(r.plan.einstellungen.labor).toBe('praxis')
    expect(r.getan.join(' ')).toContain('neu gerechnet')
  })

  it('Zirkon für alle Kronen stellt die Planung auf vollkeramisch und wählt das Material', () => {
    const p = mitKrone()
    expect(schalter(p).find((s) => s.name === 'kronenmaterial')?.wert).toBe('')
    const r = hkpAnwenden(p, [sch('kronenmaterial', 'zirkon')])
    expect(r.nicht).toEqual([])
    expect(r.plan.zaehne['16'].TP).toBe('KM')
    expect(r.plan.werkstoffe['16']).toBe('zirkon')
    expect(schalter(r.plan).find((s) => s.name === 'kronenmaterial')?.wert).toBe('zirkon')
  })

  it('Material an einem einzelnen Zahn, auch im selben Schritt wie der Befund', () => {
    const r = hkpAnwenden(leererPlan(), [zahn('16', { befund: 'ww', werkstoff: 'hochgold' }), zahn('26', { befund: 'ww' })])
    expect(r.nicht).toEqual([])
    expect(r.plan.werkstoffe).toEqual({ 16: 'hochgold' })
    const k = hkpAnwenden(r.plan, [zahn('26', { werkstoff: 'zirkon' })])
    expect(k.nicht).toEqual([])
    expect(k.plan.zaehne['26'].TP).toBe('KM')
    expect(k.plan.zaehne['16'].TP).toBe('')
    expect(k.plan.werkstoffe).toEqual({ 16: 'hochgold', 26: 'zirkon' })
    const m = hkpAnwenden(k.plan, [zahn('26', { werkstoff: 'nem' })])
    expect(m.plan.zaehne['26'].TP).toBe('')
    expect(m.plan.werkstoffe['26']).toBe('nem')
  })

  it('ohne Einheit am Zahn gibt es kein Material und keine Materialschalter', () => {
    const r = hkpAnwenden(leererPlan(), [zahn('11', { werkstoff: 'zirkon' })])
    expect(r.getan).toEqual([])
    expect(r.nicht[0]).toContain('keine Krone')
    expect(schalter(leererPlan()).some((s) => s.name === 'kronenmaterial' || s.name.startsWith('implantat.'))).toBe(false)
  })

  it('Positionsschritte lehnt der Kassen-HKP weiter ab', () => {
    const r = hkpAnwenden(mitKrone(), [{ op: 'weg', id: 'x' } as KiSchritt])
    expect(r.getan).toEqual([])
    expect(r.nicht[0]).toContain('Reiter Positionen')
  })

  it('der Härtefall hebt den Festzuschuss in der Rechnung, die Gesamtsumme bleibt', () => {
    const p = mitKrone()
    const h = hkpAnwenden(p, [sch('haertefall', true)]).plan
    const vor = rechnen(p).summen
    const nach = rechnen(h).summen
    expect(nach.festzuschuss).toBeGreaterThan(vor.festzuschuss)
    expect(nach.gesamt).toBe(vor.gesamt)
    const b = rechnen(hkpAnwenden(p, [sch('bonus', '75')]).plan).summen
    expect(b.festzuschuss).toBeGreaterThan(vor.festzuschuss)
    expect(b.festzuschuss).toBeLessThan(nach.festzuschuss)
  })
})
