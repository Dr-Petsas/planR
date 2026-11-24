import { createServer, type Server } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sitzungHash } from './anmeldung'

// Eine Registrierung, eine Bridge: angemeldet trägt der Dateiname den Zugang der Praxis.
const CLIENT = 'zzzBridgeDownload'
const ARZT = 'b'.repeat(43)
const ordner = mkdtempSync(join(tmpdir(), 'planr-bridge-'))
mkdirSync(join(ordner, 'downloads'))
writeFileSync(join(ordner, 'downloads', 'PlanR-Bridge-Setup.exe'), Buffer.concat([Buffer.from('MZ'), Buffer.alloc(1100)]))

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

beforeAll(async () => {
  await new Promise<void>((r) => mas.listen(0, '127.0.0.1', r))
  process.env.PLANR_DATEN = ordner
  process.env.PLANR_MAS = `http://127.0.0.1:${(mas.address() as { port: number }).port}`
  process.env.PLANR_HKP_KEY = 'k'
  const jetzt = Date.now()
  writeFileSync(join(ordner, 'sitzungen.json'), JSON.stringify([{
    hash: sitzungHash(ARZT), erneuern: '', seit: new Date(jetzt).toISOString(), geprueft: jetzt, zuletzt: jetzt,
    konto: { uid: 'arzt', email: 'frank@example.org', name: 'Frank Ackermann', clientId: CLIENT, role: 'doctor', admin: false },
  }]))
  writeFileSync(join(ordner, 'zugaenge.json'), JSON.stringify({
    benutzer: {}, mandanten: { [CLIENT]: { mandant: 'praxis-frank', praxen: [{ name: 'DENS GmbH' }] } },
  }))
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

describe('Bridge-Download der angemeldeten Praxis', () => {
  it('ohne Anmeldung bleibt die Datei namenlos', async () => {
    const r = await fetch(`${basis}/download/PlanR-Bridge-Setup.exe`)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-disposition')).toBe('attachment; filename="PlanR-Bridge-Setup.exe"')
    expect(Buffer.from(await r.arrayBuffer()).subarray(0, 2).toString()).toBe('MZ')
  })

  it('angemeldet führt die Adresse den Praxiscode, auch ohne Admin', async () => {
    const r = await fetch(`${basis}/download/PlanR-Bridge-Setup.exe`, { headers: { Cookie: `planr_sitzung=${ARZT}` }, redirect: 'manual' })
    expect(r.status).toBe(302)
    const ziel = r.headers.get('location') ?? ''
    expect(ziel).toMatch(/^\/download\/PlanR-Bridge-Setup-[A-Za-z0-9]{8}\.exe$/)
    const datei = await fetch(`${basis}${ziel}`)
    expect(datei.status).toBe(200)
    expect(datei.headers.get('content-disposition')).toBe(`attachment; filename="${ziel.slice('/download/'.length)}"`)
    const agenten = JSON.parse(readFileSync(join(ordner, 'pvs-agenten.json'), 'utf8')) as Record<string, { setup?: unknown[] }>
    expect(agenten['praxis-frank']?.setup?.length).toBe(1)
  })
})
