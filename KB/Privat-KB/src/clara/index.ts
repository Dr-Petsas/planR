/**
 * Einstieg für MAS/Clara: Kostenvoranschlag Schiene per Sprache. Der Auftrag kommt schon geordnet an
 * (welche Vorlagen, welcher Abformweg) – was der gesprochene Satz bedeutet, entscheidet das Modell, hier wird
 * kein Satz zerlegt. Gerechnet wird mit der Engine dieses Planers, eingefügt wird wie beim Klick auf die Vorlage.
 * `npm run build:engine` baut daraus MAS-2/backend/src/vendor/privat-kb-engine.mjs.
 */
import { VORLAGEN } from '../data/katalog'
import { euro, rechnen, vorlageEinfuegen } from '../engine/kb'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../store'
import type { Abformung, Einstellungen, Patient, Plan, Rechnung } from '../types'

export type { Plan, Rechnung }

declare const __PKB_ENGINE_STAND__: string | undefined
export const ENGINE_STAND = typeof __PKB_ENGINE_STAND__ === 'string' ? __PKB_ENGINE_STAND__ : 'dev'

/** Alles, was der Planer als Vorlage führt – die Auswahl für das Werkzeug. */
export const KB_VORLAGEN = VORLAGEN.map((v) => ({ id: v.id, gruppe: v.gruppe, titel: v.titel, text: v.text }))

export interface KbAuftrag {
  /** IDs aus KB_VORLAGEN, in der genannten Reihenfolge */
  vorlagen?: string[]
  abformung?: Abformung | ''
  diagnose?: string
}

export interface KbOptionen {
  patient?: Partial<Patient>
  einstellungen?: Partial<Einstellungen>
}

export interface Rueckfrage {
  status: 'rueckfrage'
  grund: 'vorlage'
  frage: string
}

export interface KbZusammenfassung {
  titel: string[]
  abformung: Abformung
  /** Gesamtbetrag einschließlich Labor und MwSt. */
  summe: number
  honorar: number
  /** Labor und Material einschließlich MwSt. */
  labor: number
}

export interface KbEntwurf {
  status: 'ok'
  plan: Plan
  /** Für die Ablage: ohne Regler, damit der Planer mit den Faktoren der Praxis rechnet */
  ablagePlan: Omit<Plan, 'regler'>
  rechnung: Rechnung
  zusammenfassung: KbZusammenfassung
  hinweise: string[]
}

const runden = (x: number) => Math.round(x * 100) / 100
const liste = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} und ${a[a.length - 1]}`)

const WAHL = 'Welche Schiene soll es sein: Knirscherschiene, adjustierte Aufbissschiene, Tiefziehschiene, digitale Schiene oder Unterkieferprotrusionsschiene?'

export function kbEntwurf(auftrag: KbAuftrag = {}, optionen: KbOptionen = {}): KbEntwurf | Rueckfrage {
  const ids = [...new Set((auftrag.vorlagen ?? []).map((x) => String(x).trim().toLowerCase()).filter(Boolean))]
  const gewaehlt = ids.map((id) => VORLAGEN.find((v) => v.id === id))
  if (!ids.length || gewaehlt.some((v) => !v)) return { status: 'rueckfrage', grund: 'vorlage', frage: WAHL }

  const einst: Einstellungen = {
    ...STANDARD_EINSTELLUNGEN, ...optionen.einstellungen,
    praxis: { ...STANDARD_EINSTELLUNGEN.praxis, ...optionen.einstellungen?.praxis },
    laborPreise: { ...STANDARD_EINSTELLUNGEN.laborPreise, ...optionen.einstellungen?.laborPreise },
  }
  const basis = neuerPlan('', einst)
  let positionen = basis.positionen
  let abformung: Abformung = auftrag.abformung === 'scan' ? 'scan' : 'abdruck'
  for (const v of gewaehlt) {
    const neu = vorlageEinfuegen(positionen, v!.pos, abformung, einst)
    positionen = neu.positionen
    abformung = neu.abformung
  }
  const plan: Plan = {
    ...basis,
    patient: { ...basis.patient, ...optionen.patient },
    diagnose: String(auftrag.diagnose ?? '').trim(),
    positionen, abformung, vorlagen: ids,
  }
  const rechnung = rechnen(plan, einst)
  const { regler: _regler, ...ablagePlan } = plan
  void _regler
  return {
    status: 'ok', plan, ablagePlan, rechnung,
    zusammenfassung: {
      titel: gewaehlt.map((v) => v!.titel), abformung,
      summe: rechnung.gesamt, honorar: rechnung.summeHonorar, labor: runden(rechnung.summeLabor + rechnung.mwst),
    },
    hinweise: rechnung.warnungen,
  }
}

/** "Knirscherschiene weich und Kontrollen, mit Intraoralscan" */
export function kbVersorgungSatz(z: KbZusammenfassung): string {
  return `${liste(z.titel)}${z.abformung === 'scan' ? ', mit Intraoralscan' : ''}`
}

export { euro }
