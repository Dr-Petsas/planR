import { useSyncExternalStore } from 'react'

/**
 * Aktueller 01-Befund je Patient aus dem PlanR-Server (Start/befund01.ts): zuletzt aus dem Praxisprogramm
 * gelesen, darüber die im Gespräch mit Clara oder in einem Planer geänderten Zähne, die dort noch nicht stehen.
 * Jede Änderung kommt live über /api/befund/live. Derselbe Stand wie im HKP-Planer.
 */
export interface Befund01 {
  /** Patientennummer im Praxisprogramm */
  patient: string
  label: string
  geburt: string
  pvs: string
  pvsDatum: string
  /** aktuell: Praxisprogramm plus offene Änderungen */
  zaehne: Record<string, string>
  pvsZaehne: Record<string, string>
  offen: Record<string, string>
  offenWer: string
  gelesen: string
  geschrieben: string
  stand: string
  vorgang?: { modul: string; phase: 'befund' | 'planung' | 'angelegt'; auftrag: string; freigegeben: string; freigabeWo: string; meldung: string } | null
}

export interface BefundAngabe { patient?: string; vorname?: string; name?: string; geburt?: string }

export const OBERKIEFER = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
export const UNTERKIEFER = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']
export const ALLE_ZAEHNE = [...OBERKIEFER, ...UNTERKIEFER]

/** eHKP-Befundkürzel, wie sie DS-Win im 01 führt */
export const BEFUND_KUERZEL: Record<string, string> = {
  a: 'Adhäsivbrücke (Anker)', ab: 'Adhäsivbrücke (Brückenglied)', abw: 'erneuerungsbedürftige Adhäsivbrücke (Brückenglied)',
  aw: 'erneuerungsbedürftige Adhäsivbrücke (Anker)', b: 'Brückenglied', bw: 'erneuerungsbedürftiges Brückenglied',
  e: 'ersetzter Zahn', ew: 'ersetzter, aber erneuerungsbedürftiger Zahn', f: 'fehlender Zahn', i: 'Implantat mit intakter Suprakonstruktion',
  ix: 'zu entfernendes Implantat', k: 'klinisch intakte Krone', kw: 'erneuerungsbedürftige Krone', pkw: 'erneuerungsbedürftige Teilkrone',
  pw: 'erhaltungswürdiger Zahn mit partiellen Substanzdefekten', r: 'Wurzelstiftkappe mit ersetztem Zahn', rw: 'erneuerungsbedürftige Wurzelstiftkappe',
  sb: 'implantatgetragenes Brückenglied', sbw: 'erneuerungsbedürftiges implantatgetragenes Brückenglied',
  se: 'ersetzter Zahn einer implantatgetragenen (Teil-)Prothese', sew: 'erneuerungsbedürftiger ersetzter Zahn einer implantatgetragenen Prothese',
  sk: 'implantatgetragene intakte Krone', skw: 'erneuerungsbedürftige implantatgetragene Krone',
  so: 'implantatgetragenes Verbindungselement mit ersetztem Zahn', sow: 'erneuerungsbedürftiges implantatgetragenes Verbindungselement',
  st: 'implantatgetragene Teleskopkrone', stw: 'erneuerungsbedürftige implantatgetragene Teleskopkrone', t: 'Teleskopkrone',
  t2w: 'erneuerungsbedürftiges Sekundärteil einer Teleskopkrone', tw: 'erneuerungsbedürftige Teleskopkrone', ur: 'unzureichende Retention',
  ww: 'erhaltungswürdiger Zahn mit weitgehender Zerstörung', x: 'nicht erhaltungswürdiger Zahn', ')(': 'Lückenschluss',
}

/** Kein natürlicher Zahn an der Stelle (fehlt, ersetzt, Brückenglied, Implantat) */
export const KEIN_ZAHN = new Set(['f', 'e', 'ew', 'b', 'bw', 'ab', 'abw', 'i', 'ix', 'r', 'rw', 'sb', 'sbw', 'se', 'sew', 'sk', 'skw', 'so', 'sow', 'st', 'stw', ')('])
/** Natürlicher Zahn, aber überkront bzw. als Pfeiler versorgt – keine Füllung, kein Inlay */
export const VERSORGT = new Set(['k', 'kw', 'pkw', 't', 'tw', 't2w', 'a', 'aw'])

