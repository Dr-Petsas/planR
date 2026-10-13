import { describe, expect, it } from 'vitest'
import { buchungPruefen, ibanGueltig, infoMail, kundenMail, neueMandatsreferenz } from './buchung.ts'

const gueltig = {
  paket: 'planr_clara',
  praxis: { name: 'Zahnarztpraxis Muster', rechtsform: 'Einzelpraxis', strasse: 'Hauptstr. 1', plz: '40235', ort: 'Düsseldorf', telefon: '0211 123456', email: 'praxis@example.de' },
  inhaber: { anrede: 'Frau', titel: 'Dr.', vorname: 'Anna', nachname: 'Muster', email: 'Anna@Example.de' },
  kzv: { nr: '20', abrechnungsnr: '123456', zahnaerzte: 2, praxen: 1, eigenlabor: true },
  pvs: { id: 'dampsoft', server: 'server' },
  benutzer: 'team@example.de, rezeption@example.de',
  sepa: { inhaber: 'Dr. Anna Muster', iban: 'DE89 3704 0044 0532 0130 00', mandat: true, unterschrift: 'Anna Muster' },
  zustimmung: { agb: true, datenschutz: true, avv: true },
  passwort: 'geheim-123',
}

describe('IBAN', () => {
  it('prüft die Prüfziffer und die Länge deutscher IBAN', () => {
    expect(ibanGueltig('DE89 3704 0044 0532 0130 00')).toBe(true)
    expect(ibanGueltig('DE89 3704 0044 0532 0130 01')).toBe(false)
    expect(ibanGueltig('DE89 3704 0044 0532 0130')).toBe(false)
    expect(ibanGueltig('AT61 1904 3002 3457 3201')).toBe(true)
  })
  it('Mandatsreferenz hat höchstens 35 erlaubte Zeichen', () => {
    expect(neueMandatsreferenz()).toMatch(/^PLANR-\d{8}-[0-9A-F]{8}$/)
  })
})

describe('Buchung prüfen', () => {
  it('nimmt eine vollständige Buchung an und normalisiert Adressen und IBAN', () => {
    const r = buchungPruefen(gueltig)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.buchung.inhaber.email).toBe('anna@example.de')
    expect(r.buchung.sepa.iban).toBe('DE89370400440532013000')
    expect(r.buchung.benutzer).toEqual(['team@example.de', 'rezeption@example.de'])
    expect(r.buchung.sepa.anschrift).toBe('Hauptstr. 1, 40235 Düsseldorf')
    expect(r.passwort).toBe('geheim-123')
    expect(JSON.stringify(r.buchung)).not.toContain('geheim-123')
  })
  it('verlangt ein Passwort mit mindestens 8 Zeichen', () => {
    const r = buchungPruefen({ ...gueltig, passwort: 'kurz' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fehler.passwort).toBeTruthy()
  })
  it('meldet fehlende Angaben je Feld', () => {
    const r = buchungPruefen({ ...gueltig, paket: 'gold', kzv: { ...gueltig.kzv, nr: '99' }, sepa: { ...gueltig.sepa, iban: 'DE00 1234', mandat: false }, zustimmung: {} })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.fehler)).toEqual(expect.arrayContaining(['paket', 'kzv.nr', 'sepa.iban', 'sepa.mandat', 'zustimmung.agb', 'zustimmung.avv']))
  })
  it('lehnt unbekannte Praxissysteme ab', () => {
    const r = buchungPruefen({ ...gueltig, pvs: { id: 'xyz' } })
    expect(r.ok).toBe(false)
  })
})

describe('Mails', () => {
  const r = buchungPruefen(gueltig)
  if (!r.ok) throw new Error('Testbuchung ungültig')
  const b = r.buchung
  it('Info-Mail an Pickadoc enthält alles für die Freischaltung, mit voller IBAN', () => {
    const m = infoMail(b, 'DE98ZZZ09999999999')
    expect(m.betreff).toContain('Zahnarztpraxis Muster')
    expect(m.text).toContain('DE89 3704 0044 0532 0130 00')
    expect(m.text).toContain('Hessen')
    expect(m.text).toContain('sprachsteuerung: true')
    expect(m.text).toContain(b.sepa.mandatsreferenz)
    expect(m.text).toContain('DE98ZZZ09999999999')
  })
  it('Bestätigung an die Praxis verdeckt die IBAN und nennt die nächsten Schritte', () => {
    const m = kundenMail(b, '')
    expect(m.text).not.toContain('0532 0130')
    expect(m.text).toContain('DE89 •••• •••• 3000')
    expect(m.text).toContain('Sehr geehrte Frau Dr. Muster')
    expect(m.text).toContain('wird mit der ersten Rechnung mitgeteilt')
  })
  it('mit sofort angelegtem Konto: Anmeldung gleich, keine Freischaltung von Hand', () => {
    const mit = { ...b, konto: { status: 'angelegt' as const, clientId: 'abc123' } }
    expect(kundenMail(mit, '').text).toContain('Passwort aus der Buchung an')
    expect(infoMail(mit, '').text).toContain('automatisch erledigt')
    expect(infoMail(mit, '').text).toContain('abc123')
    expect(infoMail({ ...b, konto: { status: 'vorhanden' } }, '').text).toContain('ZU TUN')
  })
})
