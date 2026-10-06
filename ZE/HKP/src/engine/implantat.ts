import type { Ebene, ImplantatAngaben, Labor, Position, ZahnZeilen } from '../types'
import { KOMPONENTEN, implantatsystem, type Komponente } from '../data/implantatsysteme'
import { ALLE_ZAEHNE, kieferVon } from './zahnschema'
import { bereich } from './zusatzleistungen'

/** Kürzel (TP, sonst R) einer implantatgetragenen Krone, eines Implantat-Teleskops oder -Verbindungselements (Steg, Locator) */
export const IMPLANTAT_TP = /^S[KTO]/

const kuerzelVon = (v: ZahnZeilen | undefined) => (v?.TP.trim() || v?.R || '').toUpperCase()

export const ABUTMENTS: { id: ImplantatAngaben['abutment']; titel: string }[] = [
  { id: 'standard', titel: 'konfektioniert (Titan)' },
  { id: 'individuell', titel: 'individuell CAD/CAM (Hybrid auf Ti-Base)' },
  { id: 'keramik', titel: 'individuell Keramik (Zirkon auf Ti-Base)' },
]

export const GEGENUEBER: Record<string, string> = {
  'OK rechts': 'UK rechts', 'OK-Front': 'UK-Front', 'OK links': 'UK links',
  'UK rechts': 'OK rechts', 'UK-Front': 'OK-Front', 'UK links': 'OK links',
}

export function implantatZaehne(zaehne: Record<string, ZahnZeilen>): string[] {
  return ALLE_ZAEHNE.filter((z) => IMPLANTAT_TP.test(kuerzelVon(zaehne[z])))
}

let zaehler = 0
function pos(ebene: Ebene, nr: string, zahn: string, anzahl = 1, extra: Partial<Position> = {}): Position {
  return { id: `impl-${Date.now().toString(36)}-${(zaehler++).toString(36)}`, ebene, nr, zahn, anzahl, auto: true, ...extra }
}

/**
 * Prothetische Implantatleistungen je Implantatkrone: GOZ 9050 (Abformung und Eingliederung),
 * Abformung je nach Art (Scan / offener / geschlossener Löffel), Labor (Implantatmodell, Zahnfleischmaske,
 * Abutment) und die Implantatteile des gewählten Systems als Material.
 * `teileLabor`: wer die Teile berechnet ('fremd' = Laborrechnung, sonst Praxismaterial).
 */
export function implantatPositionen(zaehne: Record<string, ZahnZeilen>, a: ImplantatAngaben, teileLabor?: Labor): { positionen: Position[]; hinweise: string[] } {
  const imp = implantatZaehne(zaehne)
  if (!imp.length) return { positionen: [], hinweise: [] }
  const sys = implantatsystem(a.system)
  const positionen: Position[] = []
  const hinweise: string[] = []
  const kiefer = [...new Set(imp.map(kieferVon))]
  const haelften = [...new Set(imp.map(bereich))]
  const mat = (k: Komponente, zahn: string) =>
    pos('MAT', '', zahn, 1, { text: `${sys.hersteller} ${sys.system}: ${KOMPONENTEN[k]}`, preis: sys.preise[k], ...(teileLabor ? { labor: teileLabor } : {}) })

  for (const z of imp) positionen.push(pos('GOZ', '9050', z, 2))

  if (a.abformung === 'scan') {
    const regionen = [...new Set([...haelften, ...haelften.map((h) => GEGENUEBER[h])])]
    for (const r of regionen) positionen.push(pos('GOZ', '0065', r))
    for (const k of kiefer) positionen.push(pos('BEB', '0009', k), pos('BEB', '0018', k))
    for (const z of imp) positionen.push(pos('BEB', '0224', z), mat('scanbody', z), mat('laboranalog', z))
  } else if (a.abformung) {
    if (a.abformung === 'offen') for (const k of kiefer) positionen.push(pos('GOZ', '5170', k), pos('BEB', '1108', k))
    for (const k of kiefer) positionen.push(pos('BEB', '0018', k))
    for (const z of imp) positionen.push(pos('BEB', '0225', z), mat('abdruckpfosten', z), mat('laboranalog', z))
  } else {
    hinweise.push(`Implantatkrone ${imp.join(', ')}: Abformung (Intraoralscan oder offener/geschlossener Löffel) noch nicht festgelegt – Abformleistungen und Abformteile fehlen.`)
  }
  for (const h of haelften) positionen.push(pos('BEB', '0223', h))

  for (const z of imp) {
    if (a.abutment === 'standard' || kuerzelVon(zaehne[z]) === 'SO') positionen.push(pos('BEB', '4421', z), mat('abutmentStandard', z))
    else positionen.push(pos('BEB', a.abutment === 'keramik' ? '6906' : '2033', z), mat('tiBase', z), mat('schraube', z))
  }

  if (sys.genau !== 'ja') hinweise.push(`Implantatteile ${sys.hersteller} ${sys.system}: Preise ${sys.genau === 'teilweise' ? 'teilweise ' : ''}geschätzt (${sys.stand}) – mit der aktuellen Preisliste bzw. Laborrechnung abgleichen.`)
  hinweise.push('Chirurgische Implantatleistungen (GOZ 9000–9040, Augmentation) gehören nicht in den HKP und sind gesondert zu planen.')
  return { positionen, hinweise }
}
