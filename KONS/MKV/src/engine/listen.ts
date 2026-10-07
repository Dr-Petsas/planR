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
/** Mit § 2-Vereinbarung zulässige Obergrenze. */
export const GOZ_VEREINBARUNG_MAX = 5.0

export const gozPunkte = (nr: string) => GOZ.get(nr)?.punkte ?? 0

export const gozEinzel = (nr: string, faktor: number) =>
  runden(gozPunkte(nr) * GOZ_PUNKTWERT * faktor)

export const gozText = (nr: string) => GOZ.get(nr)?.text ?? ''
