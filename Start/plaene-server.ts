import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  befundDateiVon, begraben, eingangOffen, ersetzbar, grabAnlegen, hkpKarten, HKP_VERWERFBAR, kartePrüfen, modulErsetzen, planDateiAus, planDateiLesen,
  type Eingang, type Grab, type PlanKarte,
} from './src/plaene.ts'
import { planerZuModul } from './src/planer.ts'
import { einstellungenPruefen, LEER, MANDANT_RE, pvsVon } from './src/einstellungen.ts'
import { PVS_CONNECTOR, PVS_SUCHE, hkpFuerPvs, patientWaehlen, vermerkText, type PlanPatient, type PvsTreffer, type PvsVermerk } from './src/pvs.ts'
import {
  AgentHub, Bremse, GERAET_COOKIE, accessPruefen, accessSchluessel, auftragErlaubt, codePasst, cookieWert, emailErlaubt, geraetPasst,
  neuerSchluessel, schluesselHash, schluesselPasst, type AccessEinstellung, type AgentListe,
} from './pvs-agent-server.ts'
import { spawn } from 'node:child_process'

const ORDNER = 'F:/PlanR/Start/data'
const DATEI = `${ORDNER}/plaene.json`
const GRAEBER = `${ORDNER}/geloescht.json`
/** Planinhalte je `modul|nummer` – Grundlage für den Export aus der Übersicht */
const INHALTE = `${ORDNER}/inhalte.json`
/** Importierte Pläne, bis der Planer sie in seine Ablage übernommen hat */
const EINGANG = `${ORDNER}/eingang.json`
/** Behandler je Modul, wenn der Plan ihn nicht selbst trägt (HKP: Praxis-Einstellungen) */
const BEHANDLER = `${ORDNER}/behandler.json`
/** PVS und Bridge je Mandant */
const EINSTELLUNGEN = `${ORDNER}/einstellungen.json`
/** HKPs, die schon im PVS liegen: `hkp|nummer` → Vermerk */
const PVS_VERMERKE = `${ORDNER}/pvs-export.json`
/** PVS-Agent je Mandant: Schlüssel-Hash und freigegebene Anmeldungen (pvs-agent-schluessel.ts) */
const AGENTEN = `${ORDNER}/pvs-agenten.json`
/** Cloudflare Access vor dem Tunnel: { team, aud } – sonst CF_ACCESS_TEAM / CF_ACCESS_AUD */
const CF_ACCESS = `${ORDNER}/cf-access.json`
/** Installationspaket für den Praxisserver (pvsConnectoR: agent/paket-bauen.ps1) */
const AGENT_PAKET = `${ORDNER}/downloads/PlanR-Agent.zip`
const TUNNEL_HOST = 'planr.pickadoc-tunnel.com'
const HERKUNFT = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$|^https:\/\/[a-z0-9-]+\.pickadoc-tunnel\.com$/
const MODUL_RE = /^[a-z0-9-]{1,40}$/

type Inhalte = Record<string, { geaendert: string; plan: Record<string, unknown> }>
const schluessel = (modul: string, nummer: string) => `${modul}|${nummer}`

