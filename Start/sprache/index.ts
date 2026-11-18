/**
 * KI-Zeile ohne Browser: derselbe Dienst wie in den Planern (kiPlan.ts), für Clara in MAS.
 * Ein Plan wird gelesen (blick), mit den Schritten des Modells geändert (anwenden) und neu bewertet
 * (betrag, pvs). Bauen: npm run build:sprache (Start) – das Bundle landet in MAS (src/vendor/plan-ki-engine.mjs).
 */
import type { KiSchritt, Meldung, PlanBlick, PlanKiDienst } from '../../ZE/HKP/src/planKi'
import { planPruefen } from '../../ZE/HKP/src/pruefung'

import { hkpKi } from '../../ZE/HKP/src/kiPlan'
import { listenFuer, rechnen as hkpRechnen, type PraxisListen } from '../../ZE/HKP/src/clara'
import { leererPlan as hkpNeu } from '../../ZE/HKP/src/store/plan'

import { zeKi } from '../../ZE/Privat-HKP/src/kiPlan'
import { kalkulieren as zeKalk } from '../../ZE/Privat-HKP/src/engine/berechnung'
import { pvsPlaene as zePvs } from '../../ZE/Privat-HKP/src/engine/pvs'
import { STANDARD_EINSTELLUNGEN as ZE_E, neuerPlan as zeNeu } from '../../ZE/Privat-HKP/src/planNeu'

import { implKi } from '../../Implantologie/Privat-Impl/src/kiPlan'
import { kalkulieren as implKalk } from '../../Implantologie/Privat-Impl/src/engine/berechnung'
import { pvsPlaene as implPvs } from '../../Implantologie/Privat-Impl/src/engine/pvs'
import { STANDARD_EINSTELLUNGEN as IMPL_E, neuerPlan as implNeu } from '../../Implantologie/Privat-Impl/src/planNeu'

import { mkvKi } from '../../KONS/MKV/src/kiPlan'
import { rechnen as mkvRechnen } from '../../KONS/MKV/src/engine/mkv'
import { pvsPlaene as mkvPvs } from '../../KONS/MKV/src/engine/pvs'
import { STANDARD_EINSTELLUNGEN as MKV_E, neuerPlan as mkvNeu } from '../../KONS/MKV/src/planNeu'

import { konsKi } from '../../KONS/Privat-Kons/src/kiPlan'
import { rechnen as konsRechnen } from '../../KONS/Privat-Kons/src/engine/kons'
import { pvsPlaene as konsPvs } from '../../KONS/Privat-Kons/src/engine/pvs'
import { STANDARD_EINSTELLUNGEN as KONS_E, neuerPlan as konsNeu } from '../../KONS/Privat-Kons/src/planNeu'

import { parKi as kparKi } from '../../PAR/Kassen-PAR/src/kiPlan'
import { preiseAus, streckeRechnen } from '../../PAR/Kassen-PAR/src/engine/leistungen'
import { ermittlePunktwert } from '../../PAR/Kassen-PAR/src/punktwerte'
import { STANDARD_EINSTELLUNGEN as KPAR_E, neuerFall as kparNeu } from '../../PAR/Kassen-PAR/src/store'

import { parKi as pparKi } from '../../PAR/Privat-PAR/src/kiPlan'
import { rechnen as pparRechnen } from '../../PAR/Privat-PAR/src/engine/par'
import { STANDARD_EINSTELLUNGEN as PPAR_E, neuerPlan as pparNeu } from '../../PAR/Privat-PAR/src/store'

import { kbKi as kkbKi } from '../../KB/Kassen-KB/src/kiPlan'
import { rechnen as kkbRechnen } from '../../KB/Kassen-KB/src/engine/kb'
import { STANDARD_EINSTELLUNGEN as KKB_E, neuerPlan as kkbNeu } from '../../KB/Kassen-KB/src/store'

import { kbKi as pkbKi } from '../../KB/Privat-KB/src/kiPlan'
import { rechnen as pkbRechnen } from '../../KB/Privat-KB/src/engine/kb'
import { pvsPlaene as pkbPvs } from '../../KB/Privat-KB/src/engine/pvs'
import { STANDARD_EINSTELLUNGEN as PKB_E, neuerPlan as pkbNeu } from '../../KB/Privat-KB/src/store'

