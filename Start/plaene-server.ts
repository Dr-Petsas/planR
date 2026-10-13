import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  befundDateiVon, begraben, eingangOffen, ersetzbar, grabAnlegen, hkpKarten, HKP_VERWERFBAR, kartePrüfen, modulErsetzen, planDateiAus, planDateiLesen,
  type Eingang, type Grab, type PlanKarte,
} from './src/plaene.ts'
import { planerZuModul } from './src/planer.ts'
import { einstellungenPruefen, LEER, MANDANT_RE, pvsVon } from './src/einstellungen.ts'
import { PVS_CONNECTOR, PVS_SUCHE, hkpFuerPvs, patientWaehlen, vermerkText, type PlanPatient, type PvsTreffer, type PvsVermerk } from './src/pvs.ts'
import {
  AgentHub, Bremse, accessPruefen, accessSchluessel, auftragErlaubt, cookieWert, neuerSchluessel, schluesselHash, schluesselPasst, type AccessEinstellung, type AgentListe,
} from './pvs-agent-server.ts'
import { PAKETE, buchungPruefen, ibanVerdeckt, infoMail, kundenMail, type Buchung } from './buchung.ts'
import { infoAdresse, mailSenden } from './mail.ts'
import {
  PRUEFEN_MS, SITZUNG_COOKIE, SITZUNG_TAGE, benutzerVermerken, darfSehen, einloggen, erneuern, hauptpraxis, mandantVon, neuesToken, registerVon,
  passwortVergessen, praxenVon, praxisNr, sitzungFinden, sitzungHash, sitzungenAufraeumen, zugaengePruefen,
  type Konto, type PraxisInfo, type Sitzung, type Zugaenge,
} from './anmeldung.ts'
import { spawn } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'
import { isoDatum, stammdatenAusPvs } from './pvsPatient.ts'
import { zipMitDatei } from './zipAnhang.ts'
import {
  UST_SATZ, abrechnen, ausstellerVollstaendig, euroText, leeresZaehlwerk, monatMerken, monatVon, monatsname, naechsteNummer, rechnungErstellen, rechnungHtml,
  zaehlwerkAktualisieren, type Aussteller, type Empfaenger, type Gesehen, type Rechnung, type Zaehlwerk,
} from './rechnung.ts'
import type { Paket } from './src/paket.ts'
import { aenderungen, katalogBilden, rohPruefen, unbekannte, wahlPruefen, type Ablage, type Bekannt } from './praxiskatalog.ts'

const ORDNER = process.env.PLANR_DATEN?.trim() || 'F:/PlanR/Start/data'
/** Ablage eines Mandanten: Pläne, Papierkorb, Inhalte, Eingang, Behandler – jede Praxis für sich */
const ABLAGE = (mandant: string, name: 'plaene' | 'geloescht' | 'inhalte' | 'eingang' | 'behandler') => `${ORDNER}/mandanten/${mandant}/${name}.json`
/** Pickadoc-Praxis → Mandant, Benutzer → DS-Win-Praxen (anmeldung.ts) */
const ZUGAENGE = `${ORDNER}/zugaenge.json`
const SITZUNGEN = `${ORDNER}/sitzungen.json`

// Vor der Anmeldung lag eine einzige Ablage direkt in data/ – sie gehört dem bisherigen Mandanten „standard“.
for (const name of ['plaene', 'geloescht', 'inhalte', 'eingang', 'behandler'] as const) {
  const alt = `${ORDNER}/${name}.json`, neu = ABLAGE('standard', name)
  if (existsSync(alt) && !existsSync(neu)) {
    mkdirSync(dirname(neu), { recursive: true })
    copyFileSync(alt, neu)
  }
}
/** PVS und Bridge je Mandant */
const EINSTELLUNGEN = `${ORDNER}/einstellungen.json`
/** HKPs, die schon im PVS liegen: `hkp|nummer` → Vermerk */
const PVS_VERMERKE = `${ORDNER}/pvs-export.json`
/** PVS-Agent je Mandant: Schlüssel-Hash und freigegebene Anmeldungen (pvs-agent-schluessel.ts) */
const AGENTEN = `${ORDNER}/pvs-agenten.json`
/** Cloudflare Access vor dem Tunnel: { team, aud } – sonst CF_ACCESS_TEAM / CF_ACCESS_AUD */
const CF_ACCESS = `${ORDNER}/cf-access.json`
/** { ziel: "https://planr.pickadoc.de" }: Bridges, die noch hier abholen, werden dorthin durchgereicht. Nicht mit auf den Zielserver kopieren. */
const BRIDGE_WEITER = `${ORDNER}/bridge-weiter.json`
/** Buchungen von der Startseite (enthalten IBAN – bleiben im Datenordner) */
const BUCHUNGEN = `${ORDNER}/buchungen.json`
/** Installationspaket für den Praxisserver (pvsConnectoR: agent/paket-bauen.ps1) */
const AGENT_PAKET = `${ORDNER}/downloads/PlanR-Bridge.zip`
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

