import { describe, expect, it } from 'vitest'
import { hkpEntwurf, kurzText, listenFuer, positionAendern, positionPruefen, positionVerstehen, zahlwort } from './index'
import { regelOptionen, regelversorgungErmitteln, therapieAnwenden } from '../engine/regeln'
import { regelUebernehmen } from '../engine/aufwertung'

const SATZ = 'Teleskopprothese mit Teleskopen auf den OK 4ern und nach distal ersetzt als Cover Denture'
const BEFUND = Object.fromEntries(['18', '17', '16', '15', '13', '12', '11', '21', '22', '23', '25', '26', '27', '28'].map((z) => [z, 'f']))

describe('Praxiskatalog', () => {
  const katalog = {
    pvs: 'DS-Win', stand: '2026-11-09', listeName: 'Praxis', komplexe: [],
    goz: [{ nr: '2220a', text: '2220 analog Tabletop', punkte: 1400, eigen: true, faktor: 2.3 }],
    eigenlabor: [{ nr: '0010', text: 'Spezialmodell der Praxis', preis: 40, ersetzt: '0010' }],
    bel: [{ nr: '0010', text: 'Modell der Praxis', preis: 11 }],
  }
  const ohne = hkpEntwurf('Unterkiefer Totalprothese', Object.fromEntries(['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'].map((z) => [z, 'f'])))
  const mit = hkpEntwurf('Unterkiefer Totalprothese', Object.fromEntries(['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'].map((z) => [z, 'f'])), {}, { katalog })

  it('BEL-Preis der Praxis ersetzt den Höchstpreis, Analognummer ersetzt die GOZ', () => {
    expect(ohne.status).toBe('ok')
    expect(mit.status).toBe('ok')
    if (ohne.status !== 'ok' || mit.status !== 'ok') return
    expect(mit.plan.einstellungen.labor).toBe('praxis')
    const preis = (r: typeof ohne, nr: string) => r.status === 'ok' ? r.ergebnis.positionen.find((p) => p.ebene === 'BEL' && p.nr.replace(/\s/g, '') === nr)?.einzelpreis : undefined
    expect(preis(mit, '0010')).toBeLessThan(preis(ohne, '0010')!)
    const top = hkpEntwurf('Tabletop 26', { 26: '' }, {}, { katalog })
    expect(top.status).toBe('ok')
    if (top.status !== 'ok') return
    expect(top.plan.positionen.some((p) => p.ebene === 'GOZ' && p.nr.toLowerCase() === '2220a')).toBe(true)
    expect(top.ergebnis.positionen.some((p) => p.nr.toLowerCase() === '2220a')).toBe(true)
  })

  it('Fremdlabor lässt den Praxiskatalog aus', () => {
    const fremd = hkpEntwurf('Unterkiefer Totalprothese im Fremdlabor', Object.fromEntries(['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'].map((z) => [z, 'f'])), {}, { katalog })
    expect(fremd.status === 'ok' && fremd.plan.einstellungen.labor).toBe('gewerbe')
  })
})

