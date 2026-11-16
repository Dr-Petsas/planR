import { describe, expect, it } from 'vitest'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './store'
import { zahnSetzen } from './kiPlan'

describe('KI-Zeile: Zahnschema im privaten PAR-Plan', () => {
  it('setzt fehlende Zähne und chirurgische Therapie und nimmt sie zurück', () => {
    const p = neuerPlan('PP-1', E)
    const frei = ['16', '26', '36', '46'].find((z) => !p.fehlend.includes(z) && !p.cpt.includes(z))!
    const a = zahnSetzen(p, frei, { fehlt: true })
    if (typeof a === 'string') throw new Error(a)
    expect(a.plan.fehlend).toContain(frei)
    expect(typeof zahnSetzen(a.plan, frei, { cpt: true })).toBe('string')
    const b = zahnSetzen(a.plan, frei, { fehlt: false, cpt: true })
    if (typeof b === 'string') throw new Error(b)
    expect(b.plan.fehlend).not.toContain(frei)
    expect(b.plan.cpt).toContain(frei)
    expect(zahnSetzen(b.plan, frei, { cpt: true })).toContain('schon')
  })
})