import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sitzungHash } from './anmeldung'

// Eine Praxis hat ein Praxisprogramm: Mit eingerichteter Bridge steht es fest. Nur das Entwicklerkonto wechselt frei.
const CLIENT = 'zzzPvsFestTest'
const PRAXIS = 'p'.repeat(43)
const ENTWICKLER = 'e'.repeat(43)
const ARZT = 'a'.repeat(43)
const ordner = mkdtempSync(join(tmpdir(), 'planr-pvsfest-'))

const json = (res: import('node:http').ServerResponse, status: number, d: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(d))
}
const mas = createServer((req, res) => {
  const u = new URL(req.url ?? '', 'http://mas')
  if (u.pathname === '/planr/berechtigung') return json(res, 200, { ok: true, erlaubt: true, planr: true, clara: 'planr' })
  return json(res, 404, { ok: false })
})

let planr: Server
let basis = ''
interface Antwort { ok: boolean; mandant?: string; pvsFest?: boolean; pvsWahl?: boolean; meldung?: string; einstellungen?: { pvs: string } }
const lesen = (token: string) =>
  fetch(`${basis}/api/einstellungen`, { headers: { Cookie: `planr_sitzung=${token}` } }).then((r) => r.json()) as Promise<Antwort>
const setzen = async (token: string, pvs: string) => {
  const r = await fetch(`${basis}/api/einstellungen`, {
    method: 'POST', headers: { Cookie: `planr_sitzung=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pvs, bridge: true, ordner: '' }),
  })
  return { status: r.status, d: await r.json() as Antwort }
}

beforeAll(async () => {
  await new Promise<void>((r) => mas.listen(0, '127.0.0.1', r))
  process.env.PLANR_DATEN = ordner
  process.env.PLANR_MAS = `http://127.0.0.1:${(mas.address() as { port: number }).port}`
  process.env.PLANR_HKP_KEY = 'k'
  process.env.PLANR_PVS_FREI = 'Entwickler@example.org,arzt@example.org'
  const jetzt = Date.now()
  const sitzung = (token: string, email: string, admin = true) => ({
    hash: sitzungHash(token), erneuern: '', seit: new Date(jetzt).toISOString(), geprueft: jetzt, zuletzt: jetzt,
    konto: { uid: email, email, name: 'Test', clientId: CLIENT, role: admin ? 'admin' : 'doctor', admin },
  })
  writeFileSync(join(ordner, 'sitzungen.json'), JSON.stringify([
    sitzung(PRAXIS, 'praxis@example.org'),
    sitzung(ENTWICKLER, 'entwickler@example.org'),
    sitzung(ARZT, 'arzt@example.org', false),
  ]))
  const { plaeneMiddleware } = await import('./plaene-server')
  planr = createServer((req, res) => plaeneMiddleware(req, res, () => json(res, 404, { ok: false })))
  await new Promise<void>((r) => planr.listen(0, '127.0.0.1', r))
  basis = `http://127.0.0.1:${(planr.address() as { port: number }).port}`
})

afterAll(() => {
  planr?.close()
  mas.close()
  rmSync(ordner, { recursive: true, force: true })
})

describe('Praxisprogramm steht fest', () => {
  it('ohne Bridge bleibt die Wahl offen: ein Fehlgriff im Assistenten ist korrigierbar', async () => {
    expect((await setzen(PRAXIS, 'dampsoft')).status).toBe(200)
    expect((await setzen(PRAXIS, 'dens')).status).toBe(200)
    expect(await lesen(PRAXIS)).toMatchObject({ pvsFest: false, einstellungen: { pvs: 'dens' } })
  })

  it('mit eingerichteter Bridge: die Praxis kann nicht mehr wechseln, andere Felder speichert sie weiter', async () => {
    const { mandant } = await lesen(PRAXIS)
    writeFileSync(join(ordner, 'pvs-agenten.json'), JSON.stringify({ [mandant!]: { hash: 'x'.repeat(64) } }))
    expect(await lesen(PRAXIS)).toMatchObject({ pvsFest: true })
    const r = await setzen(PRAXIS, 'dampsoft')
    expect(r.status).toBe(403)
    expect(r.d.meldung).toContain('DENSoffice')
    expect((await setzen(PRAXIS, '')).status).toBe(403)
    expect((await setzen(PRAXIS, 'dens')).status).toBe(200)
    expect(await lesen(PRAXIS)).toMatchObject({ einstellungen: { pvs: 'dens' } })
  })

  it('das Entwicklerkonto wechselt weiter zwischen allen Praxisprogrammen', async () => {
    expect(await lesen(ENTWICKLER)).toMatchObject({ pvsFest: false, pvsWahl: true })
    expect((await setzen(ENTWICKLER, 'dampsoft')).status).toBe(200)
    expect((await setzen(ENTWICKLER, 'cgm-z1pro')).status).toBe(200)
    expect(await lesen(PRAXIS)).toMatchObject({ pvsFest: true, einstellungen: { pvs: 'cgm-z1pro' } })
  })

  it('ein Arzt-Entwicklerkonto wählt ebenfalls jedes Praxisprogramm, die Praxis bleibt fest', async () => {
    expect(await lesen(ARZT)).toMatchObject({ pvsFest: false, pvsWahl: true })
    expect((await setzen(ARZT, 'dens')).status).toBe(200)
    expect(await lesen(PRAXIS)).toMatchObject({ pvsFest: true, pvsWahl: false, einstellungen: { pvs: 'dens' } })
  })
})
