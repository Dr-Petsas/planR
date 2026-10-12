import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify, type JsonWebKey } from 'node:crypto'

/**
 * Anmeldung mit dem Pickadoc-Konto (Firebase Authentication, Projekt docgenda).
 * PlanR prüft das ID-Token selbst gegen Googles öffentliche Schlüssel – kein Pickadoc-Geheimnis nötig – und führt
 * danach eine eigene Sitzung (Cookie). Mandant und sichtbare DS-Win-Praxen hängen am Konto, nie an der Adresse.
 */
export const FIREBASE = { apiKey: 'AIzaSyCG65EB0gojy6cIUO23eJ1gM2mMi7DjLLI', projekt: 'docgenda' }

export interface Konto {
  uid: string
  email: string
  name: string
  /** Pickadoc-Praxis */
  clientId: string
  role: string
  admin: boolean
}

type Jwk = JsonWebKey & { kid?: string }
const b64json = (teil: string) => JSON.parse(Buffer.from(teil, 'base64url').toString('utf8')) as Record<string, unknown>

/** Rollen, die PlanR nie öffnen: Patienten-Konten des Patientenportals. */
const GESPERRT = new Set(['patient'])

/** Prüft ein Firebase-ID-Token (RS256, Aussteller/Empfänger docgenda, Laufzeit). Ergebnis: Konto oder null. */
export async function tokenPruefen(token: string, schluessel: () => Promise<Jwk[]>, jetzt = Date.now(), projekt = FIREBASE.projekt): Promise<Konto | null> {
  const teile = token.split('.')
  if (teile.length !== 3) return null
  let kopf: Record<string, unknown>, inhalt: Record<string, unknown>
  try {
    kopf = b64json(teile[0])
    inhalt = b64json(teile[1])
  } catch {
    return null
  }
  if (kopf.alg !== 'RS256' || typeof kopf.kid !== 'string') return null
  const jwk = (await schluessel()).find((k) => k.kid === kopf.kid)
  if (!jwk) return null
  try {
    if (!verify('RSA-SHA256', Buffer.from(`${teile[0]}.${teile[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(teile[2], 'base64url'))) return null
  } catch {
    return null
  }
  const sek = jetzt / 1000
  if (inhalt.aud !== projekt || inhalt.iss !== `https://securetoken.google.com/${projekt}`) return null
  if (typeof inhalt.exp !== 'number' || inhalt.exp < sek - 30) return null
  if (typeof inhalt.iat !== 'number' || inhalt.iat > sek + 300) return null
  if (typeof inhalt.sub !== 'string' || !inhalt.sub) return null
  const role = String(inhalt.role ?? '').toLowerCase()
  const clientId = String(inhalt.clientId ?? '').trim()
  if (GESPERRT.has(role) || !/^[A-Za-z0-9_-]{1,64}$/.test(clientId)) return null
  return {
    uid: inhalt.sub,
    email: String(inhalt.email ?? '').trim().toLowerCase(),
    name: String(inhalt.name ?? '').trim().slice(0, 80),
    clientId,
    role,
    admin: inhalt.isAdmin === true || role === 'admin' || role === 'superuser',
  }
}

let zertifikate: { bis: number; keys: Jwk[] } | null = null

export async function googleSchluessel(): Promise<Jwk[]> {
  if (zertifikate && zertifikate.bis > Date.now()) return zertifikate.keys
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com', { signal: AbortSignal.timeout(5000) })
  const keys = r.ok ? ((await r.json()) as { keys?: Jwk[] }).keys ?? [] : []
  const alter = Number(/max-age=(\d+)/.exec(r.headers.get('cache-control') ?? '')?.[1] ?? 0)
  zertifikate = { bis: Date.now() + (keys.length ? Math.min(Math.max(alter, 600), 6 * 3600) * 1000 : 30_000), keys }
  return keys
}

// ---------- Firebase REST (wie die Pickadoc-Oberfläche, nur ohne SDK) ----------

export type Ergebnis<T> = { ok: true; wert: T } | { ok: false; status: number; meldung: string }

const MELDUNGEN: Record<string, [number, string]> = {
  INVALID_LOGIN_CREDENTIALS: [401, 'E-Mail-Adresse oder Passwort ist falsch.'],
  INVALID_PASSWORD: [401, 'E-Mail-Adresse oder Passwort ist falsch.'],
  EMAIL_NOT_FOUND: [401, 'E-Mail-Adresse oder Passwort ist falsch.'],
  INVALID_EMAIL: [400, 'Bitte eine gültige E-Mail-Adresse eingeben.'],
  USER_DISABLED: [403, 'Dieses Pickadoc-Konto ist gesperrt. Bitte wenden Sie sich an pickadoc.'],
  TOO_MANY_ATTEMPTS_TRY_LATER: [429, 'Zu viele Versuche. Bitte in ein paar Minuten erneut versuchen.'],
  TOKEN_EXPIRED: [401, 'Bitte erneut anmelden.'],
  USER_NOT_FOUND: [401, 'Bitte erneut anmelden.'],
  INVALID_REFRESH_TOKEN: [401, 'Bitte erneut anmelden.'],
}

async function firebase(url: string, body: Record<string, unknown>, form = false): Promise<{ ok: boolean; daten: Record<string, unknown> }> {
  const r = await fetch(`${url}?key=${FIREBASE.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
    body: form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
  return { ok: r.ok, daten: await r.json().catch(() => ({})) as Record<string, unknown> }
}

function fehlerVon(daten: Record<string, unknown>): { ok: false; status: number; meldung: string } {
  const code = String((daten.error as { message?: unknown } | undefined)?.message ?? '').split(/[ :]/)[0]
  const [status, meldung] = MELDUNGEN[code] ?? [502, 'Die Pickadoc-Anmeldung ist gerade nicht erreichbar. Bitte gleich nochmal versuchen.']
  return { ok: false, status, meldung }
}

export interface Anmeldung { konto: Konto; erneuern: string }

/** E-Mail und Passwort bei Firebase prüfen; das ID-Token wird danach wie jedes andere geprüft. */
export async function einloggen(email: string, passwort: string, schluessel = googleSchluessel): Promise<Ergebnis<Anmeldung>> {
  const r = await firebase('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword', { email, password: passwort, returnSecureToken: true })
  if (!r.ok) return fehlerVon(r.daten)
  const konto = await tokenPruefen(String(r.daten.idToken ?? ''), schluessel)
  if (!konto) return { ok: false, status: 403, meldung: 'Mit diesem Pickadoc-Konto ist PlanR nicht freigegeben (kein Praxis-Konto).' }
  return { ok: true, wert: { konto, erneuern: String(r.daten.refreshToken ?? '') } }
}

/** Sitzung auffrischen: gesperrte Konten und geänderte Rollen/Praxen schlagen hier durch. */
export async function erneuern(refreshToken: string, schluessel = googleSchluessel): Promise<Ergebnis<Anmeldung>> {
  const r = await firebase('https://securetoken.googleapis.com/v1/token', { grant_type: 'refresh_token', refresh_token: refreshToken }, true)
  if (!r.ok) return fehlerVon(r.daten)
  const konto = await tokenPruefen(String(r.daten.id_token ?? ''), schluessel)
  if (!konto) return { ok: false, status: 403, meldung: 'Mit diesem Pickadoc-Konto ist PlanR nicht freigegeben.' }
  return { ok: true, wert: { konto, erneuern: String(r.daten.refresh_token ?? refreshToken) } }
}

/** Pickadoc schickt die übliche Mail zum Zurücksetzen. Antwortet immer gleich, damit niemand Adressen abfragen kann. */
export async function passwortVergessen(email: string): Promise<void> {
  await firebase('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email }).catch(() => undefined)
}

// ---------- Sitzungen ----------

export const SITZUNG_COOKIE = 'planr_sitzung'
export const SITZUNG_TAGE = 30
/** So oft fragt PlanR bei Firebase nach, ob das Konto noch gilt */
export const PRUEFEN_MS = 6 * 3600_000

export interface Sitzung { hash: string; konto: Konto; erneuern: string; seit: string; geprueft: number; zuletzt: number }

export const sitzungHash = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')
export const neuesToken = () => randomBytes(32).toString('base64url')

export function sitzungFinden(liste: Sitzung[], token: string, jetzt = Date.now()): Sitzung | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const h = Buffer.from(sitzungHash(token), 'hex')
  const s = liste.find((x) => /^[0-9a-f]{64}$/.test(x.hash) && timingSafeEqual(Buffer.from(x.hash, 'hex'), h))
  return s && jetzt - s.zuletzt < SITZUNG_TAGE * 864e5 ? s : null
}

/** Abgelaufene Sitzungen fallen weg; je Konto höchstens 20 (Handy, Praxis-PCs …). */
export function sitzungenAufraeumen(liste: Sitzung[], jetzt = Date.now()): Sitzung[] {
  const frisch = liste.filter((s) => jetzt - s.zuletzt < SITZUNG_TAGE * 864e5).sort((a, b) => b.zuletzt - a.zuletzt)
  const je = new Map<string, number>()
  return frisch.filter((s) => {
    const n = (je.get(s.konto.uid) ?? 0) + 1
    je.set(s.konto.uid, n)
    return n <= 20
  })
}

// ---------- Mandant und Praxen ----------

export interface Benutzer {
  email: string
  name: string
  clientId: string
  role: string
  /** DS-Win-Praxen (1–9), die er sieht; fehlt = noch nicht zugeordnet */
  praxen?: number[]
  zuerst: string
  zuletzt: string
}

export interface PraxisInfo { nummer: number; name?: string; kzvNr?: string; patienten?: number }

export interface MandantEintrag {
  /** Ablage in PlanR (Einstellungen, Pläne, Bridge) */
  mandant: string
  /** HKP-Register in MAS (clientId), falls es unter einer anderen Pickadoc-Praxis liegt als die Konten */
  register?: string
  /** Praxen auf dem PVS-Server (von der Bridge gemeldet bzw. beim Einrichten hinterlegt) */
  praxen?: PraxisInfo[]
  /** Pläne und HKPs ohne Praxis-Stempel (Altbestand, Clara) gehören zu dieser Praxis */
  hauptpraxis?: number
}

export interface Zugaenge {
  /** Pickadoc-Praxis (clientId) → PlanR-Mandant */
  mandanten: Record<string, MandantEintrag>
  /** Pickadoc-Konto (uid) → Zuordnung */
  benutzer: Record<string, Benutzer>
  /** Zuordnung vorab per E-Mail, bevor sich jemand zum ersten Mal anmeldet */
  vorbelegung?: Record<string, number[]>
}

export const MANDANT_AUS_CLIENT = (clientId: string) => `p-${clientId.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 38)}`

export const mandantVon = (z: Zugaenge, k: Pick<Konto, 'clientId'>) => z.mandanten[k.clientId]?.mandant ?? MANDANT_AUS_CLIENT(k.clientId)
export const registerVon = (z: Zugaenge, k: Pick<Konto, 'clientId'>) => {
  const r = z.mandanten[k.clientId]?.register
  return typeof r === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(r) ? r : k.clientId
}
export const hauptpraxis = (z: Zugaenge, k: Pick<Konto, 'clientId'>) => z.mandanten[k.clientId]?.hauptpraxis ?? 1
export const praxisNr = (x: unknown) => (Number.isInteger(x) && (x as number) >= 1 && (x as number) <= 9 ? (x as number) : null)

/**
 * Sichtbare DS-Win-Praxen: null = alle (Einzelpraxis). Liegen mehrere Praxen auf dem Server, sieht ein Benutzer
 * nur die ihm zugeordneten – ein neuer zunächst keine, bis der Praxis-Admin ihn freischaltet.
 */
export function praxenVon(z: Zugaenge, k: Pick<Konto, 'uid' | 'clientId' | 'email'>): number[] | null {
  const eigene = z.benutzer[k.uid]?.praxen ?? z.vorbelegung?.[k.email]
  const bekannt = z.mandanten[k.clientId]?.praxen ?? []
  if (eigene) return [...new Set(eigene.map(praxisNr).filter((n): n is number => n !== null))].sort()
  return bekannt.length > 1 ? [] : null
}

export const darfSehen = (praxen: number[] | null, praxis: number | undefined, haupt: number) =>
  praxen === null || praxen.includes(praxis ?? haupt)

/** Konto beim Anmelden vermerken (erscheint dann in der Benutzerliste des Praxis-Admins). */
export function benutzerVermerken(z: Zugaenge, k: Konto, jetzt = new Date().toISOString()): Zugaenge {
  const alt = z.benutzer[k.uid]
  const vorab = z.vorbelegung?.[k.email]
  const neu: Benutzer = {
    email: k.email, name: k.name, clientId: k.clientId, role: k.role, zuerst: alt?.zuerst ?? jetzt, zuletzt: jetzt,
    ...(alt?.praxen ? { praxen: alt.praxen } : vorab ? { praxen: vorab } : {}),
  }
  const vorbelegung = { ...z.vorbelegung }
  if (vorab && !alt?.praxen) delete vorbelegung[k.email]
  return { ...z, benutzer: { ...z.benutzer, [k.uid]: neu }, vorbelegung }
}

export function zugaengePruefen(roh: unknown): Zugaenge {
  const o = (roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {}) as Partial<Zugaenge>
  const obj = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {}) as Record<string, never>
  return { mandanten: obj(o.mandanten), benutzer: obj(o.benutzer), vorbelegung: obj(o.vorbelegung) }
}
