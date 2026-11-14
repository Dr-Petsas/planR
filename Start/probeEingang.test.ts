import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { darfEingangSehen, eingangAnlegen, eingangDatei, eingangEinmalMelden, eingangListe, eingangSichtbar, eingangText, kontaktAusText } from './probeEingang'

const STEMPEL = `
Zahnarztpraxis Dr. Anna Berg
Luise-Rainer-Str. 12
40235 Düsseldorf
Tel. 0211 1234567
anna@praxis-berg.de

Heil- und Kostenplan
Name, Vorname des Versicherten
Max Mustermann
Geburtsdatum 01.01.1980
Versichertennummer A123456789
Tel. 0170 9999999
`

describe('kontaktAusText', () => {
  it('liest den Praxisstempel und nicht das Telefon des Versicherten', () => {
    expect(kontaktAusText(STEMPEL)).toEqual({
      name: 'Zahnarztpraxis Dr. Anna Berg',
      praxis: 'Zahnarztpraxis Dr. Anna Berg',
      telefon: '0211 1234567',
      email: 'anna@praxis-berg.de',
      anschrift: 'Luise-Rainer-Str. 12, 40235 Düsseldorf',
    })
  })

  it('nimmt einen Stempel unter dem Plan, wenn die Zeile die Praxis nennt', () => {
    const text = 'Name des Versicherten\nMax Mustermann\n\nZahnarztpraxis Dr. Petsas · Tel. 0211 30293035 · petsas@praxis.de'
    const k = kontaktAusText(text)
    expect(k.telefon).toBe('0211 30293035')
    expect(k.email).toBe('petsas@praxis.de')
    expect(k.name).toContain('Petsas')
    expect(k.telefon).not.toContain('Mustermann')
  })

  it('lässt den Kontakt leer, wenn nur der Versicherte eine Nummer hat', () => {
    const text = 'Heil- und Kostenplan\nVersichertennummer A123456789\nTel. 0170 9999999'
    expect(kontaktAusText(text)).toMatchObject({ name: '', telefon: '', email: '' })
  })
})

describe('darfEingangSehen', () => {
  it('lässt Pickadoc und das Standalone-Konto hinein, eine fremde Praxis nicht', () => {
    expect(darfEingangSehen('dr.petsas@pickadoc.de')).toBe(true)
    expect(darfEingangSehen('contact@maik-music.io')).toBe(true)
    expect(darfEingangSehen('praxis@example.de', 'superuser')).toBe(true)
    expect(darfEingangSehen('praxis@example.de', 'admin')).toBe(false)
  })
})

describe('Ablage', () => {
  const ordner: string[] = []
  afterEach(async () => {
    await Promise.all(ordner.splice(0).map((o) => rm(o, { recursive: true, force: true })))
  })

  it('speichert die Datei und trägt den Kontakt aus dem Text nach', async () => {
    const wurzel = await mkdtemp(join(tmpdir(), 'probe-eingang-'))
    ordner.push(wurzel)
    const karte = await eingangAnlegen(wurzel, { name: 'hkp.pdf', art: 'application/pdf', bytes: Buffer.from('pdf') })
    expect(karte.kontakt.telefon).toBe('')
    const nach = await eingangText(wurzel, karte.id, STEMPEL)
    expect(nach?.kontakt.telefon).toBe('0211 1234567')
    expect(nach?.kontakt.email).toBe('anna@praxis-berg.de')
    const liste = await eingangListe(wurzel)
    expect(liste.map((e) => e.id)).toEqual([karte.id])
    const datei = await eingangDatei(wurzel, karte.id)
    expect(datei?.bytes.toString()).toBe('pdf')
    expect(await eingangText(wurzel, 'kein-gueltiger-id', STEMPEL)).toBeNull()
    expect((await eingangEinmalMelden(wurzel, karte.id))?.id).toBe(karte.id)
    expect(await eingangEinmalMelden(wurzel, karte.id)).toBeNull()
    const sichtbar = eingangSichtbar((await eingangListe(wurzel))[0])
    expect(sichtbar.kontakt.anschrift).toBe('Luise-Rainer-Str. 12, 40235 Düsseldorf')
    expect(sichtbar).not.toHaveProperty('gemeldet')
  })
})
