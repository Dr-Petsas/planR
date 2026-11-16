import { describe, expect, it } from 'vitest'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './planNeu'
import { zahnSetzen } from './kiPlan'
import { rechnen } from './engine/mkv'

describe('KI-Zeile: Zahnschema in der Mehrkostenvereinbarung', () => {
  it('trägt eine Füllung ein, ändert sie und nimmt sie heraus', () => {
    const p = neuerPlan('FMKV-1', E)
    const a = zahnSetzen(p, '36', { therapie: 'komposit', flaechen: 3 })
    if (typeof a === 'string') throw new Error(a)
    expect(a.plan.zaehne['36']).toMatchObject({ therapie: 'komposit', flaechen: 3 })
    expect(rechnen(a.plan, E).mehrkosten).toBeGreaterThan(0)
    const b = zahnSetzen(a.plan, '36', { therapie: 'inlay' })
    if (typeof b === 'string') throw new Error(b)
    expect(b.plan.zaehne['36']).toMatchObject({ therapie: 'inlay', flaechen: 3, labor: 'keramik' })
    const c = zahnSetzen(b.plan, '36', { therapie: '' })
    if (typeof c === 'string') throw new Error(c)
    expect(c.plan.zaehne['36']).toBeUndefined()
  })

  it('lehnt Unpassendes ab', () => {
    const p = neuerPlan('FMKV-1', E)
    expect(typeof zahnSetzen(p, '36', { flaechen: 2 })).toBe('string')
    expect(typeof zahnSetzen(p, '36', { therapie: 'inlay', flaechen: 4 })).toBe('string')
    expect(typeof zahnSetzen(p, '36', { therapie: 'komposit', stift: true })).toBe('string')
  })
})