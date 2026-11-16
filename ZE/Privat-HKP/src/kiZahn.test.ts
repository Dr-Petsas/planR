import { describe, expect, it } from 'vitest'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './planNeu'
import { zeAnwenden, zeBlick } from './kiPlan'

describe('KI-Zeile: Zahnschema im privaten ZE-Plan', () => {
  it('trägt Befund und Planung ein, der Plan rechnet daraus', () => {
    const p = neuerPlan(1)
    expect(zeBlick(p, E, false).kann).toContain('zahn')
    const r = zeAnwenden(p, E, [{ op: 'zahn', zahn: '16', felder: { befund: 'kw', planung: 'KM' } }])
    expect(r.nicht.filter((n) => !n.startsWith('Hinweis der Rechnung'))).toEqual([])
    expect(r.plan.zaehne['16']).toMatchObject({ B: 'kw', TP: 'KM' })
    const b = zeBlick(r.plan, E, false)
    expect(b.positionen.length).toBeGreaterThan(0)
    expect(b.summen.gesamt).toBeGreaterThan(zeBlick(p, E, false).summen.gesamt)
  })

  it('nimmt die Versorgung wieder heraus und lehnt unbekannte Kürzel ab', () => {
    const mit = zeAnwenden(neuerPlan(1), E, [{ op: 'zahn', zahn: '16', felder: { befund: 'kw', planung: 'KM' } }]).plan
    const r = zeAnwenden(mit, E, [{ op: 'zahn', zahn: '16', felder: { befund: '', planung: '' } }])
    expect(r.plan.zaehne['16']).toBeUndefined()
    expect(zeBlick(r.plan, E, false).summen.gesamt).toBe(zeBlick(neuerPlan(1), E, false).summen.gesamt)
    expect(zeAnwenden(mit, E, [{ op: 'zahn', zahn: '16', felder: { planung: 'XYZ' } }]).nicht).toHaveLength(1)
  })
})