/**
 * Aktueller 01-Befund je Patient (Chef 15.10.2026): das Neueste aus dem Praxisprogramm plus das, was im
 * Gespräch mit der Assistentin geändert und noch nicht ins Praxisprogramm übernommen wurde. PlanR zeigt ihn
 * auf der Befundseite und im HKP-Planer und schickt jede Änderung sofort an alle offenen Fenster der Praxis.
 */
import type { ServerResponse } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { PlanKarte } from './src/plaene.ts'

const OK = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
const UK = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']
export const KIEFER: Record<string, string[]> = { OK, UK }
const ALLE = new Set([...OK, ...UK])
const kieferVon = (z: string) => (/^[12]/.test(z) ? 'OK' : 'UK')
/** So viele Patienten behält die Ablage je Praxis (die zuletzt geänderten) */
export const BEFUNDE_MAX = 2000

export interface Befund01 {
  /** Patientennummer im Praxisprogramm */
  patient: string
  /** „Name, Vorname“ zum Wiederfinden */
  label: string
  geburt: string
  pvs: string
  /** zuletzt aus dem Praxisprogramm gelesen, Kürzel genau wie dort */
  pvsZaehne: Record<string, string>
  /** Datum des Befunds im Praxisprogramm */
  pvsDatum: string
  /** im Gespräch oder in PlanR geändert, noch nicht im Praxisprogramm */
  offen: Record<string, string>
  offenWer: string
  gelesen: string
  geschrieben: string
  /** letzte Änderung des angezeigten Befunds */
  stand: string
  /** laufender Weg vom Befund zum Plan (Gespräch mit der Assistentin oder PlanR) */
  vorgang?: Vorgang
}

/**
 * Vom Befund zum Plan (Chef 15.10.2026): erst steht der Befund, nach seiner Freigabe (Gespräch, Handy oder PC) geht er
 * ins Praxisprogramm, erst danach wird geplant; mit dem angelegten Plan übernimmt dessen Eintrag in der Liste.
 */
export type Phase = 'befund' | 'planung' | 'angelegt'
const PHASEN: Phase[] = ['befund', 'planung', 'angelegt']
export interface Vorgang {
  /** Planer-Modul (hkp, par …); leer, solange die Planart noch nicht feststeht */
  modul: string
  phase: Phase
  seit: string
  stand: string
  /** Auftrag in Worten, z. B. „Brücke 14 bis 16“ */
  auftrag: string
  /** Befund freigegeben (ins Praxisprogramm übernommen oder unverändert bestätigt) */
  freigegeben: string
  freigabeWo: string
  /** Planungszeilen zur Anzeige je Zahn */
  plan: Record<string, { TP: string; R: string }>
  hkpId: string
  meldung: string
}
/** Ohne Bewegung so lange gilt ein Vorgang noch als laufend */
export const VORGANG_MS = 12 * 3600_000
export const FREIGABE_WO = ['Gespräch', 'Handy', 'PlanR'] as const

export const vorgangLaeuft = (b: Befund01, jetzt = Date.now()) =>
  !!b.vorgang && b.vorgang.phase !== 'angelegt' && jetzt - Date.parse(b.vorgang.stand) < VORGANG_MS

const kurz = (x: unknown, n: number) => String(x ?? '').trim().slice(0, n)

function planZeilen(roh: unknown): Vorgang['plan'] {
  if (!roh || typeof roh !== 'object') return {}
  const aus: Vorgang['plan'] = {}
  for (const [z, v] of Object.entries(roh as Record<string, { TP?: unknown; R?: unknown }>)) {
    if (!ALLE.has(z) || !v || typeof v !== 'object') continue
    const TP = kurz(v.TP, 12), R = kurz(v.R, 12)
    if (TP || R) aus[z] = { TP, R }
  }
  return aus
}

export interface VorgangTeil { modul?: string; phase?: string; auftrag?: string; plan?: unknown; hkpId?: string; meldung?: string }

