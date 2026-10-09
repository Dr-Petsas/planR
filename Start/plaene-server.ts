import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  befundDateiVon, begraben, eingangOffen, ersetzbar, grabAnlegen, hkpKarten, HKP_VERWERFBAR, kartePrüfen, modulErsetzen, planDateiAus, planDateiLesen,
  type Eingang, type Grab, type PlanKarte,
} from './src/plaene.ts'
import { planerZuModul } from './src/planer.ts'
import { einstellungenPruefen, LEER, MANDANT_RE } from './src/einstellungen.ts'

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

const AKTIONEN = ['loeschen', 'zurueck', 'export', 'import', 'befund'] as const
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
    jsonLesen<Record<string, unknown>>(EINSTELLUNGEN, {})
      .then((alle) => json(res, 200, { ok: true, mandant, einstellungen: alle[mandant] ? einstellungenPruefen(alle[mandant]) : LEER }))
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

/** Gemeinsame Planliste: Datei plus das HKP-Register aus MAS. */
export function plaeneMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const [url, query = ''] = String(req.url ?? '').split('?')
  if (url === '/api/einstellungen') return einstellungen(req, res, query)
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
    lesenBody(req).then((text) => exklusiv(async () => {
      const b = JSON.parse(text) as { modul?: unknown; nummer?: unknown; datei?: unknown; ziel?: { modul?: unknown; nummer?: unknown } }
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