/** fuellung: Füllung, Inlay, Veneer, Versiegelung · aufbau: Aufbau vor Krone · endo: Wurzelbehandlung, Überkappung, internes Bleichen */
export type KonsArt = 'fuellung' | 'aufbau' | 'endo'

const KRONE_WIRD_ERNEUERT = new Set(['kw', 'pkw', 'tw', 't2w', 'aw'])

/** Was der Befund für die geplante Kons-Leistung an einem Zahn sagt */
export function konsHinweis(code: string, art: KonsArt = 'fuellung'): { geht: boolean; text: string } {
  const c = code.trim().toLowerCase()
  const name = BEFUND_KUERZEL[c] ?? c
  if (KEIN_ZAHN.has(c)) return { geht: false, text: `laut 01 ${name} – kein natürlicher Zahn` }
  if (c === 'x') return { geht: false, text: 'laut 01 nicht erhaltungswürdig' }
  if (VERSORGT.has(c)) {
    if (art === 'endo') return { geht: true, text: `laut 01 ${name} – Zugang durch die Krone` }
    if (art === 'aufbau' && KRONE_WIRD_ERNEUERT.has(c)) return { geht: true, text: `laut 01 ${name} – Aufbau vor der Neuversorgung` }
    return { geht: false, text: `laut 01 ${name}` }
  }
  if (c === 'ww') {
    if (art === 'fuellung') return { geht: true, text: 'laut 01 weitgehend zerstört – eher Aufbau, Teilkrone oder Krone' }
    return { geht: true, text: 'laut 01 weitgehend zerstört – Teilkrone oder Krone einplanen' }
  }
  if (c === 'pw') return { geht: true, text: art === 'fuellung' ? 'laut 01 partieller Substanzdefekt' : '' }
  return { geht: true, text: '' }
}

/** Kons/MKV: Zähne, die der 01 nahelegt – „pw“ für Füllung/Inlay, „ww“ für Aufbau/Teilkrone */
export function konsKandidaten(befund: Record<string, string>): { zahn: string; art: 'fuellung' | 'aufbau' }[] {
  return ALLE_ZAEHNE.flatMap((zahn): { zahn: string; art: 'fuellung' | 'aufbau' }[] => {
    const c = (befund[zahn] ?? '').trim().toLowerCase()
    return c === 'pw' ? [{ zahn, art: 'fuellung' }] : c === 'ww' ? [{ zahn, art: 'aufbau' }] : []
  })
}

/** Kons/MKV: Hinweise des 01 zu den geplanten Zähnen */
export function konsWarnungen(geplant: readonly (string | { zahn: string; art: KonsArt })[], befund: Record<string, string> | undefined): string[] {
  if (!befund) return []
  return geplant.flatMap((g) => {
    const { zahn, art } = typeof g === 'string' ? { zahn: g, art: 'fuellung' as const } : g
    const h = konsHinweis(befund[zahn] ?? '', art)
    return h.text ? [`Zahn ${zahn}: ${h.text}${h.geht ? '' : ' – Planung prüfen'}`] : []
  })
}

/** PlanR-Server; die Sitzung (Cookie) gilt für denselben Host wie der Planer */
const SERVER = typeof location === 'undefined' ? 'http://127.0.0.1:5189'
  : location.pathname.startsWith('/planer/') ? location.origin
  : location.hostname.endsWith('.pickadoc-tunnel.com') ? 'https://planr.pickadoc-tunnel.com'
    : `http://${location.hostname}:5189`
const BASIS = `${SERVER}/api/befund`

let befunde: Record<string, Befund01> = {}
const abonnenten = new Set<() => void>()
const melden = () => abonnenten.forEach((f) => f())

function merken(b: Befund01) {
  const alt = befunde[b.patient]
  if (alt && alt.stand > b.stand) return alt
  befunde = { ...befunde, [b.patient]: b }
  melden()
  return b
}

export class BefundFehler extends Error {
  anmelden: boolean
  constructor(text: string, anmelden = false) {
    super(text)
    this.anmelden = anmelden
  }
}