import { kfoKi as kkfoKi } from '../../KFO/Kassen-KFO/src/kiPlan'
import { rechnen as kkfoRechnen } from '../../KFO/Kassen-KFO/src/engine/kfo'
import { STANDARD_EINSTELLUNGEN as KKFO_E, neuerPlan as kkfoNeu } from '../../KFO/Kassen-KFO/src/store'

import { kfoKi as pkfoKi } from '../../KFO/Privat-KFO/src/kiPlan'
import { rechnen as pkfoRechnen } from '../../KFO/Privat-KFO/src/engine/kfo'
import { STANDARD_EINSTELLUNGEN as PKFO_E, neuerPlan as pkfoNeu } from '../../KFO/Privat-KFO/src/store'

declare const __SPRACHE_STAND__: string
export const ENGINE_STAND = typeof __SPRACHE_STAND__ === 'string' ? __SPRACHE_STAND__ : 'dev'

/* eslint-disable @typescript-eslint/no-explicit-any */
type P = any
type E = any

interface Modul {
  /** wie der Plan in den Sätzen heißt */
  text: string
  standard: E
  dienst: (lesen: () => { plan: P; einst: E; gesperrt: boolean }, schreiben: (plan: P) => void) => PlanKiDienst
  betrag: (plan: P, einst: E) => number
  pvs?: (plan: P, einst: E) => unknown[]
  /** leerer Plan, wie ihn der Planer bei „Neu“ anlegt */
  neu: (einst: E) => P
}

const kparPreise = (fall: P, einst: E) => {
  const kassenart = fall?.patient?.kassenart
  const pw = (bereich: 'PAR' | 'KCH') => ermittlePunktwert({ bereich, praxis: einst.praxis, kassenart, fest: einst.punktwertFest?.[bereich] }).wert
  return preiseAus(einst, pw('PAR'), pw('KCH'))
}

