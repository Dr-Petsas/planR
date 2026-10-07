import gozDaten from '../data/goz-2012.json'
import type { ListenEintrag } from '../types'

export const GOZ_PUNKTWERT = gozDaten.punktwert

export const GOZ: Map<string, ListenEintrag> = new Map(
  (gozDaten.eintraege as ListenEintrag[]).map((e) => [e.nr, e] as const),
)

export const runden = (x: number) => Math.round(x * 100) / 100

/** GOZ-Faktorrahmen (alle Abschnitte gleich). */
export const GOZ_SCHWELLE = 2.3
export const GOZ_HOECHSTSATZ = 3.5

export const gozPunkte = (nr: string) => GOZ.get(nr)?.punkte ?? 0
export const gozEinfach = (nr: string) => runden(gozPunkte(nr) * GOZ_PUNKTWERT)
export const gozText = (nr: string) => GOZ.get(nr)?.text ?? ''

/** GOZ 0120: Zuschlag für Laser, 100 % des einfachen Satzes der Leistung, höchstens 68 €. */
export const LASER_HOECHSTBETRAG = 68

/** GOÄ für die Röntgen-Messaufnahmen der Endo (technische Leistung, Faktor 1,8). */
export const GOAE_PUNKTWERT = 0.0582873
export const GOAE: Record<string, ListenEintrag> = {
  '5000': { nr: '5000', text: 'Röntgen Zähne, je Projektion', punkte: 50 },
}
export const GOAE_FAKTOR_TECHNIK = 1.8
