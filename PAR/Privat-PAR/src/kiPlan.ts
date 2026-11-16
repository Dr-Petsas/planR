/** Der private PAR-Plan für die KI-Zeile und das Prüfmodul. */
import type { Plan, Rechnung, Zusatz } from './types'
import { rechnen } from './engine/par'
import { begruendungText } from './engine/begruendung'
import { kiName, listenDienst, listenZeilen, type KiPosition, type PlanKiDienst } from './planKi'

const ebene = (nr: string) => (nr === 'Mat.' ? 'MATERIAL' : 'GOZ')
export function kiZeilen(r: Rechnung, plan: Plan): KiPosition[] {
  const frei = new Set(plan.zusatz.map((z) => z.id))
  // Über 2,3 steht im Dokument der Begründungsvorschlag dieser Leistung.
  const mit = new Set(r.begruendung)
  return listenZeilen(r.zeilen.map((z) => (mit.has(z) ? { ...z, begruendung: begruendungText(z) } : z)), { ebene: (z) => ebene(z.nr), frei: (id) => frei.has(id) })
}

export function parKi(lesen: () => { plan: Plan; gesperrt: boolean }, schreiben: (plan: Plan) => void): PlanKiDienst {
  return listenDienst<Plan, Zusatz & { ebene?: string }>({
    planart: 'privat-par', name: 'privater Parodontitis-Behandlungsplan (GOZ und Analogleistungen nach der PAR-Strecke)',
    ebenen: ['GOZ', 'MATERIAL'], tarif: ['GOZ'], maxFaktor: 3.5,
    lesen, schreiben,
    liste: (plan) => plan.zusatz.map((z) => ({ ...z, ebene: ebene(z.nr) })),
    mitListe: (plan, liste) => ({ ...plan, zusatz: liste.map(({ ebene: _e, ...z }) => z) }),
    neu: (s, id) => ({
      id, ebene: s.ebene, nr: s.ebene === 'MATERIAL' ? 'Mat.' : s.nr, anzahl: s.anzahl || 1,
      ...(s.faktor ? { faktor: s.faktor } : {}), ...(s.preis !== undefined ? { preis: s.preis } : {}), ...(s.text ? { text: s.text } : {}),
    }),
    // Faktor einer errechneten Zeile: gilt je Gebührennummer
    eigen: (plan, s, zeilen) => {
      if (s.op !== 'setze' || s.faktor === undefined || plan.zusatz.some((z) => z.id === s.id)) return null
      const z = zeilen.find((x) => x.id === s.id)
      if (!z) return 'Die Position zum Ändern finde ich nicht mehr.'
      if (s.anzahl !== undefined) return `${kiName(z)}: die Anzahl errechnet der Planer aus dem Befund.`
      if (s.faktor > 3.5 || s.faktor < 1) return `${kiName(z)}: der Faktor muss zwischen 1 und 3,5 liegen; darüber braucht es eine Vereinbarung nach § 2 GOZ.`
      return { plan: { ...plan, faktoren: { ...plan.faktoren, [z.nr]: s.faktor } }, text: `${kiName(z)}: Faktor ${s.faktor.toLocaleString('de-DE')}` }
    },
    rechnen: (plan) => {
      const r = rechnen(plan)
      return { zeilen: kiZeilen(r, plan), summen: { ...r.summen, honorar: r.honorar, material: r.material, gesamt: r.gesamt }, gesamt: r.gesamt }
    },
    angaben: (plan) => ({
      versichert: plan.gkv ? 'gesetzlich versichert (Privatvereinbarung nötig)' : 'privat',
      diagnose: `${plan.diagnose || 'nicht eingetragen'}; Stadium ${plan.stadium}, Grad ${plan.grad}`,
      befund: `fehlende Zähne: ${plan.fehlend.join(', ') || 'keine'}; chirurgische Therapie an: ${plan.cpt.join(', ') || 'keinem Zahn'}`,
      strecke: `Variante ${plan.variante}, UPT über ${plan.uptJahre} Jahre, Standardfaktor ${plan.faktor}`,
      aufbau: 'Die Zeilen der Strecke errechnet der Planer aus dem Befund. Weitere GOZ-Leistungen und Material kann ich ergänzen, den Faktor je Nummer ändern.',
      ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
    }),
  })
}
