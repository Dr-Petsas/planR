import { describe, expect, it } from 'vitest'
import { leererPlan } from './plan'
import { abweichungen, befundFolgen, befundLinkAus, zeilenAenderung } from './befund01'
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

describe('freier Plan und 01 im Gleichlauf', () => {
  it('beim Öffnen gilt der 01, live folgen nur die Zähne, die ihm folgten', () => {
    expect(befundFolgen({ 16: { B: 'k' } }, null, { 16: 'kw', 36: 'f' })).toMatchObject({ 16: 'kw', 36: 'f', 11: '' })
    const z = befundFolgen({ 16: { B: 'kw' }, 26: { B: 'x' } }, { 16: 'kw', 26: 'pw' }, { 16: 'k', 26: 'ww' })!
    expect(z).toMatchObject({ 16: 'k', 26: 'x' })
  })
  it('an den 01 gehen nur im Plan geänderte, abweichende Zähne', () => {
    expect(zeilenAenderung({ 16: { B: 'kw' } }, { 16: { B: 'k' }, 36: { B: 'f' } }, { 36: 'f' })).toEqual({ 16: 'k' })
  })
})