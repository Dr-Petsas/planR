// Ergänzungen zum amtlichen goz-2012.json, die dort fehlen oder als
// Zuschlags-Sonderregel gebraucht werden. Quelle: GOZ 2012, Abschnitt A.

import type { ListenEintrag } from '../types'

/**
 * GOZ 0120 – Laser-Zuschlag. Fehlt in goz-2012.json und wird hier ergänzt.
 * Höchstens einmal je Behandlungstag, nur mit dem einfachen Gebührensatz,
 * höchstens 68 € und nur zu den unten genannten Leistungen.
 */
export const LASER_ZUSCHLAG = {
  nr: '0120',
  text: 'Zuschlag für die Anwendung eines Lasers',
  bestimmung:
    'Je Behandlungstag nur einmal, nur mit dem einfachen Gebührensatz, höchstens 68 € (§ 5 Abs. 1 GOZ). ' +
    'Nur zu den Leistungen nach den Nummern 2410, 3070, 3080, 3210, 3240, 4080, 4090, 4100, 4130, 4133 und 9160.',
  hoechstbetrag: 68,
  nummern: ['2410', '3070', '3080', '3210', '3240', '4080', '4090', '4100', '4130', '4133', '9160'],
} as const

/**
 * GOZ 0110 – Operationsmikroskop. Steht in goz-2012.json, die zuschlagsfähigen
 * Nummern werden hier für das Regelwerk gespiegelt.
 */
export const MIKROSKOP_ZUSCHLAG = {
  nr: '0110',
  hoechstbetrag: Infinity,
  nummern: ['2195', '2330', '2340', '2360', '2410', '2440', '3020', '3030', '3040', '3045', '3060', '3110', '3120', '3190', '3200', '4090', '4100', '4130', '4133', '9100', '9110', '9120', '9130', '9170'],
} as const

/** Positionen, die als Ergänzung in die GOZ-Map gemischt werden. */
export const GOZ_ERGAENZUNG: ListenEintrag[] = [
  { nr: '0120', text: LASER_ZUSCHLAG.text, punkte: 0, abschnitt: 'A' },
]

/** Chirurgische OP-Zuschläge (nichtstationär), je Tag nur der höchste. */
export const OP_ZUSCHLAEGE = ['0500', '0510', '0520', '0530'] as const

/** Nur mit dem einfachen Gebührensatz: OP-Zuschläge 0500–0530, Mikroskop 0110, Laser 0120. */
const EINFACHSATZ = new Set<string>(['0110', '0120', ...OP_ZUSCHLAEGE])

export function gozEinfachsatz(nr: string): boolean {
  return EINFACHSATZ.has(nr)
}

/** Chirurgische Leistungen des Planers (Sitzung mit Anästhesie, Kontrollröntgen, ggf. OP-Zuschlag). */
export const OP_LEISTUNGEN = new Set([
  '3000', '3010', '3020', '3030', '3040', '3045', '3070', '3080', '3100', '3110', '3120', '3210', '3230', '3240',
  '4080', '4090', '4100', '4120', '4130', '4133',
  '9010', '9020', '9040', '9090', '9100', '9110', '9120', '9130', '9140', '9150', '9160', '9170',
])

/**
 * OP-Zuschlag (GOZ Abschnitt L). Die Zuschläge gelten nur für die dort ausdrücklich genannten Leistungen,
 * nicht für jede Leistung ab 250 Punkten – 9040 (Freilegung, 626 Punkte) und 4120 sind nicht zuschlagsfähig.
 * Quelle: Allgemeine Bestimmungen zu Abschnitt L und BZÄK-Kommentar zu 0500, 0510, 0520, 0530.
 */
const OP_ZUSCHLAG_ZU: Record<(typeof OP_ZUSCHLAEGE)[number], readonly string[]> = {
  '0500': ['3020', '3030', '3090', '3100', '3110', '3130', '3190', '3230', '3250', '3280', '4090', '4100', '4130', '9090', '9160'],
  '0510': ['3040', '3045', '3120', '3140', '3160', '3200', '3240', '3260', '3270', '9020', '9140', '9150', '9170'],
  '0520': ['4133'],
  '0530': ['9010', '9100', '9110', '9120', '9130'],
}

export function opZuschlagStufe(nr: string): (typeof OP_ZUSCHLAEGE)[number] | null {
  return OP_ZUSCHLAEGE.find((z) => OP_ZUSCHLAG_ZU[z].includes(nr)) ?? null
}
