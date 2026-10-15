import { useSyncExternalStore } from 'react'
import { PLANR_SERVER } from './register'

/**
 * Aktueller 01-Befund je Patient aus dem PlanR-Server (Start/befund01.ts): zuletzt aus dem Praxisprogramm
 * gelesen, darüber die im Gespräch mit Clara oder hier geänderten Zähne, die dort noch nicht stehen.
 * Jede Änderung kommt live über /api/befund/live – auch die, die Clara per Sprache macht.
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
  /** laufender Weg vom Befund zum Plan; null ohne */
  vorgang?: Vorgang | null
}

/** Erst steht der Befund, nach seiner Freigabe wird geplant, dann ist der Plan angelegt (Start/befund01.ts) */
export interface Vorgang {
  modul: string
  phase: 'befund' | 'planung' | 'angelegt'
  seit: string
  stand: string
  auftrag: string
  freigegeben: string
  freigabeWo: string
  plan: Record<string, { TP: string; R: string }>
  hkpId: string
  meldung: string
}

export interface BefundAngabe { patient?: string; vorname?: string; name?: string; geburt?: string }

/** Handy-Link aus der Clara-Karte: ein Patient, ohne PlanR-Anmeldung, signiert von MAS */
export interface BefundLink { c: string; p: string; t: string }

export function befundLinkAus(search: string): BefundLink | null {
  const q = new URLSearchParams(search)
  const p = (q.get('befund') ?? '').trim(), t = q.get('bt') ?? '', c = q.get('c') ?? ''
  return /^\d{1,9}$/.test(p) && /^\d+\.[\w-]+$/.test(t) && /^[\w-]{2,64}$/.test(c) ? { p, t, c } : null
}

const BASIS = `${PLANR_SERVER}/api/befund`
let link: BefundLink | null = null
/** Ab jetzt laufen alle Anfragen über den Handy-Link statt über die Sitzung */
export const befundLinkSetzen = (l: BefundLink | null) => { link = l }
const linkSuche = () => (link ? `?${new URLSearchParams({ c: link.c, p: link.p, t: link.t })}` : '')

function ziel(pfad: string) {
  if (!link) return `${BASIS}${pfad}`
  const weg = pfad.startsWith('?') ? '' : pfad === '/schreiben' ? '/freigeben' : pfad
  return `${BASIS}/link${weg}${linkSuche()}`
}

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

export class BefundFehler extends Error {}

async function anfrage(pfad: string, init: RequestInit = {}): Promise<{ befund?: Befund01; befunde?: Befund01[]; meldung?: string }> {
  const r = await fetch(ziel(pfad), { ...init, credentials: link ? 'omit' : 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...init.headers } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d.ok === false) {
    throw new BefundFehler(String(d.meldung ?? (r.status === 401 ? (link ? 'Der Link ist abgelaufen.' : 'Bitte in PlanR anmelden.') : `PlanR antwortet mit ${r.status}.`)))
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

/** Zähne ändern – noch nicht im Praxisprogramm, gilt aber sofort für den nächsten Plan (auch für Clara) */
export const befundAendern = (patient: string, zaehne: Record<string, string>) => senden('/aenderung', { patient, zaehne })
/** Befund freigeben: offene Änderungen ins Praxisprogramm (der ganze betroffene Kiefer), sonst bestätigt; danach wird geplant */
export const befundSchreiben = (patient: string) => senden('/schreiben', { patient })
export const befundVerwerfen = (patient: string) => senden('/verwerfen', { patient })
/** Vorgang aus der Planliste nehmen – der Befund bleibt */
export const vorgangEnde = (patient: string) => senden('/vorgang-ende', { patient })

export async function befundListe(): Promise<Befund01[]> {
  const d = await anfrage('/liste')
  for (const b of d.befunde ?? []) merken(b)
  return d.befunde ?? []
}

// Ein Live-Kanal für alle Ansichten; offen, solange jemand zuhört.
let quelle: EventSource | null = null
let live = false
const liveAbos = new Set<() => void>()
const liveMelden = (an: boolean) => {
  live = an
  liveAbos.forEach((f) => f())
}

function liveAn(): () => void {
  if (!quelle && typeof EventSource !== 'undefined') {
    quelle = link ? new EventSource(`${BASIS}/link/live${linkSuche()}`) : new EventSource(`${BASIS}/live`, { withCredentials: true })
    quelle.onopen = () => liveMelden(true)
    quelle.onerror = () => liveMelden(false)
    quelle.addEventListener('befund', (ev) => {
      try {
        merken(JSON.parse((ev as MessageEvent).data) as Befund01)
      } catch { /* unvollständige Meldung überspringen */ }
    })
  }
  return () => {
    if (abonnenten.size || liveAbos.size || !quelle) return
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
export const useBefunde = () => useSyncExternalStore(abo, () => befunde)
export const useBefundLive = () => useSyncExternalStore(liveAbo, () => live)

/** Zähne des Plans, die vom aktuellen Befund abweichen (leere Felder zählen als „vorhanden“) */
export function abweichungen(plan: Record<string, { B?: string }>, aktuell: Record<string, string>): Record<string, string> {
  const aus: Record<string, string> = {}
  for (const z of Object.keys(aktuell)) {
    const p = String(plan[z]?.B ?? '').trim().toLowerCase()
    if (p !== String(aktuell[z] ?? '').trim().toLowerCase()) aus[z] = p
  }
  return aus
}

export const datumDe = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('.') : iso)
export const uhrzeit = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
