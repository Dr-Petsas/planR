import gozMitgeliefert from '../data/goz-2012.json'
import bebMitgeliefert from '../data/beb-itz-2024.json'
import goaeDaten from '../data/goae-kb.json'
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

/** GOÄ (nach § 6 Abs. 2 GOZ), hier nur Röntgen: Abschnitt O mit Schwelle 1,8 und Höchstsatz 2,5. */
const GOAE = new Map((goaeDaten.eintraege as (Eintrag & { kat?: string })[]).map((e) => [e.nr, e] as const))
export const GOAE_PUNKTWERT = goaeDaten.punktwert
export const ROE_SCHWELLE = 1.8
export const ROE_HOECHSTSATZ = 2.5
export const goaeText = (nr: string) => GOAE.get(nr)?.text ?? ''
export const istRoentgen = (nr: string) => GOAE.get(nr)?.kat === 'O'
export const goaeEinzel = (nr: string, faktor: number) => runden((GOAE.get(nr)?.punkte ?? 0) * GOAE_PUNKTWERT * faktor)
export const GOAE_POSITIONEN = [...GOAE.keys()]
/** Röntgenfaktor zum GOZ-Faktor des Reglers: bis 2,3 höchstens 1,8, darüber gleichmäßig bis 2,5 bei 3,5. */
export const roentgenFaktor = (f: number) =>
  f <= GOZ_SCHWELLE ? Math.min(f, ROE_SCHWELLE)
    : Math.min(ROE_HOECHSTSATZ, Math.round((ROE_SCHWELLE + (f - GOZ_SCHWELLE) * (ROE_HOECHSTSATZ - ROE_SCHWELLE) / (GOZ_HOECHSTSATZ - GOZ_SCHWELLE)) * 10) / 10)

/** Preis der Laborliste für eine Labornummer (undefined = nicht gelistet). */
export const laborListenPreis = (nr: string | undefined) => (nr ? LABOR.get(nr)?.preis : undefined)
