import type { Ebene, ImplantatAngaben, Labor, Position, ZahnZeilen } from '../types'
import { KOMPONENTEN, implantatsystem, type Komponente } from '../data/implantatsysteme'
import { ALLE_ZAEHNE, FEHLEND, OBERKIEFER, UNTERKIEFER, kieferVon } from './zahnschema'
import { bereich, zweiJeKiefer } from './zusatzleistungen'

/** Kürzel (TP, sonst R) einer implantatgetragenen Krone, eines Implantat-Teleskops oder -Verbindungselements (Steg, Locator) */
export const IMPLANTAT_TP = /^S[KTO]|^ZAS$/

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

/** Befundkürzel, die ein Implantat im Plan festhalten (nicht eine erst gerechnete Regelversorgung). */
const BEFUND_IMPLANTAT = new Set(['i', 'ix', 'sk', 'skw', 'sb', 'sbw', 'se', 'sew', 'so', 'sow', 'st', 'stw'])

/** Implantate, die der Plan selbst trägt: Therapie, Regelversorgung oder Befund. */
export function implantateErfasst(zaehne: Record<string, ZahnZeilen>): string[] {
  return ALLE_ZAEHNE.filter((z) => {
    const v = zaehne[z]
    if (!v) return false
    if (IMPLANTAT_TP.test((v.TP.trim() || v.R.trim()).toUpperCase())) return true
    return BEFUND_IMPLANTAT.has(v.B.trim().toLowerCase())
  })
}

const befundVon = (v: ZahnZeilen | undefined) => (v?.B ?? '').trim().toLowerCase()
const nachbarn = (z: string) => {
  const reihe = kieferVon(z) === 'OK' ? OBERKIEFER : UNTERKIEFER
  const i = reihe.indexOf(z)
  return [reihe[i - 1], reihe[i + 1]]
}

/** Befund 7.1: erneuerungsbedürftige Implantatkrone in einer zahnbegrenzten Einzelzahnlücke – beide Nachbarn sind natürliche Zähne. */
export function supraEinzelzahnluecke(zaehne: Record<string, ZahnZeilen>, z: string): boolean {
  if (befundVon(zaehne[z]) !== 'skw') return false
  return nachbarn(z).every((n) => {
    if (!n) return false
    const k = befundVon(zaehne[n])
    return !FEHLEND.has(k) && !k.startsWith('s')
  })
}

/**
 * Ausnahmefall Nr. 36 a) ZE-Richtlinie: Die Suprakonstruktion in einer zahnbegrenzten Einzelzahnlücke ist
 * Regelversorgung, wenn keine parodontale Behandlungsbedürftigkeit besteht und die Nachbarzähne kariesfrei
 * und nicht überkronungsbedürftig bzw. überkront sind. Die Praxis setzt den Fall je Zahn (klinisch.supraRegel);
 * am Zahnschema prüfbar sind die Einzelzahnlücke und Nachbarzähne ohne Befund oder mit intakter Krone (k).
 */
export function supraAlsRegelversorgung(zaehne: Record<string, ZahnZeilen>, klinisch: { supraRegel?: string[] } | undefined, z: string): boolean {
  return !!klinisch?.supraRegel?.includes(z) && supraEinzelzahnluecke(zaehne, z) && nachbarn(z).every((n) => ['', 'k'].includes(befundVon(zaehne[n])))
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
    pos('MAT', '', zahn, 1, { text: `${sys.hersteller} ${sys.system}: ${KOMPONENTEN[k]}`, preis: sys.preise[k], rolle: `implantat-${k}`, ...(teileLabor ? { labor: teileLabor } : {}) })

  for (const z of imp) positionen.push(pos('GOZ', '9050', z, 2))

  if (a.abformung === 'scan') {
    const regionen = zweiJeKiefer([...haelften, ...haelften.map((h) => GEGENUEBER[h])])
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
