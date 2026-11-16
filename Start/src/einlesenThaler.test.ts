import { describe, expect, it } from 'vitest'
import { blattAusEinlesen, type EinleseAntwort } from './einlesenZeilen'
import thaler from './testdaten/thaler.json'

const r = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Vorfall 15.11.2026: Der Plan einer Praxis aus einem anderen Praxisprogramm wurde nur zur Hälfte gelesen.
 * Teil 2 heißt dort „Gebiet · GOZ · Anz · Faktor · Betrag", der Praxislaborbeleg führt die Menge vor dem Einzelpreis,
 * die Summen heißen anders, Teil 2 liegt dreifach bei, und im Schlüsselverzeichnis steht „ZE-Richtlinie Nr. 36b".
 */
describe('Blatt aus einem zweiten Praxisprogramm (Vorfall 15.11.2026)', () => {
  const blatt = blattAusEinlesen(thaler as EinleseAntwort)
  const goz = blatt.positionen.filter((p) => p.ebene === 'GOZ')
  const labor = blatt.positionen.filter((p) => p.ebene !== 'GOZ')

  it('liest das Zahnschema ohne Zahn 36 aus dem Schlüsselverzeichnis', () => {
    expect(blatt.schema.B).toEqual({ 24: 'ww', 25: 'f', 26: 'ww' })
    expect(blatt.schema.R).toEqual({ 24: 'KV', 25: 'BV', 26: 'K' })
    expect(blatt.schema.TP).toEqual({ 24: 'KM', 25: 'BM', 26: 'KM' })
  })

  it('liest jede GOZ-Zeile von Teil 2 genau einmal, auch die ohne Zahn', () => {
    expect(goz.map((p) => `${p.nr}/${p.zahn}`)).toEqual(['2197/24', '2197/26', '2210/24', '2210/26', '5010/24', '5070/24', '6190/'])
    expect(r(goz.reduce((s, p) => s + (p.betrag ?? 0) * p.anzahl, 0))).toBe(blatt.summen.honorarGoz)
  })

  it('nimmt den gesonderten GOZ-Kostenvoranschlag nicht in den HKP', () => {
    expect(goz.some((p) => ['0040', '0065', '8065'].includes(p.nr))).toBe(false)
  })

  it('liest den Praxislaborbeleg über beide Seiten auf den Cent', () => {
    expect(labor).toHaveLength(21)
    expect(labor.find((p) => p.nr === '0903')).toMatchObject({ anzahl: 8, betrag: 21.48 })
    expect(labor.find((p) => p.nr === 'g100')).toMatchObject({ anzahl: 2.5, betrag: 12.27, text: 'Degulor M' })
    const zeilen = labor.reduce((s, p) => s + r(p.anzahl * (p.betrag ?? 0)), 0)
    const mwst = (blatt.summen.laborMwst ?? []).reduce((s, m) => s + m.betrag, 0)
    // 2,50 g × 12,27 € steht auf dem Beleg als 30,68 €: ein Cent Rundung ist erlaubt.
    expect(Math.abs(r(zeilen + mwst) - blatt.summen.laborBeleg!)).toBeLessThanOrEqual(0.011)
  })

  it('liest die Summen von Teil 2', () => {
    expect(blatt.summen).toMatchObject({
      honorarGoz: 1100.57, honorarBema: 152.79, labor: 1688.18, gesamt: 2941.54,
      festzuschuss: 711.88, eigenanteil: 2229.66, festzuschussVoll: 1186.48, laborBeleg: 1688.17,
    })
  })
})
