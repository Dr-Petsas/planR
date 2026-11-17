/** Der private PAR-Plan für die KI-Zeile und das Prüfmodul. */
import type { Plan, Rechnung, Zusatz } from './types'
import { rechnen } from './engine/par'
import { begruendungText } from './engine/begruendung'
import { feldSetzen, felderSchalter, kiName, listenDienst, listenZeilen, zielSchalter, zielSetzen, type KiFeld, type KiPosition, type KiZiel, type KiZahnFeld, type KiZahnWerte, type PlanKiDienst } from './planKi'

const ebene = (nr: string) => (nr === 'Mat.' ? 'MATERIAL' : 'GOZ')
export function kiZeilen(r: Rechnung, plan: Plan): KiPosition[] {
  const frei = new Set(plan.zusatz.map((z) => z.id))
  // Über 2,3 steht im Dokument der Begründungsvorschlag dieser Leistung.
  const mit = new Set(r.begruendung)
  return listenZeilen(r.zeilen.map((z) => (mit.has(z) ? { ...z, begruendung: begruendungText(z) } : z)), { ebene: (z) => ebene(z.nr), frei: (id) => frei.has(id) })
}

const option = (k: keyof Plan['optionen']) => ({
  lesen: (p: Plan) => p.optionen[k],
  setzen: (p: Plan, w: boolean) => ({ ...p, optionen: { ...p.optionen, [k]: w } }),
})

/** Regler und Angaben des Plans, wie sie in der Leiste links stehen. */
export const FELDER: KiFeld<Plan>[] = [
  { name: 'faktor', text: 'GOZ-Faktor für Honorar und Analogleistungen (Zuschläge bleiben beim einfachen Satz)', von: 1, bis: 3.5, lesen: (p) => p.faktor, setzen: (p, w: number) => ({ ...p, faktor: w }) },
  { name: 'variante', text: 'Bewertung der Analogleistungen (aktuell = BZÄK-Neubewertung 2026, beratungsforum = Beschlüsse mit PKV und Beihilfe)', werte: ['aktuell', 'beratungsforum'], lesen: (p) => p.variante, setzen: (p, w: Plan['variante']) => ({ ...p, variante: w }) },
  { name: 'stadium', text: 'Stadium der Parodontitis', werte: ['I', 'II', 'III', 'IV'], lesen: (p) => p.stadium, setzen: (p, w: Plan['stadium']) => ({ ...p, stadium: w }) },
  { name: 'grad', text: 'Grad der Parodontitis (bestimmt die Häufigkeit der UPT)', werte: ['A', 'B', 'C'], lesen: (p) => p.grad, setzen: (p, w: Plan['grad']) => ({ ...p, grad: w }) },
  { name: 'uptJahre', text: 'UPT-Jahre im Plan', von: 0, bis: 5, lesen: (p) => p.uptJahre, setzen: (p, w: number) => ({ ...p, uptJahre: Math.round(w) }) },
  { name: 'resttaschen', text: 'Anteil der Zähne mit Resttaschen in der UPT in Prozent', von: 0, bis: 100, lesen: (p) => p.resttaschen, setzen: (p, w: number) => ({ ...p, resttaschen: Math.round(w) }) },
  { name: 'gkv', text: 'Patient ist gesetzlich versichert (dann Privatvereinbarung nach § 8 Abs. 7 BMV-Z)', lesen: (p) => p.gkv, setzen: (p, w: boolean) => ({ ...p, gkv: w }) },
  { name: 'optionen.hkp', text: 'schriftlicher Heil- und Kostenplan (GOZ 0030)', ...option('hkp') },
  { name: 'optionen.pzrAit', text: 'GOZ 1040 neben der subgingivalen Instrumentierung (AIT)', ...option('pzrAit') },
  { name: 'optionen.bevCpt', text: 'Befundevaluation nach der chirurgischen Therapie', ...option('bevCpt') },
  { name: 'diagnose', text: 'Diagnose (freier Text)', lesen: (p) => p.diagnose ?? '', setzen: (p, w: string) => ({ ...p, diagnose: w }) },
  { name: 'bemerkung', text: 'Bemerkung auf dem Plan (freier Text)', lesen: (p) => p.bemerkung ?? '', setzen: (p, w: string) => ({ ...p, bemerkung: w }) },
]
const ziel: KiZiel<Plan> = { was: 'GOZ-Faktor', gesamt: (p) => rechnen(p).gesamt, lesen: (p) => p.faktor, setzen: (p, f) => ({ ...p, faktor: f }) }

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
    schalter: (plan) => [...felderSchalter(FELDER, plan), ...zielSchalter(plan, ziel)],
    schalterSetzen: (plan, name, wert) => (name === 'zielbetrag' ? zielSetzen(plan, ziel, wert) : feldSetzen(FELDER, plan, name, wert) ?? 'Diese Einstellung gibt es in diesem Plan gerade nicht.'),
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
      aufbau: 'Die Zeilen der Strecke errechnet der Planer aus dem Befund. Ich kann Zähne als fehlend oder vorhanden eintragen und die chirurgische Therapie je Zahn setzen, weitere GOZ-Leistungen und Material ergänzen, den Faktor je Nummer ändern und die Regler und Angaben aus SCHALTER setzen (Faktor, Variante, Stadium, Grad, UPT-Jahre, Zielbetrag, Bemerkung).',
      ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
    }),
  })
}