async function anfrage(pfad: string, init: RequestInit = {}): Promise<{ befund?: Befund01; meldung?: string }> {
  const r = await fetch(`${BASIS}${pfad}`, { ...init, credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...init.headers } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d.ok === false) {
    throw new BefundFehler(String(d.meldung ?? (r.status === 401 ? 'Bitte in PlanR anmelden.' : `PlanR antwortet mit ${r.status}.`)), r.status === 401)
  }
  return d
}

/** Liest den Befund frisch aus dem Praxisprogramm (dauert über die Bridge ein paar Sekunden) */
export async function befundHolen(a: BefundAngabe): Promise<{ befund: Befund01; meldung: string }> {
  const q = new URLSearchParams(Object.entries(a).filter(([, v]) => v) as [string, string][])
  const d = await anfrage(`?${q}`)
  if (!d.befund) throw new BefundFehler('PlanR hat keinen Befund geliefert.')
  return { befund: merken(d.befund), meldung: d.meldung ?? '' }
}

const senden = async (pfad: string, body: Record<string, unknown>) => {
  const d = await anfrage(pfad, { method: 'POST', body: JSON.stringify(body) })
  if (d.befund) merken(d.befund)
  return d.meldung ?? ''
}

/** Zähne ändern – noch nicht im Praxisprogramm, gilt aber sofort für jeden Planer und für Clara */
export const befundAendern = (patient: string, zaehne: Record<string, string>) => senden('/aenderung', { patient, zaehne })
/** Befund freigeben: offene Änderungen ins Praxisprogramm (der ganze betroffene Kiefer), sonst bestätigt */
export const befundSchreiben = (patient: string) => senden('/schreiben', { patient })
export const befundVerwerfen = (patient: string) => senden('/verwerfen', { patient })

let quelle: EventSource | null = null
let live = false
const liveAbos = new Set<() => void>()
const liveMelden = (an: boolean) => {
  live = an
  liveAbos.forEach((f) => f())
}

function liveAn(): () => void {
  if (!quelle && typeof EventSource !== 'undefined') {
    quelle = new EventSource(`${BASIS}/live`, { withCredentials: true })
    quelle.onopen = () => liveMelden(true)
    quelle.onerror = () => liveMelden(false)
    quelle.addEventListener('befund', (ev) => {
      try {
        merken(JSON.parse((ev as MessageEvent).data) as Befund01)
      } catch { /* unvollständige Meldung überspringen */ }
    })
  }
  return () => {
    if (abonnenten.size || !quelle) return
    quelle.close()
    quelle = null
    liveMelden(false)
  }
}

const abo = (f: () => void) => {
  abonnenten.add(f)
  const zu = liveAn()
  return () => {
    abonnenten.delete(f)
    zu()
  }
}
const liveAbo = (f: () => void) => {
  liveAbos.add(f)
  return () => { liveAbos.delete(f) }
}

/** Gemerkter Befund des Patienten (live aktualisiert); null, solange noch nicht gelesen */
export const useBefund = (patient: string | undefined) =>
  useSyncExternalStore(abo, () => (patient ? befunde[patient] ?? null : null))
export const useBefundLive = () => useSyncExternalStore(liveAbo, () => live)

/** Zähne der Befundzeile, die vom aktuellen 01 abweichen (leere Felder zählen als „vorhanden“) */
export function abweichungen(plan: Record<string, { B?: string }>, aktuell: Record<string, string>): Record<string, string> {
  const aus: Record<string, string> = {}
  for (const z of ALLE_ZAEHNE) {
    const p = String(plan[z]?.B ?? '').trim().toLowerCase()
    if (p !== String(aktuell[z] ?? '').trim().toLowerCase()) aus[z] = p
  }
  return aus
}

/** 01 in die Befundzeile eines Plans (alle 32 Zähne; Planung und weitere Angaben bleiben) */
export function befundZeile<Z extends { B: string }>(zaehne: Record<string, Z>, befund: Record<string, string>, leer: () => Z): Record<string, Z> {
  return Object.fromEntries(ALLE_ZAEHNE.map((z) => [z, { ...(zaehne[z] ?? leer()), B: befund[z] ?? '' }]))
}

export const datumDe = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('.') : iso)
export const uhrzeit = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
