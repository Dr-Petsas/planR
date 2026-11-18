import gozMitgeliefert from '../data/goz-2012.json'
import bebMitgeliefert from '../data/beb-itz-2024.json'
import { aktuell } from '../daten'
import type { GenutzteListe } from '../components/Listen'
import type { ListenEintrag, Zeile } from '../types'
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

/** Zahntechnische Leistungen tragen 7 % MwSt. (§ 12 Abs. 2 Nr. 6 UStG), Praxismaterial („Mat.“) nicht. */
export const MWST_LABOR = 7
export const MWST_NR = 'MwSt.'
export function mwstZeile(zeilen: Zeile[]): Zeile | null {
  const netto = zeilen.filter((z) => z.ebene === 'LABOR' && z.nr !== MWST_NR && z.nr !== 'Mat.').reduce((s, z) => s + z.summe, 0)
  const betrag = runden(netto * MWST_LABOR / 100)
  return betrag > 0 ? { ebene: 'LABOR', nr: MWST_NR, text: `MwSt. ${MWST_LABOR} % auf zahntechnische Leistungen`, anzahl: 1, einzel: betrag, summe: betrag } : null
}

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
  '1': { nr: '1', text: 'Beratung – auch mittels Fernsprecher', punkte: 80 },
  '3': { nr: '3', text: 'Eingehende, das gewöhnliche Maß übersteigende Beratung – auch mittels Fernsprecher –, mindestens 10 Minuten', punkte: 150 },
  '5': { nr: '5', text: 'Symptombezogene Untersuchung', punkte: 80 },
  '6': { nr: '6', text: 'Vollständige Untersuchung mindestens eines Organsystems (Kauorgan)', punkte: 100 },
  '34': { nr: '34', text: 'Erörterung der Auswirkungen einer Erkrankung auf die Lebensgestaltung, mindestens 20 Minuten (Aufklärungsgespräch)', punkte: 300 },
  '5000': { nr: '5000', text: 'Röntgen Zähne, je Projektion', punkte: 50 },
  '5370': { nr: '5370', text: 'Computergesteuerte Tomographie im Kopfbereich (digitale Volumentomografie)', punkte: 2000 },
  '5377': { nr: '5377', text: 'Zuschlag für computergesteuerte Analyse einschließlich 3D-Rekonstruktion', punkte: 800 },
}
/** GOÄ-Zuschläge, die nur mit dem einfachen Satz berechnungsfähig sind. */
export const GOAE_NUR_EINFACH = new Set(['5377'])
export const GOAE_FAKTOR_TECHNIK = 1.8
