import { describe, expect, it } from 'vitest'
import { relevanzErmitteln } from './relevanz'
import type { ZahnZeilen } from '../types'

const plan = (eintraege: Record<string, Partial<ZahnZeilen>>) =>
  Object.fromEntries(Object.entries(eintraege).map(([z, v]) => [z, { B: '', R: '', TP: '', ...v }]))

describe('Klinische Angaben: nur was zur Planung passt', () => {
  it('Einzelkrone: Stift ja, keine Prothese, kein Implantat, keine Metallbasis', () => {
    const r = relevanzErmitteln(plan({ 16: { B: 'ww', TP: 'KM' } }))
    expect(r.kronen).toEqual(['16'])
    expect(r.prothese).toEqual([])
    expect(r.deckprothese).toEqual([])
    expect(r.zahnlos).toEqual([])
    expect(r.implantate).toEqual([])
    expect(r.pfeiler).toEqual([])
  })

  it('vor dem Berechnen: Krone aus Zeile B abgeschätzt', () => {
    const r = relevanzErmitteln(plan({ 16: { B: 'ww' } }))
    expect(r.geplant).toBe(false)
    expect(r.kronen).toEqual(['16'])
    expect(r.prothese).toEqual([])
  })

  it('Brücke 14-16: Pfeiler 14 und 16', () => {
    const r = relevanzErmitteln(plan({ 14: { TP: 'KM' }, 15: { B: 'f', TP: 'BM' }, 16: { TP: 'KM' } }))
    expect(r.pfeiler).toEqual(['16', '14'])
    expect(r.prothese).toEqual([])
  })

  it('Teleskopprothese OK mit 2 Pfeilern: Prothese, Deckprothese (Metallbasis), Pfeiler', () => {
    const z: Record<string, Partial<ZahnZeilen>> = { 13: { TP: 'T' }, 23: { TP: 'T' } }
    for (const t of ['17', '16', '15', '14', '12', '11', '21', '22', '24', '25', '26', '27']) z[t] = { B: 'f', TP: 'E' }
    const r = relevanzErmitteln(plan(z))
    expect(r.prothese).toEqual(['OK'])
    expect(r.deckprothese).toEqual(['OK'])
    expect(r.pfeiler).toEqual(expect.arrayContaining(['13', '23']))
    expect(r.zahnlos).toEqual([])
  })

  it('zahnloser UK, Implantat 36', () => {
    const z: Record<string, Partial<ZahnZeilen>> = {}
    for (const t of ['47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '37']) z[t] = { B: 'f', TP: 'E' }
    z['36'] = { B: 'f', TP: 'SKM' }
    const r = relevanzErmitteln(plan(z))
    expect(r.zahnlos).toEqual(['UK'])
    expect(r.implantate).toEqual(['36'])
    expect(r.kronen).toEqual([])
  })
})
