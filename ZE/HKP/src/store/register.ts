import { useSyncExternalStore } from 'react'
import type { HkpPlan } from '../types'
import type { Ergebnis, Listen } from '../engine/berechnung'
import { MANDANT_ID, STANDARD_ID, mk } from '../mandant'

/** HKP-Register in MAS. PlanR spricht über den Vite-Proxy /mas (gleicher Ursprung, auch über den Tunnel). */
const BASIS = '/mas/planr'
/** Weitere Mandanten bekommen am Praxis-PC nicht automatisch den Schlüssel der Praxis (vite.config.ts) */
const MANDANT_KOPF: Record<string, string> = MANDANT_ID === STANDARD_ID ? {} : { 'X-PlanR-Mandant': MANDANT_ID }
const VERBINDUNG_KEY = mk('hkp.mas.v1')
const AKTIV_KEY = mk('hkp.register.v1')

export type HkpStatus = 'wartet_auf_freigabe' | 'freigegeben' | 'eingereicht' | 'genehmigt' | 'abgelehnt' | 'abgerechnet' | 'verworfen'

export const STATUS_TEXT: Record<HkpStatus, string> = {
  wartet_auf_freigabe: 'wartet auf Freigabe',
  freigegeben: 'freigegeben',
  eingereicht: 'eingereicht',
  genehmigt: 'genehmigt',
  abgelehnt: 'abgelehnt',
  abgerechnet: 'abgerechnet',
  verworfen: 'verworfen',
}

export interface RegisterKopf {
  id: string
  patient: { id?: string; firstName?: string; lastName?: string; label: string; birthDate?: string }
  status: HkpStatus
  kiefer?: string
  versorgungText?: string
  auftragText?: string
  erstellt: string
  aktualisiert: string
  erstelltVon?: 'clara' | 'planr'
  version: number
  summen?: { gesamt: number; festzuschuss: number; kassenanteil: number; eigenanteil: number; material: number }
  befundQuelle?: { art: string; datum?: string }
  hinweise?: string[]
  offeneAenderung?: { id: string } | null
  verlauf?: { at: string; wer: string; was: string }[]
  /** angehängte Dateien, z. B. der diktierte Befund */
  dateien?: RegisterDateiKopf[]
}

export interface RegisterDateiKopf {
  id: string
  name: string
  art: 'befund'
  erstellt: string
}

export interface RegisterHkp extends RegisterKopf {
  planJson: string
}

/** HKP, mit dem der aktuelle Plan im Register verknüpft ist */
export interface AktiverEintrag {
  id: string
  version: number
  status: HkpStatus
  label: string
  /** Prüfsumme des zuletzt abgeglichenen Plans */
  stand: string
}

export function planStand(plan: HkpPlan): string {
  const s = JSON.stringify(plan)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return `${s.length}-${(h >>> 0).toString(36)}`
}

function lesen<T>(key: string, leer: T): T {
  try {
    const s = localStorage.getItem(key)
    return s ? { ...leer, ...JSON.parse(s) } : leer
  } catch {
    return leer
  }
}

/** automatisch = am Praxis-PC trägt der PlanR-Server den Schlüssel selbst ein (vite.config.ts) */
let verbindung = lesen<{ schluessel: string; automatisch?: boolean }>(VERBINDUNG_KEY, { schluessel: '' })
let aktiv: AktiverEintrag | null = lesen<AktiverEintrag | null>(AKTIV_KEY, null)
const abonnenten = new Set<() => void>()
const melden = () => abonnenten.forEach((f) => f())
const abo = (f: () => void) => {
  abonnenten.add(f)
  return () => abonnenten.delete(f)
}

export function schluesselSetzen(schluessel: string) {
  verbindung = { ...verbindung, schluessel: schluessel.trim() }
  localStorage.setItem(VERBINDUNG_KEY, JSON.stringify({ schluessel: verbindung.schluessel }))
  melden()
}

export const verbunden = (v: { schluessel: string; automatisch?: boolean } = verbindung) => !!(v.schluessel || v.automatisch)

/** Erledigt, sobald geprüft ist, ob der PlanR-Server den Schlüssel selbst einträgt */
export const verbindungBereit: Promise<void> = typeof window === 'undefined' || typeof fetch !== 'function'
  ? Promise.resolve()
  : fetch(`${BASIS}/status`, { headers: { 'Content-Type': 'application/json', ...MANDANT_KOPF } })
    .then((r) => {
      if (!r.ok) return
      verbindung = { ...verbindung, automatisch: true }
      melden()
    })
    .catch(() => {})

export function aktivSetzen(e: AktiverEintrag | null) {
  aktiv = e
  if (e) localStorage.setItem(AKTIV_KEY, JSON.stringify(e))
  else localStorage.removeItem(AKTIV_KEY)
  melden()
}

export const useVerbindung = () => useSyncExternalStore(abo, () => verbindung)
export const useAktiv = () => useSyncExternalStore(abo, () => aktiv)

export class RegisterFehler extends Error {
  status: number
  daten: Record<string, unknown>
  constructor(status: number, daten: Record<string, unknown>) {
    super(String(daten.message ?? daten.error ?? `HTTP ${status}`))
    this.status = status
    this.daten = daten
  }
}

