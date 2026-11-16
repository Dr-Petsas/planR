import { describe, expect, it } from 'vitest'
import type { Buchung } from './buchung'
import { kundenBauen, type ProbeKurz } from './kundenBackend'

const buchung = {
  id: 'b1',
  eingang: '2026-11-01T10:00:00.000Z',
  paket: 'planr',
  praxis: { name: 'Praxis Berg', rechtsform: 'Einzelpraxis', strasse: 'Bergstr. 1', plz: '40235', ort: 'Düsseldorf', telefon: '0211 1', email: 'praxis@berg.de', website: '', ustId: '' },
  inhaber: { anrede: 'Herr', titel: 'Dr.', vorname: 'Anton', nachname: 'Berg', email: 'anton@berg.de', mobil: '0171 1' },
  kzv: { nr: '37', abrechnungsnr: '123', zahnaerzte: 1, praxen: 1, eigenlabor: false },
  pvs: { id: 'dampsoft', version: '2026', server: 'server', it: '' },
  pickadocKonto: 'anton@berg.de',
  benutzer: [],
  sepa: { inhaber: 'Anton Berg', anschrift: '', iban: 'DE89370400440532013000', bic: '', bank: 'Bank', mandatsreferenz: 'M1', unterschrift: 'Anton Berg' },
  hinweis: '',
  doku: false,
} as Buchung

const plan: ProbeKurz = {
  id: 'p1', zeit: '2026-11-15T14:00:00.000Z', dateiname: 'plan.pdf',
  kontakt: { name: 'Dr. Anton Berg', praxis: '', telefon: '', email: 'anton@berg.de', anschrift: '' },
  stand: { planart: 'privat-ze', planer: 'Privat-ZE', regler: { privatStufe: 2, titel: 'Vollkeramik', gozFaktor: 0 }, vorher: { gesamt: 1000 }, nachher: { gesamt: 800, eigenanteil: 800 } },
}

const fremd: ProbeKurz = {
  id: 'p2', zeit: '2026-11-15T15:00:00.000Z', dateiname: 'implant.pdf',
  kontakt: { name: 'DR. PANTAS', praxis: 'Praxis Dr. Pantas GmbH', telefon: '', email: '', anschrift: 'Heinrich-Heine-Allee 37, Düsseldorf' },
}

describe('kundenBauen', () => {
  it('hängt den Upload an die Buchung und maskiert die IBAN', () => {
    const [berg] = kundenBauen([buchung], [plan, fremd], ['anton@berg.de'])
    const namen = kundenBauen([buchung], [plan, fremd], ['anton@berg.de']).map((k) => k.name)
    expect(namen).toContain('Dr. Anton Berg')
    expect(namen).toContain('DR. PANTAS')
    const anton = kundenBauen([buchung], [plan, fremd], ['anton@berg.de']).find((k) => k.name === 'Dr. Anton Berg')!
    expect(anton.login).toEqual({ email: 'anton@berg.de', vorhanden: true })
    expect(anton.plaene.map((p) => p.id)).toEqual(['p1'])
    expect(anton.stammdaten.find((z) => z.label === 'IBAN')?.wert).toBe('DE89 •••• •••• 3000')
    expect(JSON.stringify(anton)).not.toContain('0532013000')
    expect(berg).toBeTruthy()
  })

  it('zeigt eine doppelt abgeschickte Buchung nur einmal, mit der Buchung, die das Konto trägt', () => {
    const erste = { ...buchung, id: 'b1', konto: { status: 'angelegt', clientId: 'c1' } } as Buchung
    const zweite = { ...buchung, id: 'b2', konto: { status: 'vorhanden' } } as Buchung
    for (const reihe of [[erste, zweite], [zweite, erste]]) {
      const zeilen = kundenBauen(reihe, [], ['anton@berg.de'], { b1: { plaene: 3, umsatzCent: 100 } })
      expect(zeilen.map((k) => k.id)).toEqual(['b1'])
      expect(zeilen[0].plaeneAnzahl).toBe(3)
    }
  })

  it('zeigt einen Upload ohne Buchung und ohne Login', () => {
    const pantas = kundenBauen([], [fremd], []).find((k) => k.name === 'DR. PANTAS')!
    expect(pantas.login).toEqual({ email: 'pantas@pickadoc.de', vorhanden: false })
    expect(pantas.plaene).toHaveLength(1)
    expect(pantas.stammdaten.find((z) => z.label === 'Praxis')?.wert).toContain('Pantas')
  })
})
