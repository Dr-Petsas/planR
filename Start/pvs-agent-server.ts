import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify, type JsonWebKey } from 'node:crypto'

/**
 * PVS-Agenten: Je Praxis (Mandant) baut ein Agent auf dem Praxisserver die Verbindung zu PlanR selbst auf
 * (ausgehend, Long-Poll) und reicht Aufträge an den PVS-Connector neben DS-Win bzw. DENS weiter.
 * PlanR speichert nur den SHA-256 des Agenten-Schlüssels.
 */
export interface AgentEintrag {
  hash: string
  /** Schlüssel früher geladener Pakete: Wer das Paket mehrmals lädt, soll die schon installierte Bridge nicht abhängen. */
  frueher?: { hash: string; bis: string }[]
  /** Wer über den Tunnel (Cloudflare Access) an dieses PVS darf: volle Adresse oder „@domain“ */
  emails?: string[]
  /** Praxis-Code, mit dem ein PC sich einmal freigibt */
  codeHash?: string
  /** Freigegebene PCs: Hash ihres Geräte-Cookies */
  geraete?: { hash: string; name: string; am: string }[]
  angelegt?: string
}
export type AgentListe = Record<string, AgentEintrag>

export const schluesselHash = (schluessel: string) => createHash('sha256').update(schluessel, 'utf8').digest('hex')
export const neuerSchluessel = () => randomBytes(32).toString('base64url')

const gleich = (hash: string | undefined, wert: string) =>
  !!hash && /^[0-9a-f]{64}$/.test(hash) && !!wert && timingSafeEqual(Buffer.from(schluesselHash(wert), 'hex'), Buffer.from(hash, 'hex'))

export const schluesselPasst = (liste: AgentListe, mandant: string, schluessel: string, jetzt = Date.now()) => {
  const e = liste[mandant]
  return gleich(e?.hash, schluessel) || (e?.frueher ?? []).some((f) => Date.parse(f.bis) > jetzt && gleich(f.hash, schluessel))
}

export const FRUEHER_TAGE = 14

/** Neuer Paket-Schlüssel: der bisherige bleibt FRUEHER_TAGE gültig (höchstens fünf ältere). */
export function paketSchluesselSetzen(alt: AgentEintrag | undefined, hash: string, jetzt = Date.now()): AgentEintrag {
  const bis = new Date(jetzt + FRUEHER_TAGE * 86_400_000).toISOString()
  const frueher = [...(alt?.hash ? [{ hash: alt.hash, bis }] : []), ...(alt?.frueher ?? [])]
    .filter((f) => Date.parse(f.bis) > jetzt).slice(0, 5)
  return { ...alt, hash, frueher, emails: alt?.emails ?? [], geraete: alt?.geraete ?? [], angelegt: new Date(jetzt).toISOString() }
}

/** Ohne leicht verwechselbare Zeichen (0/O, 1/I/L); 15 Zeichen ≈ 74 Bit */
const CODE_ZEICHEN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function neuerPraxisCode(): string {
  const z = [...randomBytes(15)].map((b) => CODE_ZEICHEN[b % CODE_ZEICHEN.length]).join('')
  return `${z.slice(0, 5)}-${z.slice(5, 10)}-${z.slice(10)}`
}
export const codeNorm = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '')
export const codeHash = (code: string) => schluesselHash(codeNorm(code))
export const codePasst = (liste: AgentListe, mandant: string, code: string) => gleich(liste[mandant]?.codeHash, codeNorm(code))

export const GERAET_COOKIE = (mandant: string) => `planr_pvs_${mandant}`
export function cookieWert(kopf: string | undefined, name: string): string {
  for (const teil of (kopf ?? '').split(';')) {
    const [k, ...v] = teil.trim().split('=')
    if (k === name) return v.join('=')
  }
  return ''
}
export const geraetPasst = (liste: AgentListe, mandant: string, token: string) =>
  !!token && (liste[mandant]?.geraete ?? []).some((g) => gleich(g.hash, token))

/** Fehlversuche je Schlüssel (IP|Mandant): höchstens `max` in `fenster` ms */
export class Bremse {
  private versuche = new Map<string, number[]>()
  private max: number
  private fenster: number
  constructor(max = 5, fenster = 15 * 60_000) {
    this.max = max
    this.fenster = fenster
  }
  gesperrt(k: string, jetzt = Date.now()) {
    const l = (this.versuche.get(k) ?? []).filter((t) => jetzt - t < this.fenster)
    this.versuche.set(k, l)
    return l.length >= this.max
  }
  fehler(k: string, jetzt = Date.now()) { this.versuche.set(k, [...(this.versuche.get(k) ?? []), jetzt]) }
}

