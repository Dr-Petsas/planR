import { describe, expect, it } from 'vitest'
import { datumZeit, ungespeichert, type AblageEintrag } from './ablage'

const eintrag = (plan: object): AblageEintrag<object> => ({ nummer: 'X-1', patient: '', betrag: 0, geaendert: '', status: 'entwurf', plan })

describe('Ablage', () => {
  it('ohne Eintrag gilt der Plan als nicht gespeichert', () => {
    expect(ungespeichert({ a: 1 }, undefined)).toBe(true)
  })
  it('gleicher Inhalt gilt als gespeichert, geänderter nicht', () => {
    expect(ungespeichert({ a: 1, b: [2] }, eintrag({ a: 1, b: [2] }))).toBe(false)
    expect(ungespeichert({ a: 1, b: [3] }, eintrag({ a: 1, b: [2] }))).toBe(true)
  })
  it('Zeitstempel deutsch, fehlend als Strich', () => {
    expect(datumZeit(undefined)).toBe('—')
    expect(datumZeit('2026-10-07T06:30:00.000Z')).toMatch(/^07\.10\.2026/)
  })
})
