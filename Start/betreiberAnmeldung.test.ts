import { createServer, type Server } from 'node:http'
import { randomBytes, scryptSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Die Anmeldung auf der Hauptseite ging nur über ein Pickadoc-Konto.
 * superuser@pickadoc.de hat keines: das Passwort liegt lokal. Dieselbe Anmeldung muss ihn trotzdem hereinlassen.
 */
const ordner = mkdtempSync(join(tmpdir(), 'planr-superuser-'))
const salt = randomBytes(16)
const hash = scryptSync('geheimes-testpasswort', salt, 32)
process.env.PLANR_DATEN = ordner
process.env.PLANR_BETREIBER_HASH = `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`

let planr: Server
let basis = ''

beforeAll(async () => {
  const { plaeneMiddleware } = await import('./plaene-server')
  planr = createServer((req, res) => plaeneMiddleware(req, res, () => {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end('{"ok":false}')
  }))
  await new Promise<void>((r) => planr.listen(0, '127.0.0.1', r))
  basis = `http://127.0.0.1:${(planr.address() as { port: number }).port}`
})

afterAll(() => {
  planr?.close()
  rmSync(ordner, { recursive: true, force: true })
})

const posten = (passwort: string) => fetch(`${basis}/api/anmeldung`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'superuser@pickadoc.de', passwort }),
})

describe('Superuser über die Anmeldung der Hauptseite', () => {
  it('lässt das lokale Passwort herein und die Sitzung gilt danach', async () => {
    const r = await posten('geheimes-testpasswort')
    const d = await r.json() as { ok: boolean; konto: { name: string; email: string; admin: boolean } }
    expect(r.status).toBe(200)
    expect(d.konto).toEqual({ name: 'Superuser', email: 'superuser@pickadoc.de', admin: true })
    const cookie = String(r.headers.get('set-cookie') ?? '').split(';')[0]
    expect(cookie.startsWith('planr_sitzung=')).toBe(true)
    const wer = await fetch(`${basis}/api/anmeldung`, { headers: { Cookie: cookie } }).then((x) => x.json()) as { ok: boolean; konto: { name: string } }
    expect(wer.ok).toBe(true)
    expect(wer.konto.name).toBe('Superuser')
  })

  it('lehnt ein falsches Passwort ab und fragt dafür nicht bei Pickadoc nach', async () => {
    const r = await posten('falsch')
    expect(r.status).toBe(401)
    const d = await r.json() as { ok: boolean; meldung: string }
    expect(d.ok).toBe(false)
    expect(d.meldung).toBe('Anmeldung hat nicht geklappt.')
  })
})