export function emailErlaubt(liste: AgentListe, mandant: string, email: string): boolean {
  const e = email.trim().toLowerCase()
  if (!e.includes('@')) return false
  return (liste[mandant]?.emails ?? []).some((x) => {
    const m = x.trim().toLowerCase()
    return m.startsWith('@') ? e.endsWith(m) : m === e
  })
}

// ---------- Cloudflare Access ----------

export interface AccessEinstellung { team: string; aud: string }
export interface AccessIdentitaet { email?: string; dienst?: string }
type Jwk = JsonWebKey & { kid?: string }

const b64json = (teil: string) => JSON.parse(Buffer.from(teil, 'base64url').toString('utf8')) as Record<string, unknown>

/**
 * Prüft das Cf-Access-Jwt-Assertion-Token (RS256) gegen die Schlüssel des Access-Teams.
 * Ergebnis: E-Mail (Nutzer) bzw. Client-ID (Service-Token) oder null.
 */
export async function accessPruefen(
  token: string, cfg: AccessEinstellung, schluessel: () => Promise<Jwk[]>, jetzt = Date.now(),
): Promise<AccessIdentitaet | null> {
  const teile = token.split('.')
  if (teile.length !== 3) return null
  let kopf: Record<string, unknown>, inhalt: Record<string, unknown>
  try {
    kopf = b64json(teile[0])
    inhalt = b64json(teile[1])
  } catch {
    return null
  }
  if (kopf.alg !== 'RS256') return null
  const jwk = (await schluessel()).find((k) => k.kid === kopf.kid)
  if (!jwk) return null
  try {
    const echt = verify('RSA-SHA256', Buffer.from(`${teile[0]}.${teile[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(teile[2], 'base64url'))
    if (!echt) return null
  } catch {
    return null
  }
  const aud = Array.isArray(inhalt.aud) ? inhalt.aud : [inhalt.aud]
  if (!aud.includes(cfg.aud)) return null
  if (inhalt.iss !== `https://${cfg.team}.cloudflareaccess.com`) return null
  const sek = jetzt / 1000
  if (typeof inhalt.exp !== 'number' || inhalt.exp < sek - 30) return null
  if (typeof inhalt.nbf === 'number' && inhalt.nbf > sek + 30) return null
  const email = typeof inhalt.email === 'string' && inhalt.email ? inhalt.email : undefined
  const dienst = typeof inhalt.common_name === 'string' && inhalt.common_name ? inhalt.common_name : undefined
  return email || dienst ? { email, dienst } : null
}

let zertifikate: { team: string; bis: number; keys: Jwk[] } | null = null

export async function accessSchluessel(team: string): Promise<Jwk[]> {
  if (zertifikate && zertifikate.team === team && zertifikate.bis > Date.now()) return zertifikate.keys
  const r = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) })
  const keys = r.ok ? ((await r.json()) as { keys?: Jwk[] }).keys ?? [] : []
  zertifikate = { team, bis: Date.now() + (keys.length ? 10 * 60_000 : 30_000), keys }
  return keys
}

// ---------- Aufträge ----------

export interface Auftrag { id: string; method: 'GET' | 'POST'; pfad: string; body?: unknown; headers?: Record<string, string>; ms: number }
export interface Antwort { ok: boolean; status: number; daten: Record<string, unknown> }
export interface AgentStand { am: number; pvs?: string; version?: string; status?: string }

/** Ein Agent gilt als verbunden, solange er spätestens alle ONLINE_MS wieder abholt. */
export const ONLINE_MS = 60_000
/** Eine laufende Bridge hält immer einen Long-Poll offen; bleibt ein Auftrag länger liegen, holt sie nicht mehr ab. */
export const ABHOL_MS = 45_000

export class AgentHub {
  private schlange = new Map<string, Auftrag[]>()
  private wartende = new Map<string, ((a: Auftrag | null) => void)[]>()
  private offen = new Map<string, { mandant: string; fertig: (a: Antwort) => void; fehler: (e: Error) => void; timer: ReturnType<typeof setTimeout>; abholen?: ReturnType<typeof setTimeout> }>()
  private stand = new Map<string, AgentStand>()

  constructor(private abholMs = ABHOL_MS) {}

  private ausgeben(a: Auftrag) {
    const o = this.offen.get(a.id)
    if (o?.abholen) { clearTimeout(o.abholen); o.abholen = undefined }
    return a
  }

