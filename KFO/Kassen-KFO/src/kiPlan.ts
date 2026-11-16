/** Der Kassen-KFO-Plan für die KI-Zeile und das Prüfmodul. */
import type { Einstellungen, Plan, Position, Rechnung } from './types'
import { rechnen } from './engine/kfo'
import { listenDienst, listenZeilen, type KiPosition, type PlanKiDienst } from './planKi'

const EBENEN = ['BEMA', 'BEL', 'MATERIAL']
export const kiZeilen = (r: Rechnung): KiPosition[] => [
  ...listenZeilen([...r.honorar, ...r.labor, ...r.material]),
  ...listenZeilen(r.privat, { ebene: () => 'PRIVAT' }),
]

export function kfoKi(lesen: () => { plan: Plan; gesperrt: boolean; einst: Einstellungen }, schreiben: (plan: Plan) => void): PlanKiDienst {
  const rechnung = (plan: Plan) => rechnen(plan, lesen().einst)
  return listenDienst<Plan, Position>({
    planart: 'kassen-kfo', name: 'Kassen-Behandlungsplan Kieferorthopädie (BEMA Teil 3, BEL II, Mehr- und Zusatzleistungen)',
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
        summen: {
          honorar: r.summeHonorar, labor: r.summeLabor, material: r.summeMaterial, gesamt: r.gesamt,
          eigenanteil: r.eigenanteil, kassenanteil: r.kassenanteil, privat: r.privatGesamt,
        },
        gesamt: r.gesamt,
      }
    },
    angaben: (plan) => {
      const r = rechnung(plan)
      return {
        einstufung: r.einstufung.length ? JSON.stringify(r.einstufung).slice(0, 600) : 'noch keine Einstufung',
        kassenleistung: r.kassenleistung ? 'ja' : 'nein',
        alter: r.alter == null ? 'unbekannt' : String(r.alter),
        punktwert: `KFO ${r.punktwertKfo}; ${r.punktwertHinweis}`,
        hinweis: 'Privatleistungen (Mehr- und Zusatzleistungen) legt die Praxis im Planer über den Katalog an.',
        ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
      }
    },
  })
}
