/** Der private KFO-Plan für die KI-Zeile und das Prüfmodul. */
import type { Einstellungen, Plan, Position, Rechnung } from './types'
import { rechnen } from './engine/kfo'
import { begruendungText } from './engine/begruendung'
import { listenDienst, listenZeilen, type KiPosition, type PlanKiDienst } from './planKi'

const EBENEN = ['GOZ', 'GOAE', 'LABOR', 'MATERIAL']
// Über der Schwelle steht im Dokument der Begründungsvorschlag dieser Leistung.
export const kiZeilen = (r: Rechnung): KiPosition[] => {
  const mit = new Set(r.begruendung)
  const text = <Z extends Rechnung['honorar'][number]>(z: Z) => (mit.has(z) ? { ...z, begruendung: begruendungText(z) } : z)
  return [
    ...listenZeilen(r.aufgabe.map(text)).map((z) => ({ ...z, auto: true })),
    ...listenZeilen([...r.honorar.map(text), ...r.labor, ...r.mehr]),
  ]
}

export function kfoKi(lesen: () => { plan: Plan; gesperrt: boolean; einst: Einstellungen }, schreiben: (plan: Plan) => void): PlanKiDienst {
  const rechnung = (plan: Plan) => rechnen(plan, lesen().einst)
  return listenDienst<Plan, Position>({
    planart: 'privat-kfo', name: 'privater kieferorthopädischer Behandlungsplan (GOZ Abschnitt G, GOÄ, Labor, Mehrleistungen)',
    ebenen: EBENEN, tarif: ['GOZ', 'GOAE'], maxFaktor: 3.5,
    lesen, schreiben,
    liste: (plan) => plan.positionen,
    mitListe: (plan, positionen) => ({ ...plan, positionen }),
    neu: (s, id) => ({
      id, ebene: s.ebene as Position['ebene'], nr: s.nr, anzahl: s.anzahl || 1,
      ...(s.faktor ? { faktor: s.faktor } : {}), ...(s.preis !== undefined ? { preis: s.preis } : {}), ...(s.text ? { text: s.text } : {}),
    }),
    rechnen: (plan) => {
      const r = rechnung(plan)
      return {
        zeilen: kiZeilen(r),
        summen: { behandlungsaufgabe: r.summeAufgabe, honorar: r.summeHonorar, labor: r.summeLabor, mehrleistungen: r.summeMehr, gesamt: r.gesamt },
        gesamt: r.gesamt,
      }
    },
    angaben: (plan) => ({
      diagnose: plan.diagnose || 'nicht eingetragen',
      therapie: plan.therapie || 'nicht eingetragen',
      behandlungsaufgabe: 'Die Zeilen 6030 bis 6090 errechnet der Planer aus der Behandlungsaufgabe (Umformung, Einstellung in den Regelbiss) und der Dauer.',
      quartale: String(plan.quartale),
      faktoren: `Abschnitt G ${plan.regler.kfoFaktor}, übrige ${plan.regler.faktor}`,
      ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
    }),
  })
}
