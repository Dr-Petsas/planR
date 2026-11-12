import { describe, expect, it } from 'vitest'
import { FALLKATALOG, fallAnsicht, fallAufnehmen, fallEntfernen, fallPruefen, regelnAus, type Fall } from './fallkatalog'

const krone = (faktor = 2.3, nr = '2210') => ({
  befund: { '16': 'kw' },
  positionen: [
    { ebene: 'GOZ', nr, zahn: '16', anzahl: 1, faktor, ...(faktor > 2.3 ? { begruendung: 'erschwerte Präparation' } : {}) },
    { ebene: 'BEL', nr: '1200', zahn: '16', anzahl: 1 },
  ],
})

describe('Fallkatalog', () => {
  it('verlangt 50 vollständige Pläne', () => {
    expect(FALLKATALOG.reduce((n, s) => n + s.soll, 0)).toBe(50)
    expect(new Set(FALLKATALOG.map((s) => s.id)).size).toBe(FALLKATALOG.length)
  })

  it('zählt nur einen vollständigen Plan', () => {
    expect(fallPruefen('ze-krone-gleich', { positionen: krone().positionen })).toEqual({ fehler: 'Der Befund je Zahn fehlt.' })
    expect(fallPruefen('ze-krone-gleich', { befund: { '16': 'kw' }, positionen: [{ ebene: 'GOZ', nr: '2210', zahn: '16', anzahl: 1 }] })).toEqual({ fehler: 'GOZ 2210 ohne Faktor.' })
    expect(fallPruefen('ze-krone-gleich', {
      befund: { '16': 'kw' },
      positionen: [{ ebene: 'GOZ', nr: '2210', zahn: '16', faktor: 3.5 }, { ebene: 'BEL', nr: '1200', zahn: '16' }],
    })).toEqual({ fehler: 'GOZ 2210 mit Faktor 3,5 ohne Begründung.' })
    expect(fallPruefen('kons-fuellung', { befund: { '16': 'k' }, positionen: [{ ebene: 'BEMA', nr: '13a', zahn: '16' }] })).not.toHaveProperty('fehler')
    expect(fallPruefen('ze-krone-gleich', { befund: { '16': 'kw' }, positionen: [{ ebene: 'GOZ', nr: '2210', zahn: '16', faktor: 2.3 }] })).toEqual({ fehler: 'Laborposition (BEL oder BEB) oder Werkstoff fehlt.' })
  })

  it('liest Befund und Positionen aus einem PlanR-Plan und verwirft Namen und Beträge', () => {
    const roh = {
      format: 'planr-plan', patient: 'Max Mustermann', betrag: 480,
      plan: {
        zaehne: { '16': { B: 'kw', TP: 'K' }, '15': { B: '' } },
        positionen: [
          { ebene: 'GOZ', nr: '2210', zahn: '16', anzahl: 1, faktor: 2.3, betrag: 200 },
          { ebene: 'BEB', nr: '0100', zahn: '16', material: 'Zirkon', betrag: 90 },
        ],
      },
    }
    const r = fallAufnehmen([], 'privat-krone', roh, new Date('2026-11-09T08:00:00Z'), 'f1')
    expect(r.fehler).toBeUndefined()
    expect(r.fall?.befund).toEqual({ '16': 'kw' })
    expect(JSON.stringify(r.fall)).not.toMatch(/Mustermann|480|200|90/)
    expect(r.fall?.positionen[1].material).toBe('Zirkon')
  })

  it('bevorzugt die Rechnung, wenn sie Positionen trägt', () => {
    const r = fallPruefen('kons-fuellung', {
      befund: { '26': 'f' },
      positionen: [{ ebene: 'BEMA', nr: '13a', zahn: '26' }],
      rechnung: { positionen: [{ ebene: 'BEMA', nr: '13b', zahn: '26' }] },
    })
    expect(r).toMatchObject({ positionen: [{ nr: '13b' }] })
  })

  it('macht aus der Mehrheit eine Regel und aus einem Einzelfall keine', () => {
    let faelle: Fall[] = []
    faelle = fallAufnehmen(faelle, 'ze-krone-gleich', krone(2.3, '2210'), new Date(), 'a').faelle
    expect(regelnAus(faelle)).toEqual([])
    faelle = fallAufnehmen(faelle, 'ze-krone-gleich', {
      befund: { '26': 'kw' },
      positionen: [
        { ebene: 'GOZ', nr: '2210', zahn: '26', faktor: 2.3 },
        { ebene: 'GOZ', nr: '2197', zahn: '26', faktor: 2.3 },
        { ebene: 'BEL', nr: '1200', zahn: '26' },
      ],
    }, new Date(), 'b').faelle
    const regeln = regelnAus(faelle)
    expect(regeln.map((r) => r.nr).sort()).toEqual(['1200', '2210'])
    expect(regeln.find((r) => r.nr === '2210')).toMatchObject({ bezug: 'zahn', faktor: 2.3, belegt: 2, von: 2, worte: ['krone', 'gleichartig'] })
    expect(regeln.find((r) => r.nr === '2210')!.zeile).toMatch(/Bei Krone, gleichartig: GOZ 2210 je Zahn/)
    expect(regeln.find((r) => r.nr === '2210')!.zeile).not.toMatch(/€|Euro/)
    faelle = fallAufnehmen(faelle, 'ze-krone-gleich', {
      befund: { '11': 'kw' },
      positionen: [
        { ebene: 'GOZ', nr: '2210', zahn: '11', faktor: 2.3 },
        { ebene: 'BEL', nr: '1200', zahn: '11' },
      ],
    }, new Date(), 'c').faelle
    expect(fallAufnehmen(faelle, 'ze-krone-gleich', krone(2.3, '2210'), new Date(), 'd').fehler).toMatch(/schon vor/)
    expect(regelnAus(faelle).find((r) => r.nr === '2210')).toMatchObject({ belegt: 3, von: 3 })
    expect(regelnAus(faelle).some((r) => r.nr === '2197')).toBe(false)
  })

  it('setzt den Haken, wenn die Sollzahl erreicht ist', () => {
    let faelle: Fall[] = []
    faelle = fallAufnehmen(faelle, 'ze-total', {
      befund: { '16': 'f', '26': 'f' },
      positionen: [{ ebene: 'BEMA', nr: '97a', zahn: 'OK' }, { ebene: 'BEL', nr: '3010', zahn: 'OK' }],
    }, new Date(), 't1').faelle
    expect(fallAnsicht(faelle).zeilen.find((z) => z.id === 'ze-total')).toMatchObject({ ist: 1, fertig: false, soll: 2 })
    faelle = fallAufnehmen(faelle, 'ze-total', {
      befund: { '36': 'f' },
      positionen: [{ ebene: 'BEMA', nr: '97b', zahn: 'UK' }, { ebene: 'BEL', nr: '3010', zahn: 'UK' }],
    }, new Date(), 't2').faelle
    const sicht = fallAnsicht(faelle)
    expect(sicht.zeilen.find((z) => z.id === 'ze-total')!.fertig).toBe(true)
    expect(sicht.soll).toBe(50)
    expect(sicht.ist).toBe(2)
    expect(sicht.artenFertig).toBe(1)
    expect(fallEntfernen(faelle, 'ze-total').faelle).toHaveLength(1)
  })
})
