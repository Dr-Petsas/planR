import { describe, expect, it } from 'vitest'
import { neuerFall } from './store'
import { initialBefund } from './engine/strecke'
import { zahnSetzen, ZAHNFELDER } from './kiPlan'
import { zahnWerte } from './planKi'

describe('KI-Zeile: Zahnbefund im Kassen-PAR-Fall', () => {
  it('schreibt Sondierungstiefen und Blutung in den Anfangsbefund', () => {
    const fall = neuerFall(1)
    const w = zahnWerte(ZAHNFELDER, { zahn: '16', felder: { stMesial: 6, bopMesial: true, furkation: 2 } })
    if (typeof w === 'string') throw new Error(w)
    const r = zahnSetzen(fall, '16', w)
    if (typeof r === 'string') throw new Error(r)
    const z = initialBefund(r.plan).zaehne['16']
    expect(z.st[0]).toBe(6)
    expect(z.bop[0]).toBe(true)
    expect(z.fb).toBe(2)
    expect(zahnSetzen(r.plan, '16', w)).toContain('schon')
  })

  it('lehnt Werte außerhalb des Schemas ab', () => {
    expect(typeof zahnWerte(ZAHNFELDER, { zahn: '16', felder: { stMesial: 40 } })).toBe('string')
    expect(typeof zahnWerte(ZAHNFELDER, { zahn: '16', felder: { farbe: 'rot' } })).toBe('string')
  })
})