import { describe, expect, it } from 'vitest'
import { abgleichen, datumZeit, ohneGeloeschte, ungespeichert, type AblageEintrag } from './ablage'

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
  it('in der Übersicht gelöschte Pläne fliegen raus, neu gespeicherte bleiben', () => {
    const liste = [
      { ...eintrag({}), nummer: 'A', geaendert: '2026-10-07T08:00:00.000Z' },
      { ...eintrag({}), nummer: 'B', geaendert: '2026-10-07T12:00:00.000Z' },
      { ...eintrag({}), nummer: 'C', geaendert: '2026-10-07T08:00:00.000Z' },
    ]
    const weg = [{ nummer: 'A', geaendert: '2026-10-07T08:00:00.000Z' }, { nummer: 'B', geaendert: '2026-10-07T09:00:00.000Z' }]
    expect(ohneGeloeschte(liste, weg).map((e) => e.nummer)).toEqual(['B', 'C'])
  })
  it('importierte Pläne kommen als Entwurf in die Ablage, ein neuerer eigener Stand bleibt', () => {
    const liste = [
      { ...eintrag({ alt: 1 }), nummer: 'A', status: 'freigegeben' as const, geaendert: '2026-10-07T08:00:00.000Z' },
      { ...eintrag({ eigen: 1 }), nummer: 'B', geaendert: '2026-10-07T12:00:00.000Z' },
    ]
    const imp = (nummer: string, geaendert: string) => ({ nummer, patient: 'P', betrag: 5, geaendert, plan: { neu: nummer } })
    const neu = abgleichen(liste, [], [imp('A', '2026-10-07T10:00:00.000Z'), imp('B', '2026-10-07T10:00:00.000Z'), imp('C', '2026-10-07T10:00:00.000Z')])
    expect(neu.map((e) => e.nummer)).toEqual(['C', 'A', 'B'])
    expect(neu.find((e) => e.nummer === 'A')).toMatchObject({ status: 'entwurf', plan: { neu: 'A' }, geaendert: '2026-10-07T10:00:00.000Z' })
    expect(neu.find((e) => e.nummer === 'B')?.plan).toEqual({ eigen: 1 })
    expect(abgleichen(liste, [], [])).toEqual(liste)
  })
})