/** Meldung der Assistentin bzw. von PlanR: ein laufender Vorgang wird ergänzt, sonst beginnt ein neuer. Phasen nur vorwärts. */
export function vorgangMelden(alt: Befund01, teil: VorgangTeil, jetzt = new Date().toISOString()): Befund01 {
  const modul = /^[a-z0-9-]{1,40}$/.test(teil.modul ?? '') ? teil.modul! : ''
  const v0 = alt.vorgang
  const weiter = v0 && vorgangLaeuft(alt, Date.parse(jetzt)) && (!modul || !v0.modul || modul === v0.modul)
  const v: Vorgang = weiter
    ? { ...v0, plan: { ...v0.plan } }
    : { modul: '', phase: 'befund', seit: jetzt, stand: jetzt, auftrag: '', freigegeben: '', freigabeWo: '', plan: {}, hkpId: '', meldung: '' }
  if (modul) v.modul = modul
  const phase = PHASEN.indexOf(teil.phase as Phase)
  if (phase > PHASEN.indexOf(v.phase)) v.phase = PHASEN[phase]
  if (teil.auftrag !== undefined) v.auftrag = kurz(teil.auftrag, 300)
  if (teil.plan !== undefined) v.plan = planZeilen(teil.plan)
  if (teil.hkpId) v.hkpId = kurz(teil.hkpId, 80)
  if (teil.meldung !== undefined) v.meldung = kurz(teil.meldung, 300)
  v.stand = jetzt
  return { ...alt, vorgang: v }
}

/** Befund freigegeben: ab jetzt darf geplant werden. Ohne laufenden Vorgang bleibt alles, wie es ist. */
export function befundFreigeben(alt: Befund01, wo: string, jetzt = new Date().toISOString()): Befund01 {
  if (!vorgangLaeuft(alt, Date.parse(jetzt))) return alt
  const v = alt.vorgang!
  return { ...alt, vorgang: { ...v, freigegeben: jetzt, freigabeWo: wo, phase: v.phase === 'befund' ? 'planung' : v.phase, meldung: '', stand: jetzt } }
}

const KUERZEL: Record<string, string> = { hkp: 'HKP', par: 'PAR', kb: 'KB', kfo: 'KFO', implantologie: 'IMPL', mkv: 'MKV', kons: 'KONS' }

/** Laufende Vorgänge als Zeilen der Planliste: Befund ohne Plan bzw. in Planung */
export function vorgangKarten(alle: Record<string, Befund01>, jetzt = Date.now()): PlanKarte[] {
  return Object.values(alle).filter((b) => vorgangLaeuft(b, jetzt)).map((b) => {
    const v = b.vorgang!
    const modul = v.modul.replace(/^privat-/, '')
    return {
      modul: v.modul || 'hkp', kuerzel: KUERZEL[modul] ?? '01', art: v.modul.startsWith('privat') ? 'Privat' : 'Kasse',
      nummer: `befund-${b.patient}`, patient: b.label || `Patient ${b.patient}`, betrag: 0,
      status: v.phase === 'befund' ? 'befund' : 'in_planung', geaendert: v.stand, oeffnen: `befund=${b.patient}`,
      vorgang: { phase: v.phase, modul: v.modul, patient: b.patient, offen: Object.keys(b.offen).length, pvs: b.pvs, auftrag: v.auftrag, meldung: v.meldung },
    }
  })
}

export const vorgangBeenden = (alt: Befund01): Befund01 => {
  if (!alt.vorgang) return alt
  const { vorgang: _, ...rest } = alt
  return rest
}

/** Was angezeigt wird und für den nächsten Plan gilt */
export const zaehneAktuell = (b: Befund01) => ({ ...b.pvsZaehne, ...b.offen })

