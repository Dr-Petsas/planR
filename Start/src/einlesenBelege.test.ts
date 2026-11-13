import { describe, expect, it } from 'vitest'
import { blattAusEinlesen } from './einlesenZeilen'
import { BELEGE } from './testdaten/belege'

const r = (n: number) => Math.round(n * 100) / 100

describe('echte Blätter', () => {
  for (const [name, { antwort, erwartet }] of Object.entries(BELEGE)) {
    it(`${name} wird vollständig und unverändert gelesen`, () => {
      expect(blattAusEinlesen(antwort)).toEqual(erwartet)
    })
  }

  it('jeder Laborbeleg geht auf den Cent auf: Zeilen plus MwSt. ergeben die Belegsumme', () => {
    const belege = Object.entries(BELEGE).filter(([name]) => name.includes('beleg'))
    expect(belege).toHaveLength(5)
    for (const [name, { antwort }] of belege) {
      const blatt = blattAusEinlesen(antwort)
      const zeilen = blatt.positionen.reduce((s, p) => s + p.anzahl * (p.betrag ?? 0), 0)
      const mwst = (blatt.summen.laborMwst ?? []).reduce((s, m) => s + m.betrag, 0)
      expect(r(zeilen + mwst), name).toBe(blatt.summen.laborBeleg)
      expect(blatt.positionen.every((p) => p.text && (p.ebene === 'MAT' || p.nr)), name).toBe(true)
    }
  })

  it('die GOZ-Zeilen von Teil 2 ergeben das GOZ-Honorar', () => {
    for (const name of ['fall1_teil2', 'fall2_teil2', 'fall3_teil2']) {
      const blatt = blattAusEinlesen(BELEGE[name].antwort)
      expect(r(blatt.positionen.reduce((s, p) => s + (p.betrag ?? 0), 0)), name).toBe(blatt.summen.honorarGoz)
    }
  })

  it('nimmt ein Textwort am Spaltenrand nicht als Nummer (3D- Modellscan)', () => {
    for (const name of ['fall1_beleg', 'fall1_beleg_jpg110', 'fall1_beleg_png200', 'fall3_beleg']) {
      const scan = blattAusEinlesen(BELEGE[name].antwort).positionen.find((p) => p.text?.startsWith('3D-'))
      expect(scan, name).toMatchObject({ ebene: 'BEB', nr: 'SCAN', anzahl: 1, betrag: 89 })
    }
  })
})
