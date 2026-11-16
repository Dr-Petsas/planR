/** Der Kassen-HKP für die KI-Zeile (lesen). Änderungen laufen über den Planer und seine Vorschläge. */
import type { HkpPlan } from './types'
import type { Ergebnis } from './engine/berechnung'
import { leseDienst, type PlanKiDienst } from './planKi'

export function hkpKi(lesen: () => { plan: HkpPlan; ergebnis: Ergebnis }): PlanKiDienst {
  return leseDienst(() => {
    const { plan, ergebnis: e } = lesen()
    const zaehne = Object.entries(plan.zaehne as Record<string, Record<string, unknown>>)
      .map(([nr, z]) => {
        const teile = ['B', 'R', 'TP'].filter((k) => typeof z[k] === 'string' && z[k]).map((k) => `${k} ${z[k]}`)
        return teile.length ? `${nr}: ${teile.join(', ')}` : ''
      }).filter(Boolean)
    const s = e.summen
    return {
      planart: 'kassen-hkp', name: 'Heil- und Kostenplan Zahnersatz der gesetzlichen Kasse (BEMA, GOZ, BEL II/BEB, Festzuschüsse)',
      nummer: '', gesperrt: false, kann: [], ebenen: [],
      positionen: e.positionen.map((p) => ({
        id: p.id, ebene: p.ebene, nr: p.nr, zahn: p.zahn, anzahl: p.anzahl,
        ...(p.faktor !== undefined ? { faktor: p.faktor } : {}),
        einzel: p.einzelpreis, betrag: p.betrag, text: p.bezeichnung,
        ...(p.auto ? { auto: true } : {}), ...(p.begruendung ? { begruendung: p.begruendung } : {}),
      })),
      summen: {
        bemaHonorar: s.bemaHonorar, gozHonorar: s.gozHonorar, materialUndLabor: s.materialUndLabor, gesamt: s.gesamt,
        festzuschuss: s.festzuschuss, kassenanteil: s.kassenanteil, eigenanteil: s.eigenanteil,
      },
      angaben: {
        versorgungsart: String(e.versorgungsart),
        zahnschema: zaehne.join('; ') || 'noch nichts eingetragen',
        festzuschussBefunde: e.befunde.map((b) => `${b.nr} (${b.zahnGebiet || '-'}) ${b.anzahl}× = ${b.betrag.toFixed(2)} €`).join('; ') || 'keine',
        bonus: `${plan.zuschuss.bonus} %${plan.zuschuss.haertefall ? ', Härtefall' : ''}`,
        abformung: plan.abformung || 'noch nicht festgelegt',
        ...(e.zusatzNichtAngesetzt.length ? { nichtAngesetzt: e.zusatzNichtAngesetzt.join('; ') } : {}),
        aufbau: 'Positionen ändert die Praxis im Planer (Reiter Planung und Positionen); das Prüfmodul oben zeigt die Prüfhinweise.',
      },
      schalter: [],
      hinweise: e.hinweise.map((h) => ({ stufe: h.stufe, text: h.text })),
    }
  }, () => lesen().ergebnis.summen.gesamt)
}