/** Erst in eine Nebendatei, dann umbenennen: ein Absturz mitten im Schreiben hinterlässt nie eine halbe Datei. */
async function jsonSchreiben(datei: string, daten: unknown): Promise<void> {
  await mkdir(dirname(datei), { recursive: true })
  const tmp = `${datei}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(daten), 'utf8')
  await rename(tmp, datei)
}

async function dateiLesen(m: string): Promise<PlanKarte[]> {
  const roh = await jsonLesen<unknown>(ABLAGE(m, 'plaene'), [])
  return Array.isArray(roh) ? roh.map(kartePrüfen).filter((k): k is PlanKarte => !!k) : []
}
const dateiSchreiben = (m: string, liste: PlanKarte[]) => jsonSchreiben(ABLAGE(m, 'plaene'), liste.filter((k) => k.modul !== 'hkp'))

async function graeberLesen(m: string): Promise<Grab[]> {
  const roh = await jsonLesen<unknown>(ABLAGE(m, 'geloescht'), [])
  return Array.isArray(roh) ? roh.filter((g) => g && typeof g.modul === 'string' && typeof g.nummer === 'string' && g.karte) : []
}
const graeberSchreiben = (m: string, liste: Grab[]) => jsonSchreiben(ABLAGE(m, 'geloescht'), liste)

const inhalteLesen = async (m: string) => {
  const roh = await jsonLesen<unknown>(ABLAGE(m, 'inhalte'), {})
  return (roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {}) as Inhalte
}
const eingangLesen = async (m: string) => {
  const roh = await jsonLesen<unknown>(ABLAGE(m, 'eingang'), [])
  return (Array.isArray(roh) ? roh.filter((e) => e && typeof e.modul === 'string' && typeof e.nummer === 'string' && e.plan) : []) as (Eingang & { praxis?: number })[]
}

// ---------- Anmeldung und Sitzung ----------

/** Wer fragt: Pickadoc-Konto, sein PlanR-Mandant und die DS-Win-Praxen, die er sieht (null = alle) */
interface Wer { konto: Konto; mandant: string; register: string; praxen: number[] | null; haupt: number }

const zugaengeLesen = async () => zugaengePruefen(await jsonLesen<unknown>(ZUGAENGE, {}))

let sitzungen: Sitzung[] | null = null
let sitzungKette: Promise<unknown> = Promise.resolve()
/** Sitzungen und Zugänge haben eine eigene Warteschlange – sie laufen auch innerhalb von `exklusiv`. */
function sitzungExklusiv<T>(fn: (liste: Sitzung[]) => Promise<T>): Promise<T> {
  const lauf = sitzungKette.then(async () => {
    sitzungen ??= (await jsonLesen<Sitzung[]>(SITZUNGEN, [])).filter((s) => s && typeof s.hash === 'string' && s.konto?.uid)
    return fn(sitzungen)
  })
  sitzungKette = lauf.then(() => undefined, () => undefined)
  return lauf
}
const sitzungenSpeichern = async (liste: Sitzung[]) => {
  sitzungen = sitzungenAufraeumen(liste)
  await jsonSchreiben(SITZUNGEN, sitzungen)
}

function werAus(z: Zugaenge, konto: Konto): Wer {
  return { konto, mandant: mandantVon(z, konto), register: registerVon(z, konto), praxen: praxenVon(z, konto), haupt: hauptpraxis(z, konto) }
}

/** Sitzung zum Cookie; alle PRUEFEN_MS fragt PlanR bei Firebase nach, ob das Konto noch gilt (gesperrt, Rolle geändert). */
async function werIst(req: IncomingMessage): Promise<Wer | null> {
  const token = cookieWert(req.headers.cookie, SITZUNG_COOKIE)
  if (!token) return null
  const s = await sitzungExklusiv(async (liste) => sitzungFinden(liste, token))
  if (!s) return null
  const jetzt = Date.now()
  if (jetzt - s.geprueft > PRUEFEN_MS) {
    const r = await erneuern(s.erneuern).catch(() => null)
    if (r && !r.ok && r.status !== 502) {
      await sitzungExklusiv((liste) => sitzungenSpeichern(liste.filter((x) => x.hash !== s.hash)))
      return null
    }
    // Firebase gerade nicht erreichbar: die Sitzung gilt weiter, geprüft wird beim nächsten Mal.
    if (r?.ok) Object.assign(s, { konto: r.wert.konto, erneuern: r.wert.erneuern, geprueft: jetzt })
  }
  if (jetzt - s.zuletzt > 10 * 60_000 || s.geprueft === jetzt) {
    s.zuletzt = jetzt
    await sitzungExklusiv((liste) => sitzungenSpeichern(liste))
  }
  // Buchung beendet (MAS oder PlanR-Abo gekündigt): die Sitzung gilt nicht mehr
  const b = await berechtigung(s.konto.clientId)
  if (b && !b.erlaubt) {
    abgelehnt.add(req)
    return null
  }
  return werAus(await zugaengeLesen(), s.konto)
}
/** Anfragen mit gültiger Sitzung, deren Praxis PlanR nicht (mehr) gebucht hat */
const abgelehnt = new WeakSet<IncomingMessage>()

const sicher = (req: IncomingMessage) => (req.headers['x-forwarded-proto'] === 'https' || String(req.headers.host ?? '').endsWith('.pickadoc-tunnel.com') ? '; Secure' : '')
const anmeldeBremse = new Bremse(8, 15 * 60_000)
/** Absender: Cloudflare-Tunnel bzw. Caddy (nur wenn die Anfrage lokal ankommt, sonst ist der Kopf gefälscht) */
const ip = (req: IncomingMessage) => {
  const direkt = req.socket.remoteAddress ?? ''
  const lokal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(direkt)
  const weiter = lokal ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : ''
  return String(req.headers['cf-connecting-ip'] ?? '') || weiter || direkt
}

const werInfo = (w: Wer, z: Zugaenge) => ({
  ok: true,
  konto: { name: w.konto.name, email: w.konto.email, admin: w.konto.admin },
  mandant: w.mandant,
  praxen: w.praxen,
  praxisNamen: Object.fromEntries((z.mandanten[w.konto.clientId]?.praxen ?? []).map((p) => [p.nummer, p.name ?? `Praxis ${p.nummer}`])),
  clara: berechtigungen.get(w.konto.clientId)?.b.clara ?? 'aus',
  abo: ((b) => (b?.mas ? 'mas' : b?.planr ? 'planr' : ''))(berechtigungen.get(w.konto.clientId)?.b),
})

/** GET: wer bin ich · POST {email, passwort}: anmelden · DELETE: abmelden */
async function anmeldungEndpunkt(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'GET') {
    const w = await werIst(req)
    if (w) return json(res, 200, werInfo(w, await zugaengeLesen()))
    return json(res, 401, { ok: false, anmelden: true, ...(abgelehnt.has(req) ? { meldung: NICHT_GEBUCHT } : {}) })
  }
  if (!eigeneSeite(req)) return json(res, 403, { ok: false })
  if (req.method === 'DELETE') {
    const token = cookieWert(req.headers.cookie, SITZUNG_COOKIE)
    if (token) await sitzungExklusiv((liste) => sitzungenSpeichern(liste.filter((x) => x.hash !== sitzungHash(token))))
    res.setHeader('Set-Cookie', `${SITZUNG_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${sicher(req)}`)
    return json(res, 200, { ok: true })
  }
  if (req.method !== 'POST') return json(res, 405, { ok: false })
  const b = JSON.parse(await lesenBody(req, 8000)) as { email?: unknown; passwort?: unknown; uebergabe?: unknown }
  // Aus Pickadoc geöffnet: die dortige Firebase-Sitzung (Refresh-Token) wird übernommen, Google bestätigt das Konto.
  const uebergabe = typeof b.uebergabe === 'string' && /^[A-Za-z0-9_-]{20,4000}$/.test(b.uebergabe) ? b.uebergabe : ''
  const email = String(b.email ?? '').trim().toLowerCase().slice(0, 200)
  const passwort = String(b.passwort ?? '').slice(0, 200)
  if (!uebergabe && (!email || !passwort)) return json(res, 400, { ok: false, meldung: 'Bitte E-Mail-Adresse und Passwort eingeben.' })
  if (anmeldeBremse.gesperrt(ip(req)) || (!uebergabe && anmeldeBremse.gesperrt(email))) {
    return json(res, 429, { ok: false, meldung: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' })
  }
  const r = uebergabe ? await erneuern(uebergabe) : await einloggen(email, passwort)
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) {
      anmeldeBremse.fehler(ip(req))
      if (!uebergabe) anmeldeBremse.fehler(email)
    }
    return json(res, r.status, { ok: false, meldung: uebergabe ? 'Die Anmeldung aus Pickadoc ließ sich nicht übernehmen. Bitte hier anmelden.' : r.meldung })
  }
  const { konto, erneuern: refresh } = r.wert
  const frei = await berechtigung(konto.clientId)
  if (!frei) return json(res, 503, { ok: false, meldung: 'Die Freischaltung lässt sich gerade nicht prüfen. Bitte in ein paar Minuten erneut versuchen.' })
  if (!frei.erlaubt) return json(res, 403, { ok: false, meldung: NICHT_GEBUCHT })
  const z = await sitzungStarten(req, res, konto, refresh)
  json(res, 200, werInfo(werAus(z, konto), z))
}

/** Konto vermerken, Sitzung anlegen und das Cookie setzen (Anmeldung und frisch gebuchte Praxis). */
async function sitzungStarten(req: IncomingMessage, res: ServerResponse, konto: Konto, refresh: string): Promise<Zugaenge> {
  const z = await sitzungExklusiv(async () => {
    const neu = benutzerVermerken(await zugaengeLesen(), konto)
    await jsonSchreiben(ZUGAENGE, neu)
    return neu
  })
  const token = neuesToken()
  const jetzt = Date.now()
  await sitzungExklusiv((liste) => sitzungenSpeichern([...liste, { hash: sitzungHash(token), konto, erneuern: refresh, seit: new Date(jetzt).toISOString(), geprueft: jetzt, zuletzt: jetzt }]))
  res.setHeader('Set-Cookie', `${SITZUNG_COOKIE}=${token}; Path=/; Max-Age=${SITZUNG_TAGE * 86400}; HttpOnly; SameSite=Lax${sicher(req)}`)
  return z
}

async function passwortEndpunkt(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST' || !eigeneSeite(req)) return json(res, 403, { ok: false })
  const email = String((JSON.parse(await lesenBody(req, 1000)) as { email?: unknown }).email ?? '').trim().toLowerCase().slice(0, 200)
  if (!email.includes('@')) return json(res, 400, { ok: false, meldung: 'Bitte die E-Mail-Adresse Ihres Pickadoc-Kontos eingeben.' })
  if (anmeldeBremse.gesperrt(`mail|${ip(req)}`)) return json(res, 429, { ok: false, meldung: 'Bitte etwas später erneut versuchen.' })
  anmeldeBremse.fehler(`mail|${ip(req)}`)
  await passwortVergessen(email)
  json(res, 200, { ok: true, meldung: 'Falls es zu dieser Adresse ein Pickadoc-Konto gibt, ist eine E-Mail zum Zurücksetzen unterwegs.' })
}

/**
 * Benutzer der eigenen Pickadoc-Praxis und ihre DS-Win-Praxen (nur Praxis-Admins).
 * GET liest dabei die Praxen frisch vom PVS-Server, sofern die Bridge verbunden ist.
 */
async function benutzerEndpunkt(req: IncomingMessage, res: ServerResponse, w: Wer) {
  res.setHeader('Cache-Control', 'no-store')
  if (!w.konto.admin) return json(res, 403, { ok: false, meldung: 'Benutzer verwalten dürfen nur Praxis-Admins.' })
  const clientId = w.konto.clientId
  if (req.method === 'GET') {
    const c = await pvsConnector(req, { ...w, praxen: null }, 'hkp').catch(() => null)
    if (c?.rufen && c.id === 'dampsoft') {
      const r = await c.rufen<{ items?: PraxisInfo[] }>('/praxen', { ms: 15_000 }).catch(() => null)
      const praxen = (r?.ok ? r.daten.items ?? [] : []).filter((p) => praxisNr(p.nummer) !== null && (p.patienten ?? 0) > 0)
        .map((p) => ({ nummer: p.nummer, name: String(p.name ?? '').slice(0, 80), kzvNr: String(p.kzvNr ?? '').slice(0, 20), patienten: Number(p.patienten) || 0 }))
      if (praxen.length) {
        await sitzungExklusiv(async () => {
          const z = await zugaengeLesen()
          z.mandanten[clientId] ??= { mandant: w.mandant }
          for (const eintrag of Object.values(z.mandanten)) if (eintrag.mandant === w.mandant) eintrag.praxen = praxen
          await jsonSchreiben(ZUGAENGE, z)
        })
      }
    }
    const z = await zugaengeLesen()
    // Mehrere Pickadoc-Praxen können sich eine Ablage teilen (z. B. Klinik und Praxisgemeinschaft)
    const benutzer = Object.entries(z.benutzer).filter(([, b]) => mandantVon(z, b) === w.mandant)
      .map(([uid, b]) => ({ uid, email: b.email, name: b.name, role: b.role, praxen: b.praxen ?? null, zuletzt: b.zuletzt, ich: uid === w.konto.uid }))
      .sort((a, b) => a.email.localeCompare(b.email))
    return json(res, 200, { ok: true, praxen: z.mandanten[clientId]?.praxen ?? [], benutzer })
  }
  if (req.method !== 'PUT' || !eigeneSeite(req)) return json(res, 405, { ok: false })
  const b = JSON.parse(await lesenBody(req, 2000)) as { uid?: unknown; praxen?: unknown }
  const uid = String(b.uid ?? '')
  const praxen = b.praxen === null ? null : Array.isArray(b.praxen) ? [...new Set(b.praxen.map(praxisNr).filter((n): n is number => n !== null))].sort() : undefined
  if (praxen === undefined) return json(res, 400, { ok: false })
  return sitzungExklusiv(async () => {
    const z = await zugaengeLesen()
    const ziel = z.benutzer[uid]
    if (!ziel || mandantVon(z, ziel) !== w.mandant) return json(res, 404, { ok: false, meldung: 'Diesen Benutzer gibt es in Ihrer Praxis nicht.' })
    if (praxen === null) delete ziel.praxen
    else ziel.praxen = praxen
    await jsonSchreiben(ZUGAENGE, z)
    json(res, 200, { ok: true })
  })
}

// ---------- HKP-Register in MAS ----------

/** MAS läuft am Praxis-PC; PlanR auf dem Server erreicht es über PLANR_MAS (z. B. https://mas.pickadoc-tunnel.com). */
const MAS = `${process.env.PLANR_MAS?.trim().replace(/\/+$/, '') || 'http://127.0.0.1:4000'}/planr`
interface HkpDoc { id?: string; status?: string; version?: number; planJson?: string; dateien?: { id?: string; art?: string }[] }

/** HKP-Register des Mandanten (zugaenge.json, sonst die eigene Pickadoc-Praxis) – nie das einer anderen */
const mas = (w: Wer, pfad: string, init: { method?: string; body?: unknown } = {}) => masPlanr(w, `/hkp${pfad}`, init)

async function masPlanr(w: Wer, pfad: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; daten: Record<string, unknown> }> {
  const key = masSchluessel()
  if (!key) return { ok: false, status: 503, daten: { message: 'HKP-Register nicht erreichbar (kein PlanR-Schlüssel).' } }
  const [weg, q = ''] = pfad.split('?')
  const query = new URLSearchParams(q)
  query.set('clientId', w.register)
  const r = await fetch(`${MAS}${weg}?${query}`, {
    method: init.method ?? 'GET',
    headers: { 'X-PlanR-Key': key, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(6000),
  })
  return { ok: r.ok, status: r.status, daten: await r.json().catch(() => ({})) as Record<string, unknown> }
}

/** HKPs der eigenen Praxen; ohne Praxis-Stempel (Altbestand, Clara) zählen sie zur Hauptpraxis. */
async function hkpsAusMas(w: Wer): Promise<PlanKarte[] | null> {
  try {
    const r = await mas(w, '?link=1')
    if (!r.ok) return null
    const liste = (Array.isArray(r.daten.hkps) ? r.daten.hkps : []) as (Parameters<typeof hkpKarten>[0][number] & { praxis?: unknown })[]
    return hkpKarten(liste.filter((h) => darfSehen(w.praxen, praxisNr(h.praxis) ?? undefined, w.haupt)))
  } catch {
    return null
  }
}

interface Berechtigung { erlaubt: boolean; mas: boolean; planr: boolean; clara: 'voll' | 'planr' | 'aus' }
const berechtigungen = new Map<string, { b: Berechtigung; zeit: number }>()

/**
 * Darf diese Pickadoc-Praxis PlanR nutzen (MAS gebucht oder PlanR-Abo)? MAS kennt das Billing.
 * null = MAS gerade nicht erreichbar und kein Stand der letzten 24 Stunden bekannt.
 */
async function berechtigung(clientId: string): Promise<Berechtigung | null> {
  const alt = berechtigungen.get(clientId)
  if (alt && Date.now() - alt.zeit < 10 * 60_000) return alt.b
  try {
    const key = masSchluessel()
    const r = await fetch(`${MAS}/berechtigung?clientId=${encodeURIComponent(clientId)}`, {
      headers: { 'X-PlanR-Key': key }, signal: AbortSignal.timeout(5000),
    })
    const d = await r.json() as Partial<Berechtigung> & { ok?: boolean }
    if (!r.ok || !d.ok) throw new Error(`berechtigung ${r.status}`)
    const b: Berechtigung = { erlaubt: d.erlaubt === true, mas: d.mas === true, planr: d.planr === true, clara: d.clara === 'voll' || d.clara === 'planr' ? d.clara : 'aus' }
    berechtigungen.set(clientId, { b, zeit: Date.now() })
    return b
  } catch {
    return alt && Date.now() - alt.zeit < 24 * 3600_000 ? alt.b : null
  }
}
const NICHT_GEBUCHT = 'PlanR ist für Ihre Praxis nicht gebucht. Es ist in Pickadoc MAS enthalten oder einzeln unter planr.pickadoc.de buchbar.'

/** Ein HKP – nur, wenn er zu den Praxen des Angemeldeten gehört */
const hkpHolen = async (w: Wer, id: string): Promise<HkpDoc | null> => {
  const r = await mas(w, `/${encodeURIComponent(id)}`)
  const h = r.ok ? (r.daten.hkp as HkpDoc & { praxis?: unknown }) : null
  return h && darfSehen(w.praxen, praxisNr(h.praxis) ?? undefined, w.haupt) ? h : null
}

/**
 * HKP-Planer → Register (/api/register/…): wie MAS /planr/…, aber mit der PlanR-Sitzung statt dem MAS-Schlüssel.
 * Register des Mandanten, nur HKPs der eigenen Praxen; neue HKPs bekommen Praxis-Stempel und Bearbeiter.
 */
async function registerEndpunkt(req: IncomingMessage, res: ServerResponse, url: string, w: Wer) {
  res.setHeader('Cache-Control', 'no-store')
  const weg = url.slice('/api/register'.length)
  const id = weg.match(/^\/hkp\/([A-Za-z0-9_-]{1,80})(?:\/|$)/)?.[1]
  const weiter = (r: { status: number; daten: Record<string, unknown> }) => json(res, r.status, r.daten)
  const body = async () => req.method === 'GET' ? undefined : JSON.parse((await lesenBody(req, 4_000_000)) || '{}') as Record<string, unknown>
  if (req.method === 'GET' && weg === '/status') return weiter(await masPlanr(w, '/status'))
  if (req.method === 'POST' && weg === '/praxis') return weiter(await masPlanr(w, '/praxis', { method: 'POST', body: await body() }))
  if (weg === '/hkp' && req.method === 'GET') {
    const r = await mas(w, '')
    if (!r.ok) return weiter(r)
    const liste = (Array.isArray(r.daten.hkps) ? r.daten.hkps : []) as { praxis?: unknown }[]
    return json(res, 200, { ...r.daten, hkps: liste.filter((h) => darfSehen(w.praxen, praxisNr(h.praxis) ?? undefined, w.haupt)) })
  }
  if (weg === '/hkp' && req.method === 'POST') {
    if (!w.praxen.length) return json(res, 403, { ok: false, message: 'Ihr Zugang ist noch keiner Praxis zugeordnet.' })
    return weiter(await mas(w, '', { method: 'POST', body: { ...await body(), praxis: stempel(w), wer: w.konto.email } }))
  }
  if (!id) return json(res, 404, { ok: false, error: 'nicht_gefunden' })
  if (!(await hkpHolen(w, id))) return json(res, 404, { ok: false, error: 'nicht_gefunden' })
  const rest = weg.slice(`/hkp/${id}`.length)
  if (req.method === 'GET' && (rest === '' || /^\/datei\/[A-Za-z0-9_-]{1,80}$/.test(rest))) return weiter(await mas(w, `/${id}${rest}`))
  if (req.method === 'PUT' && rest === '') return weiter(await mas(w, `/${id}`, { method: 'PUT', body: { ...await body(), wer: w.konto.email } }))
  json(res, 404, { ok: false, error: 'nicht_gefunden' })
}

/** Status eines HKP im MAS-Register setzen; `nurVon` schützt vor Überschreiben eines inzwischen geänderten Stands. */
async function hkpStatus(w: Wer, id: string, status: string, nurVon: string[]): Promise<{ ok: boolean; vorher?: string; meldung?: string }> {
  const h = await hkpHolen(w, id)
  if (!h) return { ok: false, meldung: 'HKP nicht gefunden.' }
  const vorher = String(h.status ?? '')
  if (!nurVon.includes(vorher)) return { ok: false, vorher, meldung: `Der HKP ist ${vorher.replace(/_/g, ' ')} und kann hier nicht geändert werden.` }
  const p = await mas(w, `/${encodeURIComponent(id)}`, { method: 'PUT', body: { status, version: h.version } })
  return p.ok ? { ok: true, vorher } : { ok: false, vorher, meldung: 'Der HKP wurde inzwischen geändert – Seite neu laden.' }
}

// ---------- Antworten ----------

function json(res: ServerResponse, status: number, daten: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(daten))
}

/** Plan aus der Übersicht löschen. HKPs werden im Register verworfen, die übrigen begraben. */
const sichtbar = (w: Wer, k: { praxis?: number }) => darfSehen(w.praxen, k.praxis, w.haupt)
/** Stempel für neue Pläne: die Praxis des Benutzers, bei mehreren die erste (null = alle → Hauptpraxis) */
const stempel = (w: Wer) => (w.praxen?.length ? w.praxen[0] : w.haupt)

async function loeschen(w: Wer, modul: string, nummer: string, res: ServerResponse) {
  const m = w.mandant
  if (modul === 'hkp') {
    const r = await hkpStatus(w, nummer, 'verworfen', HKP_VERWERFBAR)
    if (!r.ok) return json(res, 409, { ok: false, meldung: r.meldung })
    const karte = kartePrüfen({ modul: 'hkp', kuerzel: 'HKP', art: 'Kasse', nummer, patient: '', betrag: 0, status: r.vorher, geaendert: new Date().toISOString(), praxis: stempel(w) })
    if (karte) await graeberSchreiben(m, grabAnlegen(await graeberLesen(m), karte))
    return json(res, 200, { ok: true })
  }
  const datei = await dateiLesen(m)
  const karte = datei.find((k) => k.modul === modul && k.nummer === nummer && sichtbar(w, k))
  if (!karte) return json(res, 404, { ok: false, meldung: 'Plan nicht gefunden.' })
  await graeberSchreiben(m, grabAnlegen(await graeberLesen(m), karte))
  await dateiSchreiben(m, datei.filter((k) => k !== karte))
  await jsonSchreiben(ABLAGE(m, 'eingang'), (await eingangLesen(m)).filter((e) => !(e.modul === modul && e.nummer === nummer)))
  json(res, 200, { ok: true })
}

async function zurueckholen(w: Wer, modul: string, nummer: string, res: ServerResponse) {
  const m = w.mandant
  const graeber = await graeberLesen(m)
  const grab = graeber.find((g) => g.modul === modul && g.nummer === nummer && sichtbar(w, g.karte))
  if (!grab) return json(res, 404, { ok: false, meldung: 'Nichts zum Zurückholen.' })
  if (modul === 'hkp') {
    const r = await hkpStatus(w, nummer, grab.karte.status, ['verworfen'])
    if (!r.ok) return json(res, 409, { ok: false, meldung: r.meldung })
  } else {
    const datei = await dateiLesen(m)
    await dateiSchreiben(m, modulErsetzen(datei, modul, [grab.karte, ...datei.filter((k) => k.modul === modul && k.nummer !== nummer)]))
  }
  await graeberSchreiben(m, graeber.filter((g) => g !== grab))
  json(res, 200, { ok: true })
}

async function exportieren(w: Wer, modul: string, nummer: string, res: ServerResponse) {
  if (modul === 'hkp') {
    const h = await hkpHolen(w, nummer)
    const karte = h ? hkpKarten([h])[0] : undefined
    if (!h || !karte) return json(res, 404, { ok: false, meldung: 'HKP nicht gefunden.' })
    return json(res, 200, { ok: true, datei: planDateiAus(karte, JSON.parse(h.planJson || '{}')) })
  }
  const karte = (await dateiLesen(w.mandant)).find((k) => k.modul === modul && k.nummer === nummer && sichtbar(w, k))
  const inhalt = (await inhalteLesen(w.mandant))[schluessel(modul, nummer)]
  if (!karte) return json(res, 404, { ok: false, meldung: 'Plan nicht gefunden.' })
  if (!inhalt) return json(res, 409, { ok: false, meldung: 'Den Planinhalt kennt die Übersicht noch nicht – den Planer einmal öffnen, dann klappt der Export.' })
  json(res, 200, { ok: true, datei: planDateiAus(karte, inhalt.plan) })
}

/** Befund-Datei (KZBV-Kürzel), die Clara beim Anlegen an den HKP gehängt hat */
async function befundLaden(w: Wer, modul: string, nummer: string, res: ServerResponse) {
  if (modul !== 'hkp') return json(res, 404, { ok: false, meldung: 'Nur HKPs haben eine Befund-Datei.' })
  const h = await hkpHolen(w, nummer)
  if (!h) return json(res, 404, { ok: false, meldung: 'HKP nicht gefunden.' })
  const dateiId = befundDateiVon(h)
  if (!dateiId) return json(res, 404, { ok: false, meldung: 'An diesem HKP hängt keine Befund-Datei.' })
  const r = await mas(w, `/${encodeURIComponent(nummer)}/datei/${encodeURIComponent(dateiId)}`)
  const datei = r.daten.datei as { name?: unknown; inhalt?: unknown } | undefined
  if (!r.ok || typeof datei?.inhalt !== 'string') return json(res, 404, { ok: false, meldung: 'Die Befund-Datei ist gerade nicht abrufbar.' })
  json(res, 200, { ok: true, befund: { name: String(datei.name ?? 'Befund.json'), inhalt: datei.inhalt } })
}

// ---------- Export ins PVS (pvsConnectoR) ----------

/** Direkt an diesem PC (nicht über den Tunnel) */
function amPraxisPc(req: IncomingMessage) {
  const host = String(req.headers.host ?? '').split(':')[0]
  const lokal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')
  // Hinter Caddy (planr.pickadoc.de) kommt alles von 127.0.0.1 – das ist kein Praxis-PC
  const weitergeleitet = !!req.headers['cf-connecting-ip'] || !!req.headers['x-forwarded-for']
  return lokal && !weitergeleitet && host !== TUNNEL_HOST && ['127.0.0.1', 'localhost', '[::1]'].includes(host)
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

/** Die Bridge bzw. der Connector liefert nur Patienten dieser DS-Win-Praxen (fehlt der Kopf: alle). */
const praxenKopf = (praxen: number[] | null): Record<string, string> => (praxen === null ? {} : { 'X-DSWin-Praxen': praxen.join(',') || '0' })

const agentRufer = (mandant: string, praxen: number[] | null): Rufer => async <T,>(pfad: string, init: Parameters<Rufer>[1] = {}) => {
  const method = init.method ?? 'GET'
  if (!auftragErlaubt(method, pfad)) throw new Error('auftrag_nicht_erlaubt')
  const r = await hub.rufen(mandant, { method, pfad, body: init.body, headers: { ...init.headers, ...praxenKopf(praxen) }, ms: init.ms ?? 10_000 })
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

async function insPvs(req: IncomingMessage, w: Wer, modul: string, nummer: string, res: ServerResponse) {
  if (modul !== 'hkp') return json(res, 400, { ok: false, meldung: 'Ins Praxisprogramm gehen bisher nur HKPs.' })
  const c = await pvsConnector(req, w)
  if (!c.rufen) return wegFehler(res, c)
  const pvs = { id: c.id!, name: c.name! }

  if (!await hkpHolen(w, nummer)) return json(res, 404, { ok: false, meldung: 'HKP nicht gefunden.' })
  const r = await mas(w, `/${encodeURIComponent(nummer)}/rechnung`)
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

interface PvsWeg { id?: string; name?: string; agent?: boolean; rufen?: Rufer; fehler?: string; status?: number }

const wegFehler = (res: ServerResponse, c: PvsWeg) => json(res, c.status ?? 409, { ok: false, meldung: c.fehler })

const stumm = (c: PvsWeg) => c.agent
  ? `Die PlanR-Bridge der Praxis antwortet nicht – läuft ${c.name} auf dem Server?`
  : `Der ${c.name}-Connector antwortet nicht – läuft er auf diesem PC?`

/**
 * Weg zum PVS des Mandanten: über seine Bridge, sobald sie verbunden ist, sonst zum Connector auf diesem PC
 * (nur direkt hier). Wer angemeldet ist, darf – von überall, auch vom Handy; sehen kann er nur seine Praxen.
 * `suche` reicht für Patientensuche und HKP-Liste.
 */
async function pvsConnector(req: IncomingMessage, w: Wer, zweck: 'suche' | 'hkp' = 'hkp'): Promise<PvsWeg> {
  const { mandant, praxen } = w
  if (praxen?.length === 0) return { status: 403, fehler: 'Sie sind noch keiner Praxis zugeordnet. Bitte vom Praxis-Admin in PlanR (Einstellungen → Benutzer) freischalten lassen.' }
  const alle = await jsonLesen<Record<string, unknown>>(EINSTELLUNGEN, {})
  const e = alle[mandant] ? einstellungenPruefen(alle[mandant]) : LEER
  const pvs = pvsVon(e.pvs)
  if (!pvs || !e.bridge) return { fehler: 'Kein Praxisprogramm eingestellt bzw. die Verbindung dorthin ist aus (Einstellungen).' }
  const basis = (zweck === 'suche' ? PVS_SUCHE : PVS_CONNECTOR)[pvs.id]
  if (!basis) return { fehler: zweck === 'suche' ? `Für ${pvs.name} gibt es noch keine Patientensuche.` : `HKPs aus ${pvs.name} kann PlanR noch nicht übernehmen.` }
  const agenten = await agentenLesen()
  const stand = agenten[mandant] ? hub.verbunden(mandant) : null
  if (stand?.pvs && stand.pvs !== pvs.id) return { status: 409, fehler: `Die PlanR-Bridge der Praxis arbeitet mit ${stand.pvs}, eingestellt ist ${pvs.name}.` }
  if (stand) return { id: pvs.id, name: pvs.name, agent: true, rufen: agentRufer(mandant, praxen) }
  if (!amPraxisPc(req)) return { status: 503, fehler: `Die PlanR-Bridge der Praxis ist nicht verbunden – läuft der Dienst „PlanR-Bridge“ auf dem ${pvs.name}-Server?` }
  return {
    id: pvs.id, name: pvs.name, agent: false,
    rufen: <T,>(pfad: string, init: Parameters<Rufer>[1] = {}) => connector<T>(basis, pfad, { ...init, headers: { ...init.headers, ...praxenKopf(praxen) } }),
  }
}

type PvsZeile = PvsTreffer & { patientNumber?: string; city?: string; postalCodeAndCity?: string }

/** Patientensuche und HKP-Liste im PVS (nur lesen) */
async function pvsLesen(req: IncomingMessage, w: Wer, art: string, q: URLSearchParams, res: ServerResponse) {
  const c = await pvsConnector(req, w, 'suche')
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
    if (art === 'patient') {
      const z = await c.rufen<Record<string, unknown>>(`/patients/${id}`)
      if (!z.ok) return json(res, z.status === 404 ? 404 : 502, { ok: false, meldung: `${c.name}: ${String(z.daten.error ?? `HTTP ${z.status}`)}` })
      return json(res, 200, { ok: true, patient: stammdatenAusPvs(z.daten) })
    }
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
async function ausPvs(req: IncomingMessage, w: Wer, patient: string, planNr: string, res: ServerResponse) {
  const mandant = w.mandant
  const c = await pvsConnector(req, w)
  if (!c.rufen) return wegFehler(res, c)
  let r, praxis = stempel(w)
  try {
    r = await c.rufen<{ plan?: Record<string, unknown>; hinweise?: string[] }>(`/patients/${patient}/hkps/${planNr}/planr`, { ms: 30_000 })
    // Der HKP gehört zur Praxis des Patienten (Praxisgemeinschaft); ältere Bridges kennen die Abfrage noch nicht.
    const zeile = await c.rufen<{ praxis?: unknown }>(`/patients/${patient}`).catch(() => null)
    praxis = (zeile?.ok ? praxisNr(zeile.daten.praxis) : null) ?? praxis
  } catch {
    return json(res, 503, { ok: false, meldung: stumm(c) })
  }
  if (!r.ok || !r.daten.plan) return json(res, r.status === 404 ? 404 : 502, { ok: false, meldung: `${c.name}: ${r.daten.error ?? 'HKP ließ sich nicht lesen.'}` })
  const hinweise = [...(r.daten.hinweise ?? [])]
  const fehlen = unbekannte(r.daten.plan, bekannteListen(), (await katalogLesen(mandant))?.katalog)
  if (fehlen.length) {
    const k = await katalogAbgleichen(c, mandant)
    const rest = k.ok ? unbekannte(r.daten.plan, bekannteListen(), k.ablage.katalog) : fehlen
    if (!k.ok) hinweise.push(`Unbekannte Positionen (${fehlen.join(', ')}); Abgleich der Leistungsverzeichnisse mit ${c.name} hat nicht geklappt: ${k.meldung}`)
    else if (rest.length) hinweise.push(`${rest.join(', ')} steht weder in den PlanR-Listen noch in den Leistungsverzeichnissen von ${c.name} – bitte im Plan prüfen.`)
    else hinweise.push(`Preise & Positionen aus ${c.name} aktualisiert (${fehlen.join(', ')} waren PlanR noch unbekannt).`)
  }
  const m = await mas(w, '', { method: 'POST', body: { plan: r.daten.plan, status: 'wartet_auf_freigabe', versorgungText: `aus ${c.name} (Plan ${planNr})`, praxis, wer: w.konto.email } })
  const neu = m.daten.hkp as { id?: string } | undefined
  if (!m.ok || !neu?.id) return json(res, 400, { ok: false, meldung: String(m.daten.message ?? 'Der HKP konnte nicht angelegt werden.') })
  json(res, 200, { ok: true, nummer: neu.id, hinweise })
}

const katalogDatei = (mandant: string) => `${ORDNER}/praxiskatalog/${mandant}.json`

async function katalogLesen(mandant: string): Promise<Ablage | null> {
  const a = await jsonLesen<Ablage | null>(katalogDatei(mandant), null)
  return a?.katalog && a.roh ? a : null
}

let bekannt: Bekannt | null = null
/** Nummern der mitgelieferten GOZ- und BEB-Listen (Startseite /daten) */
function bekannteListen(): Bekannt {
  if (bekannt) return bekannt
  const nummern = (datei: string) => {
    try {
      const d = JSON.parse(readFileSync(`F:/PlanR/Start/public/daten/${datei}`, 'utf8')) as { eintraege?: { nr?: string }[] }
      return new Set((d.eintraege ?? []).map((e) => String(e.nr ?? '')))
    } catch {
      return new Set<string>()
    }
  }
  bekannt = { goz: nummern('goz-2012.json'), beb: nummern('beb-itz-2024.json') }
  return bekannt
}

type KatalogErgebnis = { ok: true; ablage: Ablage } | { ok: false; status: number; meldung: string }
const abgleichLaeuft = new Map<string, Promise<KatalogErgebnis>>()

/** Leistungsverzeichnisse aus dem PVS lesen und als Praxiskatalog ablegen; die Wahl (Liste/Spalte) bleibt erhalten. */
function katalogAbgleichen(c: PvsWeg, mandant: string): Promise<KatalogErgebnis> {
  const laeuft = abgleichLaeuft.get(mandant)
  if (laeuft) return laeuft
  const p = (async (): Promise<KatalogErgebnis> => {
    let r
    try {
      r = await c.rufen!<Record<string, unknown>>('/praxis/katalog', { ms: 90_000 })
    } catch {
      return { ok: false, status: 503, meldung: stumm(c) }
    }
    if (r.status === 404) return { ok: false, status: 501, meldung: `${c.name} liefert seine Leistungsverzeichnisse noch nicht – PlanR-Bridge bzw. Connector aktualisieren.` }
    if (!r.ok) return { ok: false, status: 502, meldung: `${c.name}: ${r.daten.error ?? `HTTP ${r.status}`}` }
    const roh = rohPruefen(r.daten)
    if (!roh) return { ok: false, status: 502, meldung: `${c.name}: Antwort unvollständig.` }
    return exklusiv(async () => {
      const alt = await katalogLesen(mandant)
      const katalog = katalogBilden(roh, wahlPruefen(null, roh, alt?.wahl))
      const ablage: Ablage = { roh, wahl: katalog.wahl, katalog, aenderungen: aenderungen(alt?.katalog, katalog) }
      await jsonSchreiben(katalogDatei(mandant), ablage)
      return { ok: true as const, ablage }
    })
  })().finally(() => abgleichLaeuft.delete(mandant))
  abgleichLaeuft.set(mandant, p)
  return p
}

const katalogInfo = (a: Ablage | null) => a && {
  pvs: a.katalog.pvs, stand: a.katalog.stand, wahl: a.wahl, listeName: a.katalog.listeName, belListeName: a.katalog.belListeName ?? '',
  listen: a.roh.listen, vorschlag: a.roh.vorschlag ?? null, vorschlagKasse: a.roh.vorschlagKasse ?? null, aenderungen: a.aenderungen ?? null,
  anzahl: {
    bel: a.katalog.bel?.length ?? 0,
    eigenlabor: a.katalog.eigenlabor.filter((e) => e.ersetzt).length,
    material: a.katalog.eigenlabor.filter((e) => e.material).length,
    goz: a.katalog.goz.filter((g) => g.eigen).length,
    kuerzel: a.katalog.goz.filter((g) => g.kuerzel).length,
    faktoren: a.katalog.goz.filter((g) => g.faktor).length,
    komplexe: a.katalog.komplexe.length,
  },
}

/**
 * Praxiskatalog: GET für Planer und Übersicht (`nur=info` ohne die Listen), POST nur aus der Übersicht –
 * `abgleich` liest die Verzeichnisse neu aus dem PVS, `wahl` stellt Laborliste/Preisspalte/Faktoren um.
 */
function praxiskatalog(req: IncomingMessage, res: ServerResponse, query: string, w: Wer) {
  const q = new URLSearchParams(query)
  const mandant = w.mandant
  if (req.method === 'GET') {
    katalogLesen(mandant)
      .then((a) => json(res, 200, { ok: true, info: katalogInfo(a), ...(q.get('nur') === 'info' ? {} : { katalog: a?.katalog ?? null }) }))
      .catch(() => json(res, 500, { ok: false }))
    return
  }
  if (req.method !== 'POST' || !eigeneSeite(req)) return json(res, 403, { ok: false })
  lesenBody(req, 2000).then(async (text) => {
    const b = JSON.parse(text) as { abgleich?: unknown; wahl?: unknown }
    if (b.abgleich === true) {
      const c = await pvsConnector(req, w)
      if (!c.rufen) return wegFehler(res, c)
      const k = await katalogAbgleichen(c, mandant)
      return k.ok ? json(res, 200, { ok: true, info: katalogInfo(k.ablage) }) : json(res, k.status, { ok: false, meldung: k.meldung })
    }
    return exklusiv(async () => {
      const alt = await katalogLesen(mandant)
      if (!alt) return json(res, 404, { ok: false, meldung: 'Noch keine Preise & Positionen aus dem PVS übernommen.' })
      const katalog = katalogBilden(alt.roh, wahlPruefen(b.wahl, alt.roh, alt.wahl), alt.katalog.stand)
      const ablage: Ablage = { roh: alt.roh, wahl: katalog.wahl, katalog, aenderungen: aenderungen(alt.katalog, katalog) }
      await jsonSchreiben(katalogDatei(mandant), ablage)
      json(res, 200, { ok: true, info: katalogInfo(ablage) })
    })
  }).catch(() => { if (!res.headersSent) json(res, 400, { ok: false, meldung: 'Das hat gerade nicht geklappt.' }) })
}

/**
 * Plandatei übernehmen. Mit `ziel` ersetzt sie den Plan dieser Zeile (gleicher Planer Pflicht), ohne `ziel`
 * kommt sie unter ihrer eigenen Nummer dazu. HKPs gehen direkt ins MAS-Register, alles andere in den Eingang
 * des Planers.
 */
async function importieren(w: Wer, roh: unknown, ziel: PlanKarte | null, res: ServerResponse) {
  const m = w.mandant
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
      const h = await hkpHolen(w, ziel.nummer)
      if (!h) return json(res, 404, { ok: false, meldung: 'HKP nicht gefunden.' })
      if (h.status !== 'wartet_auf_freigabe') return json(res, 409, { ok: false, meldung: 'Der HKP wartet nicht mehr auf Freigabe – Seite neu laden.' })
      const r = await mas(w, `/${encodeURIComponent(ziel.nummer)}`, { method: 'PUT', body: { plan: datei.plan, version: h.version } })
      return r.ok ? json(res, 200, { ok: true, nummer: ziel.nummer }) : json(res, 409, { ok: false, meldung: String(r.daten.message ?? 'Der HKP wurde inzwischen geändert – Seite neu laden.') })
    }
    const r = await mas(w, '', { method: 'POST', body: { plan: datei.plan, status: 'wartet_auf_freigabe', versorgungText: 'HKP (importiert)', praxis: stempel(w), wer: w.konto.email } })
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
    praxis: ziel?.praxis ?? stempel(w),
  })
  if (!karte) return json(res, 400, { ok: false, meldung: 'Die Plandatei ist unvollständig.' })
  const gleich = (x: { modul: string; nummer: string }) => x.modul === karte.modul && x.nummer === nummer
  const plaene = await dateiLesen(m)
  if (plaene.some((k) => gleich(k) && !sichtbar(w, k))) return json(res, 409, { ok: false, meldung: `Die Plan-Nummer ${nummer} gehört schon zu einer anderen Praxis.` })
  await dateiSchreiben(m, modulErsetzen(plaene, karte.modul, [karte, ...plaene.filter((k) => k.modul === karte.modul && k.nummer !== nummer)]))
  const inhalte = await inhalteLesen(m)
  inhalte[schluessel(karte.modul, nummer)] = { geaendert, plan }
  await jsonSchreiben(ABLAGE(m, 'inhalte'), inhalte)
  await jsonSchreiben(ABLAGE(m, 'eingang'), [
    { modul: karte.modul, nummer, patient: karte.patient, betrag: karte.betrag, geaendert, plan, praxis: karte.praxis },
    ...(await eingangLesen(m)).filter((e) => !gleich(e)),
  ])
  await graeberSchreiben(m, (await graeberLesen(m)).filter((g) => !gleich(g)))
  json(res, 200, { ok: true, nummer })
}

/**
 * Ein Planer meldet seine Ablage (Köpfe für die Liste, Inhalte für den Export). Die Meldung wird
 * zusammengeführt, nicht ersetzt: jeder Browser hat seine eigene Ablage, ein Plan verschwindet nur
 * durch ausdrückliches Löschen (`entfernt`) oder die Tonne.
 */
async function behandlerLesen(m: string): Promise<Record<string, string>> {
  const roh = await jsonLesen<unknown>(ABLAGE(m, 'behandler'), {})
  return roh && typeof roh === 'object' && !Array.isArray(roh) ? roh as Record<string, string> : {}
}

async function melden(w: Wer, body: { modul?: string; plaene?: unknown[]; entfernt?: unknown[]; behandler?: unknown }, res: ServerResponse) {
  const m = w.mandant
  const modul = String(body.modul ?? '')
  const behandler = String(body.behandler ?? '').trim().slice(0, 80)
  if (modul === 'hkp' && behandler) {
    await jsonSchreiben(ABLAGE(m, 'behandler'), { ...await behandlerLesen(m), hkp: behandler })
    return json(res, 200, { ok: true })
  }
  if (!MODUL_RE.test(modul) || modul === 'hkp') return json(res, 400, { ok: false })
  let graeber = await graeberLesen(m)
  const neu: PlanKarte[] = []
  const inhalteNeu: Inhalte = {}
  const alt = await dateiLesen(m)
  const karten = new Map(alt.filter((k) => k.modul === modul).map((k) => [k.nummer, k]))
  for (const e of Array.isArray(body.plaene) ? body.plaene : []) {
    const k = kartePrüfen({ ...(e as object), modul, praxis: undefined })
    if (!k || begraben(k, graeber)) continue
    // Pläne einer anderen Praxis fasst eine Meldung nicht an (gleiche Nummer in zwei Browsern).
    const da = karten.get(k.nummer)
    if (da && !sichtbar(w, da)) continue
    k.praxis = da?.praxis ?? stempel(w)
    neu.push(k)
    const plan = (e as { plan?: unknown }).plan
    if (plan && typeof plan === 'object' && !Array.isArray(plan)) inhalteNeu[schluessel(modul, k.nummer)] = { geaendert: k.geaendert, plan: plan as Record<string, unknown> }
  }
  // Ein älterer Stand desselben Plans überschreibt weder einen neueren noch einen offenen Import.
  const eingang = eingangOffen(await eingangLesen(m), neu)
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
    if (!da || !sichtbar(w, da) || da.geaendert > String(geaendert ?? '')) continue
    karten.delete(da.nummer)
    graeber = grabAnlegen(graeber, da)
  }
  await dateiSchreiben(m, modulErsetzen(alt, modul, [...karten.values()]))
  await graeberSchreiben(m, graeber)
  const inhalte = await inhalteLesen(m)
  for (const s of Object.keys(inhalte)) if (s.startsWith(`${modul}|`) && !karten.has(s.slice(modul.length + 1))) delete inhalte[s]
  await jsonSchreiben(ABLAGE(m, 'inhalte'), { ...inhalte, ...inhalteNeu })
  await jsonSchreiben(ABLAGE(m, 'eingang'), eingang)
  json(res, 200, { ok: true, anzahl: karten.size })
}

function herkunft(req: IncomingMessage): string {
  const o = String(req.headers.origin ?? '')
  return HERKUNFT.test(o) ? o : ''
}

function kopf(res: ServerResponse, origin: string) {
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    // Die Planer laufen unter eigenen Adressen und schicken die PlanR-Sitzung mit (credentials: 'include').
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS')
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
function einstellungen(req: IncomingMessage, res: ServerResponse, w: Wer) {
  const mandant = w.mandant
  if (req.method === 'GET') {
    Promise.all([jsonLesen<Record<string, unknown>>(EINSTELLUNGEN, {}), agentenLesen()])
      .then(([alle, agenten]) => {
        const stand = agenten[mandant] ? hub.verbunden(mandant) : null
        const agent = agenten[mandant] ? { verbunden: !!stand, pvs: stand?.pvs, version: stand?.version } : null
        json(res, 200, { ok: true, mandant, einstellungen: alle[mandant] ? einstellungenPruefen(alle[mandant]) : LEER, agent, admin: w.konto.admin })
      })
      .catch(() => json(res, 500, { ok: false }))
    return
  }
  if (req.method !== 'POST' || !eigeneSeite(req)) return json(res, 403, { ok: false })
  if (!w.konto.admin) return json(res, 403, { ok: false, meldung: 'Die Einstellungen ändern dürfen nur Praxis-Admins.' })
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
  if (await bridgeWeiterleiten(req, res, url, query)) return

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

async function bridgeWeiterleiten(req: IncomingMessage, res: ServerResponse, url: string, query: string) {
  if (req.headers['x-planr-weitergeleitet']) return false
  const { ziel } = await jsonLesen<{ ziel?: unknown }>(BRIDGE_WEITER, {})
  if (typeof ziel !== 'string' || !/^https:\/\/[a-z0-9.-]+$/i.test(ziel)) return false
  const kopf: Record<string, string> = { 'X-PlanR-Weitergeleitet': '1' }
  for (const k of ['authorization', 'x-planr-mandant', 'user-agent', 'content-type']) {
    const v = req.headers[k]
    if (typeof v === 'string') kopf[k] = v
  }
  const body = req.method === 'POST' ? await lesenBody(req, 20_000_000) : undefined
  // Legt die Bridge auf, muss auch der Long-Poll am Ziel enden, sonst geht dort ein Auftrag ins Leere.
  const weg = new AbortController()
  res.on('close', () => weg.abort())
  try {
    const r = await fetch(`${ziel}${url}${query ? `?${query}` : ''}`, {
      method: req.method, headers: kopf, body, signal: AbortSignal.any([weg.signal, AbortSignal.timeout(40_000)]),
    })
    const daten = Buffer.from(await r.arrayBuffer())
    if (res.writableEnded || res.destroyed) return true
    res.statusCode = r.status
    const art = r.headers.get('content-type')
    if (art) res.setHeader('Content-Type', art)
    res.end(daten)
  } catch {
    if (!res.headersSent && !res.destroyed) json(res, 502, { ok: false })
  }
  return true
}

const DOWNLOAD_SEITE = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PlanR-Bridge herunterladen</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1d2733}
a.knopf{display:inline-block;background:#1f6feb;color:#fff;padding:.7rem 1.2rem;border-radius:.5rem;text-decoration:none;font-weight:600}
code{background:#eef2f6;padding:.1rem .3rem;border-radius:.25rem}li{margin:.4rem 0}</style></head><body>
<h1>PlanR-Bridge für den Praxisserver</h1>
<p>Die Bridge verbindet DS-Win bzw. DENS auf dem Praxisserver mit PlanR. Sie baut die Verbindung selbst auf; am Server wird kein Port geöffnet. Python ist im Paket enthalten.</p>
<p><a class="knopf" href="/#bridge">Bridge herunterladen</a></p>
<p>Das Paket lädt der Praxis-Admin in PlanR unter <b>Einrichtung</b> herunter. Es kennt Ihre Praxis bereits – bei der Installation muss nichts eingegeben werden.</p>
<h2>Einrichten (einmal, auf dem Server mit DS-Win bzw. DENS)</h2>
<p>Am besten auf dem Rechner, auf dem der DS-Win-Ordner (<code>TDAMP</code>) liegt und den die Arbeitsplätze als Netzlaufwerk verbinden.</p>
<ol>
<li>ZIP auf den Server kopieren und entpacken (Rechtsklick → „Alle extrahieren“).</li>
<li><code>Installieren.cmd</code> doppelklicken und die Windows-Abfrage mit „Ja“ bestätigen.</li>
<li>Das Fenster meldet „Connector bereit“ und „PlanR verbunden“ – fertig. Die Bridge startet ab jetzt mit dem Server.</li>
</ol>
<h2>Arbeiten mit PlanR</h2>
<p>PlanR über <code>https://planr.pickadoc.de</code> öffnen – am Praxis-PC, zu Hause oder am Handy – und mit dem <b>Pickadoc-Konto</b> anmelden. Jeder sieht nur die Patienten und Pläne seiner Praxis; in einer Praxisgemeinschaft ordnet der Praxis-Admin die Benutzer in PlanR unter Einstellungen → Benutzer zu.</p>
<p>Entfernen: <code>Entfernen.cmd</code> im entpackten Ordner doppelklicken. Notaus: Datei <code>STOP</code> in <code>C:\\ProgramData\\PlanR-Bridge</code> anlegen.</p>
</body></html>`

function download(req: IncomingMessage, res: ServerResponse, url: string) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { ok: false })
  // Cloudflare hält .zip sonst zwischengespeichert und liefert nach einem Neubau das alte Paket.
  res.setHeader('Cache-Control', 'no-store')
  if (url === '/download' || url === '/download/') {
    stat(AGENT_PAKET).then((s) => Math.round(s.mtimeMs).toString(36), () => '0').then((stand) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(DOWNLOAD_SEITE.replace('STAND', stand))
    })
    return
  }
  readFile(AGENT_PAKET).then((daten) => {
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', 'attachment; filename="PlanR-Bridge-allgemein.zip"')
    res.setHeader('Content-Length', String(daten.length))
    res.end(req.method === 'HEAD' ? undefined : daten)
  }).catch(() => json(res, 404, { ok: false, meldung: 'Das Bridge-Paket ist noch nicht gebaut (pvsConnectoR: agent/paket-bauen.ps1).' }))
}

