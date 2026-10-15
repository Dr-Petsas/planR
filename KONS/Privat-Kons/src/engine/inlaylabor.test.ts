import { describe, expect, it } from 'vitest'
import { inlayLabor, inlayPositionen } from './inlaylabor'
import { katalogZuordnen } from './zuordnung'
import { mitDigital } from './digital'

const kurz = (p: { nr: string; zahn: string }) => `${p.nr}${p.zahn ? ' ' + p.zahn : ''}`

describe('Inlay-Labor nach BEB (Kons-Planer)', () => {
  it('nach Abdruck: Inlay je Zahn, Sägemodell je Kiefer mit Inlay, Gegenkiefer in Hartgips, Mittelwertartikulator einmal', () => {
    const p = inlayPositionen([{ zahn: '26', werkstoff: 'keramik', flaechen: 3 }, { zahn: '16', werkstoff: 'keramik', flaechen: 2 }], 'abdruck')
    expect(p.map(kurz)).toEqual(['2552 16', '2553 26', '0021 OK', '0001 UK', '0402'])
    expect(inlayPositionen([{ zahn: '36', werkstoff: 'gold', flaechen: 5 }], 'abdruck').map(kurz)[0]).toBe('2304 36')
  })

  it('nach Intraoralscan: gedruckte Modelle und digitaler Ablauf, Kristallisationsbrand nur bei Keramik', () => {
    const p = inlayPositionen([{ zahn: '36', werkstoff: 'keramik', flaechen: 1 }], 'scan')
    expect(p.map(kurz)).toEqual([
      '2551 36', '0009 OK', '0009 UK', '0007', '0901', '0902', '0903 UK',
      '0013 36', '0017 36', '0904 36', '0905 36', '0909 36', '0911 36', '0906 36',
    ])
    expect(p.find((x) => x.nr === '0007')?.text).toBe('Oralscan aufbereiten')
    expect(inlayPositionen([{ zahn: '36', werkstoff: 'gold', flaechen: 2 }], 'scan').some((x) => x.nr === '0906')).toBe(false)
  })

  it('Preise aus dem Praxiskatalog, sonst BEB-Liste; ohne Praxisposition für das Inlay bleibt die Pauschale', () => {
    const katalog = katalogZuordnen(mitDigital([
      { nr: '02552', text: 'Inlay aus Keramik, gefräst, zweiflächig', preis: 140, quelle: 'pvs' },
      { nr: '00021', text: 'Sägemodell', preis: 30, quelle: 'pvs' },
    ]))
    const beb = new Map([['0001', { text: 'Modell aus Hartgips', preis: 10.4 }], ['0402', { text: 'Modellmontage in Mittelwertartikulator I', preis: 14.75 }]])
    const r = inlayLabor([{ zahn: '16', werkstoff: 'keramik', flaechen: 2 }, { zahn: '26', werkstoff: 'gold', flaechen: 2 }], 'abdruck', katalog, beb)
    expect(r.pauschal.map((i) => i.zahn)).toEqual(['26'])
    expect(r.zeilen.map((z) => `${kurz(z)} ${z.preis}${z.praxis ? ' P' + z.praxis : ''}`)).toEqual([
      '2552 16 140 P02552', '0021 OK 30 P00021', '0001 UK 10.4', '0402 14.75',
    ])
  })
})
