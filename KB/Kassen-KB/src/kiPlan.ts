/** Der Kassen-KB-Plan für die KI-Zeile und das Prüfmodul. */
import type { Einstellungen, Plan, Position, Rechnung } from './types'
import { abformungAnwenden, rechnen } from './engine/kb'
import { feldSetzen, felderSchalter, listenDienst, listenZeilen, type KiFeld, type KiPosition, type PlanKiDienst } from './planKi'

const EBENEN = ['BEMA', 'BEL', 'MATERIAL']
export const kiZeilen = (r: Rechnung): KiPosition[] => listenZeilen([...r.honorar, ...r.labor, ...r.material, ...r.privat])

type A = Plan['angaben']
const text = (k: 'befund' | 'behandlung' | 'verletzung') => ({ lesen: (p: Plan) => p.angaben[k] ?? '', setzen: (p: Plan, w: string) => ({ ...p, angaben: { ...p.angaben, [k]: w } }) })
const kreuz = (k: 'unfall' | 'schlafmedizin' | 'genehmigungsverzicht') => ({ lesen: (p: Plan) => !!p.angaben[k], setzen: (p: Plan, w: boolean) => ({ ...p, angaben: { ...p.angaben, [k]: w } }) })
const bei = (...arten: A['art'][]) => (p: Plan) => arten.includes(p.angaben.art)

/** Angaben des Plans, wie sie in der Leiste links und auf dem Formular stehen. */
export const FELDER: KiFeld<Plan>[] = [
  { name: 'angaben.befund', text: 'Anamnese, Befunde, Diagnose (freier Text auf dem Formular)', ...text('befund'), da: bei('kiefergelenk', 'ukps') },
  { name: 'angaben.verletzung', text: 'Ort, Zeit und Ursache sowie Art der Verletzung (freier Text auf dem Formular)', ...text('verletzung'), da: bei('kieferbruch') },
  { name: 'angaben.behandlung', text: 'vorgesehene Behandlung (freier Text auf dem Formular)', ...text('behandlung') },
  { name: 'angaben.unfall', text: 'Unfall oder Unfallfolgen', ...kreuz('unfall') },
  { name: 'angaben.schlafmedizin', text: 'Veranlassung durch Vertragsarzt mit Zusatzbezeichnung Schlafmedizin liegt vor', ...kreuz('schlafmedizin'), da: bei('ukps') },
  { name: 'angaben.genehmigungsverzicht', text: 'Kasse verzichtet nach Landesvertrag auf die Genehmigung von K1 bis K4', ...kreuz('genehmigungsverzicht'), da: bei('kiefergelenk') },
  { name: 'labor', text: 'Labor (praxis = Eigenlabor, gewerbe = Fremdlabor)', werte: ['praxis', 'gewerbe'], lesen: (p) => p.labor, setzen: (p, w: Plan['labor']) => ({ ...p, labor: w }) },
  { name: 'abformung', text: 'Abformung (abdruck = konventionell, scan = Intraoralscan)', werte: ['abdruck', 'scan'], lesen: (p) => p.abformung, setzen: (p, w: Plan['abformung']) => ({ ...p, abformung: w, positionen: abformungAnwenden(p.positionen, w) }) },
  { name: 'bemerkung', text: 'Bemerkung auf dem Plan (freier Text)', lesen: (p) => p.bemerkung ?? '', setzen: (p, w: string) => ({ ...p, bemerkung: w }) },
]

export function kbKi(lesen: () => { plan: Plan; gesperrt: boolean; einst: Einstellungen }, schreiben: (plan: Plan) => void): PlanKiDienst {
  const rechnung = (plan: Plan) => rechnen(plan, lesen().einst)
  return listenDienst<Plan, Position>({
    planart: 'kassen-kb', name: 'Kassen-Behandlungsplan Kieferbruch / Kiefergelenkserkrankungen (BEMA Teil 2, BEL II)',
    ebenen: EBENEN, tarif: ['BEMA', 'BEL'],
    lesen, schreiben,
    schalter: (plan) => felderSchalter(FELDER, plan),
    schalterSetzen: (plan, name, wert) => feldSetzen(FELDER, plan, name, wert) ?? 'Diese Einstellung gibt es in diesem Plan gerade nicht.',
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
        labor: `${plan.labor === 'praxis' ? 'Eigenlabor' : 'Fremdlabor'}, Abformung ${plan.abformung}`,
        befund: plan.angaben.befund || 'nicht eingetragen',
        behandlung: plan.angaben.behandlung || 'nicht eingetragen',
        punktwert: `KB ${r.punktwertKb}; ${r.punktwertHinweis}`,
        genehmigung: r.genehmigungspflichtig ? 'genehmigungspflichtig' : 'nicht genehmigungspflichtig',
        ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
      }
    },
  })
}
