import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sitzungHash } from './anmeldung'

// Private Sprach-Entwürfe von Clara: die Übersicht holt sie aus MAS (Nachbau) in Karten und Eingang des Planers.
const CLIENT = 'zzzEntwurfTest'
const TOKEN = 'a'.repeat(43)
const JAHR = new Date().getFullYear()
const ordner = mkdtempSync(join(tmpdir(), 'planr-entwuerfe-'))

interface MasEntwurf { id: string; modul: string; patient: string; betrag: number; plan: Record<string, unknown> }
let offen: MasEntwurf[] = []
const abgeholt: { id: string; nummer: string }[] = []
const gesperrt = new Set<string>()
let masKaputt = false

const plan = (tp: string) => ({ nummer: '', zaehne: { 14: { B: 'ww', TP: tp } }, patient: { name: 'Privattest', vorname: 'Paula' } })
const json = (res: import('node:http').ServerResponse, status: number, d: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(d))
}

const mas = createServer(async (req, res) => {
  const u = new URL(req.url ?? '', 'http://mas')
  let roh = ''
  for await (const c of req) roh += c
  if (req.headers['x-planr-key'] !== 'k' || u.searchParams.get('clientId') !== CLIENT) return json(res, 401, { ok: false })
  if (u.pathname === '/planr/berechtigung') return json(res, 200, { ok: true, erlaubt: true, planr: true, clara: 'planr' })
  if (u.pathname === '/planr/hkp') return json(res, 200, { ok: true, hkps: [] })
  if (u.pathname === '/planr/entwuerfe') return masKaputt ? json(res, 500, { ok: false }) : json(res, 200, { ok: true, entwuerfe: offen })
  const ab = u.pathname.match(/^\/planr\/entwuerfe\/([\w-]+)\/abgeholt$/)
  if (ab && req.method === 'POST') {
    const e = offen.find((x) => x.id === ab[1])
    if (!e || gesperrt.has(e.id)) return json(res, 409, { ok: false, grund: 'verworfen' })
    offen = offen.filter((x) => x !== e)
    abgeholt.push({ id: e.id, nummer: String(JSON.parse(roh).nummer) })
    return json(res, 200, { ok: true })
  }
  return json(res, 404, { ok: false })
})

let planr: Server
let basis = ''
const holen = (pfad: string) => fetch(`${basis}${pfad}`, { headers: { Cookie: `planr_sitzung=${TOKEN}` } }).then((r) => r.json())

beforeAll(async () => {
  await new Promise<void>((r) => mas.listen(0, '127.0.0.1', r))
  const port = (mas.address() as { port: number }).port
  process.env.PLANR_DATEN = ordner
  process.env.PLANR_MAS = `http://127.0.0.1:${port}`
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
})

afterAll(() => {
  planr?.close()
  mas.close()
  rmSync(ordner, { recursive: true, force: true })
})