async function anfrage<T>(pfad: string, init: RequestInit = {}): Promise<T> {
  if (!verbunden()) throw new RegisterFehler(401, { message: 'Kein MAS-Schlüssel eingetragen (Einstellungen).' })
  const r = await fetch(`${BASIS}${pfad}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...MANDANT_KOPF, ...(verbindung.schluessel ? { 'X-PlanR-Key': verbindung.schluessel } : {}), ...init.headers },
  })
  const daten = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
  if (!r.ok || daten.ok === false) {
    if (r.status === 401) throw new RegisterFehler(401, { message: 'MAS-Schlüssel ist falsch.' })
    throw new RegisterFehler(r.status, daten)
  }
  return daten as T
}

export const registerStatus = () => anfrage<{ engineStand: string; praxis: { aktualisiert: string; preislisten: number; eigen: number } }>('/status')
export const registerListe = () => anfrage<{ hkps: RegisterKopf[] }>('/hkp').then((d) => d.hkps)
export const registerLesen = (id: string) => anfrage<{ hkp: RegisterHkp }>(`/hkp/${id}`).then((d) => d.hkp)
export const registerDatei = (id: string, dateiId: string) =>
  anfrage<{ datei: { name: string; typ: string; inhalt: string } }>(`/hkp/${encodeURIComponent(id)}/datei/${encodeURIComponent(dateiId)}`).then((d) => d.datei)

/** Zugang über einen Link aus MAS: t = lesen, f = freigeben (nur Karte in der Clara-App), c = Mandant */
export interface LinkZugang { id: string; t: string; f?: string; c?: string }

const linkPfad = (z: LinkZugang) => `${BASIS}/hkp-link/${encodeURIComponent(z.id)}${z.c ? `?c=${encodeURIComponent(z.c)}` : ''}`
const linkKopf = (z: LinkZugang): Record<string, string> => ({ 'X-PlanR-Link': z.t, ...(z.f ? { 'X-PlanR-Freigabe': z.f } : {}) })

async function linkAntwort<T>(r: Response): Promise<T> {
  const daten = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
  if (!r.ok || daten.ok === false) throw new RegisterFehler(r.status, daten)
  return daten as T
}

/** HKP samt den Preislisten, mit denen MAS ihn rechnet; `freigabe` = Freigabe-Schlüssel gültig */
export const hkpPerLink = (z: LinkZugang) =>
  fetch(linkPfad(z), { headers: linkKopf(z) }).then((r) => linkAntwort<{ hkp: RegisterHkp; listen: Listen | null; freigabe: boolean }>(r))

/** HKP aus einem SMS-Link (?hkp=…&t=…): nur lesend, ohne MAS-Schlüssel */
export const registerLesenPerLink = (id: string, token: string, c?: string) => hkpPerLink({ id, t: token, c }).then((d) => d.hkp)

/** Freigabe vom Handy; `plan` nur, wenn die Regler verschoben wurden (MAS rechnet selbst nach) */
export const freigebenPerLink = (z: LinkZugang, version: number, plan?: HkpPlan) =>
  fetch(linkPfad(z), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...linkKopf(z) },
    body: JSON.stringify({ version, status: 'freigegeben', ...(plan ? { plan } : {}) }),
  }).then((r) => linkAntwort<{ hkp: RegisterKopf }>(r)).then((d) => d.hkp)

export function summenVon(e: Ergebnis) {
  const s = e.summen
  return { gesamt: s.gesamt, festzuschuss: s.festzuschuss, kassenanteil: s.kassenanteil, eigenanteil: s.eigenanteil, material: s.fremdMat + s.eigenMat }
}

/** Kiefer und Bezeichnung aus dem Zahnschema (für in PlanR angelegte HKPs) */
export function beschreibung(plan: HkpPlan): { kiefer: string; versorgungText: string } {
  const geplant = Object.entries(plan.zaehne).filter(([, v]) => (v.TP || v.R).trim())
  const kiefer = new Set(geplant.map(([z]) => (z[0] === '1' || z[0] === '2' ? 'OK' : 'UK')))
  const kz = geplant.map(([, v]) => (v.TP || v.R).trim().toUpperCase())
  const versorgungText = kz.some((k) => /^T/.test(k)) ? 'Teleskop-HKP'
    : kz.some((k) => /^S/.test(k)) ? 'Implantat-HKP'
      : kz.some((k) => /^B/.test(k)) ? 'Brücken-HKP'
        : kz.some((k) => /^(K|PK)/.test(k)) ? 'Kronen-HKP'
          : kz.some((k) => /^E/.test(k)) ? 'Prothesen-HKP' : 'HKP'
  return { kiefer: kiefer.size === 1 ? [...kiefer][0] : '', versorgungText }
}

export const registerAnlegen = (plan: HkpPlan, ergebnis: Ergebnis, status: HkpStatus = 'wartet_auf_freigabe') =>
  anfrage<{ hkp: RegisterKopf }>('/hkp', { method: 'POST', body: JSON.stringify({ plan, summen: summenVon(ergebnis), status, ...beschreibung(plan) }) }).then((d) => d.hkp)

export const registerSpeichern = (id: string, version: number, plan: HkpPlan, ergebnis: Ergebnis) =>
  anfrage<{ hkp: RegisterKopf }>(`/hkp/${id}`, { method: 'PUT', body: JSON.stringify({ version, plan, summen: summenVon(ergebnis), ...beschreibung(plan) }) }).then((d) => d.hkp)

export const registerStatusSetzen = (id: string, version: number, status: HkpStatus) =>
  anfrage<{ hkp: RegisterKopf }>(`/hkp/${id}`, { method: 'PUT', body: JSON.stringify({ version, status }) }).then((d) => d.hkp)

export const praxisFreigeben = (daten: { preislisten: unknown[]; eigen: unknown[]; einstellungen: Partial<HkpPlan['einstellungen']> }) =>
  anfrage<{ preislisten: number; eigen: number }>('/praxis', { method: 'POST', body: JSON.stringify(daten) })
