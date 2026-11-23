import { createServer, type Server } from 'node:http'
import { randomBytes, scryptSync } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Der Superuser sah „Max Mustermann“ in der Liste, kam aber nicht hinein: Die Praxis hatte sich noch nie angemeldet.
 * Dazu fehlten Sperren und Löschen. Beides betrifft nur PlanR; bei Pickadoc wird nichts angefragt.
 */
const ordner = mkdtempSync(join(tmpdir(), 'planr-su-konto-'))
const salt = randomBytes(16)
process.env.PLANR_DATEN = ordner
process.env.PLANR_BETREIBER_HASH = `scrypt:${salt.toString('hex')}:${scryptSync('geheimes-testpasswort', salt, 32).toString('hex')}`

const EMAIL = 'max@mustermann.de'
const MANDANT = 'p-climax1'
writeFileSync(join(ordner, 'buchungen.json'), JSON.stringify([{
  id: 'b1', eingang: '2026-11-20T10:00:00.000Z', paket: 'planr',
  praxis: { name: 'Praxis Mustermann', rechtsform: '', strasse: 'Weg 1', plz: '40210', ort: 'Düsseldorf', telefon: '', email: '', website: '', ustId: '' },
  inhaber: { anrede: 'Herr', titel: '', vorname: 'Max', nachname: 'Mustermann', email: EMAIL, mobil: '' },
  kzv: { nr: '', abrechnungsnr: '', zahnaerzte: 1, praxen: 1, eigenlabor: false },
  pvs: { id: 'dens', version: '', server: '', it: '' },
  pickadocKonto: '', benutzer: [],
  sepa: { inhaber: '', anschrift: '', iban: '', bic: '', bank: '', mandatsreferenz: '', unterschrift: '' },
  hinweis: '', doku: false,
  konto: { status: 'angelegt', clientId: 'CliMax1' },
}]))
mkdirSync(join(ordner, 'mandanten', MANDANT), { recursive: true })
writeFileSync(join(ordner, 'mandanten', MANDANT, 'plaene.json'), '[]')
writeFileSync(join(ordner, 'einstellungen.json'), JSON.stringify({ [MANDANT]: { pvs: 'dens' }, standard: { pvs: 'dampsoft' } }))
writeFileSync(join(ordner, 'pvs-agenten.json'), JSON.stringify({ [MANDANT]: { hash: 'x' }, standard: { hash: 'y' } }))

let planr: Server
let basis = ''
let cookie = ''

const posten = (pfad: string, daten: unknown, mit = cookie) => fetch(`${basis}${pfad}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: mit }, body: JSON.stringify(daten),
})
const liste = async () => (await fetch(`${basis}/api/probe/eingang`, { headers: { Cookie: cookie } }).then((r) => r.json()) as {
  kunden: { id: string; konto?: { email: string; zugang: boolean; gesperrt: boolean } | null }[]
}).kunden
const lesen = (name: string) => JSON.parse(readFileSync(join(ordner, name), 'utf8'))

beforeAll(async () => {
  const { plaeneMiddleware } = await import('./plaene-server')
  planr = createServer((req, res) => plaeneMiddleware(req, res, () => {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end('{"ok":false}')
  }))
  await new Promise<void>((r) => planr.listen(0, '127.0.0.1', r))
  basis = `http://127.0.0.1:${(planr.address() as { port: number }).port}`
  const r = await posten('/api/probe/anmeldung', { email: 'superuser@pickadoc.de', passwort: 'geheimes-testpasswort' }, '')
  cookie = String(r.headers.get('set-cookie') ?? '').split(';')[0]
})

afterAll(() => {
  planr?.close()
  rmSync(ordner, { recursive: true, force: true })
})

