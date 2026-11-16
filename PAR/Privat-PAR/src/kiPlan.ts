/** Der private PAR-Plan für die KI-Zeile und das Prüfmodul. */
import type { Plan, Rechnung, Zusatz } from './types'
import { rechnen } from './engine/par'
import { begruendungText } from './engine/begruendung'
import { kiName, listenDienst, listenZeilen, type KiPosition, type KiZahnFeld, type KiZahnWerte, type PlanKiDienst } from './planKi'

const ebene = (nr: string) => (nr === 'Mat.' ? 'MATERIAL' : 'GOZ')
export function kiZeilen(r: Rechnung, plan: Plan): KiPosition[] {
  const frei = new Set(plan.zusatz.map((z) => z.id))
  // Über 2,3 steht im Dokument der Begründungsvorschlag dieser Leistung.
  const mit = new Set(r.begruendung)
  return listenZeilen(r.zeilen.map((z) => (mit.has(z) ? { ...z, begruendung: begruendungText(z) } : z)), { ebene: (z) => ebene(z.nr), frei: (id) => frei.has(id) })
}

export const ZAHNFELDER: KiZahnFeld[] = [
  { name: 'fehlt', text: 'Zahn fehlt', ja: true },
  { name: 'cpt', text: 'chirurgische Therapie (CPT) an diesem Zahn', ja: true },
]

/** Fehlende Zähne und CPT-Zähne wie im Befundschema; die Strecke rechnet der Planer daraus neu. */
export function zahnSetzen(plan: Plan, zahn: string, w: KiZahnWerte): { plan: Plan; text: string } | string {
  const fehlt = w.fehlt !== undefined ? w.fehlt === true : plan.fehlend.includes(zahn)
  const cpt = w.cpt !== undefined ? w.cpt === true : plan.cpt.includes(zahn)
  if (fehlt && w.cpt === true) return `Zahn ${zahn} fehlt; dort gibt es keine chirurgische Therapie.`
  const fehlend = fehlt ? [...new Set([...plan.fehlend, zahn])] : plan.fehlend.filter((z) => z !== zahn)
  const cptNeu = cpt && !fehlt ? [...new Set([...plan.cpt, zahn])] : plan.cpt.filter((z) => z !== zahn)
  if (fehlend.length === plan.fehlend.length && cptNeu.length === plan.cpt.length) return `Zahn ${zahn} steht schon so im Plan.`
  const teile = [
    ...(fehlend.length !== plan.fehlend.length ? [fehlt ? 'fehlt' : 'vorhanden'] : []),
    ...(cptNeu.length !== plan.cpt.length ? [cptNeu.includes(zahn) ? 'chirurgische Therapie' : 'keine chirurgische Therapie'] : []),
  ]
  return { plan: { ...plan, fehlend, cpt: cptNeu }, text: `Zahn ${zahn}: ${teile.join(', ')}` }
}

export function parKi(lesen: () => { plan: Plan; gesperrt: boolean }, schreiben: (plan: Plan) => void): PlanKiDienst {
  return listenDienst<Plan, Zusatz & { ebene?: string }>({
    planart: 'privat-par', name: 'privater Parodontitis-Behandlungsplan (GOZ und Analogleistungen nach der PAR-Strecke)',
    ebenen: ['GOZ', 'MATERIAL'], tarif: ['GOZ'], maxFaktor: 3.5,
    lesen, schreiben,
    zahnfelder: () => ZAHNFELDER, zahnSetzen,
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
      aufbau: 'Die Zeilen der Strecke errechnet der Planer aus dem Befund. Ich kann Zähne als fehlend oder vorhanden eintragen und die chirurgische Therapie je Zahn setzen, weitere GOZ-Leistungen und Material ergänzen und den Faktor je Nummer ändern.',
      ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
    }),
  })
}