const buchungBremse = new Bremse(5, 60 * 60_000)

/** POST: Buchung von der Startseite – speichern, Info-Mail an Pickadoc, Bestätigung an die Praxis. Ohne Anmeldung. */
async function buchungEndpunkt(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST' || !eigeneSeite(req)) return json(res, 405, { ok: false })
  if (buchungBremse.gesperrt(ip(req))) return json(res, 429, { ok: false, meldung: 'Zu viele Buchungen von diesem Anschluss. Bitte rufen Sie uns an: 0211 3029 3035.' })
  const roh = JSON.parse(await lesenBody(req, 30_000)) as Record<string, unknown>
  // Unsichtbares Feld: füllen nur Bots aus
  if (String(roh.firma2 ?? '')) return json(res, 200, { ok: true, id: 'B-0' })
  const r = buchungPruefen(roh)
  if (!r.ok) return json(res, 400, { ok: false, fehler: r.fehler, meldung: 'Bitte die markierten Angaben prüfen.' })
  buchungBremse.fehler(ip(req))
  const b = { ...r.buchung, konto: await kontoAnlegen(r.buchung, r.passwort) }
  await exklusiv(async () => {
    const alle = await jsonLesen<Buchung[]>(BUCHUNGEN, [])
    await jsonSchreiben(BUCHUNGEN, [...(Array.isArray(alle) ? alle : []), b])
  })
  const glaeubiger = process.env.PLANR_GLAEUBIGER_ID?.trim() ?? ''
  const info = infoMail(b, glaeubiger)
  const kunde = kundenMail(b, glaeubiger)
  const [infoOk, kundeOk] = await Promise.all([
    mailSenden(ORDNER, { an: infoAdresse(), betreff: info.betreff, text: info.text, antwortAn: b.inhaber.email }),
    mailSenden(ORDNER, { an: b.inhaber.email, betreff: kunde.betreff, text: kunde.text, antwortAn: infoAdresse() }),
  ])
  if (!infoOk) console.error('[planr] Buchung', b.id, 'gespeichert, Info-Mail fehlt – data/buchungen.json prüfen')
  let angemeldet = false
  if (b.konto.status === 'angelegt' && b.konto.clientId) {
    // Praxissystem aus der Buchung übernehmen und gleich anmelden: Die Bestätigungsseite lädt die Bridge direkt.
    const mandant = mandantVon(await zugaengeLesen(), { clientId: b.konto.clientId })
    await exklusiv(async () => {
      const alle = await jsonLesen<Record<string, unknown>>(EINSTELLUNGEN, {})
      if (!alle[mandant]) await jsonSchreiben(EINSTELLUNGEN, { ...alle, [mandant]: { ...einstellungenPruefen({ pvs: b.pvs.id, bridge: true }), geaendert: new Date().toISOString() } })
    }).catch(() => undefined)
    const a = await einloggen(b.inhaber.email, r.passwort).catch(() => null)
    if (a?.ok && a.wert.konto.clientId === b.konto.clientId) {
      await sitzungStarten(req, res, a.wert.konto, a.wert.erneuern)
      angemeldet = true
    }
  }
  json(res, 200, { angemeldet, ok: true, id: b.id, paket: b.paket, pvs: b.pvs.id, email: b.inhaber.email, bestaetigt: kundeOk, konto: b.konto.status })
}

