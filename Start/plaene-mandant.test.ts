import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sitzungHash } from './anmeldung'

// Vorfall 18.11.2026: Ein Browser, der vorher das Konto einer anderen Praxis geführt hatte, meldete deren
// Pläne (auch alte, dort gelöschte) in die Ablage des jetzt angemeldeten Kontos.
const CLIENT = 'zzzMandantTest'
const TOKEN = 'b'.repeat(43)
const ordner = mkdtempSync(join(tmpdir(), 'planr-mandant-'))
const json = (res: import('node:http').ServerResponse, status: number, d: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(d))
}
const mas = createServer((req, res) => {
  const u = new URL(req.url ?? '', 'http://mas')
  if (u.pathname === '/planr/berechtigung') return json(res, 200, { ok: true, erlaubt: true, planr: true, clara: 'planr' })
  if (u.pathname === '/planr/hkp') return json(res, 200, { ok: true, hkps: [] })
  if (u.pathname === '/planr/entwuerfe') return json(res, 200, { ok: true, entwuerfe: [] })
  return json(res, 404, { ok: false })
})

let planr: Server
let basis = ''
let eigen = ''
const kopf = { Cookie: `planr_sitzung=${TOKEN}`, 'Content-Type': 'application/json' }
const karte = { nummer: 'IMPL-2026-A001', patient: 'Fremde Patientin', betrag: 100, status: 'entwurf', geaendert: '2026-11-18T08:00:00.000Z', kuerzel: 'IMPL', art: 'Privat', plan: { nummer: 'IMPL-2026-A001' } }
const melden = (pm: string | null) => fetch(`${basis}/api/plaene${pm === null ? '' : `?pm=${encodeURIComponent(pm)}`}`, {
  method: 'PUT', headers: kopf, body: JSON.stringify({ modul: 'privat-impl', plaene: [karte], entfernt: [] }),
})
const liste = async () => ((await (await fetch(`${basis}/api/plaene`, { headers: kopf })).json()) as { plaene: { nummer: string }[] }).plaene

beforeAll(async () => {
  await new Promise<void>((r) => mas.listen(0, '127.0.0.1', r))
  process.env.PLANR_DATEN = ordner
  process.env.PLANR_MAS = `http://127.0.0.1:${(mas.address() as { port: number }).port}`
  process.env.PLANR_HKP_KEY = 'k'
  const jetzt = Date.now()
  writeFileSync(join(ordner, 'sitzungen.json'), JSON.stringify([{
    hash: sitzungHash(TOKEN), erneuern: '', seit: new Date(jetzt).toISOString(), geprueft: jetzt, zuletzt: jetzt,
    konto: { uid: 'u1', email: 'test@example.org', name: 'Test', clientId: CLIENT, role: 'admin', admin: true },
  }]))
  const { plaeneMiddleware } = await import('./plaene-server')
  planr = createServer((req, res) => plaeneMiddleware(req, res, () => json(res, 404, { ok: false })))
  await new Promise<void>((r) => planr.listen(0, '127.0.0.1', r))
  basis = `http://127.0.0.1:${(planr.address() as { port: number }).port}`
  eigen = String(((await (await fetch(`${basis}/api/anmeldung`, { headers: kopf })).json()) as { mandant?: string }).mandant)
})

afterAll(() => {
  planr?.close()
  mas.close()
  rmSync(ordner, { recursive: true, force: true })
})

describe('Browser-Ablage einer anderen Praxis läuft nie in dieses Konto', () => {
  it('das Konto hat einen eigenen Mandanten', () => {
    expect(eigen).toMatch(/^p-/)
  })

  it('Meldung aus dem Speicher der Standard-Praxis: abgelehnt, mit dem richtigen Mandanten als Antwort', async () => {
    const r = await melden('standard')
    expect(r.status).toBe(409)
    expect(await r.json()).toMatchObject({ falscherMandant: true, mandant: eigen })
    expect(await liste()).toEqual([])
  })

  it('alter Planer-Stand ohne Marke: abgelehnt', async () => {
    const r = await melden(null)
    expect(r.status).toBe(409)
    expect(await liste()).toEqual([])
  })

  it('Abgleich und Einstellungen eines fremden Speichers: nichts geliefert, nichts angenommen', async () => {
    const a = await fetch(`${basis}/api/plaene?nur=abgleich&modul=privat-impl&pm=standard`, { headers: kopf })
    expect(a.status).toBe(409)
    const e = await fetch(`${basis}/api/planer-einstellungen?pm=standard`, {
      method: 'PUT', headers: kopf, body: JSON.stringify({ modul: 'privat-impl', basis: 0, einst: { naechsteNummer: 7 } }),
    })
    expect(e.status).toBe(409)
    const ohne = await fetch(`${basis}/api/planer-einstellungen`, {
      method: 'PUT', headers: kopf, body: JSON.stringify({ modul: 'privat-impl', basis: 0, einst: { naechsteNummer: 7 } }),
    })
    expect(ohne.status).toBe(409)
  })

  it('Meldung aus dem eigenen Speicher: angenommen', async () => {
    const r = await melden(eigen)
    expect(r.status).toBe(200)
    expect((await liste()).map((k) => k.nummer)).toEqual(['IMPL-2026-A001'])
  })
})