describe('Superuser: Kundenkonto öffnen, sperren, löschen', () => {
  it('öffnet das Konto, obwohl sich die Praxis noch nie angemeldet hat', async () => {
    expect((await liste()).find((k) => k.id === 'b1')?.konto).toEqual({ email: EMAIL, zugang: true, gesperrt: false })
    const r = await posten('/api/probe/sudo', { email: EMAIL })
    expect(r.status).toBe(200)
    const sudo = String(r.headers.get('set-cookie') ?? '').split(';')[0]
    const wer = await fetch(`${basis}/api/anmeldung`, { headers: { Cookie: `${cookie}; ${sudo}` } }).then((x) => x.json()) as { ok: boolean; konto: { email: string }; mandant: string; sudo?: string }
    expect(wer).toMatchObject({ ok: true, konto: { email: EMAIL }, mandant: MANDANT, sudo: 'superuser@pickadoc.de' })
  })

  it('sperrt und entsperrt nur in PlanR; der Superuser kommt weiter hinein', async () => {
    expect((await posten('/api/probe/eingang/sperren', { email: EMAIL, gesperrt: true })).status).toBe(200)
    expect((await liste()).find((k) => k.id === 'b1')?.konto?.gesperrt).toBe(true)
    expect(lesen('gesperrt.json')).toMatchObject([{ email: EMAIL, clientIds: ['CliMax1'] }])
    expect((await posten('/api/probe/sudo', { email: EMAIL })).status).toBe(200)
    expect((await posten('/api/probe/eingang/sperren', { email: EMAIL, gesperrt: false })).status).toBe(200)
    expect((await liste()).find((k) => k.id === 'b1')?.konto?.gesperrt).toBe(false)
    expect((await posten('/api/probe/eingang/sperren', { email: 'superuser@pickadoc.de' })).status).toBe(400)
  })

  it('lässt ohne Superuser-Sitzung niemanden sperren oder löschen', async () => {
    expect((await posten('/api/probe/eingang/sperren', { email: EMAIL }, '')).status).toBe(401)
    expect((await posten('/api/probe/eingang/loeschen', { email: EMAIL }, '')).status).toBe(401)
    expect(lesen('buchungen.json')).toHaveLength(1)
  })

  it('löscht das PlanR-Konto ganz: Die Adresse ist danach frei', async () => {
    await posten('/api/probe/eingang/sperren', { email: EMAIL, gesperrt: true })
    const sudo = String((await posten('/api/probe/sudo', { email: EMAIL })).headers.get('set-cookie') ?? '').split(';')[0]
    const r = await posten('/api/probe/eingang/loeschen', { email: EMAIL })
    expect(r.status).toBe(200)
    expect(lesen('buchungen.json')).toEqual([])
    expect(lesen('gesperrt.json')).toEqual([])
    expect(lesen('einstellungen.json')).toEqual({ standard: { pvs: 'dampsoft' } })
    expect(lesen('pvs-agenten.json')).toEqual({ standard: { hash: 'y' } })
    expect(existsSync(join(ordner, 'mandanten', MANDANT))).toBe(false)
    // Aufbewahrung außerhalb der Ablage; PlanR liest dort nicht mehr.
    const archiv = readdirSync(join(ordner, 'geloeschte-konten'))
    expect(archiv).toHaveLength(1)
    expect(existsSync(join(ordner, 'geloeschte-konten', archiv[0], 'mandanten', MANDANT, 'plaene.json'))).toBe(true)
    expect(await liste()).toEqual([])
    expect((await posten('/api/probe/sudo', { email: EMAIL })).status).toBe(404)
    // Die offene Sitzung in diesem Konto ist beendet: Es bleibt die des Superusers.
    const wer = await fetch(`${basis}/api/anmeldung`, { headers: { Cookie: `${cookie}; ${sudo}` } }).then((x) => x.json()) as { konto: { email: string } }
    expect(wer.konto.email).toBe('superuser@pickadoc.de')
    expect((await posten('/api/probe/eingang/loeschen', { email: EMAIL })).status).toBe(400)
  })
})
