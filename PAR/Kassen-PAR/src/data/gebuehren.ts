// Private Gebuehren fuer Zusatzleistungen: GOZ 2012 (amtliche Tabelle, Kopie
// aus dem HKP-Planer) und die wenigen hier gebrauchten GOAE-Nummern.

import gozTabelle from './goz-2012.json'

export const GOZ_PUNKTWERT = 0.0562421
export const GOAE_PUNKTWERT = 0.0582873

interface GozEintrag { nr: string; text: string; punkte: number }

const GOZ: Record<string, GozEintrag> = Object.fromEntries(
  (gozTabelle as { eintraege: GozEintrag[] }).eintraege.map((e) => [e.nr, e]),
)

export function gozPunkte(nr: string): number | undefined {
  return GOZ[nr]?.punkte
}

export function gozText(nr: string): string {
  return GOZ[nr]?.text ?? ''
}

/** GOAE-Nummern, die im PAR-Umfeld als Zusatzleistung vorkommen. */
export const GOAE: Record<string, { titel: string; punkte: number; roentgen?: boolean }> = {
  '1': { titel: 'Beratung, auch telefonisch', punkte: 80 },
  '3': { titel: 'Eingehende Beratung (mind. 10 Minuten)', punkte: 150 },
  '5': { titel: 'Symptombezogene Untersuchung', punkte: 80 },
  '250': { titel: 'Blutentnahme mittels Spritze oder Kanüle', punkte: 40 },
  '298': { titel: 'Entnahme und Aufbereitung von Abstrichmaterial zur mikrobiologischen Untersuchung', punkte: 40 },
  '5000': { titel: 'Zähne, je Projektion (Röntgen)', punkte: 50, roentgen: true },
  '5004': { titel: 'Panoramaschichtaufnahme der Kiefer', punkte: 400, roentgen: true },
}

/**
 * Analog-Positionen nach § 6 Abs. 1 GOZ. Die Punktzahl ist Praxis-Sache
 * (Analogliste) und in den Einstellungen aenderbar; Vorgabe = Punktzahl der
 * genannten Bezugsnummer.
 */
export const ANALOG: Record<string, { titel: string; bezug: string; punkte: number }> = {
  mmp8: { titel: 'aMMP-8-Schnelltest (analog)', bezug: 'GOZ 4005', punkte: 80 },
  zungenreinigung: { titel: 'Zungenreinigung (analog)', bezug: 'GOZ 1020', punkte: 50 },
  pdt1: { titel: 'Photodynamische Therapie, erster Zahn (analog)', bezug: 'GOZ 4070', punkte: 100 },
  pdtw: { titel: 'Photodynamische Therapie, je weiterer Zahn (analog)', bezug: 'GOZ 4025', punkte: 15 },
  schienung: { titel: 'Parodontale Schienung je Interdentalraum (analog)', bezug: 'GOZ 2197', punkte: 130 },
  speicheltest: { titel: 'Speicheltest / Risikoanalyse (analog)', bezug: 'GOZ 4005', punkte: 80 },
  laser: { titel: 'Laser-Dekontamination der Tasche, je Zahn (analog)', bezug: 'GOZ 4025', punkte: 15 },
  prf: { titel: 'Aufbereitung von Eigenblut (PRF), je Sitzung (analog)', bezug: 'GOZ 4110', punkte: 180 },
}
