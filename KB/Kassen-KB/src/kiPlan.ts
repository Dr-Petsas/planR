/** Der Kassen-KB-Plan für die KI-Zeile und das Prüfmodul. */
import type { Einstellungen, Plan, Position, Rechnung } from './types'
import { rechnen } from './engine/kb'
import { listenDienst, listenZeilen, type KiPosition, type PlanKiDienst } from './planKi'

const EBENEN = ['BEMA', 'BEL', 'MATERIAL']
export const kiZeilen = (r: Rechnung): KiPosition[] => listenZeilen([...r.honorar, ...r.labor, ...r.material, ...r.privat])

export function kbKi(lesen: () => { plan: Plan; gesperrt: boolean; einst: Einstellungen }, schreiben: (plan: Plan) => void): PlanKiDienst {
  const rechnung = (plan: Plan) => rechnen(plan, lesen().einst)
  return listenDienst<Plan, Position>({
    planart: 'kassen-kb', name: 'Kassen-Behandlungsplan Kieferbruch / Kiefergelenkserkrankungen (BEMA Teil 2, BEL II)',
    ebenen: EBENEN, tarif: ['BEMA'],
    lesen, schreiben,
    liste: (plan) => plan.positionen,
    mitListe: (plan, positionen) => ({ ...plan, positionen }),
    neu: (s, id) => ({
      id, ebene: s.ebene as Position['ebene'], nr: s.nr, anzahl: s.anzahl || 1,
      ...(s.preis !== undefined ? { preis: s.preis } : {}), ...(s.text ? { text: s.text } : {}),
    }),
    rechnen: (plan) => {
      const r = rechnung(plan)
      return {
        zeilen: kiZeilen(r),
        summen: { honorar: r.summeHonorar, labor: r.summeLabor, material: r.summeMaterial, privat: r.summePrivat, kassenanteil: r.gesamt },
        gesamt: r.gesamt,
      }
    },
    angaben: (plan) => {
      const r = rechnung(plan)
      return {
        art: String(plan.angaben.art),
        befund: plan.angaben.befund || 'nicht eingetragen',
        behandlung: plan.angaben.behandlung || 'nicht eingetragen',
        punktwert: `KB ${r.punktwertKb}; ${r.punktwertHinweis}`,
        genehmigung: r.genehmigungspflichtig ? 'genehmigungspflichtig' : 'nicht genehmigungspflichtig',
        ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
      }
    },
  })
}
