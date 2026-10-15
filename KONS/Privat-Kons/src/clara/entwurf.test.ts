import { describe, expect, it } from 'vitest'
import { konsAuftragVerstehen, konsEntwurf, konsVersorgungSatz, type KonsEntwurf } from './index'

const ok = (r: ReturnType<typeof konsEntwurf>): KonsEntwurf => {
  if (r.status !== 'ok') throw new Error(`Rückfrage statt Entwurf: ${r.frage}`)
  return r
}
const kurz = (text: string) => Object.fromEntries(Object.entries(konsAuftragVerstehen(text).zaehne)
  .map(([z, l]) => [z, [l.therapie, l.flaechen ?? l.kanaele ?? ''].join('/')]))

describe('Kons-Auftrag verstehen', () => {
  it('Füllungen und Inlays mit Flächen wie im MKV-Planer', () => {
    expect(kurz('Komposit an 36 mo und 37 okklusal')).toEqual({ 36: 'komposit/2', 37: 'komposit/1' })
    expect(kurz('Keramikinlay 46 mod, 47 Goldinlay mo')).toEqual({ 46: 'inlay/3', 47: 'inlay/2' })
    expect(konsAuftragVerstehen('Goldinlay 26 mod').zaehne['26'].labor).toBe('gold')
    expect(kurz('zweiflächige Füllungen an 14 und 15')).toEqual({ 14: 'komposit/2', 15: 'komposit/2' })
  })

  it('Wurzelbehandlung mit Kanälen, vital oder avital, Sitzungen', () => {
    const a = konsAuftragVerstehen('Wurzelbehandlung an 36 dreikanalig in zwei Sitzungen')
    expect(a.zaehne['36']).toEqual({ therapie: 'endo', kanaele: 3, vital: true, sitzungen: 2 })
    expect(konsAuftragVerstehen('WKB 46 avital, 3 Kanäle').zaehne['46']).toMatchObject({ therapie: 'endo', kanaele: 3, vital: false })
    expect(kurz('Revision an 26 mit vier Kanälen')).toEqual({ 26: 'revision/4' })
  })

  it('übrige Kons-Leistungen', () => {
    expect(konsAuftragVerstehen('direkte Überkappung an 16').zaehne['16']).toEqual({ therapie: 'vital', vitalArt: 'direkt' })
    expect(konsAuftragVerstehen('Aufbau mit Glasfaserstift an 46').zaehne['46']).toEqual({ therapie: 'aufbau', aufbauStift: true })
    expect(kurz('Versiegelung an 16, 26, 36 und 46')).toEqual({ 16: 'versiegelung/', 26: 'versiegelung/', 36: 'versiegelung/', 46: 'versiegelung/' })
    expect(kurz('Icon Infiltration an 12, Veneer an 11 und 21')).toEqual({ 12: 'infiltration/', 11: 'veneer/', 21: 'veneer/' })
    expect(konsAuftragVerstehen('internes Bleaching an 21 in drei Sitzungen').zaehne['21']).toEqual({ therapie: 'bleaching', sitzungen: 3 })
  })

  it('mehrere Leistungen an einem Zahn: die wichtigste, die übrigen als Hinweis', () => {
    const a = konsAuftragVerstehen('Wurzelbehandlung und Aufbau an 46, dreikanalig')
    expect(a.zaehne['46'].therapie).toBe('endo')
    expect(a.verdraengt['46']).toEqual(['aufbau'])
  })

  it('Vereinbarungsart aus dem Wortlaut', () => {
    expect(konsAuftragVerstehen('Kostenvoranschlag Inlay 46 mod').vereinbarung).toBe('pkv')
    expect(konsAuftragVerstehen('Kassenpatient, komplett privat: Inlay 46 mod').vereinbarung).toBe('gkvPrivat')
    expect(konsAuftragVerstehen('Kassenpatientin, nur die Zusatzleistungen zur Wurzelbehandlung 36 dreikanalig').vereinbarung).toBe('gkvZusatz')
  })

  it('Kanäle, Faktor und Euro sind keine Zähne', () => {
    expect(kurz('Wurzelbehandlung 36 mit 3 Kanälen, Faktor 2,3')).toEqual({ 36: 'endo/3' })
    expect(kurz('Komposit 36,37 jeweils o')).toEqual({ 36: 'komposit/1', 37: 'komposit/1' })
  })
})