/** Praxis und Admin-Konto in Pickadoc anlegen (über MAS); Abo planr ist damit gesetzt, die Anmeldung geht sofort. */
async function kontoAnlegen(b: Buchung, passwort: string): Promise<NonNullable<Buchung['konto']>> {
  try {
    const r = await fetch(`${MAS}/registrieren`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PlanR-Key': masSchluessel() },
      body: JSON.stringify({
        email: b.inhaber.email, passwort, titel: b.inhaber.titel, vorname: b.inhaber.vorname, nachname: b.inhaber.nachname,
        praxis: { name: b.praxis.name, strasse: b.praxis.strasse, plz: b.praxis.plz, ort: b.praxis.ort },
        paket: b.paket, sprachsteuerung: PAKETE[b.paket].sprachsteuerung, buchung: b.id, mandatsreferenz: b.sepa.mandatsreferenz,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    const d = await r.json().catch(() => ({})) as { ok?: boolean; clientId?: string; error?: string }
    if (r.ok && d.ok && d.clientId) return { status: 'angelegt', clientId: d.clientId }
    if (r.status === 409) return { status: 'vorhanden' }
    console.error('[planr] Konto für Buchung', b.id, 'nicht angelegt:', r.status, d.error ?? '')
  } catch (e) {
    console.error('[planr] Konto für Buchung', b.id, 'nicht angelegt:', e instanceof Error ? e.message : e)
  }
  return { status: 'manuell' }
}

/**
 * Bridge-Schlüssel der eigenen Praxis (Einrichtungsassistent). GET: Stand · POST: neuen Schlüssel erzeugen (nur Admin).
 * Der Schlüssel wird nur jetzt angezeigt; PlanR speichert den Hash. Ein neuer Schlüssel trennt eine laufende Bridge.
 */
async function bridgeSchluessel(req: IncomingMessage, res: ServerResponse, w: Wer) {
  res.setHeader('Cache-Control', 'no-store')
  const m = w.mandant
  if (req.method === 'GET') {
    const alt = (await agentenLesen())[m]
    const stand = alt ? hub.verbunden(m) : null
    return json(res, 200, { ok: true, mandant: m, eingerichtet: !!alt, verbunden: !!stand, pvs: stand?.pvs, version: stand?.version })
  }
  if (req.method !== 'POST' || !eigeneSeite(req)) return json(res, 405, { ok: false })
  if (!w.konto.admin) return json(res, 403, { ok: false, meldung: 'Den Bridge-Schlüssel erzeugen dürfen nur Praxis-Admins.' })
  const b = JSON.parse(await lesenBody(req, 1000) || '{}') as { neu?: unknown }
  const schluesselNeu = neuerSchluessel()
  const ergebnis = await exklusiv(async () => {
    const liste = await agentenLesen()
    const alt = liste[m]
    if (alt && b.neu !== true) return 'vorhanden' as const
    liste[m] = { ...alt, hash: schluesselHash(schluesselNeu), emails: alt?.emails ?? [], geraete: alt?.geraete ?? [], angelegt: new Date().toISOString() }
    await jsonSchreiben(AGENTEN, liste)
    return 'neu' as const
  })
  if (ergebnis === 'vorhanden') return json(res, 409, { ok: false, meldung: 'Für Ihre Praxis gibt es schon einen Bridge-Schlüssel. Ein neuer trennt die laufende Bridge.' })
  json(res, 200, { ok: true, mandant: m, schluessel: schluesselNeu })
}

/**
 * POST: persönliches Bridge-Paket (nur Admin). Erzeugt einen neuen Schlüssel und legt ihn mit Mandant als
 * einrichtung.json ins ZIP – die Installation braucht so keine Eingaben. Eine laufende Bridge braucht danach das neue Paket.
 */
async function bridgePaket(req: IncomingMessage, res: ServerResponse, w: Wer) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST' || !eigeneSeite(req)) return json(res, 405, { ok: false })
  if (!w.konto.admin) return json(res, 403, { ok: false, meldung: 'Die Bridge laden nur Praxis-Admins herunter.' })
  const basis = await readFile(AGENT_PAKET).catch(() => null)
  if (!basis || basis.length < 30 || basis.readUInt32LE(0) !== 0x04034b50) {
    return json(res, 503, { ok: false, meldung: 'Das Bridge-Paket ist gerade nicht verfügbar. Bitte rufen Sie uns an: 0211 3029 3035.' })
  }
  const erster = basis.subarray(30, 30 + basis.readUInt16LE(26)).toString('utf8')
  const trenner = erster.includes('\\') ? '\\' : '/'
  const wurzel = erster.split(/[\\/]/)[0] || 'PlanR-Bridge'
  const m = w.mandant
  const schluesselNeu = neuerSchluessel()
  await exklusiv(async () => {
    const liste = await agentenLesen()
    const alt = liste[m]
    liste[m] = { ...alt, hash: schluesselHash(schluesselNeu), emails: alt?.emails ?? [], geraete: alt?.geraete ?? [], angelegt: new Date().toISOString() }
    await jsonSchreiben(AGENTEN, liste)
  })
  const z = await zugaengeLesen()
  const praxis = z.mandanten[w.konto.clientId]?.praxen?.[0]?.name ?? ''
  const einrichtung = { planr: `https://${req.headers.host ?? 'planr.pickadoc.de'}`, mandant: m, schluessel: schluesselNeu, praxis }
  const daten = zipMitDatei(basis, [wurzel, 'programm', 'agent', 'einrichtung.json'].join(trenner), Buffer.from(JSON.stringify(einrichtung, null, 2)))
  console.log('[planr] Bridge-Paket für', m, 'von', w.konto.email)
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', 'attachment; filename="PlanR-Bridge.zip"')
  res.setHeader('Content-Length', String(daten.length))
  res.end(daten)
}

/**
 * HKP-Clara (nur PlanR ohne MAS): GET Stand + Ruf-Name · PUT {assistantName} (Admins) · POST kopplung → QR fürs Handy.
 * Clara-Sitzungen laufen unter der Pickadoc-Praxis des Kontos, daher nicht über w.register.
 */
async function claraEndpunkt(req: IncomingMessage, res: ServerResponse, url: string, w: Wer) {
  res.setHeader('Cache-Control', 'no-store')
  const praxis: Wer = { ...w, register: w.konto.clientId }
  const weiter = (r: Awaited<ReturnType<typeof masPlanr>>) => json(res, r.status, r.daten)
  if (url === '/api/clara' && req.method === 'GET') return weiter(await masPlanr(praxis, '/clara'))
  if (!eigeneSeite(req)) return json(res, 403, { ok: false })
  if (url === '/api/clara' && req.method === 'PUT') {
    if (!w.konto.admin) return json(res, 403, { ok: false, meldung: 'Den Namen der Assistentin ändern dürfen nur Praxis-Admins.' })
    const b = JSON.parse(await lesenBody(req, 1000) || '{}') as { assistantName?: unknown }
    return weiter(await masPlanr(praxis, '/clara', { method: 'PUT', body: { assistantName: String(b.assistantName ?? '') } }))
  }
  if (url === '/api/clara/kopplung' && req.method === 'POST') {
    return weiter(await masPlanr(praxis, '/clara/kopplung', { method: 'POST', body: { name: w.konto.name || w.konto.email, nutzer: w.konto.uid, role: w.konto.role } }))
  }
  json(res, 405, { ok: false })
}

// ---------- Rechnungen (PlanR-Kunden ohne MAS, rechnung.ts) ----------

const ZAEHLWERK = (m: string) => `${ORDNER}/mandanten/${m}/zaehlwerk.json`
const RECHNUNGEN = (m: string) => `${ORDNER}/mandanten/${m}/rechnungen.json`
const RECHNUNGSLAUF = `${ORDNER}/rechnungsnummern.json`

let rechnungKette: Promise<unknown> = Promise.resolve()
function rechnungExklusiv<T>(fn: () => Promise<T>): Promise<T> {
  const lauf = rechnungKette.then(fn, fn)
  rechnungKette = lauf.then(() => undefined, () => undefined)
  return lauf
}

function aussteller(): Aussteller {
  const e = (k: string) => process.env[k]?.trim() ?? ''
  return {
    name: 'Pickadoc GmbH',
    anschrift: (e('PLANR_RECHNUNG_ANSCHRIFT') || 'Medical Center · c/o Dr. Petsas|Luise-Rainer-Str. 6–10|40235 Düsseldorf').split('|').map((s) => s.trim()).filter(Boolean),
    ustId: e('PLANR_RECHNUNG_USTID'),
    steuernummer: e('PLANR_RECHNUNG_STEUERNR'),
    register: 'Geschäftsführer: Dr. Michael Petsas · Amtsgericht Düsseldorf, HRB 99537',
    glaeubigerId: e('PLANR_GLAEUBIGER_ID'),
    email: 'info@pickadoc.de',
    telefon: '0211 3029 3035',
  }
}

/** Buchung der Praxis: fest zugeordnet (zugaenge.json mandanten[clientId].buchung), sonst über die E-Mail eines ihrer Konten */
async function buchungFuer(z: Zugaenge, clientId: string): Promise<Buchung | null> {
  const alle = await jsonLesen<Buchung[]>(BUCHUNGEN, [])
  const liste = Array.isArray(alle) ? alle : []
  const fest = (z.mandanten[clientId] as { buchung?: unknown } | undefined)?.buchung
  if (typeof fest === 'string' && fest) return liste.find((b) => b.id === fest) ?? null
  const mails = new Set(Object.values(z.benutzer).filter((b) => b.clientId === clientId).map((b) => b.email.toLowerCase()))
  const passend = liste.filter((b) => mails.has(String(b.pickadocKonto ?? '').toLowerCase()) || mails.has(String(b.inhaber?.email ?? '').toLowerCase()))
  return passend.sort((a, b) => b.eingang.localeCompare(a.eingang))[0] ?? null
}

const empfaengerAus = (b: Buchung): Empfaenger => ({
  praxis: b.praxis.name,
  zuHaenden: [b.inhaber.anrede, b.inhaber.titel, b.inhaber.vorname, b.inhaber.nachname].filter(Boolean).join(' '),
  strasse: b.praxis.strasse,
  plzOrt: `${b.praxis.plz} ${b.praxis.ort}`,
  ustId: b.praxis.ustId,
  email: b.praxis.email,
  mandatsreferenz: b.sepa.mandatsreferenz,
  iban: ibanVerdeckt(b.sepa.iban),
})

/** Alle Pläne des Mandanten (alle Praxen) fürs Zählwerk; HKPs nur, wenn MAS antwortet */
async function planeFuerZaehlwerk(m: string, register: string): Promise<Gesehen[] | null> {
  const lokal = (await dateiLesen(m)).filter((k) => k.modul !== 'hkp').map((k) => ({ modul: k.modul, kuerzel: k.kuerzel, art: k.art, nummer: k.nummer, datum: k.geaendert }))
  const r = await masPlanr({ register } as Wer, '/hkp').catch(() => null)
  if (!r?.ok || !Array.isArray(r.daten.hkps)) return null
  const hkps = (r.daten.hkps as { id?: unknown; status?: unknown; erstellt?: unknown; aktualisiert?: unknown }[])
    .filter((h) => typeof h.id === 'string' && h.id)
    .map((h) => ({ modul: 'hkp', kuerzel: 'HKP', art: 'Kasse', nummer: String(h.id), datum: String(h.erstellt ?? h.aktualisiert ?? ''), verworfen: h.status === 'verworfen' }))
  return [...lokal, ...hkps]
}

interface RechnungStand { aktiv: boolean; z?: Zaehlwerk; paket?: Paket; rechnungen?: Rechnung[]; hinweise?: string[] }

/** Zählwerk nachführen und abgelaufene Monate abrechnen. Nur PlanR-Abo ohne MAS. */
async function abrechnungPflegen(clientId: string, jetzt = new Date()): Promise<RechnungStand> {
  const b = await berechtigung(clientId)
  if (!b || !b.planr || b.mas) return { aktiv: false }
  const paket: Paket = b.clara === 'planr' ? 'planr_clara' : 'planr'
  return rechnungExklusiv(async () => {
    const zg = await zugaengeLesen()
    const m = mandantVon(zg, { clientId })
    const roh = await jsonLesen<Zaehlwerk | null>(ZAEHLWERK(m), null)
    const neu = !roh?.seit
    const z: Zaehlwerk = neu ? leeresZaehlwerk(jetzt) : { seit: roh.seit, plaene: roh.plaene ?? {}, monate: roh.monate ?? {} }
    const hinweise: string[] = []
    const gesehen = await planeFuerZaehlwerk(m, registerVon(zg, { clientId }))
    if (!gesehen) hinweise.push('Das HKP-Register war gerade nicht erreichbar – neue HKPs werden beim nächsten Abgleich gezählt.')
    let geaendert = gesehen ? zaehlwerkAktualisieren(z, gesehen, jetzt, neu) : false
    geaendert = monatMerken(z, monatVon(jetzt.toISOString()), paket) || geaendert || neu
    if (geaendert && (gesehen || !neu)) await jsonSchreiben(ZAEHLWERK(m), z)

    const rechnungen = await jsonLesen<Rechnung[]>(RECHNUNGEN(m), [])
    const offen = Object.keys(z.monate).filter((mo) => mo < monatVon(jetzt.toISOString()) && !rechnungen.some((r) => r.monat === mo)).sort()
    if (offen.length && process.env.PLANR_RECHNUNGEN === '1') {
      const a = aussteller()
      const buchung = await buchungFuer(zg, clientId)
      if (!ausstellerVollstaendig(a)) hinweise.push('Rechnungen werden erstellt, sobald die Steuernummer der Pickadoc GmbH hinterlegt ist.')
      else if (!buchung) hinweise.push('Ihre Buchung ist noch keiner Praxis zugeordnet – wir melden uns.')
      else {
        for (const mo of offen) {
          const lauf = await jsonLesen<Record<string, number>>(RECHNUNGSLAUF, {})
          const n = naechsteNummer(lauf, String(jetzt.getFullYear()))
          await jsonSchreiben(RECHNUNGSLAUF, n.lauf)
          const r = rechnungErstellen(abrechnen(z, mo, z.monate[mo].paket), { nummer: n.nummer, jetzt, mandant: m, clientId, buchung: buchung.id, aussteller: a, empfaenger: empfaengerAus(buchung) })
          rechnungen.push(r)
          await jsonSchreiben(RECHNUNGEN(m), rechnungen)
          void rechnungMelden(r)
        }
      }
    }
    return { aktiv: true, z, paket, rechnungen, hinweise }
  })
}

async function rechnungMelden(r: Rechnung) {
  const text = [
    `Guten Tag${r.empfaenger.zuHaenden ? ` ${r.empfaenger.zuHaenden}` : ''},`, '',
    `Ihre PlanR-Rechnung ${r.nummer} für ${monatsname(r.monat)} über ${euroText(r.bruttoCent)} (inkl. ${UST_SATZ} % USt.) liegt in PlanR unter „Rechnungen“ bereit:`,
    'https://planr.pickadoc.de/#rechnungen', '',
    `Den Betrag ziehen wir am ${r.einzug.split('-').reverse().join('.')} per SEPA-Lastschrift ein (Mandatsreferenz ${r.empfaenger.mandatsreferenz}). Diese Nachricht ist zugleich die Vorabankündigung.`, '',
    'Ihr PlanR-Team der Pickadoc GmbH', '0211 3029 3035 · info@pickadoc.de',
  ].join('\n')
  const betreff = `PlanR-Rechnung ${r.nummer} – ${monatsname(r.monat)}`
  await Promise.all([
    r.empfaenger.email ? mailSenden(ORDNER, { an: r.empfaenger.email, betreff, text, antwortAn: infoAdresse() }) : Promise.resolve(false),
    mailSenden(ORDNER, { an: infoAdresse(), betreff: `[Kopie] ${betreff} · ${r.empfaenger.praxis}`, text }),
  ]).catch((e) => console.error('[planr] Rechnung', r.nummer, 'Mail', e))
}

/** GET /api/rechnungen: laufender Monat + alle Rechnungen · GET /api/rechnungen/<nummer>: Druckansicht. Nur Praxis-Admins. */
async function rechnungenEndpunkt(req: IncomingMessage, res: ServerResponse, url: string, w: Wer) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return json(res, 405, { ok: false })
  if (!w.konto.admin) return json(res, 403, { ok: false, meldung: 'Rechnungen sehen nur Praxis-Admins.' })
  const s = await abrechnungPflegen(w.konto.clientId)
  if (!s.aktiv || !s.z || !s.paket) return json(res, 200, { ok: true, aktiv: false })
  const nummer = decodeURIComponent(url.slice('/api/rechnungen/'.length))
  if (url.startsWith('/api/rechnungen/')) {
    const r = s.rechnungen?.find((x) => x.nummer === nummer)
    if (!r) return json(res, 404, { ok: false })
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'")
    return void res.end(rechnungHtml(r))
  }
  const monat = monatVon(new Date().toISOString())
  json(res, 200, {
    ok: true, aktiv: true, hinweise: s.hinweise ?? [],
    laufend: abrechnen(s.z, monat, s.paket),
    seit: s.z.seit,
    rechnungen: (s.rechnungen ?? []).map((r) => ({ nummer: r.nummer, monat: r.monat, datum: r.datum, einzug: r.einzug, bruttoCent: r.bruttoCent, plaene: r.plaene.length })).reverse(),
  })
}

// Monatslauf nur auf dem Server, der die Kunden betreut (Strato: PLANR_RECHNUNGEN=1), nie zusätzlich am Praxis-PC
if (process.env.PLANR_RECHNUNGEN === '1') {
  const lauf = async () => {
    const z = await zugaengeLesen()
    const ids = new Set([...Object.keys(z.mandanten), ...Object.values(z.benutzer).map((b) => b.clientId)].filter(Boolean))
    for (const id of ids) await abrechnungPflegen(id).catch((e) => console.error('[planr] Abrechnung', id, e))
  }
  setTimeout(() => void lauf(), 60_000).unref()
  setInterval(() => void lauf(), 15 * 60_000).unref()
}

/**
 * GET /api/intern/pvs/patienten?clientId=&q= · /api/intern/pvs/patient?clientId=&patient=
 * Für Clara (MAS) bei PlanR-Praxen ohne MAS: Patienten aus dem PVS der Praxis, nur über ihre verbundene Bridge.
 * Schlüssel wie MAS→PlanR-Gegenrichtung (PLANR_HKP_KEY), nie mit Sitzungs-Cookie.
 */
async function internPvs(req: IncomingMessage, res: ServerResponse, url: string, query: string) {
  res.setHeader('Cache-Control', 'no-store')
  const soll = Buffer.from(masSchluessel())
  const ist = Buffer.from(String(req.headers['x-planr-key'] ?? ''))
  if (!soll.length || soll.length !== ist.length || !timingSafeEqual(soll, ist)) return json(res, 401, { ok: false })
  if (req.method !== 'GET') return json(res, 405, { ok: false })
  const q = new URLSearchParams(query)
  const clientId = q.get('clientId') ?? ''
  const z = await zugaengeLesen()
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(clientId) || !(clientId in z.mandanten || Object.values(z.benutzer).some((b) => b.clientId === clientId))) {
    return json(res, 404, { ok: false, meldung: 'Praxis unbekannt.' })
  }
  const konto = { clientId } as Konto
  const w: Wer = { konto, mandant: mandantVon(z, konto), register: registerVon(z, konto), praxen: null, haupt: hauptpraxis(z, konto) }
  if (url === '/api/intern/pvs/patienten') return internPatienten(req, w, q, res)
  await pvsLesen(req, w, url.slice('/api/intern/pvs/'.length), q, res)
}