  private liegtBereit(mandant: string, a: Auftrag) {
    const o = this.offen.get(a.id)
    if (!o) return
    clearTimeout(o.abholen)
    o.abholen = setTimeout(() => {
      if (this.offen.get(a.id) !== o) return
      clearTimeout(o.timer)
      this.offen.delete(a.id)
      const l = this.schlange.get(mandant) ?? []
      const i = l.indexOf(a)
      if (i >= 0) l.splice(i, 1)
      o.fehler(new Error('nicht_abgeholt'))
    }, this.abholMs)
  }

  verbunden(mandant: string, jetzt = Date.now()): AgentStand | null {
    const s = this.stand.get(mandant)
    return s && jetzt - s.am < ONLINE_MS ? s : null
  }

  zuletzt(mandant: string): number | null {
    return this.stand.get(mandant)?.am ?? null
  }

  /** Long-Poll des Agenten: nächster Auftrag oder null nach `ms`. `abbruch` meldet eine abgerissene Verbindung. */
  abholen(mandant: string, ms: number, info: Omit<AgentStand, 'am'> = {}, abbruch?: (weg: () => void) => void): Promise<Auftrag | null> {
    this.stand.set(mandant, { ...info, am: Date.now() })
    const da = this.schlange.get(mandant)?.shift()
    if (da) return Promise.resolve(this.ausgeben(da))
    return new Promise((resolve) => {
      const liste = this.wartende.get(mandant) ?? []
      const weg = () => {
        clearTimeout(timer)
        const l = this.wartende.get(mandant) ?? []
        const i = l.indexOf(geben)
        if (i >= 0) l.splice(i, 1)
      }
      const geben = (a: Auftrag | null) => {
        weg()
        this.stand.set(mandant, { ...info, am: Date.now() })
        resolve(a && this.ausgeben(a))
      }
      const timer = setTimeout(() => geben(null), ms)
      liste.push(geben)
      this.wartende.set(mandant, liste)
      abbruch?.(() => { weg(); resolve(null) })
    })
  }

  rufen(mandant: string, a: Omit<Auftrag, 'id'>): Promise<Antwort> {
    const auftrag: Auftrag = { ...a, id: randomBytes(12).toString('hex') }
    return new Promise<Antwort>((fertig, fehler) => {
      const timer = setTimeout(() => {
        this.offen.delete(auftrag.id)
        const l = this.schlange.get(mandant) ?? []
        const i = l.indexOf(auftrag)
        if (i >= 0) l.splice(i, 1)
        fehler(new Error('zeitueberschreitung'))
      }, auftrag.ms + 5000)
      this.offen.set(auftrag.id, { mandant, fertig, fehler, timer })
      const wartet = this.wartende.get(mandant)?.[0]
      if (wartet) wartet(auftrag)
      else {
        this.schlange.set(mandant, [...(this.schlange.get(mandant) ?? []), auftrag])
        this.liegtBereit(mandant, auftrag)
      }
    })
  }

  /** Auftrag, dessen Abholer weg ist, für den nächsten Abholer zurückstellen. */
  zurueckstellen(mandant: string, a: Auftrag) {
    if (this.offen.get(a.id)?.mandant !== mandant) return
    const wartet = this.wartende.get(mandant)?.[0]
    if (wartet) wartet(a)
    else {
      this.schlange.set(mandant, [a, ...(this.schlange.get(mandant) ?? [])])
      this.liegtBereit(mandant, a)
    }
  }

  /** Antwort des Agenten; nur der Mandant, dem der Auftrag gehört, darf sie liefern. */
  antworten(mandant: string, id: string, antwort: Antwort): boolean {
    const o = this.offen.get(id)
    if (!o || o.mandant !== mandant) return false
    clearTimeout(o.timer)
    clearTimeout(o.abholen)
    this.offen.delete(id)
    o.fertig(antwort)
    return true
  }
}

/** Was ein Agent im Connector aufrufen darf – alles andere lehnt PlanR schon vor dem Versand ab. */
const PFADE: [Auftrag['method'], RegExp][] = [
  ['GET', /^\/patients\?[\w%=&.+-]{0,300}$/],
  ['GET', /^\/patients\/\d{1,9}$/],
  ['GET', /^\/patients\/\d{1,9}\/(clinical|hkps)$/],
  ['GET', /^\/patients\/\d{1,9}\/hkps\/\d{1,5}\/planr$/],
  ['POST', /^\/patients\/\d{1,9}\/hkps(\/import)?$/],
  ['GET', /^\/praxis\/katalog$/],
  ['GET', /^\/praxen$/],
]
export const auftragErlaubt = (method: string, pfad: string) => PFADE.some(([m, re]) => m === method && re.test(pfad))
