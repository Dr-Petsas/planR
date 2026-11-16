import { describe, expect, it } from 'vitest'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './planNeu'
import { zahnSetzen } from './kiPlan'
import { rechnen } from './engine/kons'

describe('KI-Zeile: Zahnschema im privaten Kons-Plan', () => {
  it('trägt eine Therapie ein, ändert sie und nimmt den Zahn heraus', () => {
    const p = neuerPlan('PK-1', E)
    const a = zahnSetzen(p, '16', { therapie: 'komposit', flaechen: 3 })
    if (typeof a === 'string') throw new Error(a)
    expect(a.plan.zaehne['16']).toMatchObject({ therapie: 'komposit', flaechen: 3 })
    expect(rechnen(a.plan, E).summe).toBeGreaterThan(rechnen(p, E).summe)
    const b = zahnSetzen(a.plan, '16', { therapie: 'endo', kanaele: 3 })
    if (typeof b === 'string') throw new Error(b)
    expect(b.plan.zaehne['16']).toMatchObject({ therapie: 'endo', kanaele: 3 })
    const c = zahnSetzen(b.plan, '16', { therapie: '' })
    if (typeof c === 'string') throw new Error(c)
    expect(c.plan.zaehne['16']).toBeUndefined()
  })

  it('lehnt Unpassendes ab', () => {
    const p = neuerPlan('PK-1', E)
    expect(typeof zahnSetzen(p, '16', { flaechen: 2 })).toBe('string')
    expect(typeof zahnSetzen(p, '16', { therapie: 'inlay', flaechen: 5 })).toBe('string')
    expect(typeof zahnSetzen(p, '16', { therapie: 'komposit', kanaele: 2 })).toBe('string')
  })
})