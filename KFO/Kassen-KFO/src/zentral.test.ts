import { describe, expect, it } from 'vitest'
import { entscheide, kern, uebernommen, type ZentralStand } from './zentral'

const server = (v: number, einst: Record<string, unknown> | null, mandant = 'p-a'): ZentralStand => ({ mandant, v, einst })
const A = { faktor: 2.3, preise: { krone: 400 } }
const B = { faktor: 3.5, preise: { krone: 400 } }

describe('zentrale Einstellungen: Abgleich', () => {
  it('vergleicht ohne Praxiskopf und ohne Reihenfolge der Schlüssel', () => {
    expect(kern({ praxis: { name: 'X' }, b: 1, a: { d: 1, c: 2 } })).toBe(kern({ a: { c: 2, d: 1 }, b: 1, praxis: { name: 'Y' } }))
    expect(kern(A)).not.toBe(kern(B))
  })

  it('erster Platz der Praxis legt den Stand an', () => {
    expect(entscheide(kern(A), null, server(0, null))).toBe('hoch')
    // Gleicher Stand aus einer alten Meldung: zur ersten Fassung machen
    expect(entscheide(kern(A), null, server(0, A))).toBe('hoch')
  })

  it('fragt, wenn ein Platz ohne Abgleich andere Werte hat als die Praxis', () => {
    expect(entscheide(kern(A), null, server(0, B))).toBe('fragen')
    expect(entscheide(kern(A), null, server(4, B))).toBe('fragen')
  })

  it('übernimmt den Praxis-Stand, wenn hier nichts geändert wurde', () => {
    expect(entscheide(kern(A), { mandant: 'p-a', v: 1, kern: kern(A) }, server(2, B))).toBe('runter')
  })

  it('meldet eine Änderung von hier auf Basis der bekannten Fassung', () => {
    expect(entscheide(kern(B), { mandant: 'p-a', v: 2, kern: kern(A) }, server(2, A))).toBe('hoch')
  })

  it('fragt bei Änderungen an zwei Plätzen zugleich', () => {
    expect(entscheide(kern(B), { mandant: 'p-a', v: 2, kern: kern(A) }, server(3, { faktor: 1.8 }))).toBe('fragen')
  })

  it('ruht, wenn alles gleich ist, und merkt sich einen gleichen Stand', () => {
    expect(entscheide(kern(A), { mandant: 'p-a', v: 2, kern: kern(A) }, server(2, A))).toBe('nichts')
    expect(entscheide(kern(A), null, server(2, A))).toBe('merken')
    expect(entscheide(kern(A), { mandant: 'p-a', v: 1, kern: kern(B) }, server(2, A))).toBe('merken')
  })

  it('ein Abgleich mit einer anderen Praxis zählt nicht', () => {
    expect(entscheide(kern(A), { mandant: 'p-b', v: 1, kern: kern(A) }, server(1, B))).toBe('fragen')
    expect(entscheide(kern(A), { mandant: 'p-b', v: 1, kern: kern(A) }, server(0, null))).toBe('hoch')
  })

  it('behält beim Übernehmen den Praxiskopf dieses Platzes', () => {
    expect(uebernommen({ praxis: { name: 'Hier' }, faktor: 1 }, { praxis: { name: 'Dort' }, faktor: 2 })).toEqual({ praxis: { name: 'Hier' }, faktor: 2 })
    expect(uebernommen({ faktor: 1 }, { faktor: 2 })).toEqual({ faktor: 2 })
  })
})
