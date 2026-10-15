import gozMitgeliefert from '../data/goz-2012.json'
import goaeMitgeliefert from '../data/goae-zahnarzt.json'
import bebMitgeliefert from '../data/beb-itz-2024.json'
import { aktuell } from '../daten'
import type { GenutzteListe } from '../components/Listen'
import type { ListenEintrag } from '../types'
import { GOZ_ERGAENZUNG } from '../data/goz-sonderregeln'
import { bebErgaenzen } from './beb-standard'
import { mitDigital } from './digital'
import type { EigenPosition } from './eigenlabor'
import { katalogZuordnen } from './zuordnung'

const gozDaten = aktuell('goz-2012.json', gozMitgeliefert)
const goaeDaten = aktuell('goae-zahnarzt.json', goaeMitgeliefert)
const bebDaten = aktuell('beb-itz-2024.json', bebMitgeliefert)

/** Listen, die "Preislisten aktualisieren" erneuert. */
export const GENUTZTE_LISTEN: GenutzteListe[] = [
  { datei: 'goz-2012.json', name: 'GOZ (Privathonorar)', mitgeliefert: gozMitgeliefert, aktuell: gozDaten },
  { datei: 'goae-zahnarzt.json', name: 'GOÄ (für Zahnärzte geöffnete Abschnitte)', mitgeliefert: goaeMitgeliefert, aktuell: goaeDaten },
  { datei: 'beb-itz-2024.json', name: 'BEB (Privat-Labor, z. B. Bohrschablone)', mitgeliefert: bebMitgeliefert, aktuell: bebDaten },
]

export const BEB: Map<string, ListenEintrag> = new Map(
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
export const GOAE_PUNKTWERT = goaeDaten.punktwert

export const GOZ: Map<string, ListenEintrag> = new Map([
  ...(gozDaten.eintraege as ListenEintrag[]).map((e) => [e.nr, e] as const),
  ...GOZ_ERGAENZUNG.map((e) => [e.nr, e] as const),
])
export const GOAE: Map<string, ListenEintrag> = new Map((goaeDaten.eintraege as ListenEintrag[]).map((e) => [e.nr, e]))

export const runden = (x: number) => Math.round(x * 100) / 100

/** GOZ-Faktorrahmen (alle Abschnitte gleich). */
export const GOZ_SCHWELLE = 2.3
export const GOZ_HOECHSTSATZ = 3.5
/** Mit § 2-Vereinbarung zulässige Obergrenze. */
export const GOZ_VEREINBARUNG_MAX = 5.0

export const gozEinzel = (nr: string, faktor: number) =>
  runden((GOZ.get(nr)?.punkte ?? 0) * GOZ_PUNKTWERT * faktor)

/** GOÄ-Faktorrahmen je Eintrag (persönliche Leistungen, Röntgen, feste Zuschläge). */
export function goaeRahmen(nr: string): { schwelle: number; max: number } {
  const e = GOAE.get(nr)
  return { schwelle: e?.schwelle ?? 2.3, max: e?.maxFaktor ?? 3.5 }
}

export const goaeEinzel = (nr: string, faktor: number) =>
  runden((GOAE.get(nr)?.punkte ?? 0) * GOAE_PUNKTWERT * faktor)
