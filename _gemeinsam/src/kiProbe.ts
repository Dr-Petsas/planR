/**
 * Probe der KI-Zeile gegen das echte Modell: derselbe Ablauf wie in der Startseite (lesen, fragen,
 * Schritte anwenden, Prüfmodul, bis zu drei Runden), nur ohne Fenster.
 * Läuft nur mit VITE_KI_LIVE=1 und dem Probe-Dienst aus MAS (node scripts/plan-ki-probe.mjs).
 */
import type { KiSchritt, Meldung, PlanBlick, PlanKiDienst } from './planKi'
import { planPruefen } from './pruefung'
import { nurLeerlauf } from './arbeitClient'

export const KI_LIVE = !!import.meta.env.VITE_KI_LIVE
const ZIEL = import.meta.env.VITE_KI_LIVE_URL || 'http://127.0.0.1:4011'

interface Antwort { ok: boolean; antwort?: string; message?: string; schritte?: KiSchritt[]; pruefung?: boolean; frage?: string; verworfen?: number }
export interface ProbeZug { wer: 'ich' | 'clara'; text: string }

export interface ProbeErgebnis<P> {
  plan: P
  blick: PlanBlick
  /** Alles, was die Zeile gesagt hätte, in einem Text. */
  text: string
  schritte: KiSchritt[]
  getan: string[]
  nicht: string[]
  frage: string
  verlauf: ProbeZug[]
}

/** Blick und Anwenden aus dem Dienst eines Planers, wie die Seite ihn anmeldet (für Planer ohne eigene Blick-Funktion). */
export function probeDienst<P>(bau: (lesen: () => P, schreiben: (plan: P) => void) => PlanKiDienst) {
  return {
    blick: (plan: P): PlanBlick => bau(() => plan, () => {}).lesen(),
    anwenden: (plan: P, schritte: KiSchritt[]) => {
      let neu = plan
      const r = bau(() => plan, (p) => { neu = p }).aendern(schritte)
      return { plan: neu, getan: r.getan, nicht: r.nicht }
    },
  }
}

/**
 * Eine Sitzung wie im geöffneten Planer: derselbe Dienst über mehrere Züge, damit »zurück« den Stand
 * vor der letzten Änderung kennt. `plan()` liefert den aktuellen Plan.
 */
export function probeSitzung<P>(bau: (lesen: () => P, schreiben: (plan: P) => void) => PlanKiDienst, start: P) {
  let plan = start
  const d = bau(() => plan, (p) => { plan = p })
  return {
    plan: () => plan,
    blick: (_: P): PlanBlick => d.lesen(),
    anwenden: (_: P, schritte: KiSchritt[]) => {
      const r = d.aendern(schritte)
      return { plan, getan: r.getan, nicht: r.nicht }
    },
  }
}

const offen = (h: Meldung[]) => h.filter((x) => x.stufe !== 'info')

export async function kiProbe<P>(o: {
  plan: P
  text: string
  blick: (plan: P) => PlanBlick
  anwenden: (plan: P, schritte: KiSchritt[]) => { plan: P; getan: string[]; nicht: string[] }
  verlauf?: ProbeZug[]
  begruendung?: boolean
}): Promise<ProbeErgebnis<P>> {
  const lesen = (plan: P): PlanBlick => {
    const b = o.blick(plan)
    // Wie live: Prüfmodul-Meldungen mit Art/ids; fehlt das Widget, prüft die Probe selbst.
    const pruef = planPruefen(b.positionen, { begruendung: o.begruendung ?? true })
    return { ...b, hinweise: b.hinweise.some((h) => h.art && h.ids?.length) ? b.hinweise : (pruef.length ? pruef : b.hinweise) }
  }
  let plan = o.plan
  let blick = lesen(plan)
  const teile: string[] = []
  const schritteAlle: KiSchritt[] = []
  const getanAlle: string[] = []
  const nichtAlle: string[] = []
  let frage = ''
  let leerlauf: string[] = []
  let nachlauf: { runde: number; getan: string[]; nicht: string[] } | undefined
  for (let runde = 1; runde <= 3; runde++) {
    const r = await fetch(ZIEL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: o.text, blick, verlauf: (o.verlauf ?? []).slice(-6), ...(nachlauf ? { nachlauf } : {}) }) })
    const d = (await r.json()) as Antwort
    if (!d.ok || !d.antwort) {
      if (runde === 1) teile.push(d.message || 'keine Antwort')
      break
    }
    const schritte = Array.isArray(d.schritte) ? d.schritte : []
    if (d.frage) frage = d.frage
    const angesagt = !d.pruefung || (runde === 1 && !schritte.length && !d.frage) ? teile.push(d.antwort) - 1 : -1
    if (!schritte.length) {
      if (leerlauf.length && angesagt < 0) nichtAlle.push(...leerlauf)
      break
    }
    schritteAlle.push(...schritte)
    const a = o.anwenden(plan, schritte)
    // Wie die Startseite: hat der Plan nichts übernommen, zählt sein Grund und nicht die Ankündigung.
    if (!a.getan.length && angesagt >= 0) teile.splice(angesagt, 1)
    if (!leerlauf.length && runde < 3 && nurLeerlauf(a.getan, a.nicht)) {
      leerlauf = a.nicht
      nachlauf = { runde: runde + 1, getan: a.getan, nicht: a.nicht }
      continue
    }
    nichtAlle.push(...a.nicht)
    if (!a.getan.length) break
    getanAlle.push(...a.getan)
    plan = a.plan
    blick = lesen(plan)
    const wartet = (h: Meldung) => !!frage && (h.art === 'doppelt' || h.art === 'ausschluss')
    if (!d.pruefung || !offen(blick.hinweise.filter((h) => !wartet(h))).length) break
    nachlauf = { runde: runde + 1, getan: a.getan, nicht: a.nicht }
  }
  if (getanAlle.length) teile.push(`Im Plan geändert: ${getanAlle.join('; ')}.`)
  for (const n of nichtAlle) teile.push(n)
  if (frage) teile.push(frage)
  const text = teile.join(' ')
  console.log(`\n» ${o.text}\n« ${text}\n`)
  return { plan, blick, text, schritte: schritteAlle, getan: getanAlle, nicht: nichtAlle, frage, verlauf: [...(o.verlauf ?? []), { wer: 'ich', text: o.text }, { wer: 'clara', text }] }
}