/** Gesprochene Kürzel klein (eHKP), Kürzel aus dem Praxisprogramm unverändert */
const nurZaehne = (z: Record<string, unknown>, klein = true) =>
  Object.fromEntries(Object.entries(z).filter(([k, v]) => ALLE.has(k) && String(v ?? '').trim().length <= 6).map(([k, v]) => {
    const c = String(v ?? '').trim()
    return [k, klein ? c.toLowerCase() : c]
  }))

/** Praxisprogramme schreiben Kürzel teils groß – gleich ist gleich */
const wieImPvs = (pvs: Record<string, string>, z: string, c: string) => (pvs[z] ?? '').toLowerCase() === c.toLowerCase()

const gleich = (a: Record<string, string>, b: Record<string, string>) =>
  [...ALLE].every((z) => (a[z] ?? '') === (b[z] ?? ''))

/** Nach dem Lesen aus dem Praxisprogramm: offene Änderungen, die dort inzwischen genauso stehen, sind erledigt. */
export function nachLesen(alt: Befund01 | undefined, l: { patient: string; label?: string; geburt?: string; pvs: string; zaehne: Record<string, string>; datum: string }, jetzt = new Date().toISOString()): Befund01 {
  const pvsZaehne = nurZaehne(l.zaehne, false)
  const offen = Object.fromEntries(Object.entries(alt?.offen ?? {}).filter(([z, c]) => !wieImPvs(pvsZaehne, z, c)))
  const vorher = alt ? zaehneAktuell(alt) : null
  const b: Befund01 = {
    patient: l.patient, label: l.label || alt?.label || '', geburt: l.geburt || alt?.geburt || '', pvs: l.pvs,
    pvsZaehne, pvsDatum: l.datum, offen, offenWer: Object.keys(offen).length ? alt?.offenWer ?? '' : '',
    gelesen: jetzt, geschrieben: alt?.geschrieben ?? '', stand: alt?.stand ?? jetzt,
    ...(alt?.vorgang ? { vorgang: alt.vorgang } : {}),
  }
  if (!vorher || !gleich(vorher, zaehneAktuell(b))) b.stand = jetzt
  return b
}

/** Änderung aus dem Gespräch (oder in PlanR): einzelne Zähne; was dem Praxisprogramm entspricht, ist nicht offen. */
export function nachAenderung(alt: Befund01, zaehne: Record<string, unknown>, wer: string, jetzt = new Date().toISOString()): Befund01 {
  const offen = { ...alt.offen, ...nurZaehne(zaehne) }
  for (const [z, c] of Object.entries(offen)) if (wieImPvs(alt.pvsZaehne, z, c)) delete offen[z]
  const b = { ...alt, offen, offenWer: Object.keys(offen).length ? wer : '' }
  return gleich(zaehneAktuell(alt), zaehneAktuell(b)) ? { ...b, stand: alt.stand } : { ...b, stand: jetzt }
}

/** Kiefer mit offenen Änderungen – nur die gehen ins Praxisprogramm */
export const offeneKiefer = (b: Befund01) => ['OK', 'UK'].filter((k) => Object.keys(b.offen).some((z) => kieferVon(z) === k))

/** Nach dem Schreiben: die geschriebenen Kiefer stehen jetzt so im Praxisprogramm. */
export function nachSchreiben(alt: Befund01, kiefer: string[], zaehne: Record<string, unknown>, jetzt = new Date().toISOString()): Befund01 {
  const neu = nurZaehne(zaehne, false)
  const pvsZaehne = { ...alt.pvsZaehne }
  for (const k of kiefer) for (const z of KIEFER[k] ?? []) if (z in neu) pvsZaehne[z] = neu[z]
  const offen = Object.fromEntries(Object.entries(alt.offen).filter(([z]) => !kiefer.includes(kieferVon(z))))
  return { ...alt, pvsZaehne, offen, offenWer: Object.keys(offen).length ? alt.offenWer : '', geschrieben: jetzt, stand: jetzt }
}

