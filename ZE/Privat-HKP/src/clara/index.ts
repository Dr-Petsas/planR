/**
 * Einstieg für MAS/Clara: privater Zahnersatz per Sprache. Auftrag, Befund und Rückfragen versteht die
 * HKP-Engine (gleiche Kürzel), gerechnet wird mit der Engine dieses Planers. `npm run build:engine` baut
 * daraus MAS-2/backend/src/vendor/privat-ze-engine.mjs.
 */
import { auftragVerstehen, planAusAuftrag, type Befund, type Rueckfrage } from '../../../HKP/src/engine/auftrag'
import { ALLE_ZAEHNE } from '../../../HKP/src/engine/zahnschema'
import type { HkpPlan } from '../../../HKP/src/types'
import { kalkulieren, type Kalkulation } from '../engine/berechnung'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../planNeu'
import type { Einstellungen, Patient, Plan, Zahn } from '../types'

export type { Befund, Rueckfrage, Kalkulation, Plan }

declare const __PRIVAT_ZE_ENGINE_STAND__: string | undefined
export const ENGINE_STAND = typeof __PRIVAT_ZE_ENGINE_STAND__ === 'string' ? __PRIVAT_ZE_ENGINE_STAND__ : 'dev'

export interface PrivatOptionen {
  patient?: Partial<Patient>
  /** Praxis-Standard, wenn der Auftrag kein System nennt */
  implantatSystem?: string
  einstellungen?: Partial<Einstellungen>
}

export interface PrivatZusammenfassung {
  kronen: string[]
  /** Brückenglieder (Teil von `ersetzt`) */
  glieder: string[]
  ersetzt: string[]
  teleskope: string[]
  implantatkronen: string[]
  verbindung?: string[]
  steg?: string[]
  ankerGesagt?: string
  haltung?: string
  kronenArt?: string
  abutmentWort?: string
  honorar: number
  /** Laborkosten mit MwSt. */
  labor: number
  material: number
  gesamt: number
}

export interface PrivatEntwurf {
  status: 'ok'
  plan: Plan
  kalkulation: Kalkulation
  zusammenfassung: PrivatZusammenfassung
  hinweise: string[]
}

// Vom HKP gelten nur die Annahmen zu Auftrag und Befund; Regel-Hinweise (Richtlinie, BEMA) und Preise sind Kasse
const AUS_DEM_AUFTRAG = /angenommen|cover-denture|passt nicht|all-on|druckknopf|kugelkopf|implantatsteg|galvano|tabletop|inlay|onlay|abutment|verschraub|zementier/i
const NUR_KASSE = /bonus|festzuschuss|härtefall|kasse|bema|richtlinie|hkp/i

const sortiert = (zs: string[]) => [...zs].sort((a, b) => ALLE_ZAEHNE.indexOf(a) - ALLE_ZAEHNE.indexOf(b))

/** Zahnschema des HKP-Entwurfs; ohne eigene Planung gilt dort die Regelversorgung (Zeile R) */
function zaehneAus(hkp: HkpPlan['zaehne']): Record<string, Zahn> {
  const ohneTp = Object.values(hkp).every((z) => !z.TP?.trim())
  const zaehne: Record<string, Zahn> = {}
  for (const [nr, z] of Object.entries(hkp)) {
    const B = (z.B ?? '').trim()
    const TP = ((ohneTp ? z.R : z.TP) ?? '').trim().toUpperCase()
    if (!B && !TP) continue
    zaehne[nr] = { B, TP, ...(!ohneTp && z.bAnfang ? { bAnfang: true } : {}), ...(!ohneTp && z.bEnde ? { bEnde: true } : {}) }
  }
  return zaehne
}

export function zusammenfassen(plan: Plan, k: Kalkulation): PrivatZusammenfassung {
  const mit = (re: RegExp) => sortiert(Object.entries(plan.zaehne).filter(([, z]) => re.test(z.TP)).map(([n]) => n))
  return {
    kronen: mit(/^(K|KV|KH|KVH|KM|KMH|PK|PKM|PKV|ZA|VE|VEK|I[1-4]|C[1-4]|ONK?)$/),
    glieder: mit(/^(B|BV|BM|SB|SBV|SBM|ZAB)$/),
    ersetzt: mit(/^(E|B|BV|BM)$/),
    teleskope: mit(/^S?T(?:2|Z)?[VM]?$/),
    implantatkronen: mit(/^(SK|ZAS)/),
    verbindung: mit(/^SO$/),
    steg: mit(/^SEO$/),
    ...(plan.ankerGesagt ? { ankerGesagt: plan.ankerGesagt } : {}),
    ...(plan.haltung ? { haltung: plan.haltung } : {}),
    ...(plan.kronenArt ? { kronenArt: plan.kronenArt } : {}),
    ...(plan.abutmentWort ? { abutmentWort: plan.abutmentWort } : {}),
    honorar: k.summeHonorar,
    labor: Math.round((k.summeLaborNetto + k.mwst) * 100) / 100,
    material: k.summeMaterial,
    gesamt: k.gesamt,
  }
}

/** Gesprochener Auftrag + Befund → gerechneter privater Kostenvoranschlag (ohne Nummer) oder Rückfrage */
export function privatZeEntwurf(auftragText: string, befund: Befund, optionen: PrivatOptionen = {}): PrivatEntwurf | Rueckfrage {
  const r = planAusAuftrag(auftragVerstehen(auftragText), befund, { implantatSystem: optionen.implantatSystem })
  if (r.status !== 'ok') return r
  const plan: Plan = {
    ...neuerPlan(1),
    nummer: '',
    patient: { ...neuerPlan(1).patient, ...optionen.patient },
    zaehne: zaehneAus(r.plan.zaehne),
    abformung: r.plan.abformung,
    abformungProthese: r.plan.abformungProthese,
    werkstoffe: { ...r.plan.werkstoffe },
  }
  if (r.plan.implantat) {
    plan.implantat = {
      ...plan.implantat,
      ...(r.plan.implantat.system ? { system: r.plan.implantat.system } : {}),
      ...(r.plan.implantat.abutment ? { abutment: r.plan.implantat.abutment } : {}),
      ...(r.plan.implantat.abformung === 'offen' || r.plan.implantat.abformung === 'geschlossen'
        ? { loeffel: r.plan.implantat.abformung } : {}),
    }
  }
  if (r.plan.einstellungen.ankerGesagt) plan.ankerGesagt = r.plan.einstellungen.ankerGesagt
  if (r.plan.einstellungen.haltung) plan.haltung = r.plan.einstellungen.haltung
  if (r.plan.einstellungen.kronenArt) plan.kronenArt = r.plan.einstellungen.kronenArt
  if (r.plan.einstellungen.abutmentWort) plan.abutmentWort = r.plan.einstellungen.abutmentWort
  const kalkulation = kalkulieren(plan, { ...STANDARD_EINSTELLUNGEN, ...optionen.einstellungen })
  const hinweise = r.hinweise.filter((h) => AUS_DEM_AUFTRAG.test(h) && !NUR_KASSE.test(h))
  return { status: 'ok', plan, kalkulation, zusammenfassung: zusammenfassen(plan, kalkulation), hinweise: [...hinweise, ...kalkulation.hinweise] }
}
