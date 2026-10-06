import { describe, expect, it } from 'vitest'
import { brueckenBereiche, markeAnzeigen, markeLesen } from './bruecken'
import { OBERKIEFER } from './zahnschema'

const reihe = (tp: Record<string, string>) => {
  const daten = Object.fromEntries(Object.entries(tp).map(([z, v]) => [z, markeLesen(v)]))
  return brueckenBereiche(OBERKIEFER, (z) => daten[z]?.kuerzel ?? '', (z) => daten[z])
}

describe('Brückenmarkierung -K … K-', () => {
  it('Eingabe lesen und wieder anzeigen', () => {
    expect(markeLesen('-KM')).toEqual({ kuerzel: 'KM', bAnfang: true, bEnde: false })
    expect(markeLesen('KM-')).toEqual({ kuerzel: 'KM', bAnfang: false, bEnde: true })
    expect(markeLesen('-')).toEqual({ kuerzel: '', bAnfang: true, bEnde: false })
    expect(markeAnzeigen('KM', { bAnfang: true, bEnde: true })).toBe('-KM-')
  })

  it('ohne Markierung: Brücke aus Gliedern und angrenzenden Pfeilern erkannt', () => {
    expect(reihe({ 14: 'K', 15: 'B', 16: 'K' })).toEqual([{ zaehne: ['16', '15', '14'], explizit: false }])
  })

  it('Doppelanker -KM KM BM KM- als eine Brücke', () => {
    expect(reihe({ 13: '-KM', 14: 'KM', 15: 'BM', 16: 'KM-' })).toEqual([{ zaehne: ['16', '15', '14', '13'], explizit: true }])
  })

  it('zwei Brücken nebeneinander getrennt', () => {
    const b = reihe({ 16: '-K', 15: 'B', 14: 'K-', 13: '-K', 12: 'B', 11: 'K-' })
    expect(b.map((x) => x.zaehne)).toEqual([['16', '15', '14'], ['13', '12', '11']])
  })

  it('gemeinsamer Pfeiler -K-', () => {
    const b = reihe({ 16: '-K', 15: 'B', 14: '-K-', 13: 'B', 12: 'K-' })
    expect(b.map((x) => x.zaehne)).toEqual([['16', '15', '14'], ['14', '13', '12']])
  })
})
