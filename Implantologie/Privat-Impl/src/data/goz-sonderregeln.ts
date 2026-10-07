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

/**
 * Leistungen, die einen OP-Zuschlag auslösen, mit der zugehörigen Stufe.
 * 0500 (≤ einfache Chirurgie) … 0530 (sehr aufwändig). Je Tag wird nur der
 * Zuschlag der höchstbewerteten Einzelleistung angesetzt (nicht summiert).
 */
export const OP_ZUSCHLAG_STUFE: Record<string, '0500' | '0510' | '0520' | '0530'> = {
  '3000': '0500', '3010': '0500', '3020': '0500', '3070': '0500', '3080': '0500', '3210': '0500', '9040': '0500', '9160': '0500',
  '3030': '0510', '3100': '0510', '3240': '0510', '4080': '0510', '9020': '0510', '9090': '0510',
  '3040': '0520', '3110': '0520', '4090': '0520', '4100': '0520', '4120': '0520', '4130': '0520', '9010': '0520', '9110': '0520', '9140': '0520', '9170': '0520',
  '3045': '0530', '3120': '0530', '3230': '0530', '4133': '0530', '9100': '0530', '9120': '0530', '9130': '0530', '9150': '0530',
}
