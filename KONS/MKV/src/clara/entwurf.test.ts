import { describe, expect, it } from 'vitest'
import { mkvAuftragVerstehen, mkvEntwurf, mkvVersorgungSatz, type MkvEntwurf } from './index'

const ok = (r: ReturnType<typeof mkvEntwurf>): MkvEntwurf => {
  if (r.status !== 'ok') throw new Error(`Rückfrage statt Entwurf: ${r.frage}`)
  return r
}
const kurz = (text: string) => Object.fromEntries(Object.entries(mkvAuftragVerstehen(text).zaehne).map(([z, l]) => [z, `${l.therapie}/${l.flaechen}`]))

describe('MKV-Auftrag verstehen', () => {
  it('Flächen hinter dem Zahn, als Buchstaben und als Wort', () => {
    expect(kurz('Komposit an 36 mo und 37 okklusal')).toEqual({ 36: 'komposit/2', 37: 'komposit/1' })
    expect(kurz('Kompositfüllung 46 M O D, 47 mesial okklusal')).toEqual({ 46: 'komposit/3', 47: 'komposit/2' })
  })

  it('Flächen vor dem Zahn und "jeweils" für mehrere Zähne', () => {
    expect(kurz('zweiflächig an 36 und dreiflächig an 37')).toEqual({ 36: 'komposit/2', 37: 'komposit/3' })
    expect(kurz('36 und 37 jeweils m-o-d')).toEqual({ 36: 'komposit/3', 37: 'komposit/3' })
    expect(kurz('zweiflächige Füllungen an 14 und 15')).toEqual({ 14: 'komposit/2', 15: 'komposit/2' })
  })

  it('verschiedene Therapien in einem Satz', () => {
    expect(kurz('Kompositfüllungen an 36 mo und 37 o, und an 46 ein Keramikinlay mod'))
      .toEqual({ 36: 'komposit/2', 37: 'komposit/1', 46: 'inlay/3' })
    expect(kurz('36 mo Komposit, 26 Mehrfarbentechnik o')).toEqual({ 36: 'komposit/2', 26: 'mehrfarben/1' })
    const gold = mkvAuftragVerstehen('Goldinlay 26 mod mit Provisorium und Anästhesie, Intraoralscan').zaehne['26']
    expect(gold).toMatchObject({ therapie: 'inlay', labor: 'gold', provisorium: true, anaesthesie: true })
  })

  it('Faktor, Euro und "im Oberkiefer" sind keine Zähne oder Flächen', () => {
    expect(kurz('Komposit an 16 mo im Oberkiefer, Faktor 2,3, Mehrkosten 15 Euro')).toEqual({ 16: 'komposit/2' })
    expect(kurz('Komposit 36,37 jeweils o')).toEqual({ 36: 'komposit/1', 37: 'komposit/1' })
    expect(kurz('Komposit an 3,6 mo.')).toEqual({ 36: 'komposit/2' })
  })

  it('Nachtrag zu einer Flächen-Rückfrage ergänzt den Auftrag', () => {
    expect(kurz('Komposit an 36 und 37. Beide mod')).toEqual({ 36: 'komposit/3', 37: 'komposit/3' })
    expect(kurz('Komposit an 36 und 37. 36 mo, 37 o')).toEqual({ 36: 'komposit/2', 37: 'komposit/1' })
  })
})

describe('MKV-Entwurf', () => {
  it('rechnet mit dem Mehrkosten-Standard je Fläche und legt ohne Regler ab', () => {
    const r = ok(mkvEntwurf('Komposit an 36 mo und 37 okklusal', {}, { patient: { name: 'Muster', vorname: 'Anna' } }))
    expect(r.zusammenfassung.mehrkosten).toBeCloseTo(60, 0)
    expect(r.zusammenfassung.kassenanteil).toBeGreaterThan(0)
    expect(r.plan.patient.name).toBe('Muster')
    expect('regler' in r.ablagePlan).toBe(false)
    expect(r.ablagePlan.nummer).toBe('')
    expect(mkvVersorgungSatz(r.zusammenfassung)).toBe('Kompositfüllung in Adhäsivtechnik, zweiflächig an 36; Kompositfüllung in Adhäsivtechnik, einflächig an 37')
  })

  it('Inlay mit Labor, Aufbau mit Glasfaserstift als Privatvereinbarung', () => {
    const inlay = ok(mkvEntwurf('Keramikinlay an 46 mod'))
    expect(inlay.rechnung.zaehne[0].zeilen.some((z) => z.ebene === 'LABOR')).toBe(true)
    expect(inlay.hinweise.join(' ')).toMatch(/Abdruck angenommen/)
    const aufbau = ok(mkvEntwurf('Aufbau an 46 dreiflächig mit Glasfaserstift'))
    expect(aufbau.plan.zaehne['46']).toMatchObject({ therapie: 'aufbau', stift: true })
    expect(aufbau.zusammenfassung.privat7).toBeGreaterThan(0)
  })

  it('Rückfragen: Zähne, Flächen, Befund', () => {
    expect(mkvEntwurf('Füllungs-MKV bitte')).toMatchObject({ status: 'rueckfrage', grund: 'zaehne' })
    const fl = mkvEntwurf('Komposit an 36 und 37')
    expect(fl).toMatchObject({ status: 'rueckfrage', grund: 'flaechen' })
    expect(fl.status === 'rueckfrage' && fl.frage).toBe('Wie viele Flächen jeweils an 36 und 37?')
    const f = mkvEntwurf('Komposit an 36 mo', { 36: 'f' })
    expect(f.status === 'rueckfrage' && f.frage).toBe('Laut Befund ist 36 ein fehlender Zahn, dort geht keine Füllung. Welchen Zahn meinen Sie?')
    expect(f).toMatchObject({ grund: 'befund_konflikt', zahn: '36' })
    const k = mkvEntwurf('Komposit an 36 mo', { 36: 'k' })
    expect(k.status === 'rueckfrage' && k.frage).toMatch(/eine klinisch intakte Krone/)
    expect(mkvEntwurf('Aufbau an 36 dreiflächig', { 36: 'kw' }).status).toBe('ok')
  })

  it('Hinweise aus Befund und Frontzahn', () => {
    const r = ok(mkvEntwurf('Komposit an 11 mi und 36 mod', { 36: 'ww' }))
    expect(r.hinweise.join(' ')).toMatch(/Zahn 36: laut 01 weitgehend zerstört/)
    expect(r.hinweise.join(' ')).toMatch(/Zahn 11: Frontzahn: die adhäsive Füllung ist hier Kassenleistung/)
  })
})
