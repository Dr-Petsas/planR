/**
 * Preisregler auf einen Wunsch-Eigenanteil stellen (Clara: „Wo soll der Eigenanteil landen?“).
 * Reihenfolge wie vom Chef vorgegeben: erst GOZ (Zusatzleistungen, dann Faktor), zuletzt Eigenlabor
 * (BEL-Prozent, Kasse → Privat, BEB-Aufschlag). Untergrenze: alle Regler unten, BEL ab 50 %.
 */
import type { HkpPlan } from '../types'
import { BEB_AUFSCHLAG_MAX, GOZ_HOECHSTSATZ, GOZ_SCHWELLENWERT, berechnen, type Ergebnis } from '../engine/berechnung'
import { ZUSATZ_STUFEN } from '../engine/zusatzleistungen'
import { PRIVAT_STUFE_MAX, privatStufeAnwenden } from '../engine/aufwertung'
import { planNormalisieren } from '../store/plan'
import { listenFuer, type PraxisListen } from './index'

export const EIGEN_KASSE_MIN = 50

export interface ReglerStand {
  gozZusatzStufe: number
  /** 0 = Regler aus (Faktor laut Einstellungen) */
  honorarFaktor: number
  eigenKasseProzent: number
  eigenPrivatStufe: number
  eigenPrivatAufschlag: number
}

export interface ZielpreisErgebnis {
  plan: HkpPlan
  ergebnis: Ergebnis
  stand: ReglerStand
  eigenanteil: number
  min: number
  max: number
  ziel: number
  /** Wunsch lag außerhalb der Spanne – genommen wurde das nächste Ende */
  unterMin: boolean
  ueberMax: boolean
  hinweise: string[]
}

const runden = (n: number) => Math.round(n * 10) / 10

function pfad(plan: HkpPlan, mitBel: boolean): ReglerStand[] {
  const e = plan.einstellungen
  const fMin = Math.min(e.gozFaktor, GOZ_SCHWELLENWERT)
  const kasseMin = mitBel ? EIGEN_KASSE_MIN : 100
  const s: ReglerStand = { gozZusatzStufe: 0, honorarFaktor: 0, eigenKasseProzent: kasseMin, eigenPrivatStufe: 0, eigenPrivatAufschlag: 0 }
  const out: ReglerStand[] = [{ ...s }]
  for (let z = 1; z < ZUSATZ_STUFEN.length; z++) out.push({ ...s, gozZusatzStufe: (s.gozZusatzStufe = z) })
  for (let f = runden(fMin + 0.1); f <= GOZ_HOECHSTSATZ + 1e-9; f = runden(f + 0.1)) out.push({ ...s, honorarFaktor: (s.honorarFaktor = f) })
  for (let k = kasseMin + 1; k <= 100; k++) out.push({ ...s, eigenKasseProzent: (s.eigenKasseProzent = k) })
  for (let p = 1; p <= PRIVAT_STUFE_MAX; p++) out.push({ ...s, eigenPrivatStufe: (s.eigenPrivatStufe = p) })
  for (let a = 1; a <= BEB_AUFSCHLAG_MAX; a++) out.push({ ...s, eigenPrivatAufschlag: (s.eigenPrivatAufschlag = a) })
  return out
}

function rechner(planRoh: HkpPlan, praxis: PraxisListen) {
  const plan = planNormalisieren(planRoh)
  const listen = listenFuer(plan, praxis)
  const ohnePrivat = (plan.einstellungen.eigenPrivatStufe ?? 0) > 0 ? privatStufeAnwenden(plan, 0).plan : plan
  const privat = new Map<number, { plan: HkpPlan; hinweise: string[] }>()
  const stufenPlan = (stufe: number) => {
    if (stufe === 0) return { plan: ohnePrivat, hinweise: [] }
    if (!privat.has(stufe)) privat.set(stufe, privatStufeAnwenden(ohnePrivat, stufe))
    return privat.get(stufe)!
  }
  return (s: ReglerStand) => {
    const b = stufenPlan(s.eigenPrivatStufe)
    const p: HkpPlan = { ...b.plan, einstellungen: { ...b.plan.einstellungen, ...s } }
    return { plan: p, ergebnis: berechnen(p, listen), hinweise: b.hinweise }
  }
}

/** BEL unter 100 % nur, wenn das Eigenlabor überhaupt BEL-Positionen fertigt (sonst bliebe der Regler sinnlos verstellt) */
function stufenUndRechner(planRoh: HkpPlan, praxis: PraxisListen) {
  const plan = planNormalisieren(planRoh)
  const r = rechner(plan, praxis)
  const mitBel = r(pfad(plan, false)[0]).ergebnis.positionen.some((p) => p.ebene === 'BEL' && p.labor === 'eigen')
  return { stufen: pfad(plan, mitBel), r }
}

/** Billigstes und teuerstes Ende des Eigenanteils */
export function preisSpanne(plan: HkpPlan, praxis: PraxisListen = {}): { min: number; max: number } {
  const { stufen, r } = stufenUndRechner(plan, praxis)
  const preise = [stufen[0], stufen[stufen.length - 1]].map((s) => r(s).ergebnis.summen.eigenanteil)
  return { min: Math.min(...preise), max: Math.max(...preise) }
}

/** Regler so stellen, dass der Eigenanteil dem Wunsch am nächsten kommt (bei Gleichstand der niedrigere Reglerstand) */
export function aufZielpreis(plan: HkpPlan, ziel: number, praxis: PraxisListen = {}): ZielpreisErgebnis {
  const { stufen, r } = stufenUndRechner(plan, praxis)
  let beste: ReturnType<typeof r> & { stand: ReglerStand } | undefined
  let min = Infinity, max = -Infinity
  for (const s of stufen) {
    const x = r(s)
    const preis = x.ergebnis.summen.eigenanteil
    min = Math.min(min, preis)
    max = Math.max(max, preis)
    if (!beste || Math.abs(preis - ziel) < Math.abs(beste.ergebnis.summen.eigenanteil - ziel) - 0.005) beste = { ...x, stand: s }
  }
  const b = beste!
  return {
    plan: b.plan, ergebnis: b.ergebnis, stand: b.stand, eigenanteil: b.ergebnis.summen.eigenanteil,
    min, max, ziel, unterMin: ziel < min - 0.005, ueberMax: ziel > max + 0.005, hinweise: b.hinweise,
  }
}
