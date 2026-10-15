import { describe, expect, it } from 'vitest'
import { leererPlan } from './plan'
import { abweichungen } from './befund01'
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
})