describe('Clara-Einstieg', () => {
  it('Zahlwörter', () => {
    expect(zahlwort('einundneunzig')).toBe(91)
    expect(zahlwort('zweitausendeinhunderteins')).toBe(2101)
    expect(zahlwort('neunzehn')).toBe(19)
    expect(zahlwort('fuenfzig')).toBe(50)
    expect(zahlwort('dreihundert')).toBe(300)
  })

  it('Leistungstext sprechbar kürzen', () => {
    expect(kurzText('Besondere Maßnahmen beim Präparieren oder Füllen von Kavitäten (z. B. Separieren, Beseitigen störenden Zahnfleisches), je Kieferhälfte oder Frontzahnbereich'))
      .toBe('Besondere Maßnahmen beim Präparieren oder Füllen von Kavitäten')
    expect(kurzText('Teleskopkrone')).toBe('Teleskopkrone')
  })

  it('gesprochene Positionsnummern', () => {
    expect(positionVerstehen('BEL neun sieben null null')).toEqual({ ebene: 'BEL', nr: '9700' })
    expect(positionVerstehen('einundneunzig b')).toEqual({ ebene: undefined, nr: '91b' })
    expect(positionVerstehen('BEMA 91 d')).toEqual({ ebene: 'BEMA', nr: '91d' })
    expect(positionVerstehen('GOZ fünfzig vierzig')).toEqual({ ebene: 'GOZ', nr: '5040' })
    expect(positionVerstehen('Position 97 00')).toEqual({ ebene: undefined, nr: '9700' })
    expect(positionVerstehen('BEB zweitausendeinhunderteins')).toEqual({ ebene: 'BEB', nr: '2101' })
  })

  it('Entwurf rechnen und Position prüfen', () => {
    const r = hkpEntwurf(SATZ, { ...BEFUND, 14: '', 24: '' }, { bonus: '60' })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.zusammenfassung).toMatchObject({ teleskope: ['14', '24'], befunde: expect.arrayContaining(['4.1', '4.6', '4.7']) })
    expect(r.zusammenfassung.ersetzt).toEqual(['17', '16', '15', '13', '12', '11', '21', '22', '23', '25', '26', '27'])
    expect(r.zusammenfassung.eigenanteil).toBeCloseTo(r.zusammenfassung.gesamt - r.zusammenfassung.festzuschuss, 1)
    const listen = listenFuer(r.plan)
    const tele = positionPruefen(r.ergebnis, listen, { ebene: 'BEMA', nr: '91d' })
    expect(tele.enthalten).toBe(true)
    expect(tele.treffer.map((t) => t.zahn).sort()).toEqual(['14', '24'])
    const bel = positionPruefen(r.ergebnis, listen, { nr: '1200' })
    expect(bel.treffer.every((t) => t.ebene === 'BEL')).toBe(true)
    const fehlt = positionPruefen(r.ergebnis, listen, { ebene: 'GOZ', nr: '2210' })
    expect(fehlt.enthalten).toBe(false)
    expect(fehlt.katalog[0]?.text).toMatch(/Krone/i)
  })

  it('Regelversorgung ohne TP-Zeile steht trotzdem in der Zusammenfassung (Anruf 06.10.2026 20:14)', () => {
    const r = hkpEntwurf('Brücke von 14 auf 17 mit 15 und 16 als Brücke', { 15: 'f', 16: 'f' })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(Object.values(r.plan.zaehne).every((z) => !z.TP.trim())).toBe(true)
    expect(r.zusammenfassung).toMatchObject({ kronen: ['17', '14'], glieder: ['16', '15'], ersetzt: ['16', '15'] })
    const z = hkpEntwurf('Brücke von 14 auf 17 mit 15 und 16 als Brückenglied in Zirkon', { 15: 'f', 16: 'f' })
    expect(z.status === 'ok' && z.zusammenfassung.kronen).toEqual(['17', '14'])
    const impl = hkpEntwurf('Implantatkronen auf 14 und 15', { 14: 'f', 15: 'f' })
    expect(impl.status === 'ok' && impl.zusammenfassung).toMatchObject({ implantatkronen: ['15', '14'], kronen: [] })
  })

  it('Bonus und Härtefall aus dem Satz', () => {
    const r = hkpEntwurf(`${SATZ}, Bonus 30 Prozent`, { ...BEFUND, 14: '', 24: '' })
    expect(r.status === 'ok' && r.plan.zuschuss).toEqual({ bonus: '75', haertefall: false })
    const h = hkpEntwurf(`${SATZ}, Härtefall`, { ...BEFUND, 14: '', 24: '' }, { bonus: '70' })
    expect(h.status === 'ok' && h.plan.zuschuss).toEqual({ bonus: '70', haertefall: true })
    expect(h.status === 'ok' && h.hinweise.some((x) => x.startsWith('Bonus'))).toBe(false)
  })

  it('Position entfernen bleibt nach Neuberechnung draußen, hinzufügen und Faktor', () => {
    const r = hkpEntwurf(SATZ, { ...BEFUND, 14: '', 24: '' }, { bonus: '60' })
    if (r.status !== 'ok') throw new Error('kein Entwurf')
    const weg = positionAendern(r.plan, { aktion: 'entfernen', ebene: 'BEL', nr: '1200', zahn: '14' })
    expect(weg.ok).toBe(true)
    if (!weg.ok) return
    expect(weg.plan.ausgeschlossen).toEqual(['BEL|1200|14'])
    expect(weg.nachher.gesamt).toBeLessThan(weg.vorher.gesamt)
    const neu = regelUebernehmen(weg.plan, therapieAnwenden(regelversorgungErmitteln(weg.plan.zaehne, regelOptionen(weg.plan)), weg.plan.zaehne, weg.plan))
    expect(neu.positionen.some((p) => p.ebene === 'BEL' && p.nr === '1200' && p.zahn === '14')).toBe(false)
    expect(neu.positionen.some((p) => p.ebene === 'BEL' && p.nr === '1200' && p.zahn === '24')).toBe(true)

    const dazu = positionAendern(r.plan, { aktion: 'hinzufuegen', ebene: 'GOZ', nr: '2030', zahn: '14' })
    expect(dazu.ok && dazu.beschreibung).toMatch(/^GOZ 2030 \(.+\) an 14 hinzufügen$/)
    expect(positionAendern(r.plan, { aktion: 'hinzufuegen', ebene: 'GOZ', nr: '9999' })).toMatchObject({ ok: false, grund: 'unbekannt' })
    expect(positionAendern(r.plan, { aktion: 'entfernen', ebene: 'GOZ', nr: '2210' })).toMatchObject({ ok: false, grund: 'nicht_gefunden' })
    expect(positionAendern(r.plan, { aktion: 'faktor', ebene: 'BEMA', nr: '91d', faktor: 3 })).toMatchObject({ ok: false, grund: 'ungueltig' })
  })

  it('Rückfrage wird durchgereicht', () => {
    expect(hkpEntwurf(SATZ, {})).toMatchObject({ status: 'rueckfrage', grund: 'befund_fehlt' })
  })
})
