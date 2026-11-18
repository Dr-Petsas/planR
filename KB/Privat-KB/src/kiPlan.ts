/** Der private KB-Plan für die KI-Zeile und das Prüfmodul. */
import type { Einstellungen, Plan, Position, Rechnung } from './types'
import { abformungAnwenden, rechnen } from './engine/kb'
import { begruendungText } from './engine/begruendung'
import { feldSetzen, felderSchalter, listenDienst, listenZeilen, zielSchalter, zielSetzen, type KiFeld, type KiPosition, type KiZiel, type PlanKiDienst } from './planKi'

const EBENEN = ['GOZ', 'GOAE', 'LABOR', 'MATERIAL']
const regler = (k: keyof Plan['regler']) => ({
  lesen: (p: Plan) => p.regler[k],
  setzen: (p: Plan, w: number) => ({ ...p, regler: { ...p.regler, [k]: k === 'laborKlasse' ? Math.round(w) : w } }),
})

/** Regler und Angaben des Plans, wie sie in der Leiste links stehen. */
export const FELDER: KiFeld<Plan>[] = [
  { name: 'regler.faktor', text: 'GOZ-Faktor für Aufbissbehelfe, Schienen und Provisorien', von: 1, bis: 5, ...regler('faktor') },
  { name: 'regler.faFaktor', text: 'GOZ-Faktor der Funktionsanalyse (Abschnitt J)', von: 1, bis: 5, ...regler('faFaktor') },
  { name: 'regler.laborKlasse', text: 'Preisklasse des Labors: 0 günstig, 1 Standard, 2 hochwertig', von: 0, bis: 2, ...regler('laborKlasse') },
  { name: 'abformung', text: 'Abformung (abdruck = konventionell, scan = Intraoralscan)', werte: ['abdruck', 'scan'], lesen: (p) => p.abformung, setzen: (p, w: Plan['abformung']) => ({ ...p, abformung: w, positionen: abformungAnwenden(p.positionen, w) }) },
  { name: 'diagnose', text: 'Befund und Diagnose (freier Text)', lesen: (p) => p.diagnose ?? '', setzen: (p, w: string) => ({ ...p, diagnose: w }) },
  { name: 'bemerkung', text: 'Bemerkung auf dem Plan (freier Text)', lesen: (p) => p.bemerkung ?? '', setzen: (p, w: string) => ({ ...p, bemerkung: w }) },
]
// Über der Schwelle steht im Dokument der Begründungsvorschlag dieser Leistung.
export const kiZeilen = (r: Rechnung): KiPosition[] => {
  const mit = new Set(r.begruendung)
  return listenZeilen([...r.honorar.map((z) => (mit.has(z) ? { ...z, begruendung: begruendungText(z) } : z)), ...r.labor])
}

export function kbKi(lesen: () => { plan: Plan; gesperrt: boolean; einst: Einstellungen }, schreiben: (plan: Plan) => void): PlanKiDienst {
  const rechnung = (plan: Plan) => rechnen(plan, lesen().einst)
  // Beide GOZ-Regler (Schienen und Funktionsanalyse) laufen gemeinsam.
  const ziel: KiZiel<Plan> = { was: 'GOZ-Faktor (Schienen und Funktionsanalyse gemeinsam)', gesamt: (p) => rechnung(p).gesamt, lesen: (p) => p.regler.faktor, setzen: (p, f) => ({ ...p, regler: { ...p.regler, faktor: f, faFaktor: f } }) }
  return listenDienst<Plan, Position>({
    planart: 'privat-kb', name: 'privater Kieferbruch-/Schienenplan (Schienentherapie und Funktionsdiagnostik nach GOZ, Labor)',
    ebenen: EBENEN, tarif: ['GOZ', 'GOAE'], maxFaktor: 3.5,
    lesen, schreiben,
    schalter: (plan) => [...felderSchalter(FELDER, plan), ...zielSchalter(plan, ziel)],
    schalterSetzen: (plan, name, wert) => (name === 'zielbetrag' ? zielSetzen(plan, ziel, wert) : feldSetzen(FELDER, plan, name, wert) ?? 'Diese Einstellung gibt es in diesem Plan gerade nicht.'),
    liste: (plan) => plan.positionen,
    mitListe: (plan, positionen) => ({ ...plan, positionen }),
    neu: (s, id) => ({
      id, ebene: s.ebene as Position['ebene'], nr: s.nr, anzahl: s.anzahl || 1,
      ...(s.faktor ? { faktor: s.faktor } : {}), ...(s.preis !== undefined ? { preis: s.preis } : {}), ...(s.text ? { text: s.text } : {}),
    }),
    rechnen: (plan) => {
      const r = rechnung(plan)
      return { zeilen: kiZeilen(r), summen: { honorar: r.summeHonorar, labor: r.summeLabor, mwst: r.mwst, gesamt: r.gesamt }, gesamt: r.gesamt }
    },
    angaben: (plan) => ({
      diagnose: plan.diagnose || 'nicht eingetragen',
      faktoren: `GOZ ${plan.regler.faktor}, Funktionsanalyse ${plan.regler.faFaktor}`,
      abformung: plan.abformung,
      ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
    }),
  })
}