const MODULE: Record<string, Modul> = {
  hkp: {
    neu: () => hkpNeu(),
    text: 'Heil- und Kostenplan', standard: {} as PraxisListen,
    dienst: (lesen, schreiben) => hkpKi(() => {
      const { plan, einst, gesperrt } = lesen()
      return { plan, ergebnis: hkpRechnen(plan, einst), listen: listenFuer(plan, einst), gesperrt, praxis: einst }
    }, schreiben),
    betrag: (plan, einst) => hkpRechnen(plan, einst).summen.eigenanteil,
  },
  'privat-kv': {
    neu: () => zeNeu(0),
    text: 'Kostenvoranschlag Zahnersatz', standard: ZE_E,
    dienst: (lesen, schreiben) => zeKi(lesen, schreiben),
    betrag: (plan, einst) => zeKalk(plan, einst).gesamt,
    pvs: (plan, einst) => zePvs(plan, zeKalk(plan, einst)),
  },
  'privat-impl': {
    neu: () => implNeu(0),
    text: 'Kostenvoranschlag Implantologie', standard: IMPL_E,
    dienst: (lesen, schreiben) => implKi(lesen, schreiben),
    betrag: (plan, einst) => implKalk(plan, einst).gesamt,
    pvs: (plan, einst) => implPvs(plan, implKalk(plan, einst)),
  },
  'kons-mkv': {
    neu: (e) => mkvNeu('', e),
    text: 'Füllungs-Mehrkostenvereinbarung', standard: MKV_E,
    dienst: (lesen, schreiben) => mkvKi(lesen, schreiben),
    betrag: (plan, einst) => mkvRechnen(plan, einst).mehrkosten,
    pvs: (plan, einst) => mkvPvs(plan, mkvRechnen(plan, einst)),
  },
  'privat-kons': {
    neu: (e) => konsNeu('', e),
    text: 'Kostenvoranschlag Kons', standard: KONS_E,
    dienst: (lesen, schreiben) => konsKi(lesen, schreiben),
    betrag: (plan, einst) => konsRechnen(plan, einst).summe,
    pvs: (plan, einst) => konsPvs(plan, konsRechnen(plan, einst)),
  },
  'kassen-par': {
    neu: () => kparNeu(0),
    text: 'PAR-Plan', standard: KPAR_E,
    dienst: (lesen, schreiben) => kparKi(() => {
      const { plan, einst, gesperrt } = lesen()
      return { fall: plan, gesperrt, preise: kparPreise(plan, einst), einst }
    }, schreiben),
    betrag: (plan, einst) => streckeRechnen(plan, kparPreise(plan, einst)).summe,
  },
  'privat-par': {
    neu: (e) => pparNeu('', e),
    text: 'Kostenvoranschlag Parodontologie', standard: PPAR_E,
    dienst: (lesen, schreiben) => pparKi(lesen, schreiben),
    betrag: (plan) => pparRechnen(plan).gesamt,
  },
  'kassen-kb': {
    neu: (e) => kkbNeu('', e),
    text: 'Kassenplan Schiene', standard: KKB_E,
    dienst: (lesen, schreiben) => kkbKi(lesen, schreiben),
    betrag: (plan, einst) => kkbRechnen(plan, einst).gesamt,
  },
  'privat-kb': {
    neu: (e) => pkbNeu('', e),
    text: 'Kostenvoranschlag Schiene', standard: PKB_E,
    dienst: (lesen, schreiben) => pkbKi(lesen, schreiben),
    betrag: (plan, einst) => pkbRechnen(plan, einst).gesamt,
    pvs: (plan, einst) => pkbPvs(plan, pkbRechnen(plan, einst)),
  },
  'kassen-kfo': {
    neu: (e) => kkfoNeu('', e),
    text: 'KFO-Kassenplan', standard: KKFO_E,
    dienst: (lesen, schreiben) => kkfoKi(lesen, schreiben),
    betrag: (plan, einst) => kkfoRechnen(plan, einst).gesamt,
  },
  'privat-kfo': {
    neu: (e) => pkfoNeu('', e),
    text: 'Kostenvoranschlag Kieferorthopädie', standard: PKFO_E,
    dienst: (lesen, schreiben) => pkfoKi(lesen, schreiben),
    betrag: (plan, einst) => pkfoRechnen(plan, einst).gesamt,
  },
}

export const MODULE_NAMEN: Record<string, string> = Object.fromEntries(Object.entries(MODULE).map(([k, m]) => [k, m.text]))
export const kennt = (modul: string) => !!MODULE[modul]

/** Einstellungen der Praxis über den Vorgaben des Planers (fehlt etwas, gilt die Vorgabe). */
function einstVon(m: Modul, einst: unknown): E {
  if (!einst || typeof einst !== 'object' || Array.isArray(einst)) return m.standard
  const s = m.standard as Record<string, unknown>
  const e = einst as Record<string, unknown>
  const aus: Record<string, unknown> = { ...s, ...e }
  for (const k of Object.keys(s)) {
    const a = s[k], b = e[k]
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) aus[k] = { ...(a as object), ...(b as object) }
  }
  return aus
}

const offen = (h: Meldung[]) => h.filter((x) => x.stufe !== 'info')

export interface Zug { wer: 'ich' | 'clara'; text: string }
export interface Antwort { ok: boolean; antwort?: string; message?: string; schritte?: KiSchritt[]; pruefung?: boolean; frage?: string }
export interface Lauf {
  plan: P
  geaendert: boolean
  /** was die KI-Zeile gesagt hätte */
  text: string
  getan: string[]
  nicht: string[]
  frage: string
  betrag: number
  pvs?: unknown[]
}

/** Stand des Plans, wie ihn das Modell sieht. */
export function blick(modul: string, plan: P, einst?: unknown, gesperrt = false): PlanBlick {
  const m = MODULE[modul]
  if (!m) throw new Error(`modul_unbekannt: ${modul}`)
  const e = einstVon(m, einst)
  const b = m.dienst(() => ({ plan, einst: e, gesperrt }), () => {}).lesen()
  return { ...b, hinweise: b.hinweise.length ? b.hinweise : planPruefen(b.positionen, { begruendung: true }) }
}

