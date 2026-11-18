import { describe, expect, it } from 'vitest'
import { bewerten, blick, MODULE_NAMEN, neu } from './index'

/** Felder, die ältere Stände der Planer noch nicht kannten. */
const ALT_OHNE = ['regler', 'global', 'faktor', 'optionen', 'schalter']

describe('Sprach-Engine: Pläne wie im Planer', () => {
  for (const modul of Object.keys(MODULE_NAMEN)) {
    it(`${modul}: ein frischer Plan lässt sich lesen und bewerten`, () => {
      const plan = neu(modul)
      expect(Number.isFinite(bewerten(modul, plan).betrag)).toBe(true)
      expect(Array.isArray(blick(modul, plan).positionen)).toBe(true)
    })
    if (modul === 'hkp') continue
    it(`${modul}: ein älterer Stand wird angehoben wie beim Öffnen im Planer, die Summe bleibt`, () => {
      const plan = neu(modul) as Record<string, unknown>
      const soll = bewerten(modul, plan).betrag
      const alt = Object.fromEntries(Object.entries(plan).filter(([k]) => !ALT_OHNE.includes(k)))
      expect(() => blick(modul, alt)).not.toThrow()
      expect(bewerten(modul, alt).betrag).toBeCloseTo(soll, 2)
    })
  }
})
