/** Der private Kons-/Endo-Plan für die KI-Zeile und das Prüfmodul. */
import type { Einstellungen, FreiePosition, Plan, Rechnung } from './types'
import { rechnen } from './engine/kons'
import { listenDienst, listenZeilen, type KiPosition, type PlanKiDienst } from './planKi'

type Frei = FreiePosition & { id: string }
const ebene = (e: string) => (e === 'ANALOG' ? 'GOZ' : e)

export function kiZeilen(r: Rechnung, plan: Plan): KiPosition[] {
  const frei = new Set(plan.frei.map((f) => f.key))
  const feste = listenZeilen([...r.zaehne.flatMap((z) => z.zeilen), ...r.begleit], { ebene: (z) => ebene(z.ebene ?? 'GOZ') })
  return [...feste, ...r.frei.map((z) => ({ ...listenZeilen([{ ...z, id: z.zusatz }], { ebene: () => 'GOZ' })[0], auto: !frei.has(z.zusatz ?? '') || undefined }))]
}

export function konsKi(lesen: () => { plan: Plan; gesperrt: boolean; einst: Einstellungen }, schreiben: (plan: Plan) => void): PlanKiDienst {
  const rechnung = (plan: Plan) => rechnen(plan, lesen().einst)
  return listenDienst<Plan, Frei>({
    planart: 'privat-kons', name: 'privater Plan Zahnerhaltung (Füllungen, Endodontie, Inlays nach GOZ)',
    ebenen: ['GOZ'], tarif: ['GOZ'], maxFaktor: 3.5,
    lesen, schreiben,
    liste: (plan) => plan.frei.map((f) => ({ ...f, id: f.key })),
    mitListe: (plan, liste) => ({ ...plan, frei: liste.map(({ id, ...f }) => ({ ...f, key: id })) }),
    neu: (s, id) => ({ id, key: id, nr: s.nr, anzahl: s.anzahl || 1, faktor: s.faktor || lesen().plan.regler.faktor, ...(s.zahn ? { zahn: s.zahn } : {}) }),
    rechnen: (plan) => {
      const r = rechnung(plan)
      return { zeilen: kiZeilen(r, plan), summen: { gesamt: r.summe }, gesamt: r.summe }
    },
    angaben: (plan) => ({
      zaehne: Object.entries(plan.zaehne).map(([nr, z]) => `${nr}: ${z.therapie}${z.flaechen ? `, ${z.flaechen} Flächen` : ''}${z.kanaele ? `, ${z.kanaele} Kanäle` : ''}`).join('; ') || 'noch kein Zahn geplant',
      regler: `Faktor ${plan.regler.faktor}, Stufe ${plan.regler.stufe} (0 nur Grundleistung bis 3 mit Analogleistungen), Materialklasse ${plan.regler.materialKlasse}`,
      aufbau: 'Die Zeilen je Zahn errechnet der Planer aus der Therapie; Zusatzleistungen wählt die Praxis auf der Zahnkarte. Frei ergänzen kann ich GOZ-Positionen.',
      ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
    }),
  })
}
