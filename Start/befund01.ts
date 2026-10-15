/**
 * Aktueller 01-Befund je Patient (Chef 15.10.2026): das Neueste aus dem Praxisprogramm plus das, was im
 * Gespräch mit der Assistentin geändert und noch nicht ins Praxisprogramm übernommen wurde. PlanR zeigt ihn
 * auf der Befundseite und im HKP-Planer und schickt jede Änderung sofort an alle offenen Fenster der Praxis.
 */
import type { ServerResponse } from 'node:http'

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
}

/** Was angezeigt wird und für den nächsten Plan gilt */
export const zaehneAktuell = (b: Befund01) => ({ ...b.pvsZaehne, ...b.offen })

/** Gesprochene Kürzel klein (eHKP), Kürzel aus dem Praxisprogramm unverändert */
const nurZaehne = (z: Record<string, unknown>, klein = true) =>
  Object.fromEntries(Object.entries(z).filter(([k, v]) => ALLE.has(k) && String(v ?? '').trim().length <= 6).map(([k, v]) => {
    const c = String(v ?? '').trim()
    return [k, klein ? c.toLowerCase() : c]
  }))

const gleich = (a: Record<string, string>, b: Record<string, string>) =>
  [...ALLE].every((z) => (a[z] ?? '') === (b[z] ?? ''))

/** Nach dem Lesen aus dem Praxisprogramm: offene Änderungen, die dort inzwischen genauso stehen, sind erledigt. */
export function nachLesen(alt: Befund01 | undefined, l: { patient: string; label?: string; geburt?: string; pvs: string; zaehne: Record<string, string>; datum: string }, jetzt = new Date().toISOString()): Befund01 {
  const pvsZaehne = nurZaehne(l.zaehne, false)
  const offen = Object.fromEntries(Object.entries(alt?.offen ?? {}).filter(([z, c]) => (pvsZaehne[z] ?? '') !== c))
  const vorher = alt ? zaehneAktuell(alt) : null
  const b: Befund01 = {
    patient: l.patient, label: l.label || alt?.label || '', geburt: l.geburt || alt?.geburt || '', pvs: l.pvs,
    pvsZaehne, pvsDatum: l.datum, offen, offenWer: Object.keys(offen).length ? alt?.offenWer ?? '' : '',
    gelesen: jetzt, geschrieben: alt?.geschrieben ?? '', stand: alt?.stand ?? jetzt,
  }
  if (!vorher || !gleich(vorher, zaehneAktuell(b))) b.stand = jetzt
  return b
}

/** Änderung aus dem Gespräch (oder in PlanR): einzelne Zähne; was dem Praxisprogramm entspricht, ist nicht offen. */
export function nachAenderung(alt: Befund01, zaehne: Record<string, unknown>, wer: string, jetzt = new Date().toISOString()): Befund01 {
  const offen = { ...alt.offen, ...nurZaehne(zaehne) }
  for (const [z, c] of Object.entries(offen)) if ((alt.pvsZaehne[z] ?? '') === c) delete offen[z]
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
  }
}
export type BefundAnsicht = ReturnType<typeof befundAnsicht>

// ---------- Live an die offenen Fenster der Praxis ----------

const hoerer = new Map<string, Set<ServerResponse>>()

export function befundLive(mandant: string, res: ServerResponse, onClose: (f: () => void) => void) {
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
    try { res.write(zeile) } catch { /* Verbindung weg */ }
  }
}

export const befundHoerer = (mandant: string) => hoerer.get(mandant)?.size ?? 0
