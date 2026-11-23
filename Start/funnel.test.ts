import { describe, expect, it } from 'vitest'
import { funnelAuswerten, funnelBuchen, istFunnelSchritt, kampagneNorm, kanalNorm, type FunnelDatei } from './funnel'

describe('Funnel-Statistik (cookie-frei, aggregiert)', () => {
  it('prüft erlaubte Schritte und normalisiert Kanäle/Kampagnen', () => {
    expect(istFunnelSchritt('start')).toBe(true)
    expect(istFunnelSchritt('beispiel')).toBe(true)
    expect(istFunnelSchritt('buchung_ok')).toBe(true)
    expect(istFunnelSchritt('unbekannt')).toBe(false)
    expect(kanalNorm('ADS')).toBe('ads')
    expect(kanalNorm('organisch')).toBe('organisch')
    expect(kanalNorm('irgendwas')).toBe('direkt')
    expect(kampagneNorm('  HKP Sprach-KI 2026! ')).toBe('hkp-sprach-ki-2026')
    expect(kampagneNorm('a'.repeat(80)).length).toBe(40)
  })

  it('aggregiert Heute, 7 Tage und 30 Tage getrennt nach Kanal und Kampagne', () => {
    let daten: FunnelDatei = { tage: {} }
    daten = funnelBuchen(daten, { schritt: 'start', kanal: 'ads', kampagne: 'hkp-suche' }, '2026-11-23')
    daten = funnelBuchen(daten, { schritt: 'probe', kanal: 'ads', kampagne: 'hkp-suche' }, '2026-11-23')
    daten = funnelBuchen(daten, { schritt: 'beispiel', kanal: 'ads', kampagne: 'hkp-suche' }, '2026-11-23')
    daten = funnelBuchen(daten, { schritt: 'buchung_ok', kanal: 'ads', kampagne: 'hkp-suche' }, '2026-11-23')
    // 5 Tage zuvor (in 7d und 30d, nicht in heute)
    daten = funnelBuchen(daten, { schritt: 'start', kanal: 'organisch' }, '2026-11-18')
    daten = funnelBuchen(daten, { schritt: 'upload', kanal: 'organisch' }, '2026-11-18')
    // 20 Tage zuvor (nur in 30d)
    daten = funnelBuchen(daten, { schritt: 'start', kanal: 'direkt' }, '2026-11-03')
    // 45 Tage zuvor (außerhalb 30d)
    daten = funnelBuchen(daten, { schritt: 'start', kanal: 'direkt' }, '2026-10-09')

    const bericht = funnelAuswerten(daten, '2026-11-23')
    expect(bericht.heute.gesamt.start).toBe(1)
    expect(bericht.heute.gesamt.beispiel).toBe(1)
    expect(bericht.heute.gesamt.buchung_ok).toBe(1)
    expect(bericht.heute.kanaele.ads.start).toBe(1)
    expect(bericht.heute.kanaele.organisch.start).toBe(0)

    expect(bericht.tage7.gesamt.start).toBe(2)
    expect(bericht.tage7.gesamt.upload).toBe(1)
    expect(bericht.tage7.kanaele.organisch.upload).toBe(1)

    expect(bericht.tage30.gesamt.start).toBe(3)
    expect(bericht.tage30.kanaele.direkt.start).toBe(1)
    expect(bericht.kampagnen30).toHaveLength(1)
    expect(bericht.kampagnen30[0].name).toBe('hkp-suche')
    expect(bericht.kampagnen30[0].zaehler.buchung_ok).toBe(1)
  })

  it('begrenzt gespeicherte Tage auf maximal 90', () => {
    let daten: FunnelDatei = { tage: {} }
    for (let i = 0; i < 95; i++) {
      const d = new Date(Date.UTC(2026, 7, 1 + i))
      const tag = d.toISOString().slice(0, 10)
      daten = funnelBuchen(daten, { schritt: 'start', kanal: 'direkt' }, tag)
    }
    expect(Object.keys(daten.tage).length).toBe(90)
  })
})
