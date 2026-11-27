import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MANDANT_AUS_CLIENT, sitzungHash } from './anmeldung'
import { schluesselHash } from './pvs-agent-server'

// Abfragen von MAS (Clara, Lücke füllen) haben keinen Browser. Sie gehen an das fest eingestellte Praxisprogramm
// der Praxis und an deren Bridge, nicht an die Bridge des PCs, an dem zuletzt ein PlanR-Browser benutzt wurde.
// Der Browser an diesem PC arbeitet weiter mit seiner Bridge.
const CLIENT = 'zzzMasWegTest'
const MANDANT = MANDANT_AUS_CLIENT(CLIENT)
const PC = 'pc-0123456789ab'
const SITZUNG = 's'.repeat(43)
const SCHLUESSEL: Record<string, string> = { [MANDANT]: 'schluessel-der-praxis', [PC]: 'schluessel-am-pc' }
const ordner = mkdtempSync(join(tmpdir(), 'planr-masweg-'))

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
// Wie auf dem Server hinter Caddy: keine Anfrage gilt als "am Praxis-PC".
const VON_AUSSEN = { 'X-Forwarded-For': '203.0.113.7' }

interface Auftrag { id: string; method: string; pfad: string }
/** Bridge, wie sie sich bei PlanR meldet: holt Aufträge ab und beantwortet jede Suche mit einer leeren Liste. */
class Bridge {
  auftraege: Auftrag[] = []
  private ende = new AbortController()
  private lauf: Promise<void> = Promise.resolve()
  constructor(private kennung: string, private pvs: string) {}
  private kopf() {
    return { ...VON_AUSSEN, 'X-PlanR-Mandant': this.kennung, Authorization: `Bearer ${SCHLUESSEL[this.kennung]}`, 'Content-Type': 'application/json' }
  }
  starten() {
    const abfrage = new URLSearchParams({ version: '2.0.7', status: 'bereit', pvs: this.pvs, kann: this.pvs })
    this.lauf = (async () => {
      while (!this.ende.signal.aborted) {
        const r = await fetch(`${basis}/api/pvs-agent/auftrag?${abfrage}`, { headers: this.kopf(), signal: this.ende.signal }).catch(() => null)
        if (!r) return
        const d = r.status === 200 ? await r.json() as { auftrag?: Auftrag } : {}
        if (!d.auftrag) continue
        this.auftraege.push(d.auftrag)
        await fetch(`${basis}/api/pvs-agent/antwort`, { method: 'POST', headers: this.kopf(), body: JSON.stringify({ id: d.auftrag.id, status: 200, daten: { items: [] } }) })
      }
    })()
  }
  async stoppen() {
    this.ende.abort()
    await this.lauf
  }
}
const amPc = new Bridge(PC, 'dens')
const derPraxis = new Bridge(MANDANT, 'dampsoft')

