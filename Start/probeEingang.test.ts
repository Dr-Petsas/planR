import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scryptSync, randomBytes } from 'node:crypto'
import { BETREIBER, darfEingangSehen, eingangAnlegen, eingangDatei, eingangEinmalMelden, eingangListe, eingangSichtbar, eingangStand, eingangText, kontaktAusText, passwortPasst, standNachziehen, standPruefen, type ProbeStand } from './probeEingang'

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
  it('lässt nur den Superuser hinein, keine Praxis und keine andere Pickadoc-Adresse', () => {
    expect(darfEingangSehen(BETREIBER)).toBe(true)
    expect(darfEingangSehen('Superuser@pickadoc.de')).toBe(true)
    expect(darfEingangSehen('dr.petsas@pickadoc.de')).toBe(false)
    expect(darfEingangSehen('contact@maik-music.io')).toBe(false)
    expect(darfEingangSehen('praxis@example.de', 'superuser')).toBe(false)
    expect(darfEingangSehen('praxis@example.de', 'admin')).toBe(false)
  })

  it('prüft das Passwort gegen die Prüfsumme, nicht im Klartext', () => {
    const salt = randomBytes(16)
    const hash = scryptSync('richtig', salt, 32)
    const gespeichert = `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
    expect(passwortPasst('richtig', gespeichert)).toBe(true)
    expect(passwortPasst('falsch', gespeichert)).toBe(false)
    expect(passwortPasst('richtig', 'klartext')).toBe(false)
  })
})

describe('standPruefen', () => {
  it('behält Planart, Regler und die beiden Preise', () => {
    expect(standPruefen({
      planart: 'privat-impl', planer: 'Implantologie',
      regler: { privatStufe: 3, titel: 'Ästhetik', gozFaktor: 2.3 },
      vorher: { gesamt: 5114.57, honorar: 4393.35, material: 721.22 },
      nachher: { gesamt: 905.13, eigenanteil: 333.84, festzuschuss: 571.29 },
    })?.regler.titel).toBe('Ästhetik')
    expect(standPruefen({ planart: 'etwas' })).toBeNull()
  })
})

describe('standNachziehen', () => {
  const stand = (): ProbeStand => ({
    planart: 'privat-impl', planer: 'Privatplan',
    regler: { privatStufe: 0, titel: 'Ästhetik', gozFaktor: 2.3 },
    vorher: { gesamt: 5114.57, honorar: 4393.35, material: 721.22 },
    nachher: { gesamt: 5114.57, eigenanteil: 5114.57, festzuschuss: 0 },
  })
  const plan = { modul: 'privat-impl', nummer: 'IMPL-2026-A001', betrag: 8642.89, stufe: 4, gozFaktor: 3.5 }

  it('nimmt Summe und Regler aus dem gespeicherten Plan', () => {
    const neu = standNachziehen(stand(), [plan])
    expect(neu?.nachher).toEqual({ gesamt: 8642.89, eigenanteil: 8642.89, festzuschuss: 0 })
    expect(neu?.regler).toEqual({ privatStufe: 4, titel: '+ Laser', gozFaktor: 3.5 })
    expect(neu?.nummer).toBe('IMPL-2026-A001')
    expect(neu?.vorher.gesamt).toBe(5114.57)
  })

  it('behält die Aufteilung, wenn der Gesamtbetrag gleich bleibt', () => {
    const alt = stand()
    alt.nachher = { gesamt: 8642.89, eigenanteil: 8642.89, festzuschuss: 0, honorar: 7000, material: 1642.89 }
    const neu = standNachziehen(alt, [plan])
    expect(neu?.nachher.honorar).toBe(7000)
    expect(neu?.nachher.material).toBe(1642.89)
  })

  it('rät nicht, wenn zwei Pläne derselben Art da sind', () => {
    const zweiter = { ...plan, nummer: 'IMPL-2026-A002', betrag: 1000 }
    expect(standNachziehen(stand(), [plan, zweiter])).toEqual(stand())
  })

  it('setzt beim HKP nur den Eigenanteil aus der Liste', () => {
    const hkp: ProbeStand = {
      planart: 'hkp', planer: 'HKP', regler: { privatStufe: 0, titel: 'Kasse', gozFaktor: 0 },
      vorher: { gesamt: 2000 }, nachher: { gesamt: 2000, eigenanteil: 800, festzuschuss: 1200 },
    }
    const neu = standNachziehen(hkp, [{ modul: 'hkp', nummer: 'HKP-2026-A001', betrag: 650 }])
    expect(neu?.nachher).toEqual({ gesamt: 2000, eigenanteil: 650, festzuschuss: 1200 })
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
    const stand = standPruefen({ planart: 'privat-ze', planer: 'Privat-ZE', regler: { privatStufe: 2, titel: 'Vollkeramik', gozFaktor: 0 }, vorher: { gesamt: 1000 }, nachher: { gesamt: 800 } })
    expect(stand && (await eingangStand(wurzel, karte.id, stand))?.stand?.planer).toBe('Privat-ZE')
    expect((await eingangListe(wurzel))[0].kontakt.email).toBe('anna@praxis-berg.de')
  })
})
