/** Der private KFO-Plan für die KI-Zeile und das Prüfmodul. */
import type { Einstellungen, Plan, Position, Rechnung } from './types'
import { rechnen } from './engine/kfo'
import { begruendungText } from './engine/begruendung'
import { KRITERIEN_REGELBISS, KRITERIEN_UMFORMUNG } from './data/katalog'
import { feldSetzen, felderSchalter, listenDienst, listenZeilen, zielSchalter, zielSetzen, type KiFeld, type KiZiel, type KiPosition, type PlanKiDienst } from './planKi'

type A = Plan['aufgabe']
const aufgabe = (k: 'umformungOk' | 'umformungUk' | 'regelbiss' | 'alveolaerOk' | 'alveolaerUk') => ({
  lesen: (p: Plan) => p.aufgabe[k],
  setzen: (p: Plan, w: boolean) => ({ ...p, aufgabe: { ...p.aufgabe, [k]: w } }),
})
const kriterien = <K extends 'kriterienOk' | 'kriterienUk' | 'kriterienRegelbiss'>(k: K, an: keyof A, wo: string, texte: Record<string, string>): KiFeld<Plan>[] =>
  Object.entries(texte).map(([b, t]) => ({
    name: `aufgabe.${k}.${b}`, text: `${wo}, Kriterium ${b}: ${t}`,
    lesen: (p: Plan) => (p.aufgabe[k] as string[]).includes(b),
    setzen: (p: Plan, w: boolean) => ({ ...p, aufgabe: { ...p.aufgabe, [k]: w ? [...new Set([...(p.aufgabe[k] as string[]), b])].sort() : (p.aufgabe[k] as string[]).filter((x) => x !== b) } }),
    da: (p: Plan) => !!p.aufgabe[an],
  }))
const regler = (k: keyof Plan['regler']) => ({
  lesen: (p: Plan) => p.regler[k],
  setzen: (p: Plan, w: number) => ({ ...p, regler: { ...p.regler, [k]: k === 'laborKlasse' ? Math.round(w) : w } }),
})
const freitext = (k: 'diagnose' | 'therapie' | 'bemerkung') => ({ lesen: (p: Plan) => p[k] ?? '', setzen: (p: Plan, w: string) => ({ ...p, [k]: w }) })

/** Behandlungsaufgabe, Regler und Texte des Plans, wie sie in der Leiste links stehen. */
export const FELDER: KiFeld<Plan>[] = [
  { name: 'aufgabe.umformungOk', text: 'Umformung des Oberkiefers (GOZ 6030 bis 6050)', ...aufgabe('umformungOk') },
  ...kriterien('kriterienOk', 'umformungOk', 'Umformung Oberkiefer', KRITERIEN_UMFORMUNG),
  { name: 'aufgabe.umformungUk', text: 'Umformung des Unterkiefers (GOZ 6030 bis 6050)', ...aufgabe('umformungUk') },
  ...kriterien('kriterienUk', 'umformungUk', 'Umformung Unterkiefer', KRITERIEN_UMFORMUNG),
  { name: 'aufgabe.regelbiss', text: 'Einstellung des Unterkiefers in den Regelbiss (GOZ 6060 bis 6080)', ...aufgabe('regelbiss') },
  ...kriterien('kriterienRegelbiss', 'regelbiss', 'Regelbiss', KRITERIEN_REGELBISS),
  { name: 'aufgabe.alveolaerOk', text: 'Maßnahmen am Alveolarfortsatz im Oberkiefer (GOZ 6090, nur bei abgeschlossener Wachstumsphase)', ...aufgabe('alveolaerOk') },
  { name: 'aufgabe.alveolaerUk', text: 'Maßnahmen am Alveolarfortsatz im Unterkiefer (GOZ 6090, nur bei abgeschlossener Wachstumsphase)', ...aufgabe('alveolaerUk') },
  { name: 'quartale', text: 'geplante Behandlungsdauer in Quartalen', von: 1, bis: 16, lesen: (p) => p.quartale, setzen: (p, w: number) => ({ ...p, quartale: Math.round(w) }) },
  { name: 'digitalRoentgen', text: 'digitale Radiographie (Zuschlag GOÄ 5298)', lesen: (p) => p.digitalRoentgen, setzen: (p, w: boolean) => ({ ...p, digitalRoentgen: w }) },
  { name: 'regler.kfoFaktor', text: 'GOZ-Faktor für Abschnitt G (Kieferorthopädie)', von: 1, bis: 5, ...regler('kfoFaktor') },
  { name: 'regler.faktor', text: 'GOZ-Faktor der übrigen Leistungen und GOÄ außerhalb Röntgen', von: 1, bis: 5, ...regler('faktor') },
  { name: 'regler.roeFaktor', text: 'GOÄ-Faktor Röntgen', von: 1, bis: 2.5, ...regler('roeFaktor') },
  { name: 'regler.laborKlasse', text: 'Preisklasse des Labors: 0 günstig, 1 Standard, 2 hochwertig', von: 0, bis: 2, ...regler('laborKlasse') },
  { name: 'diagnose', text: 'Befund und Diagnose (freier Text)', ...freitext('diagnose') },
  { name: 'therapie', text: 'Behandlungsziel und vorgesehene Behandlungsmittel (freier Text)', ...freitext('therapie') },
  { name: 'bemerkung', text: 'Bemerkung auf dem Plan (freier Text)', ...freitext('bemerkung') },
]

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
  // Beide GOZ-Regler (Abschnitt G und übrige Leistungen) laufen gemeinsam.
  const ziel: KiZiel<Plan> = { was: 'GOZ-Faktor (Abschnitt G und übrige Leistungen gemeinsam)', gesamt: (p) => rechnung(p).gesamt, lesen: (p) => p.regler.kfoFaktor, setzen: (p, f) => ({ ...p, regler: { ...p.regler, kfoFaktor: f, faktor: f } }) }
  return listenDienst<Plan, Position>({
    planart: 'privat-kfo', name: 'privater kieferorthopädischer Behandlungsplan (GOZ Abschnitt G, GOÄ, Labor, Mehrleistungen)',
    ebenen: EBENEN, tarif: ['GOZ', 'GOAE'], maxFaktor: 3.5,
    lesen, schreiben,
    schalter: (plan) => [...felderSchalter(FELDER, plan), ...zielSchalter(plan, ziel)],
    schalterSetzen: (plan, name, wert) => (name === 'zielbetrag' ? zielSetzen(plan, ziel, wert) : feldSetzen(FELDER, plan, name, wert) ?? 'Diese Einstellung gibt es in diesem Plan gerade nicht.'),
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
      behandlungsaufgabe: 'Die Zeilen 6030 bis 6090 errechnet der Planer aus der Behandlungsaufgabe (Umformung, Einstellung in den Regelbiss) und der Dauer. Die Behandlungsaufgabe mit ihren Kriterien, die Dauer, die Regler und die Texte setze ich über SCHALTER.',
      quartale: String(plan.quartale),
      faktoren: `Abschnitt G ${plan.regler.kfoFaktor}, übrige ${plan.regler.faktor}`,
      ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
    }),
  })
}
