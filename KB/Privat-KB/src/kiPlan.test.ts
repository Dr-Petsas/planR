import { describe, expect, it } from 'vitest'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './store'
import { kbKi } from './kiPlan'
import type { Plan } from './types'

const dienst = () => {
  let plan: Plan = { ...neuerPlan('T-1', E) }
  const d = kbKi(() => ({ plan, gesperrt: false, einst: E }), (neu) => { plan = neu })
  return { d, plan: () => plan }
}

describe('KI-Zeile am privaten KB-Plan', () => {
  it('liest Positionen, Summe und Ebenen', () => {
    const b = dienst().d.lesen()
    expect(b.planart).toBe('privat-kb')
    expect(b.summen.gesamt).toBeGreaterThanOrEqual(0)
    expect(b.kann).toContain('hinzu')
  })

  it('nimmt eine bekannte GOZ-Nummer auf und rechnet sie', () => {
    const { d } = dienst()
    const vor = d.lesen()
    const nr = ['0030', '8000', '8010', '7010'].find((n) => !vor.positionen.some((p) => p.nr === n))!
    const r = d.aendern([{ op: 'hinzu', ebene: 'GOZ', nr, anzahl: 1 }])
    expect(r.getan).toHaveLength(1)
    expect(d.lesen().positionen.some((p) => p.nr === nr)).toBe(true)
    expect(r.gesamt).toBeGreaterThan(vor.summen.gesamt)
  })

  it('weist eine unbekannte Nummer ab und laesst den Plan unveraendert', () => {
    const { d, plan } = dienst()
    const vor = JSON.stringify(plan())
    const r = d.aendern([{ op: 'hinzu', ebene: 'GOZ', nr: '99999', anzahl: 1 }])
    expect(r.getan).toHaveLength(0)
    expect(r.nicht.length).toBeGreaterThan(0)
    expect(d.lesen().positionen.some((p) => p.nr === '99999')).toBe(false)
    expect(JSON.stringify(plan())).toBe(vor)
  })
})
