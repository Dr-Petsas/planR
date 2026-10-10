import { describe, expect, it } from 'vitest'
import { hkpEntwurf } from './index'
import { EIGEN_KASSE_MIN, aufZielpreis, preisSpanne } from './zielpreis'

const entwurf = (labor: 'praxis' | 'gewerbe') => {
  const r = hkpEntwurf('Brücke von 14 auf 17 mit 15 und 16 als Brücke', { 15: 'f', 16: 'f' }, { labor })
  if (r.status !== 'ok') throw new Error('kein Entwurf')
  return r.plan
}

describe('Zielpreis', () => {
  const plan = entwurf('praxis')
  const { min, max } = preisSpanne(plan)

  it('Spanne: billigst mit allen Reglern unten, teuerst mit allen oben', () => {
    expect(min).toBeLessThan(max)
    const unten = aufZielpreis(plan, 0)
    expect(unten.stand).toEqual({ gozZusatzStufe: 0, honorarFaktor: 0, eigenKasseProzent: EIGEN_KASSE_MIN, eigenPrivatStufe: 0, eigenPrivatAufschlag: 0 })
    expect(unten.eigenanteil).toBeCloseTo(min, 2)
    expect(unten.unterMin).toBe(true)
    const oben = aufZielpreis(plan, 1e6)
    expect(oben.eigenanteil).toBeCloseTo(max, 2)
    expect(oben.ueberMax).toBe(true)
    expect(oben.stand.eigenPrivatAufschlag).toBe(100)
  })

  it('Wunschpreis in der Spanne: nächster erreichbarer Eigenanteil, Regler im Plan', () => {
    const ziel = Math.round((min + max) / 2)
    const r = aufZielpreis(plan, ziel)
    expect(r.unterMin || r.ueberMax).toBe(false)
    expect(Math.abs(r.eigenanteil - ziel)).toBeLessThan((max - min) / 10)
    expect(r.plan.einstellungen).toMatchObject(r.stand)
    expect(r.ergebnis.summen.eigenanteil).toBe(r.eigenanteil)
  })

  it('erst GOZ, dann Eigenlabor: Eigenlabor bewegt sich erst, wenn GOZ ausgereizt ist', () => {
    for (let ziel = min; ziel <= max; ziel += (max - min) / 40) {
      const s = aufZielpreis(plan, ziel).stand
      const eigenBewegt = s.eigenKasseProzent > EIGEN_KASSE_MIN || s.eigenPrivatStufe > 0 || s.eigenPrivatAufschlag > 0
      if (eigenBewegt) expect([s.gozZusatzStufe, s.honorarFaktor]).toEqual([5, 3.5])
      if (s.eigenPrivatStufe > 0) expect(s.eigenKasseProzent).toBe(100)
    }
    const knapp = aufZielpreis(plan, min + 5).stand
    expect(knapp.gozZusatzStufe + knapp.honorarFaktor).toBeGreaterThan(0)
  })

  it('Fremdlabor: BEL bleibt bei 100 %', () => {
    const r = aufZielpreis(entwurf('gewerbe'), 0)
    expect(r.stand.eigenKasseProzent).toBe(100)
  })

  it('schnell genug fürs Gespräch', () => {
    const t = performance.now()
    aufZielpreis(plan, min + 200)
    expect(performance.now() - t).toBeLessThan(1500)
  })
})