interface Ort { ok: boolean; lokal: boolean; pvs: string; verbunden: boolean }
/** Der Browser meldet sich, wie er es alle paar Sekunden tut; mit `pc` sitzt er am Rechner der PC-Bridge. */
const browser = (pc: boolean) => fetch(`${basis}/api/ort`, {
  method: 'POST',
  headers: { ...VON_AUSSEN, Cookie: `planr_sitzung=${SITZUNG}${pc ? `; planr_ort=${PC}` : ''}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ browser: pc ? 'browser-am-pc' : 'browser-empfang', aktiv: pc }),
}).then((r) => r.json()) as Promise<Ort>

async function bisVerbunden(pc: boolean) {
  for (let i = 0; i < 100; i++) {
    if ((await browser(pc)).verbunden) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('Bridge hat sich nicht gemeldet')
}

const leistungen = async () => {
  // Zuletzt wurde am PC mit der eigenen Bridge gearbeitet.
  await browser(true)
  const r = await fetch(`${basis}/api/intern/pvs/leistungen?${new URLSearchParams({ clientId: CLIENT, vorname: 'Erika', name: 'Beispiel', geburt: '1970-01-01' })}`, {
    headers: { ...VON_AUSSEN, 'X-PlanR-Key': 'k' },
  })
  return { status: r.status, d: await r.json() as { ok: boolean; pvs?: string; meldung?: string } }
}

beforeAll(async () => {
  await new Promise<void>((r) => mas.listen(0, '127.0.0.1', r))
  process.env.PLANR_DATEN = ordner
  process.env.PLANR_MAS = `http://127.0.0.1:${(mas.address() as { port: number }).port}`
  process.env.PLANR_HKP_KEY = 'k'
  process.env.PLANR_LEISTUNGEN_PRAXEN = CLIENT
  const jetzt = Date.now()
  writeFileSync(join(ordner, 'sitzungen.json'), JSON.stringify([{
    hash: sitzungHash(SITZUNG), erneuern: '', seit: new Date(jetzt).toISOString(), geprueft: jetzt, zuletzt: jetzt,
    konto: { uid: 'praxis@example.org', email: 'praxis@example.org', name: 'Test', clientId: CLIENT, role: 'admin', admin: true },
  }]))
  writeFileSync(join(ordner, 'zugaenge.json'), JSON.stringify({ mandanten: { [CLIENT]: { mandant: MANDANT } }, benutzer: {} }))
  writeFileSync(join(ordner, 'einstellungen.json'), JSON.stringify({
    [MANDANT]: { pvs: 'dampsoft', bridge: true },
    [PC]: { pvs: 'dens', bridge: true },
  }))
  writeFileSync(join(ordner, 'pvs-agenten.json'), JSON.stringify({
    [MANDANT]: { hash: schluesselHash(SCHLUESSEL[MANDANT]) },
    [PC]: { hash: schluesselHash(SCHLUESSEL[PC]), lokalVon: MANDANT, name: 'Testrechner' },
  }))
  const { plaeneMiddleware } = await import('./plaene-server')
  planr = createServer((req, res) => plaeneMiddleware(req, res, () => json(res, 404, { ok: false })))
  await new Promise<void>((r) => planr.listen(0, '127.0.0.1', r))
  basis = `http://127.0.0.1:${(planr.address() as { port: number }).port}`
  amPc.starten()
  await bisVerbunden(true)
})

afterAll(async () => {
  await Promise.all([amPc.stoppen(), derPraxis.stoppen()])
  planr?.closeAllConnections()
  planr?.close()
  mas.close()
  rmSync(ordner, { recursive: true, force: true })
})

describe('Abfragen von MAS gehen an das eingestellte Praxisprogramm der Praxis', () => {
  it('der Browser am PC arbeitet weiter mit der Bridge an seinem PC, der am Empfang mit der der Praxis', async () => {
    expect(await browser(true)).toMatchObject({ ok: true, lokal: true, pvs: 'dens', verbunden: true })
    expect(await browser(false)).toMatchObject({ ok: true, lokal: false, pvs: 'dampsoft', verbunden: false })
  })

  it('Bridge der Praxis nicht verbunden: klare Meldung, kein Ausweichen auf die Bridge am PC', async () => {
    const r = await leistungen()
    expect(r.status).toBe(503)
    expect(r.d).toMatchObject({ ok: false, pvs: 'DS-Win' })
    expect(r.d.meldung).toContain('nicht verbunden')
    expect(amPc.auftraege).toEqual([])
  })

  it('Bridge der Praxis verbunden: der Auftrag geht an sie, auch wenn zuletzt am PC gearbeitet wurde', async () => {
    derPraxis.starten()
    await bisVerbunden(false)
    const r = await leistungen()
    // Die Bridge im Test kennt keinen Patienten; entscheidend ist, wohin der Auftrag ging.
    expect([501, 503]).not.toContain(r.status)
    expect(r.d.pvs ?? 'DS-Win').toBe('DS-Win')
    expect(derPraxis.auftraege.map((a) => `${a.method} ${a.pfad.split('?')[0]}`)).toEqual(['GET /patients'])
    expect(amPc.auftraege).toEqual([])
  })
})