/**
 * Patienten für Clara: per Nummer (genau), per Name und/oder Geburtsdatum (q, geburt=JJJJ-MM-TT).
 * Name + Datum: Namenstreffer mit diesem Datum, sonst alle mit dem Datum (Connector durchsucht das Geburtsdatum).
 */
async function internPatienten(req: IncomingMessage, w: Wer, q: URLSearchParams, res: ServerResponse) {
  const c = await pvsConnector(req, w, 'suche')
  if (!c.rufen) return wegFehler(res, c)
  const rufen = c.rufen
  const nummer = (q.get('nummer') ?? '').trim()
  const geburt = (q.get('geburt') ?? '').trim()
  const woerter = (q.get('q') ?? '').trim().toLocaleLowerCase('de').split(/\s+/).filter(Boolean).slice(0, 4)
  if (nummer && !/^\d{1,9}$/.test(nummer)) return json(res, 400, { ok: false, meldung: 'Die Patientennummer besteht nur aus Ziffern.' })
  if (geburt && !/^\d{4}-\d{2}-\d{2}$/.test(geburt)) return json(res, 400, { ok: false, meldung: 'Geburtsdatum bitte als JJJJ-MM-TT.' })
  if (!nummer && !geburt && !woerter.length) return json(res, 400, { ok: false, meldung: 'Name, Patientennummer oder Geburtsdatum fehlt.' })
  const zeile = (p: PvsZeile) => ({
    id: String(p.id ?? p.patientNumber ?? ''), vorname: p.firstName ?? '', name: p.lastName ?? '',
    geburtsdatum: isoDatum(String(p.birthDate ?? '')), ort: p.city ?? p.postalCodeAndCity ?? '',
  })
  const suche = async (text: string) => {
    const r = await rufen<{ items?: PvsZeile[] }>(`/patients?${new URLSearchParams({ q: text, ...(c.id === 'dampsoft' ? { limit: '100' } : {}) })}`)
    if (!r.ok) throw new Error(`${c.name}: ${r.daten.error ?? `HTTP ${r.status}`}`)
    return (r.daten.items ?? []).map(zeile).filter((p) => p.id)
  }
  try {
    if (nummer) {
      const z = await rufen<PvsZeile>(`/patients/${nummer}`)
      if (z.ok) return json(res, 200, { ok: true, pvs: c.name, patienten: [zeile({ ...z.daten, id: z.daten.id ?? nummer })] })
      // Gesprochen "123", in DS-Win "00123" – oder ältere Bridge ohne Einzelabruf: die Suche durchsucht auch die Nummer
      return json(res, 200, { ok: true, pvs: c.name, patienten: (await suche(nummer)).filter((p) => Number(p.id) === Number(nummer)) })
    }
    let patienten: ReturnType<typeof zeile>[] = []
    if (woerter.length) {
      patienten = (await suche(woerter.reduce((a, b) => (b.length > a.length ? b : a))))
        .filter((p) => woerter.every((x) => `${p.vorname} ${p.name}`.toLocaleLowerCase('de').includes(x)))
      if (geburt) patienten = patienten.filter((p) => p.geburtsdatum === geburt)
    }
    if (geburt && !patienten.length) patienten = (await suche(geburt)).filter((p) => p.geburtsdatum === geburt)
    return json(res, 200, { ok: true, pvs: c.name, patienten })
  } catch (e) {
    return e instanceof Error && e.message.startsWith(`${c.name}:`) ? json(res, 502, { ok: false, meldung: e.message }) : json(res, 503, { ok: false, meldung: stumm(c) })
  }
}

