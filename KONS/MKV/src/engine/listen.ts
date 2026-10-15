import gozMitgeliefert from '../data/goz-2012.json'
import bebMitgeliefert from '../data/beb-itz-2024.json'
import { aktuell } from '../daten'
import type { GenutzteListe } from '../components/Listen'
import type { ListenEintrag } from '../types'
import { bebErgaenzen } from './beb-standard'
import { mitDigital } from './digital'
import type { EigenPosition } from './eigenlabor'
import { katalogZuordnen } from './zuordnung'

const gozDaten = aktuell('goz-2012.json', gozMitgeliefert)
const bebDaten = aktuell('beb-itz-2024.json', bebMitgeliefert)

/** Listen, die "Preislisten aktualisieren" erneuert. */
export const GENUTZTE_LISTEN: GenutzteListe[] = [
  { datei: 'goz-2012.json', name: 'GOZ (Privathonorar)', mitgeliefert: gozMitgeliefert, aktuell: gozDaten },
  { datei: 'beb-itz-2024.json', name: 'BEB (Inlay-Labor)', mitgeliefert: bebMitgeliefert, aktuell: bebDaten },
]

export const BEB: Map<string, { nr: string; text: string; preis: number }> = new Map(
  bebErgaenzen({ eintraege: bebDaten.eintraege as { nr: string; text: string; preis: number }[] }).eintraege.map((e) => [e.nr, e]),
)

const LEER: readonly EigenPosition[] = []
const zugeordnet = new WeakMap<readonly EigenPosition[], EigenPosition[]>()
/** Eigenlabor der Praxis, jede Position ihrem BEB-Leistungsschritt zugeordnet (wie im HKP) */
export function eigenKatalog(k: readonly EigenPosition[] = LEER): EigenPosition[] {
  let z = zugeordnet.get(k)
  if (!z) zugeordnet.set(k, (z = katalogZuordnen(mitDigital(k))))
  return z
}

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
