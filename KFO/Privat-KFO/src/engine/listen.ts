import gozMitgeliefert from '../data/goz-2012.json'
import bebMitgeliefert from '../data/beb-itz-2024.json'
import goaeDaten from '../data/goae-kfo.json'
import { aktuell } from '../daten'
import type { GenutzteListe } from '../components/Listen'

interface Eintrag { nr: string; text: string; punkte?: number; preis?: number }
interface GoaeEintrag { nr: string; text: string; punkte: number; kat: string }

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

export const GOAE_PUNKTWERT = goaeDaten.punktwert
export const GOAE_NAME = goaeDaten.name
const GOAE = new Map((goaeDaten.eintraege as GoaeEintrag[]).map((e) => [e.nr, e] as const))

export const LABORLISTE_NAME = bebDaten.name

export const runden = (x: number) => Math.round(x * 100) / 100

export const GOZ_SCHWELLE = 2.3
export const GOZ_HOECHSTSATZ = 3.5
/** Mit § 2-Vereinbarung zulässige Obergrenze im Regler. */
export const GOZ_VEREINBARUNG_MAX = 5.0
/** GOÄ Abschnitt O (Röntgen): Schwelle 1,8, Höchstsatz 2,5, keine abweichende Vereinbarung. */
export const ROE_SCHWELLE = 1.8
export const ROE_HOECHSTSATZ = 2.5

/** Analogleistung: "6100a" = entsprechend GOZ 6100 ("a" allein = Bezugsleistung noch nicht gewählt) */
export const istAnalog = (nr: string) => /^\d{0,4}a$/.test(nr)
export const bezugNr = (nr: string) => (istAnalog(nr) ? nr.slice(0, -1) : nr)

export const gozBekannt = (nr: string) => GOZ.has(bezugNr(nr))
export const gozPunkte = (nr: string) => GOZ.get(bezugNr(nr))?.punkte ?? 0
export const gozText = (nr: string) => GOZ.get(bezugNr(nr))?.text ?? ''
export const gozEinzel = (nr: string, faktor: number) => runden(gozPunkte(nr) * GOZ_PUNKTWERT * faktor)

export const goaeEintrag = (nr: string) => GOAE.get(nr)
export const istRoentgen = (nr: string) => GOAE.get(nr)?.kat === 'O'
export const goaeEinzel = (nr: string, faktor: number) => runden((GOAE.get(nr)?.punkte ?? 0) * GOAE_PUNKTWERT * faktor)
/** GOÄ 5298: 25 % des einfachen Satzes – nur zu 5010–5290 (nicht zur OPG 5004). */
export const mitDigitalZuschlag = (nr: string) => /^\d{4}$/.test(nr) && +nr >= 5010 && +nr <= 5290
export const digitalZuschlag = (nr: string) => goaeEinzel(nr, 0.25)

/** Preis und Text der Laborliste (undefined = nicht gelistet). */
export const laborListenPreis = (nr: string | undefined) => (nr ? LABOR.get(nr)?.preis : undefined)
export const laborText = (nr: string) => LABOR.get(nr)?.text
