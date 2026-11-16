import { describe, expect, it } from 'vitest'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './planNeu'
import { implAnwenden, implBlick } from './kiPlan'
import type { Plan } from './types'

const plan = (): Plan => ({ ...neuerPlan(1), zaehne: { '16': { B: 'f', TP: 'I' } } })
const nr9010 = (p: Plan) => implBlick(p, E, false).positionen.filter((z) => z.nr === '9010').reduce((s, z) => s + z.anzahl, 0)

describe('KI-Zeile: Zahnschema im Implantatplan', () => {
  it('meldet die Felder des Zahnschemas', () => {
    const b = implBlick(plan(), E, false)
    expect(b.kann).toContain('zahn')
    expect(b.zahnfelder?.map((f) => f.name)).toEqual(expect.arrayContaining(['befund', 'planung', 'system', 'laenge']))
  })

  it('baut ein weiteres Implantat dazu und rechnet neu', () => {
    const p = plan()
    const r = implAnwenden(p, E, [{ op: 'zahn', zahn: '26', felder: { befund: 'f', planung: 'I' } }])
    expect(r.nicht).toEqual([])
    expect(r.plan.zaehne['26']).toMatchObject({ B: 'f', TP: 'I' })
    expect(r.plan.implantate['26']).toBeTruthy()
    expect(nr9010(r.plan)).toBe(nr9010(p) + 1)
    expect(implBlick(r.plan, E, false).summen.gesamt).toBeGreaterThan(implBlick(p, E, false).summen.gesamt)
  })

  it('nimmt ein Implantat heraus: Planung leer, Angaben weg, Summe sinkt', () => {
    const mit = implAnwenden(plan(), E, [{ op: 'zahn', zahn: '26', felder: { befund: 'f', planung: 'I' } }]).plan
    const r = implAnwenden(mit, E, [{ op: 'zahn', zahn: '26', felder: { planung: '' } }])
    expect(r.nicht).toEqual([])
    expect(r.plan.zaehne['26']).toMatchObject({ B: 'f', TP: '' })
    expect(r.plan.implantate['26']).toBeUndefined()
    expect(nr9010(r.plan)).toBe(nr9010(mit) - 1)
  })

  it('ändert Maße nur an Zähnen mit Implantat und lehnt fremde Werte ab', () => {
    const p = plan()
    const ok = implAnwenden(p, E, [{ op: 'zahn', zahn: '16', felder: { laenge: 12, durchmesser: 4.5 } }])
    expect(ok.plan.implantate['16']).toMatchObject({ laenge: 12, durchmesser: 4.5 })
    expect(implAnwenden(p, E, [{ op: 'zahn', zahn: '46', felder: { laenge: 12 } }]).nicht).toHaveLength(1)
    expect(implAnwenden(p, E, [{ op: 'zahn', zahn: '16', felder: { planung: 'QQ' } }]).nicht).toHaveLength(1)
    expect(implAnwenden(p, E, [{ op: 'zahn', zahn: '99', felder: { befund: 'f' } }]).nicht).toHaveLength(1)
    expect(implAnwenden(p, E, [{ op: 'zahn', zahn: '16', felder: { befund: 'f' } }]).nicht[0]).toContain('schon')
  })
})