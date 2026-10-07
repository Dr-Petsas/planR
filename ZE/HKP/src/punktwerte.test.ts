import { describe, expect, it } from 'vitest'
import { MITGELIEFERT, csvLesen, ermittlePunktwert, kzvDerPraxis } from './punktwerte'

describe('Punktwerte', () => {
  it('mitgelieferte Tabelle kennt alle 17 KZVen mit KCH-Werten', () => {
    expect(Object.keys(MITGELIEFERT.kzv)).toHaveLength(17)
    for (const k of Object.values(MITGELIEFERT.kzv)) {
      expect(k.KCH?.primaer).toBeGreaterThan(0.9)
      expect(k.KCH?.ersatz).toBeGreaterThan(0.9)
    }
  })

  it('KZV kommt aus der Praxis-PLZ, eine feste Wahl geht vor', () => {
    expect(kzvDerPraxis({ plz: '80331', kzvNr: '' })).toBe('11')
    expect(kzvDerPraxis({ plz: '80331', kzvNr: '13' })).toBe('13')
  })

  it('Tabelle je Kassenart, fester Wert hat Vorrang, ohne KZV Bundesmittel', () => {
    const praxis = { plz: '80331', kzvNr: '' }
    const p = ermittlePunktwert({ bereich: 'KCH', praxis, kassenart: 'primaer' })
    const e = ermittlePunktwert({ bereich: 'KCH', praxis, kassenart: 'ersatz' })
    expect(p.quelle).toBe('tabelle')
    expect(p.wert).toBe(MITGELIEFERT.kzv['11'].KCH!.primaer)
    expect(e.wert).toBe(MITGELIEFERT.kzv['11'].KCH!.ersatz)
    expect(ermittlePunktwert({ bereich: 'KCH', praxis, kassenart: 'primaer', fest: 1.5 })).toMatchObject({ wert: 1.5, quelle: 'fest' })
    const f = ermittlePunktwert({ bereich: 'KCH', praxis: { plz: '', kzvNr: '' }, kassenart: 'primaer' })
    expect(f.quelle).toBe('fallback')
    expect(f.wert).toBeGreaterThan(0.9)
  })

  it('liest eigene Werte aus CSV', () => {
    const { werte, zeilen } = csvLesen('KZV;Primär;Ersatz\n11;1,2345;1,2567\n13\t1.3\n99;1;1', 'PAR')
    expect(zeilen).toBe(2)
    expect(werte['11'].PAR).toEqual({ primaer: 1.2345, ersatz: 1.2567 })
    expect(werte['13'].PAR).toEqual({ primaer: 1.3, ersatz: 1.3 })
  })
})