function masSchluessel(): string {
  if (process.env.PLANR_HKP_KEY?.trim()) return process.env.PLANR_HKP_KEY.trim()
  try {
    const env = readFileSync(process.env.MAS_ENV_DATEI ?? 'F:/MAS-2/backend/.env', 'utf8')
    return env.match(/^\s*PLANR_HKP_KEY\s*=\s*["']?([^"'\r\n#]*)/m)?.[1].trim() ?? ''
  } catch {
    return ''
  }
}

let kette: Promise<unknown> = Promise.resolve()
function exklusiv<T>(fn: () => Promise<T>): Promise<T> {
  const lauf = kette.then(fn, fn)
  kette = lauf.then(() => undefined, () => undefined)
  return lauf
}

async function jsonLesen<T>(datei: string, leer: T): Promise<T> {
  try {
    return JSON.parse(await readFile(datei, 'utf8')) as T
  } catch {
    return leer
  }
}

async function jsonSchreiben(datei: string, daten: unknown): Promise<void> {
  await mkdir(dirname(datei), { recursive: true })
  await writeFile(datei, JSON.stringify(daten), 'utf8')
}

async function dateiLesen(): Promise<PlanKarte[]> {
  const roh = await jsonLesen<unknown>(DATEI, [])
  return Array.isArray(roh) ? roh.map(kartePrüfen).filter((k): k is PlanKarte => !!k) : []
}
const dateiSchreiben = (liste: PlanKarte[]) => jsonSchreiben(DATEI, liste.filter((k) => k.modul !== 'hkp'))

async function graeberLesen(): Promise<Grab[]> {
  const roh = await jsonLesen<unknown>(GRAEBER, [])
  return Array.isArray(roh) ? roh.filter((g) => g && typeof g.modul === 'string' && typeof g.nummer === 'string' && g.karte) : []
}
const graeberSchreiben = (liste: Grab[]) => jsonSchreiben(GRAEBER, liste)

const inhalteLesen = async () => {
  const roh = await jsonLesen<unknown>(INHALTE, {})
  return (roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {}) as Inhalte
}
const eingangLesen = async () => {
  const roh = await jsonLesen<unknown>(EINGANG, [])
  return (Array.isArray(roh) ? roh.filter((e) => e && typeof e.modul === 'string' && typeof e.nummer === 'string' && e.plan) : []) as Eingang[]
}

// ---------- HKP-Register in MAS ----------

const MAS = 'http://127.0.0.1:4000/planr/hkp'
interface HkpDoc { id?: string; status?: string; version?: number; planJson?: string; dateien?: { id?: string; art?: string }[] }

async function mas(pfad: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; daten: Record<string, unknown> }> {
  const key = masSchluessel()
  if (!key) return { ok: false, status: 503, daten: { message: 'HKP-Register nicht erreichbar (kein PlanR-Schlüssel).' } }
  const r = await fetch(`${MAS}${pfad}`, {
    method: init.method ?? 'GET',
    headers: { 'X-PlanR-Key': key, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(6000),
  })
  return { ok: r.ok, status: r.status, daten: await r.json().catch(() => ({})) as Record<string, unknown> }
}

async function hkpsAusMas(): Promise<PlanKarte[] | null> {
  try {
    const r = await mas('?link=1')
    if (!r.ok) return null
    return hkpKarten(Array.isArray(r.daten.hkps) ? r.daten.hkps : [])
  } catch {
    return null
  }
}

const hkpHolen = async (id: string): Promise<HkpDoc | null> => {
  const r = await mas(`/${encodeURIComponent(id)}`)
  return r.ok ? (r.daten.hkp as HkpDoc) : null
}

/** Status eines HKP im MAS-Register setzen; `nurVon` schützt vor Überschreiben eines inzwischen geänderten Stands. */
async function hkpStatus(id: string, status: string, nurVon: string[]): Promise<{ ok: boolean; vorher?: string; meldung?: string }> {
  const h = await hkpHolen(id)
  if (!h) return { ok: false, meldung: 'HKP nicht gefunden.' }
  const vorher = String(h.status ?? '')
  if (!nurVon.includes(vorher)) return { ok: false, vorher, meldung: `Der HKP ist ${vorher.replace(/_/g, ' ')} und kann hier nicht geändert werden.` }
  const p = await mas(`/${encodeURIComponent(id)}`, { method: 'PUT', body: { status, version: h.version } })
  return p.ok ? { ok: true, vorher } : { ok: false, vorher, meldung: 'Der HKP wurde inzwischen geändert – Seite neu laden.' }
}

// ---------- Antworten ----------

function json(res: ServerResponse, status: number, daten: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(daten))
}

/** Plan aus der Übersicht löschen. HKPs werden im Register verworfen, die übrigen begraben. */
async function loeschen(modul: string, nummer: string, res: ServerResponse) {
  if (modul === 'hkp') {
    const r = await hkpStatus(nummer, 'verworfen', HKP_VERWERFBAR)
    if (!r.ok) return json(res, 409, { ok: false, meldung: r.meldung })
    const karte = kartePrüfen({ modul: 'hkp', kuerzel: 'HKP', art: 'Kasse', nummer, patient: '', betrag: 0, status: r.vorher, geaendert: new Date().toISOString() })
    if (karte) await graeberSchreiben(grabAnlegen(await graeberLesen(), karte))
    return json(res, 200, { ok: true })
  }
  const datei = await dateiLesen()
  const karte = datei.find((k) => k.modul === modul && k.nummer === nummer)
  if (!karte) return json(res, 404, { ok: false, meldung: 'Plan nicht gefunden.' })
  await graeberSchreiben(grabAnlegen(await graeberLesen(), karte))
  await dateiSchreiben(datei.filter((k) => k !== karte))
  await jsonSchreiben(EINGANG, (await eingangLesen()).filter((e) => !(e.modul === modul && e.nummer === nummer)))
  json(res, 200, { ok: true })
}

async function zurueckholen(modul: string, nummer: string, res: ServerResponse) {
  const graeber = await graeberLesen()
  const grab = graeber.find((g) => g.modul === modul && g.nummer === nummer)
  if (!grab) return json(res, 404, { ok: false, meldung: 'Nichts zum Zurückholen.' })
  if (modul === 'hkp') {
    const r = await hkpStatus(nummer, grab.karte.status, ['verworfen'])
    if (!r.ok) return json(res, 409, { ok: false, meldung: r.meldung })
  } else {
    const datei = await dateiLesen()
    await dateiSchreiben(modulErsetzen(datei, modul, [grab.karte, ...datei.filter((k) => k.modul === modul && k.nummer !== nummer)]))
  }
  await graeberSchreiben(graeber.filter((g) => g !== grab))
  json(res, 200, { ok: true })
}

async function exportieren(modul: string, nummer: string, res: ServerResponse) {
  if (modul === 'hkp') {
    const h = await hkpHolen(nummer)
    const karte = h ? hkpKarten([h])[0] : undefined
    if (!h || !karte) return json(res, 404, { ok: false, meldung: 'HKP nicht gefunden.' })
    return json(res, 200, { ok: true, datei: planDateiAus(karte, JSON.parse(h.planJson || '{}')) })
  }
  const karte = (await dateiLesen()).find((k) => k.modul === modul && k.nummer === nummer)
  const inhalt = (await inhalteLesen())[schluessel(modul, nummer)]
  if (!karte) return json(res, 404, { ok: false, meldung: 'Plan nicht gefunden.' })
  if (!inhalt) return json(res, 409, { ok: false, meldung: 'Den Planinhalt kennt die Übersicht noch nicht – den Planer einmal öffnen, dann klappt der Export.' })
  json(res, 200, { ok: true, datei: planDateiAus(karte, inhalt.plan) })
}

/** Befund-Datei (KZBV-Kürzel), die Clara beim Anlegen an den HKP gehängt hat */
async function befundLaden(modul: string, nummer: string, res: ServerResponse) {
  if (modul !== 'hkp') return json(res, 404, { ok: false, meldung: 'Nur HKPs haben eine Befund-Datei.' })
  const h = await hkpHolen(nummer)
  if (!h) return json(res, 404, { ok: false, meldung: 'HKP nicht gefunden.' })
  const dateiId = befundDateiVon(h)
  if (!dateiId) return json(res, 404, { ok: false, meldung: 'An diesem HKP hängt keine Befund-Datei.' })
  const r = await mas(`/${encodeURIComponent(nummer)}/datei/${encodeURIComponent(dateiId)}`)
  const datei = r.daten.datei as { name?: unknown; inhalt?: unknown } | undefined
  if (!r.ok || typeof datei?.inhalt !== 'string') return json(res, 404, { ok: false, meldung: 'Die Befund-Datei ist gerade nicht abrufbar.' })
  json(res, 200, { ok: true, befund: { name: String(datei.name ?? 'Befund.json'), inhalt: datei.inhalt } })
}

// ---------- Export ins PVS (pvsConnectoR) ----------

/** Direkt an diesem PC (nicht über den Tunnel) */
function amPraxisPc(req: IncomingMessage) {
  const host = String(req.headers.host ?? '').split(':')[0]
  const lokal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')
  return lokal && !req.headers['cf-connecting-ip'] && host !== TUNNEL_HOST
}

const hub = new AgentHub()

const agentenLesen = async () => {
  const roh = await jsonLesen<unknown>(AGENTEN, {})
  return (roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {}) as AgentListe
}

async function accessEinstellung(): Promise<AccessEinstellung | null> {
  const datei = await jsonLesen<Partial<AccessEinstellung>>(CF_ACCESS, {})
  const team = String(process.env.CF_ACCESS_TEAM ?? datei.team ?? '').trim()
  const aud = String(process.env.CF_ACCESS_AUD ?? datei.aud ?? '').trim()
  return /^[a-z0-9-]{1,63}$/.test(team) && /^[0-9a-f]{64}$/.test(aud) ? { team, aud } : null
}

async function anmeldung(req: IncomingMessage) {
  const cfg = await accessEinstellung()
  const token = String(req.headers['cf-access-jwt-assertion'] ?? '')
  if (!cfg || !token) return null
  return accessPruefen(token, cfg, () => accessSchluessel(cfg.team)).catch(() => null)
}

type Rufer = <T>(pfad: string, init?: { method?: 'GET' | 'POST'; body?: unknown; ms?: number; headers?: Record<string, string> }) =>
  Promise<{ ok: boolean; status: number; daten: T & { error?: string } }>

const agentRufer = (mandant: string): Rufer => async <T,>(pfad: string, init: Parameters<Rufer>[1] = {}) => {
  const method = init.method ?? 'GET'
  if (!auftragErlaubt(method, pfad)) throw new Error('auftrag_nicht_erlaubt')
  const r = await hub.rufen(mandant, { method, pfad, body: init.body, headers: init.headers, ms: init.ms ?? 10_000 })
  return r as { ok: boolean; status: number; daten: T & { error?: string } }
}

const vermerkeLesen = async () => {
  const roh = await jsonLesen<unknown>(PVS_VERMERKE, {})
  return (roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {}) as Record<string, PvsVermerk>
}

async function connector<T>(basis: string, pfad: string, init: { method?: string; body?: unknown; ms?: number; headers?: Record<string, string> } = {}) {
  const r = await fetch(`${basis}${pfad}`, {
    method: init.method ?? 'GET',
    headers: { Accept: 'application/json', ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(init.ms ?? 10_000),
  })
  return { ok: r.ok, status: r.status, daten: await r.json().catch(() => ({})) as T & { error?: string } }
}

/** Holt das PVS-Fenster nach vorn, damit der Plan dort gleich geöffnet werden kann. */
function pvsNachVorn(pvs: string) {
  const prozess = ({ dens: 'DensOffice', dampsoft: 'dswin' } as Record<string, string>)[pvs]
  if (!prozess) return
  const befehl = `$p = Get-Process ${prozess} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { (New-Object -ComObject WScript.Shell).AppActivate($p.Id) | Out-Null }`
  try {
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', befehl], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  } catch { /* Fenster bleibt, wo es ist */ }
}

async function insPvs(req: IncomingMessage, modul: string, nummer: string, mandant: string, res: ServerResponse) {
  if (modul !== 'hkp') return json(res, 400, { ok: false, meldung: 'Ins Praxisprogramm gehen bisher nur HKPs.' })
  const c = await pvsConnector(req, mandant)
  if (!c.rufen) return wegFehler(res, c)
  const pvs = { id: c.id!, name: c.name! }

  const r = await mas(`/${encodeURIComponent(nummer)}/rechnung`)
  if (!r.ok) return json(res, r.status === 404 ? 404 : 502, { ok: false, meldung: r.status === 404 ? 'HKP nicht gefunden.' : String(r.daten.message ?? 'Der HKP ließ sich in MAS nicht berechnen.') })
  const plan = r.daten.plan as { patient?: PlanPatient } & Record<string, unknown>
  const patient = plan.patient ?? {}

  const dampsoft = pvs.id === 'dampsoft'
  try {
    const vorname = String(patient.vorname ?? '').trim(), nachname = String(patient.name ?? '').trim()
    const q = dampsoft ? new URLSearchParams({ q: nachname || vorname, limit: '100' }) : new URLSearchParams({ firstName: vorname, lastName: nachname })
    const suche = await c.rufen<{ items?: PvsZeile[] }>(`/patients?${q}`)
    if (!suche.ok) return json(res, 502, { ok: false, meldung: `${pvs.name}: ${suche.daten.error ?? `Patientensuche fehlgeschlagen (HTTP ${suche.status}).`}` })
    const treffer = (suche.daten.items ?? []).map((t) => ({ ...t, id: String(t.id ?? t.patientNumber ?? '') }))
    const wahl = patientWaehlen(treffer, patient, pvs.name)
    if (!wahl.id) return json(res, 409, { ok: false, meldung: wahl.fehler })

    // DS-Win nimmt HKPs nur über den Import-Endpunkt mit Schreibfreigabe an (Connector mit --enable-write).
    const anlage = await c.rufen<{ number?: number; hinweise?: string[] }>(`/patients/${encodeURIComponent(wahl.id)}/hkps${dampsoft ? '/import' : ''}`, {
      method: 'POST', body: { json: hkpFuerPvs(plan, r.daten.ergebnis as Record<string, unknown>) }, ms: 70_000,
      headers: dampsoft ? { 'X-DSWIN-EDIT': '1' } : undefined,
    })
    if (!anlage.ok || typeof anlage.daten.number !== 'number') {
      return json(res, 422, { ok: false, meldung: `${pvs.name} hat den HKP nicht übernommen: ${anlage.daten.error ?? `HTTP ${anlage.status}`}` })
    }
    const vermerk: PvsVermerk = { pvs: pvs.id, patientId: wahl.id, planNr: anlage.daten.number, am: new Date().toISOString() }
    await jsonSchreiben(PVS_VERMERKE, { ...await vermerkeLesen(), [`hkp|${nummer}`]: vermerk })
    if (!c.agent) pvsNachVorn(pvs.id)
    const wer = `${patient.vorname ?? ''} ${patient.name ?? ''}`.trim()
    const dort = dampsoft
      ? `Dort: Patient (Nr. ${wahl.id}) öffnen und die HKP-Auswahl neu laden.`
      : `Dort: Patient (Nr. ${wahl.id}) → Prothetik → Plan ${vermerk.planNr} öffnen.`
    const hinweise = anlage.daten.hinweise?.length ? ` Hinweise: ${anlage.daten.hinweise.join(' ')}` : ''
    json(res, 200, { ok: true, meldung: `HKP für ${wer} in ${pvs.name} als Plan Nr. ${vermerk.planNr} angelegt. ${dort}${hinweise}` })
  } catch {
    json(res, 503, { ok: false, meldung: stumm(c) })
  }
}

interface PvsWeg { id?: string; name?: string; agent?: boolean; rufen?: Rufer; fehler?: string; status?: number; geraet?: boolean }

const wegFehler = (res: ServerResponse, c: PvsWeg) => json(res, c.status ?? 409, { ok: false, meldung: c.fehler, ...(c.geraet ? { geraet: true } : {}) })

const stumm = (c: PvsWeg) => c.agent
  ? `Der PVS-Agent der Praxis antwortet nicht – läuft ${c.name} auf dem Server?`
  : `Der ${c.name}-Connector antwortet nicht – läuft er auf diesem PC?`

/**
 * Weg zum PVS des Mandanten: über seinen Agenten, sobald der verbunden ist, sonst zum Connector auf diesem PC
 * (nur direkt hier). Über den Tunnel nur von einem mit dem Praxis-Code freigegebenen PC oder mit einer
 * Cloudflare-Access-Anmeldung, die für den Mandanten freigegeben ist. `suche` reicht für Patientensuche und HKP-Liste.
 */
async function pvsConnector(req: IncomingMessage, mandant: string, zweck: 'suche' | 'hkp' = 'hkp'): Promise<PvsWeg> {
  const alle = await jsonLesen<Record<string, unknown>>(EINSTELLUNGEN, {})
  const e = alle[mandant] ? einstellungenPruefen(alle[mandant]) : LEER
  const pvs = pvsVon(e.pvs)
  if (!pvs || !e.bridge) return { fehler: 'Kein Praxisprogramm mit aktiver Bridge eingestellt (Einstellungen).' }
  const basis = (zweck === 'suche' ? PVS_SUCHE : PVS_CONNECTOR)[pvs.id]
  if (!basis) return { fehler: zweck === 'suche' ? `Für ${pvs.name} gibt es noch keine Patientensuche.` : `HKPs aus ${pvs.name} kann PlanR noch nicht übernehmen.` }
  const agenten = await agentenLesen()
  const lokal = amPraxisPc(req)
  if (!lokal && !geraetPasst(agenten, mandant, cookieWert(req.headers.cookie, GERAET_COOKIE(mandant)))) {
    const wer = await anmeldung(req)
    if (!wer?.email || !emailErlaubt(agenten, mandant, wer.email)) {
      return { status: 403, geraet: true, fehler: 'Dieser PC ist für das Praxisprogramm noch nicht freigegeben.' }
    }
  }
  const stand = agenten[mandant] ? hub.verbunden(mandant) : null
  if (stand?.pvs && stand.pvs !== pvs.id) return { status: 409, fehler: `Der PVS-Agent der Praxis arbeitet mit ${stand.pvs}, eingestellt ist ${pvs.name}.` }
  if (stand) return { id: pvs.id, name: pvs.name, agent: true, rufen: agentRufer(mandant) }
  if (!lokal) return { status: 503, fehler: `Der PVS-Agent der Praxis ist nicht verbunden – läuft der Dienst „PlanR-Agent“ auf dem ${pvs.name}-Server?` }
  return { id: pvs.id, name: pvs.name, agent: false, rufen: <T,>(pfad: string, init?: Parameters<Rufer>[1]) => connector<T>(basis, pfad, init) }
}

type PvsZeile = PvsTreffer & { patientNumber?: string; city?: string; postalCodeAndCity?: string }

/** Patientensuche und HKP-Liste im PVS (nur lesen) */
async function pvsLesen(req: IncomingMessage, art: string, q: URLSearchParams, res: ServerResponse) {
  const c = await pvsConnector(req, q.get('mandant') || 'standard', 'suche')
  if (!c.rufen) return wegFehler(res, c)
  const dampsoft = c.id === 'dampsoft'
  try {
    if (art === 'patienten') {
      const woerter = (q.get('q') ?? '').trim().toLocaleLowerCase('de').split(/\s+/).filter(Boolean).slice(0, 4)
      if (!woerter.length) return json(res, 400, { ok: false, meldung: 'Vor- und/oder Nachname eingeben.' })
      const r = await c.rufen<{ items?: PvsZeile[] }>(`/patients?${new URLSearchParams({ q: woerter.reduce((a, b) => (b.length > a.length ? b : a)) })}`)
      if (!r.ok) return json(res, 502, { ok: false, meldung: `${c.name}: ${r.daten.error ?? `HTTP ${r.status}`}` })
      const patienten = (r.daten.items ?? [])
        .filter((p) => woerter.every((w) => `${p.firstName ?? ''} ${p.lastName ?? ''}`.toLocaleLowerCase('de').includes(w)))
        .map((p) => ({
          id: String(p.id ?? p.patientNumber ?? ''), vorname: p.firstName ?? '', name: p.lastName ?? '',
          geburtsdatum: p.birthDate ?? '', ort: p.city ?? p.postalCodeAndCity ?? '',
        }))
        .filter((p) => p.id)
      return json(res, 200, { ok: true, pvs: c.name, patienten })
    }
    const id = q.get('patient') ?? ''
    if (!(dampsoft ? /^\d{1,5}$/ : /^\d{1,9}$/).test(id)) return json(res, 400, { ok: false })
    const r = dampsoft
      ? await c.rufen<{ items?: Record<string, unknown>[] }>(`/patients/${id}/hkps`, { ms: 30_000 })
      : await c.rufen<{ hkps?: Record<string, unknown>[] }>(`/patients/${id}/clinical`, { ms: 30_000 })
    if (!r.ok) return json(res, 502, { ok: false, meldung: `${c.name}: ${r.daten.error ?? `HTTP ${r.status}`}` })
    const roh = ('items' in r.daten ? r.daten.items : (r.daten as { hkps?: Record<string, unknown>[] }).hkps) ?? []
    const hkps = roh.map((h) => ({
      nummer: Number(h.number), datum: String(h.date ?? ''), planart: String(h.planType ?? ''),
      bezeichnung: String(h.description ?? h.title ?? ''), status: String(h.status ?? ''),
      betrag: Number(h.estimatedTotal ?? h.total) || 0,
    })).sort((a, b) => b.nummer - a.nummer)
    return json(res, 200, { ok: true, pvs: c.name, hkps, uebernehmbar: !!PVS_CONNECTOR[c.id!] })
  } catch {
    return json(res, 503, { ok: false, meldung: stumm(c) })
  }
}

/** HKP aus dem PVS ins MAS-Register übernehmen; Mapping macht der Connector */
async function ausPvs(req: IncomingMessage, patient: string, planNr: string, mandant: string, res: ServerResponse) {
  const c = await pvsConnector(req, mandant)
  if (!c.rufen) return wegFehler(res, c)
  let r
  try {
    r = await c.rufen<{ plan?: Record<string, unknown>; hinweise?: string[] }>(`/patients/${patient}/hkps/${planNr}/planr`, { ms: 30_000 })
  } catch {
    return json(res, 503, { ok: false, meldung: stumm(c) })
  }
  if (!r.ok || !r.daten.plan) return json(res, r.status === 404 ? 404 : 502, { ok: false, meldung: `${c.name}: ${r.daten.error ?? 'HKP ließ sich nicht lesen.'}` })
  const m = await mas('', { method: 'POST', body: { plan: r.daten.plan, status: 'wartet_auf_freigabe', versorgungText: `aus ${c.name} (Plan ${planNr})` } })
  const neu = m.daten.hkp as { id?: string } | undefined
  if (!m.ok || !neu?.id) return json(res, 400, { ok: false, meldung: String(m.daten.message ?? 'Der HKP konnte nicht angelegt werden.') })
  json(res, 200, { ok: true, nummer: neu.id, hinweise: r.daten.hinweise ?? [] })
}

/**
 * Plandatei übernehmen. Mit `ziel` ersetzt sie den Plan dieser Zeile (gleicher Planer Pflicht), ohne `ziel`
 * kommt sie unter ihrer eigenen Nummer dazu. HKPs gehen direkt ins MAS-Register, alles andere in den Eingang
 * des Planers.
 */
async function importieren(roh: unknown, ziel: PlanKarte | null, res: ServerResponse) {
  const { datei, fehler } = planDateiLesen(roh)
  if (!datei) return json(res, 400, { ok: false, meldung: fehler })
  const planer = planerZuModul(datei.modul)
  if (!planer) return json(res, 400, { ok: false, meldung: `Für „${datei.modul}“ gibt es keinen Planer.` })
  if (ziel && ziel.modul !== datei.modul) {
    const zielPlaner = planerZuModul(ziel.modul)
    return json(res, 409, { ok: false, meldung: `Die Datei ist ein ${planer.titel}-Plan, die Zeile gehört zum ${zielPlaner?.titel ?? ziel.modul}.` })
  }

  if (datei.modul === 'hkp') {
    if (ziel) {
      if (!ersetzbar(ziel)) return json(res, 409, { ok: false, meldung: 'Der HKP wartet nicht mehr auf Freigabe – ersetzen geht nur in PlanR selbst.' })
      const h = await hkpHolen(ziel.nummer)
      if (!h) return json(res, 404, { ok: false, meldung: 'HKP nicht gefunden.' })
      if (h.status !== 'wartet_auf_freigabe') return json(res, 409, { ok: false, meldung: 'Der HKP wartet nicht mehr auf Freigabe – Seite neu laden.' })
      const r = await mas(`/${encodeURIComponent(ziel.nummer)}`, { method: 'PUT', body: { plan: datei.plan, version: h.version } })
      return r.ok ? json(res, 200, { ok: true, nummer: ziel.nummer }) : json(res, 409, { ok: false, meldung: String(r.daten.message ?? 'Der HKP wurde inzwischen geändert – Seite neu laden.') })
    }
    const r = await mas('', { method: 'POST', body: { plan: datei.plan, status: 'wartet_auf_freigabe', versorgungText: 'HKP (importiert)' } })
    const neu = r.daten.hkp as { id?: string } | undefined
    return r.ok ? json(res, 200, { ok: true, nummer: neu?.id }) : json(res, 400, { ok: false, meldung: String(r.daten.message ?? 'Der HKP konnte nicht angelegt werden.') })
  }

  const nummer = ziel?.nummer ?? datei.nummer
  if (!nummer) return json(res, 400, { ok: false, meldung: 'Die Plandatei hat keine Plan-Nummer.' })
  const geaendert = new Date().toISOString()
  const plan = typeof datei.plan.nummer === 'string' ? { ...datei.plan, nummer } : datei.plan
  const karte = kartePrüfen({
    modul: datei.modul, kuerzel: datei.kuerzel, art: datei.art, nummer,
    patient: ziel && !datei.patient ? ziel.patient : datei.patient, betrag: datei.betrag, status: 'entwurf', geaendert,
  })
  if (!karte) return json(res, 400, { ok: false, meldung: 'Die Plandatei ist unvollständig.' })
  const gleich = (x: { modul: string; nummer: string }) => x.modul === karte.modul && x.nummer === nummer
  const plaene = await dateiLesen()
  await dateiSchreiben(modulErsetzen(plaene, karte.modul, [karte, ...plaene.filter((k) => k.modul === karte.modul && k.nummer !== nummer)]))
  const inhalte = await inhalteLesen()
  inhalte[schluessel(karte.modul, nummer)] = { geaendert, plan }
  await jsonSchreiben(INHALTE, inhalte)
  await jsonSchreiben(EINGANG, [
    { modul: karte.modul, nummer, patient: karte.patient, betrag: karte.betrag, geaendert, plan },
    ...(await eingangLesen()).filter((e) => !gleich(e)),
  ])
  await graeberSchreiben((await graeberLesen()).filter((g) => !gleich(g)))
  json(res, 200, { ok: true, nummer })
}

/**
 * Ein Planer meldet seine Ablage (Köpfe für die Liste, Inhalte für den Export). Die Meldung wird
 * zusammengeführt, nicht ersetzt: jeder Browser hat seine eigene Ablage, ein Plan verschwindet nur
 * durch ausdrückliches Löschen (`entfernt`) oder die Tonne.
 */
async function behandlerLesen(): Promise<Record<string, string>> {
  const roh = await jsonLesen<unknown>(BEHANDLER, {})
  return roh && typeof roh === 'object' && !Array.isArray(roh) ? roh as Record<string, string> : {}
}

async function melden(body: { modul?: string; plaene?: unknown[]; entfernt?: unknown[]; behandler?: unknown }, res: ServerResponse) {
  const modul = String(body.modul ?? '')
  const behandler = String(body.behandler ?? '').trim().slice(0, 80)
  if (modul === 'hkp' && behandler) {
    await jsonSchreiben(BEHANDLER, { ...await behandlerLesen(), hkp: behandler })
    return json(res, 200, { ok: true })
  }
  if (!MODUL_RE.test(modul) || modul === 'hkp') return json(res, 400, { ok: false })
  let graeber = await graeberLesen()
  const neu: PlanKarte[] = []
  const inhalteNeu: Inhalte = {}
  for (const e of Array.isArray(body.plaene) ? body.plaene : []) {
    const k = kartePrüfen({ ...(e as object), modul })
    if (!k || begraben(k, graeber)) continue
    neu.push(k)
    const plan = (e as { plan?: unknown }).plan
    if (plan && typeof plan === 'object' && !Array.isArray(plan)) inhalteNeu[schluessel(modul, k.nummer)] = { geaendert: k.geaendert, plan: plan as Record<string, unknown> }
  }
  const alt = await dateiLesen()
  const karten = new Map(alt.filter((k) => k.modul === modul).map((k) => [k.nummer, k]))
  // Ein älterer Stand desselben Plans überschreibt weder einen neueren noch einen offenen Import.
  const eingang = eingangOffen(await eingangLesen(), neu)
  const offen = new Set(eingang.filter((x) => x.modul === modul).map((x) => x.nummer))
  for (const k of neu) {
    const da = karten.get(k.nummer)
    if (!k.behandler && da?.behandler) k.behandler = da.behandler
    if (offen.has(k.nummer) || (da && da.geaendert > k.geaendert)) delete inhalteNeu[schluessel(modul, k.nummer)]
    else karten.set(k.nummer, k)
  }
  for (const e of Array.isArray(body.entfernt) ? body.entfernt : []) {
    const { nummer, geaendert } = (e ?? {}) as { nummer?: unknown; geaendert?: unknown }
    const da = karten.get(String(nummer))
    if (!da || da.geaendert > String(geaendert ?? '')) continue
    karten.delete(da.nummer)
    graeber = grabAnlegen(graeber, da)
  }
  await dateiSchreiben(modulErsetzen(alt, modul, [...karten.values()]))
  await graeberSchreiben(graeber)
  const inhalte = await inhalteLesen()
  for (const s of Object.keys(inhalte)) if (s.startsWith(`${modul}|`) && !karten.has(s.slice(modul.length + 1))) delete inhalte[s]
  await jsonSchreiben(INHALTE, { ...inhalte, ...inhalteNeu })
  await jsonSchreiben(EINGANG, eingang)
  json(res, 200, { ok: true, anzahl: karten.size })
}

function herkunft(req: IncomingMessage): string {
  const o = String(req.headers.origin ?? '')
  return HERKUNFT.test(o) ? o : ''
}

function kopf(res: ServerResponse, origin: string) {
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Cache-Control', 'no-store')
}

function lesenBody(req: IncomingMessage, hoechstens = 5_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const teile: Buffer[] = []
    let n = 0
    req.on('data', (c: Buffer) => {
      n += c.length
      if (n > hoechstens) {
        reject(new Error('zu_gross'))
        req.destroy()
        return
      }
      teile.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(teile).toString('utf8')))
    req.on('error', reject)
  })
}

const AKTIONEN = ['loeschen', 'zurueck', 'export', 'import', 'befund', 'pvs', 'pvs-import'] as const
type Aktion = (typeof AKTIONEN)[number]

const eigeneSeite = (req: IncomingMessage) =>
  !req.headers.origin || String(req.headers.origin) === `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host}`

/** Einstellungen lesen (auch die Planer) und speichern (nur die Übersicht). */
function einstellungen(req: IncomingMessage, res: ServerResponse, query: string) {
  kopf(res, herkunft(req))
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  const mandant = new URLSearchParams(query).get('mandant') || 'standard'
  if (!MANDANT_RE.test(mandant)) return json(res, 400, { ok: false })
  if (req.method === 'GET') {
    Promise.all([jsonLesen<Record<string, unknown>>(EINSTELLUNGEN, {}), agentenLesen()])
      .then(([alle, agenten]) => {
        const stand = agenten[mandant] ? hub.verbunden(mandant) : null
        const agent = agenten[mandant] ? { verbunden: !!stand, pvs: stand?.pvs, version: stand?.version } : null
        json(res, 200, { ok: true, mandant, einstellungen: alle[mandant] ? einstellungenPruefen(alle[mandant]) : LEER, agent })
      })
      .catch(() => json(res, 500, { ok: false }))
    return
  }
  if (req.method !== 'POST' || !eigeneSeite(req)) return json(res, 403, { ok: false })
  lesenBody(req, 20_000).then((text) => exklusiv(async () => {
    const neu = { ...einstellungenPruefen(JSON.parse(text)), geaendert: new Date().toISOString() }
    const alle = await jsonLesen<Record<string, unknown>>(EINSTELLUNGEN, {})
    await jsonSchreiben(EINSTELLUNGEN, { ...alle, [mandant]: neu })
    json(res, 200, { ok: true, mandant, einstellungen: neu })
  })).catch(() => { if (!res.headersSent) json(res, 400, { ok: false, meldung: 'Speichern hat nicht geklappt.' }) })
}

/**
 * Der PVS-Agent einer Praxis holt hier Aufträge ab (Long-Poll) und liefert die Antworten des Connectors.
 * Anmeldung: X-PlanR-Mandant + Bearer-Schlüssel; über den Tunnel zusätzlich das Access-Token seines Service-Tokens.
 */
async function agentEndpunkt(req: IncomingMessage, res: ServerResponse, url: string, query: string) {
  res.setHeader('Cache-Control', 'no-store')
  const mandant = String(req.headers['x-planr-mandant'] ?? '')
  const schluessel = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!MANDANT_RE.test(mandant) || !schluesselPasst(await agentenLesen(), mandant, schluessel)) return json(res, 401, { ok: false })
  if (!amPraxisPc(req) && await accessEinstellung() && !await anmeldung(req)) return json(res, 401, { ok: false })

  if (url === '/api/pvs-agent/auftrag' && req.method === 'GET') {
    const q = new URLSearchParams(query)
    const pvs = /^[a-z]{1,20}$/.test(q.get('pvs') ?? '') ? q.get('pvs')! : undefined
    const version = (q.get('version') ?? '').slice(0, 40) || undefined
    const auftrag = await hub.abholen(mandant, 25_000, { pvs, version }, (weg) => res.on('close', weg))
    if (res.writableEnded || res.destroyed) {
      if (auftrag) hub.zurueckstellen(mandant, auftrag)
      return
    }
    if (!auftrag) {
      res.statusCode = 204
      res.end()
      return
    }
    return json(res, 200, { auftrag })
  }
  if (url === '/api/pvs-agent/antwort' && req.method === 'POST') {
    try {
      const b = JSON.parse(await lesenBody(req, 20_000_000)) as { id?: unknown; status?: unknown; daten?: unknown }
      const status = Number(b.status)
      const daten = b.daten && typeof b.daten === 'object' && !Array.isArray(b.daten) ? b.daten as Record<string, unknown> : {}
      if (typeof b.id !== 'string' || !Number.isInteger(status)) return json(res, 400, { ok: false })
      const da = hub.antworten(mandant, b.id, { ok: status >= 200 && status < 300, status, daten })
      return json(res, da ? 200 : 404, { ok: da })
    } catch {
      return json(res, 400, { ok: false })
    }
  }
  json(res, 405, { ok: false })
}

const bremse = new Bremse()

/** PC mit dem Praxis-Code freigeben: setzt ein Geräte-Cookie für den Mandanten (1 Jahr). */
function geraetFreigeben(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST' || !eigeneSeite(req)) return json(res, 403, { ok: false })
  lesenBody(req, 2000).then((text) => exklusiv(async () => {
    const b = JSON.parse(text) as { mandant?: unknown; code?: unknown; name?: unknown }
    const mandant = String(b.mandant ?? 'standard')
    if (!MANDANT_RE.test(mandant)) return json(res, 400, { ok: false })
    const wer = `${String(req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? '')}|${mandant}`
    if (bremse.gesperrt(wer)) return json(res, 429, { ok: false, meldung: 'Zu viele falsche Codes – in 15 Minuten wieder versuchen.' })
    const agenten = await agentenLesen()
    if (!codePasst(agenten, mandant, String(b.code ?? ''))) {
      bremse.fehler(wer)
      return json(res, 403, { ok: false, meldung: agenten[mandant]?.codeHash ? 'Der Praxis-Code passt nicht.' : 'Für diese Praxis ist noch kein PlanR-Agent eingerichtet.' })
    }
    const token = neuerSchluessel()
    const eintrag = agenten[mandant]
    eintrag.geraete = [...(eintrag.geraete ?? []), { hash: schluesselHash(token), name: String(b.name ?? '').slice(0, 80), am: new Date().toISOString() }]
    await jsonSchreiben(AGENTEN, agenten)
    const sicher = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
    res.setHeader('Set-Cookie', `${GERAET_COOKIE(mandant)}=${token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict${sicher}`)
    json(res, 200, { ok: true })
  })).catch(() => { if (!res.headersSent) json(res, 400, { ok: false, meldung: 'Freigabe hat nicht geklappt.' }) })
}

const DOWNLOAD_SEITE = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PlanR-Agent herunterladen</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1d2733}
a.knopf{display:inline-block;background:#1f6feb;color:#fff;padding:.7rem 1.2rem;border-radius:.5rem;text-decoration:none;font-weight:600}
code{background:#eef2f6;padding:.1rem .3rem;border-radius:.25rem}li{margin:.4rem 0}</style></head><body>
<h1>PlanR-Agent für den Praxisserver</h1>
<p>Der Agent verbindet DS-Win bzw. DENS auf dem Praxisserver mit PlanR. Er baut die Verbindung selbst auf; am Server wird kein Port geöffnet. Python ist im Paket enthalten.</p>
<p><a class="knopf" href="/download/PlanR-Agent.zip" download>PlanR-Agent.zip herunterladen</a></p>
<h2>Einrichten (einmal, auf dem Server mit DS-Win bzw. DENS)</h2>
<ol>
<li>ZIP auf den Server laden und entpacken.</li>
<li><code>Installieren.cmd</code> doppelklicken und die Admin-Abfrage bestätigen.</li>
<li>Mandant und Agenten-Schlüssel eingeben (bekommen Sie von pickadoc).</li>
<li>Das Fenster meldet „Connector bereit“ und „PlanR verbunden“ – fertig. Der Dienst „PlanR-Agent“ startet ab jetzt mit dem Server.</li>
</ol>
<h2>An jedem Praxis-PC</h2>
<p>PlanR über <code>https://planr.pickadoc-tunnel.com</code> öffnen. Beim ersten Zugriff auf das Praxisprogramm fragt PlanR einmal nach dem <b>Praxis-Code</b>; danach ist der PC freigegeben.</p>
<p>Notaus: Datei <code>STOP</code> in <code>C:\\ProgramData\\PlanR-Agent</code> anlegen. Entfernen: <code>Installieren.cmd /entfernen</code>.</p>
</body></html>`

function download(req: IncomingMessage, res: ServerResponse, url: string) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { ok: false })
  if (url === '/download' || url === '/download/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(DOWNLOAD_SEITE)
    return
  }
  readFile(AGENT_PAKET).then((daten) => {
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', 'attachment; filename="PlanR-Agent.zip"')
    res.setHeader('Content-Length', String(daten.length))
    res.end(req.method === 'HEAD' ? undefined : daten)
  }).catch(() => json(res, 404, { ok: false, meldung: 'Das Agent-Paket ist noch nicht gebaut (pvsConnectoR: agent/paket-bauen.ps1).' }))
}

/** Gemeinsame Planliste: Datei plus das HKP-Register aus MAS. */
export function plaeneMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const [url, query = ''] = String(req.url ?? '').split('?')
  if (url === '/api/einstellungen') return einstellungen(req, res, query)
  if (url === '/api/pvs-agent/auftrag' || url === '/api/pvs-agent/antwort') return agentEndpunkt(req, res, url, query)
  if (url === '/api/pvs-geraet') return geraetFreigeben(req, res)
  if (url === '/download' || url === '/download/' || url === '/download/PlanR-Agent.zip') return download(req, res, url)
  if (url === '/api/pvs/patienten' || url === '/api/pvs/hkps') {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' || !eigeneSeite(req)) return json(res, 403, { ok: false })
    const q = new URLSearchParams(query)
    if (!MANDANT_RE.test(q.get('mandant') || 'standard')) return json(res, 400, { ok: false })
    pvsLesen(req, url.slice('/api/pvs/'.length), q, res).catch(() => { if (!res.headersSent) json(res, 500, { ok: false }) })
    return
  }
  const aktion = url.startsWith('/api/plaene/') ? url.slice('/api/plaene/'.length) as Aktion : null
  if (url !== '/api/plaene' && !(aktion && AKTIONEN.includes(aktion))) return next()
  const origin = herkunft(req)
  kopf(res, origin)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (aktion) {
    // Nur die Übersicht selbst – kein Planer, keine andere Seite.
    if (req.method !== 'POST' || !eigeneSeite(req)) return json(res, 403, { ok: false })
    if (aktion === 'pvs-import') {
      lesenBody(req, 2000).then((text) => {
        const b = JSON.parse(text) as { patient?: unknown; plan?: unknown; mandant?: unknown }
        const patient = String(b.patient ?? '')
        const planNr = String(b.plan ?? '')
        const mandant = String(b.mandant ?? 'standard')
        if (!/^\d{1,9}$/.test(patient) || !/^\d{1,5}$/.test(planNr) || !MANDANT_RE.test(mandant)) return json(res, 400, { ok: false })
        return ausPvs(req, patient, planNr, mandant, res)
      }).catch(() => { if (!res.headersSent) json(res, 500, { ok: false, meldung: 'Das hat gerade nicht geklappt.' }) })
      return
    }
    if (aktion === 'pvs') {
      // Schreiben im PVS dauert Sekunden – nicht in der Warteschlange, sonst hängt die Liste so lange
      lesenBody(req, 2000).then((text) => {
        const b = JSON.parse(text) as { modul?: unknown; nummer?: unknown; mandant?: unknown }
        const modul = String(b.modul ?? '')
        const nummer = String(b.nummer ?? '')
        const mandant = String(b.mandant ?? 'standard')
        if (!MODUL_RE.test(modul) || !nummer || nummer.length > 80 || !MANDANT_RE.test(mandant)) return json(res, 400, { ok: false })
        return insPvs(req, modul, nummer, mandant, res)
      }).catch(() => { if (!res.headersSent) json(res, 500, { ok: false, meldung: 'Das hat gerade nicht geklappt.' }) })
      return
    }
    lesenBody(req).then((text) => exklusiv(async () => {
      const b = JSON.parse(text) as { modul?: unknown; nummer?: unknown; datei?: unknown; ziel?: { modul?: unknown; nummer?: unknown }; mandant?: unknown }
      if (aktion === 'import') {
        let ziel: PlanKarte | null = null
        if (b.ziel) {
          const zm = String(b.ziel.modul ?? '')
          const zn = String(b.ziel.nummer ?? '')
          const liste = zm === 'hkp' ? (await hkpsAusMas()) ?? [] : await dateiLesen()
          ziel = liste.find((k) => k.modul === zm && k.nummer === zn) ?? null
          if (!ziel) return json(res, 404, { ok: false, meldung: 'Der Plan dieser Zeile ist nicht mehr da – Seite neu laden.' })
        }
        return importieren(b.datei, ziel, res)
      }
      const modul = String(b.modul ?? '')
      const nummer = String(b.nummer ?? '')
      if (!MODUL_RE.test(modul) || !nummer || nummer.length > 80) return json(res, 400, { ok: false })
      if (aktion === 'loeschen') return loeschen(modul, nummer, res)
      if (aktion === 'zurueck') return zurueckholen(modul, nummer, res)
      if (aktion === 'befund') return befundLaden(modul, nummer, res)
      return exportieren(modul, nummer, res)
    })).catch(() => { if (!res.headersSent) json(res, 500, { ok: false, meldung: 'Das hat gerade nicht geklappt.' }) })
    return
  }
  const q = new URLSearchParams(query)
  if (req.method === 'GET' && (q.get('nur') === 'abgleich' || q.get('nur') === 'geloescht')) {
    // Abgleich für einen Planer: gelöschte Pläne und importierte Pläne seines Moduls
    const modul = q.get('modul') ?? ''
    Promise.all([graeberLesen(), eingangLesen()]).then(([graeber, eingang]) => json(res, 200, {
      geloescht: graeber.filter((g) => g.modul !== 'hkp' && (!modul || g.modul === modul)).map(({ modul: m, nummer, geaendert }) => ({ modul: m, nummer, geaendert })),
      eingang: modul ? eingang.filter((e) => e.modul === modul) : [],
    })).catch(() => json(res, 500, { geloescht: [], eingang: [] }))
    return
  }
  if (req.method === 'GET') {
    exklusiv(async () => {
      const datei = await dateiLesen()
      const hkps = await hkpsAusMas()
      const liste = hkps ? modulErsetzen(datei.filter((k) => k.modul !== 'hkp'), 'hkp', hkps) : datei
      const namen = await behandlerLesen()
      for (const k of liste) if (!k.behandler && namen[k.modul]) k.behandler = namen[k.modul]
      const vermerke = await vermerkeLesen()
      for (const k of liste) {
        const v = k.modul === 'hkp' ? vermerke[`hkp|${k.nummer}`] : undefined
        if (v) k.imPvs = vermerkText(v, pvsVon(v.pvs)?.name ?? v.pvs)
      }
      json(res, 200, { plaene: liste })
    }).catch(() => json(res, 500, { plaene: [] }))
    return
  }
  if (req.method === 'PUT') {
    lesenBody(req, 20_000_000).then((text) => exklusiv(() => melden(JSON.parse(text), res)))
      .catch(() => { if (!res.headersSent) json(res, 400, { ok: false }) })
    return
  }
  res.statusCode = 405
  res.end()
}
