import { describe, expect, it } from 'vitest'
import { ablageKuerzen, befundAnsicht, nachAenderung, nachLesen, nachSchreiben, offeneKiefer, verwerfen, type Befund01 } from './befund01'

const T1 = '2026-10-15T08:00:00.000Z'
const T2 = '2026-10-15T09:00:00.000Z'
const T3 = '2026-10-15T10:00:00.000Z'
const gelesen = (zaehne: Record<string, string>) => ({ patient: '4711', label: 'Muster, Max', geburt: '1960-01-01', pvs: 'DS-Win', zaehne, datum: '2026-09-01' })

describe('aktueller 01-Befund', () => {
  it('erstes Lesen übernimmt das Praxisprogramm', () => {
    const b = nachLesen(undefined, gelesen({ '16': 'k', '26': 'f' }), T1)
    expect(befundAnsicht(b).zaehne).toMatchObject({ '16': 'k', '26': 'f' })
    expect(b.offen).toEqual({})
    expect(b.stand).toBe(T1)
  })

  it('Änderung im Gespräch ist offen und gilt für die Anzeige', () => {
    const b = nachAenderung(nachLesen(undefined, gelesen({ '16': 'k' }), T1), { '26': 'kw', '16': 'k' }, 'Eva', T2)
    expect(b.offen).toEqual({ '26': 'kw' })
    expect(befundAnsicht(b).zaehne['26']).toBe('kw')
    expect(b.offenWer).toBe('Eva')
    expect(b.stand).toBe(T2)
    expect(offeneKiefer(b)).toEqual(['OK'])
  })

  it('Rückgängig auf den Stand im Praxisprogramm ist nicht mehr offen', () => {
    const a = nachAenderung(nachLesen(undefined, gelesen({ '16': 'k' }), T1), { '16': 'x' }, 'Eva', T2)
    const b = nachAenderung(a, { '16': 'k' }, 'Eva', T3)
    expect(b.offen).toEqual({})
    expect(b.offenWer).toBe('')
  })

  it('erneutes Lesen behält offene Änderungen, solange das Praxisprogramm sie nicht hat', () => {
    const a = nachAenderung(nachLesen(undefined, gelesen({ '16': 'k' }), T1), { '26': 'kw', '36': 'f' }, 'Eva', T2)
    const b = nachLesen(a, gelesen({ '16': 'k', '36': 'f' }), T3)
    expect(b.offen).toEqual({ '26': 'kw' })
    expect(b.stand).toBe(T2)
  })

  it('Schreiben erledigt die offenen Zähne der geschriebenen Kiefer', () => {
    const a = nachAenderung(nachLesen(undefined, gelesen({ '16': 'k' }), T1), { '26': 'kw', '36': 'f' }, 'Eva', T2)
    const b = nachSchreiben(a, ['OK'], { ...a.pvsZaehne, ...a.offen }, T3)
    expect(b.offen).toEqual({ '36': 'f' })
    expect(b.pvsZaehne['26']).toBe('kw')
    expect(b.geschrieben).toBe(T3)
  })

  it('Kürzel aus dem Praxisprogramm bleiben unverändert, gesprochene werden klein', () => {
    const a = nachLesen(undefined, gelesen({ '17': 'T1' }), T1)
    expect(a.pvsZaehne['17']).toBe('T1')
    expect(nachAenderung(a, { '27': 'KW' }, 'Eva', T2).offen).toEqual({ '27': 'kw' })
  })

  it('Verwerfen und Ablage kürzen', () => {
    const a = nachAenderung(nachLesen(undefined, gelesen({}), T1), { '26': 'f' }, 'Eva', T2)
    expect(verwerfen(a, T3).offen).toEqual({})
    const ablage: Record<string, Befund01> = { a: { ...a, stand: T1 }, b: { ...a, stand: T3 }, c: { ...a, stand: T2 } }
    expect(Object.keys(ablageKuerzen(ablage, 2)).sort()).toEqual(['b', 'c'])
  })
})
