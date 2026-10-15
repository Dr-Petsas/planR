import { describe, expect, it } from 'vitest'
import { leererPlan } from './plan'
import { abweichungen, befundLinkAus } from './befund01'
import { befundInPlan } from '../components/Befund01'

describe('aktueller 01 im Planer', () => {
  it('übernimmt den Befund in die B-Zeile und findet danach keine Abweichung', () => {
    const aktuell = { 18: 'f', 16: 'k', 26: 'i', 36: '' }
    const plan = befundInPlan(leererPlan(), aktuell)
    expect([plan.zaehne[18].B, plan.zaehne[16].B, plan.zaehne[26].B, plan.zaehne[11].B]).toEqual(['f', 'k', 'i', ''])
    expect(abweichungen(plan.zaehne, aktuell)).toEqual({})
  })

  it('meldet abweichende Zähne mit dem Wert aus dem Plan, Groß-/Kleinschreibung zählt nicht', () => {
    const plan = befundInPlan(leererPlan(), { 18: 'F', 16: 'kw', 26: '' })
    expect(abweichungen(plan.zaehne, { 18: 'f', 16: 'k', 26: 'i' })).toEqual({ 16: 'kw', 26: '' })
  })

  it('Flip-Link der Clara-Karte: nur mit Patient, Schlüssel und Praxis', () => {
    expect(befundLinkAus('?befund=4711&bt=1760000000.abc_-9&c=praxis1&ansicht=mobil')).toEqual({ p: '4711', t: '1760000000.abc_-9', c: 'praxis1' })
    expect(befundLinkAus('?befund=4711')).toBeNull()
    expect(befundLinkAus('?befund=Max&bt=1.a&c=praxis1')).toBeNull()
  })
})
