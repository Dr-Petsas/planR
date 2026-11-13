import { describe, expect, it } from 'vitest'
import { arbeitVerstehen, systemAusText, type ArbeitStand } from './arbeitDialog'

const stand = (extra: Partial<ArbeitStand> = {}): ArbeitStand => ({
  implantZaehne: ['36'],
  systemName: '',
  goz9050: [{ zahn: '36', anzahl: 1 }],
  gesperrt9050: [],
  kannSystem: true,
  kann9050: true,
  ...extra,
})

describe('Arbeitshilfe', () => {
  it('9050 zweimal ist üblich und wird vorgeschlagen, wenn sie nur einmal steht', () => {
    const r = arbeitVerstehen('geht 9050 2 mal?', stand())
    expect(r.art).toBe('vorschlag')
    if (r.art !== 'vorschlag') return
    expect(r.text).toMatch(/üblich/)
    expect(r.text).toMatch(/Soll ich das anpassen\?/)
    expect(r.tun).toEqual({ art: '9050', anzahl: 2 })
  })

  it('ohne Implantat wird nichts vorgeschlagen', () => {
    const r = arbeitVerstehen('geht 9050 2 mal?', stand({ implantZaehne: [], goz9050: [], kannSystem: false, kann9050: false }))
    expect(r.art).toBe('antwort')
    if (r.art === 'antwort') expect(r.text).toMatch(/keine Implantate/)
  })

  it('ohne genannten Systemnamen wird nachgefragt', () => {
    const r = arbeitVerstehen('ändere das implantatsystem', stand())
    expect(r.art).toBe('antwort')
    if (r.art === 'antwort') expect(r.text).toMatch(/Welches Implantatsystem/)
  })

  it('Straumann bei schon zweimal 9050 ändert nur das System', () => {
    const r = arbeitVerstehen('ändere das implantatsystem auf Straumann', stand({ goz9050: [{ zahn: '36', anzahl: 2 }] }))
    expect(r.art).toBe('vorschlag')
    if (r.art !== 'vorschlag') return
    expect(r.tun).toEqual({ art: 'system', systemId: 'straumann-bl' })
    expect(r.text).toMatch(/Straumann/)
    expect(r.text).toMatch(/schon zweimal/)
    expect(r.text).toMatch(/Soll ich das anpassen\?/)
  })

  it('Camlog statt medentis bleibt Camlog', () => {
    expect(systemAusText('Camlog statt medentis')?.id).toBe('camlog')
  })

  it('ja allein ist kein neuer Auftrag', () => {
    expect(arbeitVerstehen('ja', stand()).art).toBe('fremd')
  })

  it('ein freigegebener Plan bekommt keinen Schreibvorschlag', () => {
    const r = arbeitVerstehen('ändere das implantatsystem auf Straumann', stand({ gesperrt: true }))
    expect(r.art).toBe('antwort')
  })

  it('neben 9010 wird 9050 nicht vorgeschlagen', () => {
    const r = arbeitVerstehen('geht 9050 2 mal?', stand({ gesperrt9050: ['36'] }))
    expect(r.art).toBe('antwort')
    if (r.art === 'antwort') expect(r.text).toMatch(/9010/)
  })
})