/** Leerer Plan des Planers (die Nummer vergibt PlanR). */
export function neu(modul: string, einst?: unknown): P {
  const m = MODULE[modul]
  if (!m) throw new Error(`modul_unbekannt: ${modul}`)
  return m.neu(einstVon(m, einst))
}

export function bewerten(modul: string, plan: P, einst?: unknown): { betrag: number; pvs?: unknown[] } {
  const m = MODULE[modul]
  if (!m) throw new Error(`modul_unbekannt: ${modul}`)
  const e = einstVon(m, einst)
  const betrag = Number(m.betrag(plan, e)) || 0
  let pvs: unknown[] | undefined
  try { pvs = m.pvs?.(plan, e) } catch { pvs = undefined }
  return { betrag, ...(pvs ? { pvs } : {}) }
}

/**
 * Ein Satz an die KI-Zeile, mit demselben Ablauf wie in der Startseite: lesen, fragen, Schritte anwenden,
 * Prüfmodul, bis zu drei Runden. `fragen` ist der Zug gegen das Modell (MAS: planKiZug).
 */
export async function lauf(o: {
  modul: string
  plan: P
  einst?: unknown
  gesperrt?: boolean
  text: string
  verlauf?: Zug[]
  fragen: (body: { text: string; blick: PlanBlick; verlauf: Zug[]; nachlauf?: { runde: number; getan: string[]; nicht: string[] } }) => Promise<Antwort>
}): Promise<Lauf> {
  const m = MODULE[o.modul]
  if (!m) throw new Error(`modul_unbekannt: ${o.modul}`)
  const e = einstVon(m, o.einst)
  const gesperrt = !!o.gesperrt
  const lesen = (plan: P): PlanBlick => {
    const b = m.dienst(() => ({ plan, einst: e, gesperrt }), () => {}).lesen()
    return { ...b, hinweise: b.hinweise.length ? b.hinweise : planPruefen(b.positionen, { begruendung: true }) }
  }
  const anwenden = (plan: P, schritte: KiSchritt[]) => {
    let neu = plan
    const r = m.dienst(() => ({ plan, einst: e, gesperrt }), (p) => { neu = p }).aendern(schritte)
    return { plan: neu, getan: r.getan, nicht: r.nicht }
  }
  let plan = o.plan
  let b = lesen(plan)
  const teile: string[] = []
  const getanAlle: string[] = []
  const nichtAlle: string[] = []
  let frage = ''
  let nachlauf: { runde: number; getan: string[]; nicht: string[] } | undefined
  const verlauf = (o.verlauf ?? []).slice(-6)
  for (let runde = 1; runde <= 3; runde++) {
    const d = await o.fragen({ text: o.text, blick: b, verlauf, ...(nachlauf ? { nachlauf } : {}) })
    if (!d.ok || !d.antwort) {
      if (runde === 1) teile.push(d.message || 'Dazu habe ich gerade keine Antwort.')
      break
    }
    const schritte = Array.isArray(d.schritte) ? d.schritte : []
    if (d.frage) frage = d.frage
    const angesagt = !d.pruefung || (runde === 1 && !schritte.length && !d.frage) ? teile.push(d.antwort) - 1 : -1
    if (!schritte.length) break
    const a = anwenden(plan, schritte)
    nichtAlle.push(...a.nicht)
    if (!a.getan.length && angesagt >= 0) teile.splice(angesagt, 1)
    if (!a.getan.length) break
    getanAlle.push(...a.getan)
    plan = a.plan
    b = lesen(plan)
    const wartet = (h: Meldung) => !!frage && (h.art === 'doppelt' || h.art === 'ausschluss')
    if (!d.pruefung || !offen(b.hinweise.filter((h) => !wartet(h))).length) break
    nachlauf = { runde: runde + 1, getan: a.getan, nicht: a.nicht }
  }
  if (getanAlle.length) teile.push(`Im Plan geändert: ${getanAlle.join('; ')}.`)
  for (const n of nichtAlle) teile.push(n)
  if (frage) teile.push(frage)
  const geaendert = getanAlle.length > 0
  return { plan, geaendert, text: teile.join(' '), getan: getanAlle, nicht: nichtAlle, frage, ...bewerten(o.modul, plan, e) }
}
