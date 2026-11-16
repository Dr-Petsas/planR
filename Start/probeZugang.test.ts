import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { probeBuchung } from './buchung'
import { kundenBauen, type ProbeKurz } from './kundenBackend'
import { ZUORDNEN_STUNDEN, eingangAnlegen, eingangFuerMandant, eingangZuordnen, neuesPasswort, zugangNamen } from './probeEingang'

const ordner: string[] = []
afterEach(async () => {
  await Promise.all(ordner.splice(0).map((o) => rm(o, { recursive: true, force: true })))
})

const kontakt = { name: 'Dr. Anna Berg', praxis: 'Zahnarztpraxis Dr. Anna Berg', telefon: '0211 1', email: 'anna@praxis-berg.de', anschrift: 'Bergstr. 1, 40235 Düsseldorf' }

describe('Zugang aus einer Probe', () => {
  it('ordnet einen Upload genau einmal einer Praxis zu', async () => {
    const wurzel = await mkdtemp(join(tmpdir(), 'probe-zugang-'))
    ordner.push(wurzel)
    const a = await eingangAnlegen(wurzel, { name: 'a.pdf', art: 'application/pdf', bytes: Buffer.from('a') })
    const b = await eingangAnlegen(wurzel, { name: 'b.pdf', art: 'application/pdf', bytes: Buffer.from('b') })
    expect(await eingangZuordnen(wurzel, [a.id], 'praxis1', 'anna@praxis-berg.de')).toBe(1)
    // Eine zweite Praxis bekommt den schon vergebenen Plan nicht.
    expect(await eingangZuordnen(wurzel, [a.id, b.id], 'praxis2', 'fremd@example.de')).toBe(1)
    expect((await eingangFuerMandant(wurzel, 'praxis1')).map((k) => k.id)).toEqual([a.id])
    expect((await eingangFuerMandant(wurzel, 'praxis2')).map((k) => k.id)).toEqual([b.id])
  })

  it('ordnet alte Uploads nicht mehr zu', async () => {
    const wurzel = await mkdtemp(join(tmpdir(), 'probe-zugang-'))
    ordner.push(wurzel)
    const a = await eingangAnlegen(wurzel, { name: 'a.pdf', art: 'application/pdf', bytes: Buffer.from('a') })
    const spaeter = Date.now() + (ZUORDNEN_STUNDEN + 1) * 3_600_000
    expect(await eingangZuordnen(wurzel, [a.id], 'praxis1', 'anna@praxis-berg.de', spaeter)).toBe(0)
  })

  it('baut Namen und Passwort für das Konto', () => {
    const n = zugangNamen(kontakt, 'anna@praxis-berg.de')
    expect(n.praxis).toContain('Berg')
    expect(n.nachname).toBeTruthy()
    expect(zugangNamen({ name: '', praxis: '', telefon: '', email: '', anschrift: '' }, 'empfang@zahn.de').nachname).toBeTruthy()
    const p = neuesPasswort()
    expect(p).toHaveLength(12)
    expect(neuesPasswort()).not.toBe(p)
  })

  it('legt eine Probe-Buchung im Testabo an und zeigt sie unter Proben', () => {
    const wer = zugangNamen(kontakt, 'anna@praxis-berg.de')
    const b = probeBuchung('Anna@Praxis-Berg.de', wer, kontakt)!
    expect(b.quelle).toBe('probe')
    expect(b.testabo).toBeTruthy()
    expect(b.sepa.iban).toBe('')
    expect(probeBuchung('keine-adresse', wer, kontakt)).toBeNull()
    const plan: ProbeKurz = { id: 'p1', zeit: '2026-11-15T14:00:00.000Z', dateiname: 'plan.pdf', kontakt: { ...kontakt, email: '' }, login: b.inhaber.email }
    const [zeile] = kundenBauen([b], [plan], [b.inhaber.email], { [b.id]: { plaene: 2, umsatzCent: 0 } })
    expect(zeile.art).toBe('probe')
    expect(zeile.login).toEqual({ email: b.inhaber.email, vorhanden: true })
    expect(zeile.plaene.map((p) => p.id)).toEqual(['p1'])
    expect(zeile.plaeneAnzahl).toBe(2)
  })
})
