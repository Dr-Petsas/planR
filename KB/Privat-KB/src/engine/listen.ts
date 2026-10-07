import gozMitgeliefert from '../data/goz-2012.json'
import bebMitgeliefert from '../data/beb-itz-2024.json'
import { aktuell } from '../daten'
import type { GenutzteListe } from '../components/Listen'

interface Eintrag { nr: string; text: string; punkte?: number; preis?: number }

const gozDaten = aktuell('goz-2012.json', gozMitgeliefert)
const bebDaten = aktuell('beb-itz-2024.json', bebMitgeliefert)

/** Listen, die "Preislisten aktualisieren" erneuert. */
export const GENUTZTE_LISTEN: GenutzteListe[] = [
  { datei: 'goz-2012.json', name: 'GOZ (Privathonorar)', mitgeliefert: gozMitgeliefert, aktuell: gozDaten },
  { datei: 'beb-itz-2024.json', name: 'BEB-Laborpreise (Vorgabe)', mitgeliefert: bebMitgeliefert, aktuell: bebDaten },
]

export const GOZ_PUNKTWERT = gozDaten.punktwert
const GOZ = new Map((gozDaten.eintraege as Eintrag[]).map((e) => [e.nr, e] as const))
const LABOR = new Map((bebDaten.eintraege as Eintrag[]).map((e) => [e.nr, e] as const))

export const LABORLISTE_NAME = bebDaten.name

export const runden = (x: number) => Math.round(x * 100) / 100

export const GOZ_SCHWELLE = 2.3
export const GOZ_HOECHSTSATZ = 3.5
/** Mit § 2-Vereinbarung zulässige Obergrenze im Regler. */
export const GOZ_VEREINBARUNG_MAX = 5.0

export const gozPunkte = (nr: string) => GOZ.get(nr)?.punkte ?? 0
export const gozText = (nr: string) => GOZ.get(nr)?.text ?? ''
export const gozEinzel = (nr: string, faktor: number) => runden(gozPunkte(nr) * GOZ_PUNKTWERT * faktor)

/** Preis der Laborliste für eine Labornummer (undefined = nicht gelistet). */
export const laborListenPreis = (nr: string | undefined) => (nr ? LABOR.get(nr)?.preis : undefined)
