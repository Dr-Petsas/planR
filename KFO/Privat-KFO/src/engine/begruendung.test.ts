import { describe, expect, it } from 'vitest'
import { rechnen, vorlageAnwenden } from './kfo'
import { begruendungen } from './begruendung'
import { VORLAGEN } from '../data/katalog'
import { neuerPlan, STANDARD_EINSTELLUNGEN as einst } from '../store'
import type { Plan, Regler } from '../types'

const mit = (vorlage: string, regler: Partial<Regler>): Plan => {
  const p = neuerPlan('T-1', einst)
  return { ...p, regler: { ...p.regler, ...regler }, positionen: vorlageAnwenden([], VORLAGEN.find((v) => v.id === vorlage)!.pos) }
}
const alle = (p: Plan) => { const r = rechnen(p, einst); return [...r.aufgabe, ...r.honorar] }

describe('Begründungen über dem Schwellenwert', () => {
  it('Röntgen schon über 1,8, GOZ erst über 2,3', () => {
    expect(begruendungen(alle(mit('diagnostik', { faktor: 2.3, kfoFaktor: 2.3, roeFaktor: 1.8 })))).toEqual([])
    const roe = begruendungen(alle(mit('diagnostik', { faktor: 2.3, kfoFaktor: 2.3, roeFaktor: 2.5 })))
    expect(roe.length).toBeGreaterThan(0)
    expect(roe.every((x) => x.zeile.ebene === 'GOAE' && /Befundung/.test(x.text))).toBe(true)
    const goz = begruendungen(alle(mit('diagnostik', { faktor: 3, kfoFaktor: 3, roeFaktor: 1.8 })))
    expect(goz.some((x) => x.zeile.ebene === 'GOZ' && /^60(00|10|20)$/.test(x.zeile.nr) && /diagnostischer/.test(x.text))).toBe(true)
  })
})
