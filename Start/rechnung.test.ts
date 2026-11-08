import { describe, expect, it } from 'vitest'
import { abrechnen, leeresZaehlwerk, monatMerken, naechsteNummer, planeImMonat, rechnungErstellen, rechnungHtml, zaehlwerkAktualisieren, type Aussteller, type Gesehen } from './rechnung'

const g = (nummer: string, datum: string, extra: Partial<Gesehen> = {}): Gesehen => ({ modul: 'hkp', kuerzel: 'HKP', art: 'Kasse', nummer, datum, ...extra })
const AUS: Aussteller = { name: 'Pickadoc GmbH', anschrift: ['Medical Center · c/o Dr. Petsas', 'Luise-Rainer-Str. 6–10', '40235 Düsseldorf'], ustId: 'DE123456789', steuernummer: '', register: 'Amtsgericht Düsseldorf · HRB 99537', glaeubigerId: 'DE98ZZZ09999999999', email: 'info@pickadoc.de', telefon: '0211 3029 3035' }

describe('Zählwerk', () => {
  it('erster Lauf: alles Vorhandene ist Altbestand und wird nie berechnet', () => {
    const z = leeresZaehlwerk(new Date('2026-10-12T10:00:00Z'))
    zaehlwerkAktualisieren(z, [g('a', '2026-10-05'), g('b', '2026-10-12T09:00:00Z')], new Date('2026-10-12T10:00:00Z'), true)
    expect(planeImMonat(z, '2026-10')).toHaveLength(0)
  })

  it('neue Pläne zählen einmal im Monat ihrer Anlage', () => {
    const z = leeresZaehlwerk(new Date('2026-10-12T10:00:00Z'))
    const jetzt = new Date('2026-10-20T10:00:00Z')
    zaehlwerkAktualisieren(z, [g('c', '2026-10-19T08:00:00Z'), g('lokal', '2026-10-20T09:00:00Z', { modul: 'kb', kuerzel: 'KB', art: 'Privat' })], jetzt)
    expect(zaehlwerkAktualisieren(z, [g('c', '2026-10-19T08:00:00Z')], jetzt)).toBe(false)
    expect(planeImMonat(z, '2026-10').map((p) => p.nummer)).toEqual(['c', 'lokal'])
  })

  it('Datum vor dem Zählwerk oder in der Zukunft wird auf jetzt gesetzt', () => {
    const z = leeresZaehlwerk(new Date('2026-10-12T10:00:00Z'))
    const jetzt = new Date('2026-11-02T10:00:00Z')
    zaehlwerkAktualisieren(z, [g('alt', '2026-09-01'), g('zukunft', '2027-01-01'), g('kaputt', 'nie')], jetzt)
    expect(planeImMonat(z, '2026-11')).toHaveLength(3)
  })

  it('verworfene Entwürfe zählen nicht, wiederhergestellte wieder', () => {
    const z = leeresZaehlwerk(new Date('2026-10-01T00:00:00Z'))
    const jetzt = new Date('2026-10-20T10:00:00Z')
    zaehlwerkAktualisieren(z, [g('d', '2026-10-19', { verworfen: true })], jetzt)
    expect(planeImMonat(z, '2026-10')).toHaveLength(0)
    expect(zaehlwerkAktualisieren(z, [g('d', '2026-10-19')], jetzt)).toBe(true)
    expect(planeImMonat(z, '2026-10')).toHaveLength(1)
  })
})

describe('Abrechnung', () => {
  it('voller Monat: Grundgebühr + 2,49 € je Plan + 19 % USt', () => {
    const z = leeresZaehlwerk(new Date('2026-09-15T00:00:00Z'))
    zaehlwerkAktualisieren(z, Array.from({ length: 12 }, (_, i) => g(`p${i}`, `2026-10-${String(i + 1).padStart(2, '0')}`)), new Date('2026-10-31T00:00:00Z'))
    const a = abrechnen(z, '2026-10', 'planr')
    expect(a.posten.map((p) => p.summeCent)).toEqual([6900, 2988])
    expect([a.nettoCent, a.ustCent, a.bruttoCent]).toEqual([9888, 1879, 11767])
  })

  it('erster Monat anteilig plus einmalige Einrichtung', () => {
    const z = leeresZaehlwerk(new Date('2026-10-12T10:00:00Z'))
    const a = abrechnen(z, '2026-10', 'planr_clara')
    expect(a.posten[0].text).toContain('20 von 31 Tagen')
    expect(a.posten[1].text).toContain('einmalig')
    expect(a.posten[1].summeCent).toBe(129900)
    expect(a.nettoCent).toBe(Math.round((22900 * 20) / 31) + 129900)
  })

  it('die Einrichtung steht nur auf der ersten Rechnung', () => {
    const z = leeresZaehlwerk(new Date('2026-10-12T10:00:00Z'))
    const zweiter = abrechnen(z, '2026-11', 'planr_clara')
    expect(zweiter.posten.map((p) => p.summeCent)).toEqual([22900])
  })

  it('Dokumentation ist eine Pauschale, ohne Preis je Eintrag', () => {
    const z = leeresZaehlwerk(new Date('2026-09-15T00:00:00Z'))
    monatMerken(z, '2026-10', 'planr', true)
    zaehlwerkAktualisieren(z, [g('n1', '2026-10-04')], new Date('2026-10-31T00:00:00Z'))
    const a = abrechnen(z, '2026-10', 'planr')
    expect(a.posten.map((p) => p.summeCent)).toEqual([6900, 249, 8900])
    expect(a.posten[2].text).toContain('kein Preis je Eintrag')
    expect(a.posten[2].menge).toBe(1)
  })

  it('Monat und Paket merken', () => {
    const z = leeresZaehlwerk(new Date())
    expect(monatMerken(z, '2026-10', 'planr')).toBe(true)
    expect(monatMerken(z, '2026-10', 'planr')).toBe(false)
    expect(monatMerken(z, '2026-10', 'planr_clara')).toBe(true)
  })
})

describe('Rechnung', () => {
  it('Nummern fortlaufend je Jahr', () => {
    const a = naechsteNummer({}, '2026')
    const b = naechsteNummer(a.lauf, '2026')
    expect([a.nummer, b.nummer, naechsteNummer(b.lauf, '2027').nummer]).toEqual(['PR-2026-0001', 'PR-2026-0002', 'PR-2027-0001'])
  })

  it('Druckansicht enthält Pflichtangaben und maskiert Eingaben', () => {
    const z = leeresZaehlwerk(new Date('2026-09-01T00:00:00Z'))
    zaehlwerkAktualisieren(z, [g('x1', '2026-10-03')], new Date('2026-10-31T00:00:00Z'))
    const r = rechnungErstellen(abrechnen(z, '2026-10', 'planr'), {
      nummer: 'PR-2026-0001', jetzt: new Date('2026-11-01T06:00:00Z'), mandant: 'p-x', clientId: 'x', buchung: 'B-1', aussteller: AUS,
      empfaenger: { praxis: 'Praxis <Test>', zuHaenden: 'Dr. A', strasse: 'Weg 1', plzOrt: '1 Ort', ustId: '', email: 'a@b.de', mandatsreferenz: 'PLANR-1', iban: 'DE89 •••• •••• 3000' },
    })
    const html = rechnungHtml(r)
    for (const s of ['PR-2026-0001', '01.11.2026', 'Oktober 2026', 'DE123456789', '19 %', '06.11.2026', 'PLANR-1', 'DE98ZZZ09999999999', 'Praxis &lt;Test&gt;', 'x1']) expect(html).toContain(s)
    expect(html).not.toContain('<Test>')
  })
})
