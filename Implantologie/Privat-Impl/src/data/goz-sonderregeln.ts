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

/** Chirurgische Leistungen des Planers (Sitzung mit Anästhesie, Kontrollröntgen, ggf. OP-Zuschlag). */
export const OP_LEISTUNGEN = new Set([
  '3000', '3010', '3020', '3030', '3040', '3045', '3070', '3080', '3100', '3110', '3120', '3210', '3230', '3240',
  '4080', '4090', '4100', '4120', '4130', '4133',
  '9010', '9020', '9040', '9090', '9100', '9110', '9120', '9130', '9140', '9150', '9160', '9170',
])

/**
 * OP-Zuschlag nach der Punktzahl der Leistung (GOZ Abschnitt L): 250–499 → 0500 (sowie 4090, 4130),
 * 500–799 → 0510, 800–1199 → 0520, ab 1200 → 0530; unter 250 Punkten kein Zuschlag.
 */
export function opZuschlagStufe(nr: string, punkte: number): (typeof OP_ZUSCHLAEGE)[number] | null {
  if (punkte >= 1200) return '0530'
  if (punkte >= 800) return '0520'
  if (punkte >= 500) return '0510'
  if (punkte >= 250 || nr === '4090' || nr === '4130') return '0500'
  return null
}
