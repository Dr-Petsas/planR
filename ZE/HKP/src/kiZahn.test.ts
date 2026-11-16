import { describe, expect, it } from 'vitest'
import { leererPlan } from './store/plan'
import { neuRechnen, zahnSetzen, ZAHNFELDER } from './kiPlan'
import { zahnWerte } from './planKi'

describe('KI-Zeile: Zahnschema im Kassen-HKP', () => {
  it('trägt den Befund ein und rechnet Regelversorgung und Positionen neu', () => {
    const w = zahnWerte(ZAHNFELDER, { zahn: '16', felder: { befund: 'KW' } })
    expect(w).toEqual({ befund: 'kw' })
    const r = zahnSetzen(leererPlan(), '16', w as Record<string, string>)
    if (typeof r === 'string') throw new Error(r)
    const neu = neuRechnen(r.plan).plan
    expect(neu.zaehne['16'].B).toBe('kw')
    expect(neu.zaehne['16'].R).toBeTruthy()
    expect(neu.positionen.length).toBeGreaterThan(0)
  })

  it('ohne Befund bleibt nach dem Herausnehmen keine errechnete Position', () => {
    const a = zahnSetzen(leererPlan(), '16', { befund: 'kw' })
    if (typeof a === 'string') throw new Error(a)
    const b = zahnSetzen(neuRechnen(a.plan).plan, '16', { befund: '' })
    if (typeof b === 'string') throw new Error(b)
    expect(neuRechnen(b.plan).plan.positionen.filter((p) => p.auto)).toHaveLength(0)
    expect(zahnSetzen(leererPlan(), '16', { befund: '' })).toContain('schon')
  })
})