const fehler500 = (res: ServerResponse) => (e: unknown) => {
  console.error('[planr]', e instanceof Error ? e.stack : e)
  if (!res.headersSent) json(res, 500, { ok: false, meldung: 'Das hat gerade nicht geklappt.' })
}

/**
 * Alle /api-Wege außer Anmeldung, Bridge (eigener Schlüssel) und Download verlangen eine PlanR-Sitzung.
 * Mandant und Praxen kommen allein aus ihr – Angaben in Adresse oder Anfrage zählen nicht.
 */
export function plaeneMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const [url, query = ''] = String(req.url ?? '').split('?')
  if (url === '/api/pvs-agent/auftrag' || url === '/api/pvs-agent/antwort') return agentEndpunkt(req, res, url, query)
  if (url === '/download' || url === '/download/' || url === '/download/PlanR-Agent.zip' || url === '/download/PlanR-Bridge.zip') return download(req, res, url)
  if (url === '/api/anmeldung') return void anmeldungEndpunkt(req, res).catch(() => { if (!res.headersSent) json(res, 400, { ok: false, meldung: 'Anmeldung hat nicht geklappt.' }) })
  if (url === '/api/passwort-vergessen') return void passwortEndpunkt(req, res).catch(fehler500(res))
  if (url === '/api/buchung') return void buchungEndpunkt(req, res).catch(fehler500(res))
  if (url === '/api/intern/pvs/patienten' || url === '/api/intern/pvs/patient') return void internPvs(req, res, url, query).catch(fehler500(res))
  if (!url.startsWith('/api/')) return next()
  kopf(res, herkunft(req))
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  werIst(req).then((w) => {
    if (!w) return json(res, 401, { ok: false, anmelden: true, meldung: abgelehnt.has(req) ? NICHT_GEBUCHT : 'Bitte mit dem Pickadoc-Konto anmelden.' })
    return angemeldet(req, res, url, query, w, next)
  }).catch(fehler500(res))
}