export function verwerfen(alt: Befund01, jetzt = new Date().toISOString()): Befund01 {
  return Object.keys(alt.offen).length ? { ...alt, offen: {}, offenWer: '', stand: jetzt } : alt
}

/** Ablage kürzen: die zuletzt geänderten bleiben */
export function ablageKuerzen(a: Record<string, Befund01>, max = BEFUNDE_MAX): Record<string, Befund01> {
  const eintraege = Object.entries(a)
  if (eintraege.length <= max) return a
  return Object.fromEntries(eintraege.sort(([, x], [, y]) => y.stand.localeCompare(x.stand)).slice(0, max))
}

/** Für Browser und Assistentin: aktueller Befund, offene Änderungen getrennt */
export function befundAnsicht(b: Befund01) {
  return {
    patient: b.patient, label: b.label, geburt: b.geburt, pvs: b.pvs, pvsDatum: b.pvsDatum,
    zaehne: zaehneAktuell(b), pvsZaehne: b.pvsZaehne, offen: b.offen, offenWer: b.offenWer,
    gelesen: b.gelesen, geschrieben: b.geschrieben, stand: b.stand,
    vorgang: b.vorgang && vorgangLaeuft(b) ? b.vorgang : b.vorgang?.phase === 'angelegt' ? b.vorgang : null,
  }
}
export type BefundAnsicht = ReturnType<typeof befundAnsicht>

/**
 * Handy-Link aus der Clara-Karte (?c=&p=&t=): MAS signiert mit PLANR_HKP_KEY `befund-flip:<clientId>/<nummer>:<exp>`.
 * Gilt für genau einen Patienten und höchstens drei Tage.
 */
export function befundLinkPruefen(q: URLSearchParams, schluessel: string, jetzt = Date.now()): { clientId: string; nummer: string } | null {
  const clientId = q.get('c') ?? '', nummer = q.get('p') ?? ''
  const [expRoh, sig] = (q.get('t') ?? '').split('.')
  const exp = Number(expRoh)
  if (!schluessel || !sig || !/^[A-Za-z0-9_-]{2,64}$/.test(clientId) || !/^\d{1,9}$/.test(nummer)) return null
  if (!Number.isFinite(exp) || exp * 1000 < jetzt || exp * 1000 > jetzt + 3 * 864e5) return null
  const soll = Buffer.from(createHmac('sha256', schluessel).update(`befund-flip:${clientId}/${nummer}:${exp}`).digest('base64url').slice(0, 24))
  const ist = Buffer.from(sig)
  return soll.length === ist.length && timingSafeEqual(soll, ist) ? { clientId, nummer } : null
}

// ---------- Live an die offenen Fenster der Praxis ----------

const hoerer = new Map<string, Set<ServerResponse>>()
/** Handy-Link: hört nur seinen Patienten */
const nurPatient = new WeakMap<ServerResponse, string>()

export function befundLive(mandant: string, res: ServerResponse, onClose: (f: () => void) => void, patient = '') {
  if (patient) nurPatient.set(res, patient)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 3000\n\n')
  if (!hoerer.has(mandant)) hoerer.set(mandant, new Set())
  hoerer.get(mandant)!.add(res)
  const puls = setInterval(() => { try { res.write(': puls\n\n') } catch { /* close räumt auf */ } }, 20_000)
  onClose(() => {
    clearInterval(puls)
    hoerer.get(mandant)?.delete(res)
  })
}

export function befundMelden(mandant: string, b: Befund01) {
  const zeile = `event: befund\ndata: ${JSON.stringify(befundAnsicht(b))}\n\n`
  for (const res of hoerer.get(mandant) ?? []) {
    const nur = nurPatient.get(res)
    if (nur && nur !== b.patient) continue
    try { res.write(zeile) } catch { /* Verbindung weg */ }
  }
}

export const befundHoerer = (mandant: string) => hoerer.get(mandant)?.size ?? 0
