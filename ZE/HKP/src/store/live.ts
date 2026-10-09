import type { HkpPlan } from '../types'
import { ALLE_ZAEHNE } from '../engine/zahnschema'
import { planNormalisieren } from './plan'

/** Fenstertitel im Live-Modus – MAS holt das Fenster darüber nach vorn (backend/src/hkp/live.js) */
export const LIVE_TITEL = 'Clara plant live'

export interface LivePatient {
  id: string
  label: string
  name: string
  vorname: string
  geburtsdatum: string
}

/** Stand, den MAS beim Anlegen per Sprache meldet */
export interface LiveStand {
  vorgang: string
  seq: number
  phase: 'patient' | 'befund' | 'plan' | 'angelegt'
  patient: LivePatient | null
  befund: Record<string, string> | null
  plan: Partial<HkpPlan> | null
  hkpId: string
  meldung: string
  auftragText?: string
  at: number
}

export const PHASE_TEXT: Record<LiveStand['phase'], string> = {
  patient: 'Patient gewählt',
  befund: 'Befund wird eingetragen',
  plan: 'Planung wird eingetragen',
  angelegt: 'angelegt – wartet auf Freigabe',
}

export const liveModus = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('live') === '1'

/** Zielplan des Stands: fertige Planung oder der bisherige Plan mit Patient und Befund */
export function liveZiel(von: HkpPlan, s: LiveStand): HkpPlan {
  if (s.plan) return planNormalisieren(s.plan)
  const patient = s.patient ? { ...von.patient, name: s.patient.name, vorname: s.patient.vorname, geburtsdatum: s.patient.geburtsdatum } : von.patient
  const zaehne = s.befund
    ? Object.fromEntries(ALLE_ZAEHNE.map((z) => [z, { ...von.zaehne[z], B: s.befund?.[z] ?? '' }]))
    : von.zaehne
  return { ...von, patient, zaehne }
}

const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Zwischenstände zum Mitlesen: erst Patient, dann der Befund Zahn für Zahn,
 * dann die Planung Zahn für Zahn, zuletzt alles Übrige (Positionen, Ausführung …).
 */
export function liveSchritte(von: HkpPlan, s: LiveStand): HkpPlan[] {
  const ziel = liveZiel(von, s)
  const schritte: HkpPlan[] = []
  let p = von
  const weiter = (n: HkpPlan) => { p = n; schritte.push(n) }
  if (!gleich(p.patient, ziel.patient)) weiter({ ...p, patient: ziel.patient })
  for (const z of ALLE_ZAEHNE) {
    if (p.zaehne[z].B !== ziel.zaehne[z].B) weiter({ ...p, zaehne: { ...p.zaehne, [z]: { ...p.zaehne[z], B: ziel.zaehne[z].B } } })
  }
  for (const z of ALLE_ZAEHNE) {
    if (!gleich(p.zaehne[z], ziel.zaehne[z])) weiter({ ...p, zaehne: { ...p.zaehne, [z]: ziel.zaehne[z] } })
  }
  if (!gleich(p, ziel)) weiter(ziel)
  return schritte
}

/** Abo über den PlanR-Proxy; den Praxisschlüssel trägt der Proxy nur am Praxis-PC ein. */
export function liveAbonnieren(onStand: (s: LiveStand) => void, onVerbindung: (an: boolean) => void): () => void {
  const quelle = new EventSource('/mas/planr/live')
  quelle.onopen = () => onVerbindung(true)
  quelle.onerror = () => onVerbindung(false)
  quelle.onmessage = (ev) => {
    try {
      onStand(JSON.parse(ev.data) as LiveStand)
    } catch { /* unvollständige Meldung überspringen */ }
  }
  return () => quelle.close()
}
