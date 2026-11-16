import { describe, expect, it } from 'vitest'
import goz from '../../ZE/HKP/src/data/goz-2012.json'
import { gozPruefen, type Katalog } from './probeKatalog'

const katalog = goz as Katalog
const zeile = (nr: string, mehr: { anzahl?: number; faktor?: number; betrag?: number } = {}): { ebene: string; nr: string; anzahl: number; faktor?: number; betrag?: number } =>
  ({ ebene: 'GOZ', nr, anzahl: 1, ...mehr })

describe('gozPruefen', () => {
  it('saubere Zeilen geben keinen Hinweis', () => {
    // 2210: 1678 Punkte, einfach 94,37 €, bei 2,3 sind es 217,06 €.
    expect(gozPruefen([zeile('2210', { faktor: 2.3, betrag: 217.06 }), zeile('9010', { anzahl: 2 }), zeile('2197a')], katalog)).toEqual([])
  })
  it('B statt 8 und O statt 0 werden berichtigt', () => {
    const zeilen = [zeile('B000'), zeile('22O0'), zeile('010')]
    const hinweise = gozPruefen(zeilen, katalog)
    expect(zeilen.map((z) => z.nr)).toEqual(['8000', '2200', '0010'])
    expect(hinweise).toHaveLength(1)
    expect(hinweise[0]).toContain('B000 als 8000')
  })
  it('unbekannte Nummer wird genannt, nicht geraten', () => {
    const zeilen = [zeile('2215')]
    expect(gozPruefen(zeilen, katalog)[0]).toContain('verlesen): 2215')
    expect(zeilen[0].nr).toBe('2215')
  })
  it('Faktor 2,3 gelesen, der Betrag sagt 3,5', () => {
    const zeilen = [zeile('2210', { faktor: 2.3, betrag: 330.31 })]
    const hinweise = gozPruefen(zeilen, katalog)
    expect(zeilen[0].faktor).toBe(3.5)
    expect(hinweise[0]).toContain('Faktor 3,5 statt 2,3')
  })
  it('Betrag passt auf keinen glatten Faktor: nichts ändern, nichts melden', () => {
    const zeilen = [zeile('2210', { faktor: 2.3, betrag: 500 })]
    expect(gozPruefen(zeilen, katalog)).toEqual([])
    expect(zeilen[0].faktor).toBe(2.3)
  })
  it('BEMA und Labor bleiben unberührt', () => {
    expect(gozPruefen([{ ebene: 'BEMA', nr: '20a', anzahl: 1 }, { ebene: 'BEL', nr: '0010', anzahl: 1 }], katalog)).toEqual([])
  })
})
