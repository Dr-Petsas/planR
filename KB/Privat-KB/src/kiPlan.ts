/** Der private KB-Plan für die KI-Zeile und das Prüfmodul. */
import type { Einstellungen, Plan, Position, Rechnung } from './types'
import { rechnen } from './engine/kb'
import { listenDienst, listenZeilen, type KiPosition, type PlanKiDienst } from './planKi'

const EBENEN = ['GOZ', 'GOAE', 'LABOR', 'MATERIAL']
export const kiZeilen = (r: Rechnung): KiPosition[] => listenZeilen([...r.honorar, ...r.labor])

export function kbKi(lesen: () => { plan: Plan; gesperrt: boolean; einst: Einstellungen }, schreiben: (plan: Plan) => void): PlanKiDienst {
  const rechnung = (plan: Plan) => rechnen(plan, lesen().einst)
  return listenDienst<Plan, Position>({
    planart: 'privat-kb', name: 'privater Kieferbruch-/Schienenplan (Schienentherapie und Funktionsdiagnostik nach GOZ, Labor)',
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