function angemeldet(req: IncomingMessage, res: ServerResponse, url: string, query: string, w: Wer, next: () => void) {
  const m = w.mandant
  if (url === '/api/einstellungen') return einstellungen(req, res, w)
  if (url === '/api/bridge-schluessel') return void bridgeSchluessel(req, res, w).catch(fehler500(res))
  if (url === '/api/bridge-paket') return void bridgePaket(req, res, w).catch(fehler500(res))
  if (url === '/api/praxiskatalog') return praxiskatalog(req, res, query, w)
  if (url === '/api/benutzer') return void benutzerEndpunkt(req, res, w).catch(fehler500(res))
  if (url === '/api/clara' || url === '/api/clara/kopplung') return void claraEndpunkt(req, res, url, w).catch(fehler500(res))
  if (url === '/api/rechnungen' || /^\/api\/rechnungen\/PR-\d{4}-\d{4}$/.test(url)) return void rechnungenEndpunkt(req, res, url, w).catch(fehler500(res))
  if (url === '/api/register' || url.startsWith('/api/register/')) return void registerEndpunkt(req, res, url, w).catch(fehler500(res))
  if (url === '/api/pvs/patienten' || url === '/api/pvs/hkps' || url === '/api/pvs/patient') {
    if (req.method !== 'GET' || !eigeneSeite(req)) return json(res, 403, { ok: false })
    return void pvsLesen(req, w, url.slice('/api/pvs/'.length), new URLSearchParams(query), res).catch(fehler500(res))
  }
  const aktion = url.startsWith('/api/plaene/') ? url.slice('/api/plaene/'.length) as Aktion : null
  if (url !== '/api/plaene' && !(aktion && AKTIONEN.includes(aktion))) return next()
  if (aktion) {
    // Nur die Übersicht selbst – kein Planer, keine andere Seite.
    if (req.method !== 'POST' || !eigeneSeite(req)) return json(res, 403, { ok: false })
    if (aktion === 'pvs-import') {
      lesenBody(req, 2000).then((text) => {
        const b = JSON.parse(text) as { patient?: unknown; plan?: unknown }
        const patient = String(b.patient ?? '')
        const planNr = String(b.plan ?? '')
        if (!/^\d{1,9}$/.test(patient) || !/^\d{1,5}$/.test(planNr)) return json(res, 400, { ok: false })
        return ausPvs(req, w, patient, planNr, res)
      }).catch(fehler500(res))
      return
    }
    if (aktion === 'pvs') {
      // Schreiben im PVS dauert Sekunden – nicht in der Warteschlange, sonst hängt die Liste so lange
      lesenBody(req, 2000).then((text) => {
        const b = JSON.parse(text) as { modul?: unknown; nummer?: unknown }
        const modul = String(b.modul ?? '')
        const nummer = String(b.nummer ?? '')
        if (!MODUL_RE.test(modul) || !nummer || nummer.length > 80) return json(res, 400, { ok: false })
        return insPvs(req, w, modul, nummer, res)
      }).catch(fehler500(res))
      return
    }
    lesenBody(req).then((text) => exklusiv(async () => {
      const b = JSON.parse(text) as { modul?: unknown; nummer?: unknown; datei?: unknown; ziel?: { modul?: unknown; nummer?: unknown } }
      if (aktion === 'import') {
        let ziel: PlanKarte | null = null
        if (b.ziel) {
          const zm = String(b.ziel.modul ?? '')
          const zn = String(b.ziel.nummer ?? '')
          const liste = zm === 'hkp' ? (await hkpsAusMas(w)) ?? [] : (await dateiLesen(m)).filter((k) => sichtbar(w, k))
          ziel = liste.find((k) => k.modul === zm && k.nummer === zn) ?? null
          if (!ziel) return json(res, 404, { ok: false, meldung: 'Der Plan dieser Zeile ist nicht mehr da – Seite neu laden.' })
        }
        return importieren(w, b.datei, ziel, res)
      }
      const modul = String(b.modul ?? '')
      const nummer = String(b.nummer ?? '')
      if (!MODUL_RE.test(modul) || !nummer || nummer.length > 80) return json(res, 400, { ok: false })
      if (aktion === 'loeschen') return loeschen(w, modul, nummer, res)
      if (aktion === 'zurueck') return zurueckholen(w, modul, nummer, res)
      if (aktion === 'befund') return befundLaden(w, modul, nummer, res)
      return exportieren(w, modul, nummer, res)
    })).catch(fehler500(res))
    return
  }
  const q = new URLSearchParams(query)
  if (req.method === 'GET' && (q.get('nur') === 'abgleich' || q.get('nur') === 'geloescht')) {
    // Abgleich für einen Planer: gelöschte Pläne und importierte Pläne seines Moduls
    const modul = q.get('modul') ?? ''
    Promise.all([graeberLesen(m), eingangLesen(m)]).then(([graeber, eingang]) => json(res, 200, {
      geloescht: graeber.filter((g) => g.modul !== 'hkp' && (!modul || g.modul === modul) && sichtbar(w, g.karte))
        .map(({ modul: gm, nummer, geaendert }) => ({ modul: gm, nummer, geaendert })),
      eingang: modul ? eingang.filter((e) => e.modul === modul && sichtbar(w, e)) : [],
    })).catch(() => json(res, 500, { geloescht: [], eingang: [] }))
    return
  }
  if (req.method === 'GET') {
    exklusiv(async () => {
      const datei = (await dateiLesen(m)).filter((k) => sichtbar(w, k))
      const hkps = await hkpsAusMas(w)
      const liste = hkps ? modulErsetzen(datei.filter((k) => k.modul !== 'hkp'), 'hkp', hkps) : datei
      const namen = await behandlerLesen(m)
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
    lesenBody(req, 20_000_000).then((text) => exklusiv(() => melden(w, JSON.parse(text), res)))
      .catch(() => { if (!res.headersSent) json(res, 400, { ok: false }) })
    return
  }
  res.statusCode = 405
  res.end()
}