describe('Kons-Entwurf', () => {
  it('rechnet nach GOZ und legt ohne Regler ab', () => {
    const r = ok(konsEntwurf('Keramikinlay an 46 mod und Komposit an 36 mo', {}, { patient: { name: 'Muster', vorname: 'Anna' } }))
    expect(r.zusammenfassung.summe).toBeGreaterThan(300)
    expect(r.zusammenfassung.vereinbarung).toBe('pkv')
    expect(r.plan.patient.name).toBe('Muster')
    expect('regler' in r.ablagePlan).toBe(false)
    expect(r.ablagePlan.nummer).toBe('')
    expect(konsVersorgungSatz(r.zusammenfassung)).toBe('Einlagefüllung, dreiflächig an 46; Kompositfüllung, zweiflächig an 36')
    expect(r.hinweise.join(' ')).toMatch(/Abdruck angenommen/)
  })

  it('Wurzelbehandlung: Hinweis auf die angenommene vitale Pulpa; Kassenpatient mit Zusatzleistungen', () => {
    const endo = ok(konsEntwurf('Wurzelbehandlung an 36 dreikanalig'))
    expect(endo.zusammenfassung.zaehne[0].titel).toBe('Wurzelkanalbehandlung, 3 Kanäle, vital')
    expect(endo.hinweise.join(' ')).toMatch(/vitale Pulpa angenommen/)
    const zusatz = ok(konsEntwurf('Kassenpatient, nur Zusatzleistungen: Komposit 36 mo'))
    expect(zusatz.zusammenfassung.zaehne[0].ausgeschlossen).toMatch(/Füllungs-MKV-Planer/)
    expect(zusatz.hinweise.join(' ')).toMatch(/Zahn 36: Füllung beim Kassenpatienten/)
    expect(konsVersorgungSatz(zusatz.zusammenfassung)).toBe('')
  })

  it('Rückfragen: Zähne, Therapie, Flächen, Kanäle, Befund', () => {
    expect(konsEntwurf('Kostenvoranschlag Kons bitte')).toMatchObject({ status: 'rueckfrage', grund: 'zaehne' })
    expect(konsEntwurf('Kostenvoranschlag für 36')).toMatchObject({ grund: 'therapie', frage: 'Was soll ich an 36 planen?' })
    expect(konsEntwurf('Inlays an 36 und 37')).toMatchObject({ grund: 'flaechen', frage: 'Wie viele Flächen jeweils an 36 und 37?' })
    expect(konsEntwurf('Wurzelbehandlung an 46')).toMatchObject({ grund: 'kanaele', frage: 'Wie viele Kanäle an 46?' })
    expect(konsEntwurf('Aufbau an 36', { 36: 'f' })).toMatchObject({
      grund: 'befund_konflikt', zahn: '36', frage: 'Laut Befund ist 36 ein fehlender Zahn, dort geht kein Aufbau. Welchen Zahn meinen Sie?',
    })
    expect(konsEntwurf('Wurzelbehandlung an 36 dreikanalig', { 36: 'k' }).status).toBe('ok')
  })

  it('Nachtrag zu einer Rückfrage ergänzt den Auftrag', () => {
    expect(kurz('Wurzelbehandlung an 46. Drei Kanäle')).toEqual({ 46: 'endo/3' })
    expect(kurz('Inlays an 36 und 37. Beide mod')).toEqual({ 36: 'inlay/3', 37: 'inlay/3' })
    expect(kurz('Kostenvoranschlag für 36. Inlay mod')).toEqual({ 36: 'inlay/3' })
  })
})
