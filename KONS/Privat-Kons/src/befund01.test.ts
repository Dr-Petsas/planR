import { describe, expect, it } from 'vitest'
import { ALLE_ZAEHNE, abweichungen, befundFolgen, befundZeile, konsHinweis, konsKandidaten, konsWarnungen, zeilenAenderung } from './befund01'

describe('Befund (01) als erster Schritt', () => {
  it('Abweichungen: leere Felder zählen als vorhanden, Groß/klein egal', () => {
    expect(abweichungen({ 16: { B: 'KW' }, 26: { B: '' } }, { 16: 'kw', 26: '', 36: 'f' })).toEqual({ 36: '' })
  })

  it('übernimmt den 01 in alle 32 Zähne und lässt die Planung stehen', () => {
    const z = befundZeile({ 16: { B: '', TP: 'K' } }, { 16: 'kw', 36: 'f' }, () => ({ B: '', TP: '' }))
    expect(Object.keys(z)).toHaveLength(ALLE_ZAEHNE.length)
    expect(z[16]).toEqual({ B: 'kw', TP: 'K' })
    expect(z[36]).toEqual({ B: 'f', TP: '' })
    expect(z[11]).toEqual({ B: '', TP: '' })
  })

  it('sagt für Füllungen, wo kein natürlicher oder schon versorgter Zahn steht', () => {
    expect(konsHinweis('f').geht).toBe(false)
    expect(konsHinweis('sk').geht).toBe(false)
    expect(konsHinweis('k').geht).toBe(false)
    expect(konsHinweis('x').geht).toBe(false)
    expect(konsHinweis('pw')).toEqual({ geht: true, text: 'laut 01 partieller Substanzdefekt' })
    expect(konsHinweis('ww').text).toMatch(/Aufbau/)
    expect(konsHinweis('')).toEqual({ geht: true, text: '' })
  })

  it('Kons/MKV: Kandidaten aus dem 01 und Warnungen zu geplanten Zähnen', () => {
    expect(konsKandidaten({ 16: 'pw', 26: 'ww', 36: 'k', 46: '' })).toEqual([{ zahn: '16', art: 'fuellung' }, { zahn: '26', art: 'aufbau' }])
    expect(konsWarnungen(['36', '46', '16'], { 16: 'pw', 36: 'kw', 46: '' })).toEqual([
      'Zahn 36: laut 01 erneuerungsbedürftige Krone – Planung prüfen',
      'Zahn 16: laut 01 partieller Substanzdefekt',
    ])
    expect(konsWarnungen(['36'], undefined)).toEqual([])
  })

  it('Wurzelbehandlung durch die Krone und Aufbau vor neuer Krone sind plausibel, Füllung an der Krone nicht', () => {
    expect(konsHinweis('k', 'endo')).toMatchObject({ geht: true })
    expect(konsHinweis('f', 'endo').geht).toBe(false)
    expect(konsHinweis('kw', 'aufbau')).toEqual({ geht: true, text: 'laut 01 erneuerungsbedürftige Krone – Aufbau vor der Neuversorgung' })
    expect(konsHinweis('k', 'aufbau').geht).toBe(false)
    expect(konsWarnungen([{ zahn: '46', art: 'endo' }, { zahn: '36', art: 'fuellung' }], { 46: 'kw', 36: 'kw' })).toEqual([
      'Zahn 46: laut 01 erneuerungsbedürftige Krone – Zugang durch die Krone',
      'Zahn 36: laut 01 erneuerungsbedürftige Krone – Planung prüfen',
    ])
  })
})

describe('Befundzeile und 01 im Gleichlauf', () => {
  it('beim Öffnen gilt der 01 für jeden Zahn, auch wenn der Plan schon einen Befund hatte', () => {
    const z = befundFolgen({ 16: { B: 'k' }, 36: { B: 'f' } }, null, { 16: 'kw', 36: 'f', 46: 'x' })!
    expect(z).toMatchObject({ 16: 'kw', 36: 'f', 46: 'x', 11: '' })
    expect(Object.keys(z)).toHaveLength(ALLE_ZAEHNE.length)
    expect(befundFolgen({ 16: { B: 'kw' } }, null, { 16: 'kw' })).toBeNull()
  })

  it('live folgt nur der Zahn, der dem alten 01 entsprach; eigene Änderungen bleiben', () => {
    const zeile = { 16: { B: 'kw' }, 26: { B: 'x' }, 36: { B: 'f' } }
    const alt = { 16: 'kw', 26: 'pw', 36: 'f' }
    const z = befundFolgen(zeile, alt, { 16: 'k', 26: 'ww', 36: 'f' }, new Set(['36']))!
    expect(z).toMatchObject({ 16: 'k', 26: 'x', 36: 'f' })
    expect(befundFolgen(zeile, alt, alt)).toBeNull()
  })

  it('als Änderung an den 01 gehen nur im Plan geänderte Zähne, die vom 01 abweichen', () => {
    const vorher = { 16: { B: 'kw' }, 26: { B: 'pw' } }
    expect(zeilenAenderung(vorher, { 16: { B: 'KW' }, 26: { B: 'ww' }, 36: { B: 'f' } }, { 26: 'pw', 36: 'f' })).toEqual({ 26: 'ww' })
    expect(zeilenAenderung(vorher, { 16: { B: '' }, 26: { B: 'pw' } }, { 16: 'kw', 26: 'pw' })).toEqual({ 16: '' })
  })
})