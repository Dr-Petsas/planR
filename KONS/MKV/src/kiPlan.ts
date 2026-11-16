/** Die Mehrkostenvereinbarung für die KI-Zeile und das Prüfmodul (lesen). */
import type { Einstellungen, Plan, Rechnung } from './types'
import { rechnen } from './engine/mkv'
import { leseDienst, listenZeilen, type KiPosition, type PlanKiDienst } from './planKi'

const ebene = (e: string) => (e === 'ANALOG' ? 'GOZ' : e)
export const kiZeilen = (r: Rechnung): KiPosition[] =>
  listenZeilen([...r.zaehne.flatMap((z) => z.zeilen), ...r.begleit, ...r.privat7], { ebene: (z) => ebene(z.ebene ?? 'GOZ') })

export function mkvKi(lesen: () => { plan: Plan; gesperrt: boolean; einst: Einstellungen }): PlanKiDienst {
  const stand = () => { const s = lesen(); return { ...s, r: rechnen(s.plan, s.einst) } }
  return leseDienst(() => {
    const { plan, gesperrt, r } = stand()
    return {
      planart: 'mkv', name: 'Mehrkostenvereinbarung Füllungen (§ 28 Abs. 2 SGB V): private Leistung abzüglich Kassenanteil',
      nummer: plan.nummer, gesperrt, kann: [], ebenen: [],
      positionen: kiZeilen(r),
      summen: { privat: r.privat, kassenanteil: r.kassenanteil, mehrkosten: r.mehrkosten, privatOhneKasse: r.privat7Summe },
      angaben: {
        zaehne: Object.entries(plan.zaehne).map(([nr, z]) => `${nr}: ${z.therapie}, ${z.flaechen} Flächen${z.austausch ? ', Austausch intakter Füllung' : ''}`).join('; ') || 'noch kein Zahn geplant',
        regler: `Modell ${plan.regler.modell}, Faktor ${plan.regler.faktor}, Inlay-Faktor ${plan.regler.inlayFaktor}, Laborklasse ${plan.regler.laborKlasse}`,
        punktwert: `${r.punktwert}; ${r.punktwertHinweis}`,
        aufbau: 'Alle Zeilen errechnet der Planer aus Therapie und Flächen je Zahn und den Reglern. Freie Positionen nimmt dieser Plan nicht auf.',
        ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
      },
      schalter: [], hinweise: [],
    }
  }, () => { const { r } = stand(); return r.mehrkosten + r.privat7Summe })
}
