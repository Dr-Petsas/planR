import { describe, expect, it } from 'vitest'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './planNeu'
import { zeAnwenden, zeBlick } from './kiPlan'
import type { KiSchritt } from './planKi'

const zahn = (z: string, felder: Record<string, string | boolean>): KiSchritt => ({ op: 'zahn', zahn: z, felder })
const echt = (n: string[]) => n.filter((x) => !x.startsWith('Hinweis der Rechnung'))

describe('KI-Zeile: Kronenmaterial im privaten ZE-Plan', () => {
  it('wählt das Material im selben Schritt wie die Planung und rechnet es ein', () => {
    const r = zeAnwenden(neuerPlan(1), E, [zahn('16', { befund: 'kw', planung: 'KM', werkstoff: 'zirkon' })])
    expect(echt(r.nicht)).toEqual([])
    expect(r.plan.werkstoffe).toEqual({ 16: 'zirkon' })
    const b = zeBlick(r.plan, E, false)
    expect(String(b.angaben.kronenmaterial)).toBe('16: Zirkon')
    expect(b.schalter.find((s) => s.name === 'kronenmaterial')?.wert).toBe('zirkon')
  })

  it('lehnt ein Material ab, das nicht zur geplanten Einheit passt, und nennt die möglichen', () => {
    const p = zeAnwenden(neuerPlan(1), E, [zahn('16', { befund: 'kw', planung: 'KM' })]).plan
    const r = zeAnwenden(p, E, [zahn('16', { werkstoff: 'hochgold' })])
    expect(r.plan.werkstoffe ?? {}).toEqual({})
    expect(echt(r.nicht)[0]).toContain('möglich sind')
    expect(echt(zeAnwenden(p, E, [zahn('11', { werkstoff: 'zirkon' })]).nicht)[0]).toContain('keine Krone')
  })

  it('nimmt die Planung auch heraus, wenn ein Material mitgeschickt wird, und vergisst das Material des Zahns', () => {
    const p = zeAnwenden(neuerPlan(1), E, [zahn('16', { befund: 'kw', planung: 'KM', werkstoff: 'zirkon' })]).plan
    const r = zeAnwenden(p, E, [zahn('16', { planung: '', werkstoff: 'zirkon' })])
    expect(echt(r.nicht)).toEqual([])
    expect(r.plan.zaehne['16']?.TP ?? '').toBe('')
    expect(r.plan.werkstoffe ?? {}).toEqual({})
  })

  it('setzt das Material für alle passenden Einheiten und ändert dabei die Summe nachvollziehbar', () => {
    const p = zeAnwenden(neuerPlan(1), E, [zahn('16', { befund: 'kw', planung: 'KM' }), zahn('26', { befund: 'kw', planung: 'KM' })]).plan
    expect(String(zeBlick(p, E, false).angaben.kronenmaterial)).toContain('noch nicht gewählt')
    const r = zeAnwenden(p, E, [{ op: 'schalter', name: 'kronenmaterial', wert: 'lithiumdisilikat' }])
    expect(echt(r.nicht)).toEqual([])
    expect(r.plan.werkstoffe).toEqual({ 16: 'lithiumdisilikat', 26: 'lithiumdisilikat' })
    expect(echt(zeAnwenden(r.plan, E, [{ op: 'schalter', name: 'kronenmaterial', wert: 'lithiumdisilikat' }]).nicht)[0]).toContain('schon')
    expect(echt(zeAnwenden(p, E, [{ op: 'schalter', name: 'kronenmaterial', wert: 'nem' }]).nicht)[0]).toContain('passt zu keiner Einheit')
  })
})