describe('Sprach-Entwürfe von Clara in der Übersicht', () => {
  it('Übersicht holt ab: Karte mit eigener Nummer, MAS erfährt die Nummer, Planer bekommt den Plan im Eingang', async () => {
    offen = [{ id: 'e1', modul: 'privat-kv', patient: 'Paula Privattest', betrag: 1420.53, plan: plan('KM') }]
    const d = await holen('/api/plaene') as { plaene: Record<string, unknown>[] }
    const karte = d.plaene.find((k) => k.modul === 'privat-kv')
    expect(karte).toMatchObject({ kuerzel: 'ZE', art: 'Privat', nummer: `KV-${JAHR}-C001`, patient: 'Paula Privattest', betrag: 1420.53, status: 'entwurf' })
    expect(abgeholt).toEqual([{ id: 'e1', nummer: `KV-${JAHR}-C001` }])
    expect(offen).toEqual([])
    const a = await holen('/api/plaene?nur=abgleich&modul=privat-kv') as { eingang: { nummer: string; plan: { nummer: string; zaehne: Record<string, { TP: string }> } }[] }
    expect(a.eingang).toHaveLength(1)
    expect(a.eingang[0].nummer).toBe(`KV-${JAHR}-C001`)
    expect(a.eingang[0].plan.nummer).toBe(`KV-${JAHR}-C001`)
    expect(a.eingang[0].plan.zaehne['14'].TP).toBe('KM')
  })

  it('der Planer holt beim Öffnen selbst ab; die Nummer zählt weiter', async () => {
    offen = [{ id: 'e2', modul: 'privat-kv', patient: 'Otto Zweit', betrag: 99, plan: plan('K') }]
    const a = await holen('/api/plaene?nur=abgleich&modul=privat-kv') as { eingang: { nummer: string }[] }
    expect(a.eingang.map((e) => e.nummer).sort()).toEqual([`KV-${JAHR}-C001`, `KV-${JAHR}-C002`])
    expect(abgeholt.at(-1)).toEqual({ id: 'e2', nummer: `KV-${JAHR}-C002` })
  })

  it('von Clara zurückgenommen (MAS lehnt ab), fremdes Modul, kaputter Plan: nichts angelegt', async () => {
    offen = [
      { id: 'e3', modul: 'privat-kv', patient: 'Zurück Genommen', betrag: 1, plan: plan('K') },
      { id: 'e4', modul: 'kassen-par', patient: 'Fremd', betrag: 1, plan: plan('K') },
      { id: 'e5', modul: 'privat-kv', patient: 'Kaputt', betrag: 1, plan: [] as unknown as Record<string, unknown> },
    ]
    gesperrt.add('e3')
    const vorher = abgeholt.length
    const d = await holen('/api/plaene') as { plaene: { modul: string; patient: string }[] }
    expect(d.plaene.filter((k) => k.modul === 'privat-kv').map((k) => k.patient).sort()).toEqual(['Otto Zweit', 'Paula Privattest'])
    expect(d.plaene.some((k) => k.modul === 'kassen-par')).toBe(false)
    expect(abgeholt.length).toBe(vorher)
  })

  it('Füllungs-MKV: Kassenkarte mit FMKV-Nummer, Plan ohne Regler im Eingang des MKV-Planers', async () => {
    const mkvPlan = { nummer: '', patient: { name: 'Kassentest', vorname: 'Karl' }, zaehne: { 36: { therapie: 'komposit', flaechen: 2 } } }
    offen = [{ id: 'm1', modul: 'kons-mkv', patient: 'Karl Kassentest', betrag: 59.98, plan: mkvPlan }]
    const d = await holen('/api/plaene') as { plaene: Record<string, unknown>[] }
    expect(d.plaene.find((k) => k.modul === 'kons-mkv')).toMatchObject({ kuerzel: 'MKV', art: 'Kasse', nummer: `FMKV-${JAHR}-C001`, betrag: 59.98, status: 'entwurf' })
    expect(abgeholt.at(-1)).toEqual({ id: 'm1', nummer: `FMKV-${JAHR}-C001` })
    const a = await holen('/api/plaene?nur=abgleich&modul=kons-mkv') as { eingang: { plan: Record<string, unknown> }[] }
    expect(a.eingang).toHaveLength(1)
    expect(a.eingang[0].plan).toMatchObject({ nummer: `FMKV-${JAHR}-C001`, zaehne: { 36: { therapie: 'komposit', flaechen: 2 } } })
    expect(a.eingang[0].plan.regler).toBeUndefined()
  })

  it('privater Kons-Kostenvoranschlag: Privatkarte mit PK-Nummer im Eingang des Kons-Planers', async () => {
    const konsPlan = { nummer: '', vereinbarung: 'pkv', zaehne: { 36: { therapie: 'endo', kanaele: 3, vital: true } }, frei: [] }
    offen = [{ id: 'k1', modul: 'privat-kons', patient: 'Petra Privattest', betrag: 512.4, plan: konsPlan }]
    const d = await holen('/api/plaene') as { plaene: Record<string, unknown>[] }
    expect(d.plaene.find((k) => k.modul === 'privat-kons')).toMatchObject({ kuerzel: 'KONS', art: 'Privat', nummer: `PK-${JAHR}-C001`, status: 'entwurf' })
    const a = await holen('/api/plaene?nur=abgleich&modul=privat-kons') as { eingang: { plan: Record<string, unknown> }[] }
    expect(a.eingang[0].plan).toMatchObject({ nummer: `PK-${JAHR}-C001`, zaehne: { 36: { therapie: 'endo', kanaele: 3 } } })
  })

  it('Kostenvoranschlag Implantologie: Privatkarte mit IMPL-Nummer im Eingang des Implantologie-Planers', async () => {
    const implPlan = { nummer: '', zaehne: { 46: { B: '', TP: 'I' } }, implantate: {}, regionen: { 'UK-R': { augmentation: true } }, global: { bildgebung: 'dvt' } }
    offen = [{ id: 'i1', modul: 'privat-impl', patient: 'Petra Privattest', betrag: 2450.5, plan: implPlan }]
    const d = await holen('/api/plaene') as { plaene: Record<string, unknown>[] }
    expect(d.plaene.find((k) => k.modul === 'privat-impl')).toMatchObject({ kuerzel: 'IMPL', art: 'Privat', nummer: `IMPL-${JAHR}-C001`, status: 'entwurf' })
    const a = await holen('/api/plaene?nur=abgleich&modul=privat-impl') as { eingang: { plan: Record<string, unknown> }[] }
    expect(a.eingang[0].plan).toMatchObject({ nummer: `IMPL-${JAHR}-C001`, zaehne: { 46: { TP: 'I' } }, regionen: { 'UK-R': { augmentation: true } } })
  })

  it('MAS nicht erreichbar: die Übersicht kommt trotzdem', async () => {
    masKaputt = true
    try {
      const d = await holen('/api/plaene') as { plaene: { modul: string }[] }
      expect(d.plaene.filter((k) => k.modul === 'privat-kv')).toHaveLength(2)
    } finally {
      masKaputt = false
    }
  })
})
