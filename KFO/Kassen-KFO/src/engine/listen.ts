import bemaDaten from '../data/bema-kfo.json'
import gozMitgeliefert from '../data/goz-2012.json'
import { aktuell, zusaetzliche } from '../daten'
import type { GenutzteListe } from '../components/Listen'
import { kzvNachNr } from '../data/kzv'

export interface BemaEintrag {
  nr: string; text: string; punkte: number; gruppe: string; bereich: 'KFO' | 'KCH'
  ohneEigenanteil?: boolean; hoechst?: number; abschlag?: number; bestimmung?: string
}
export interface BelEintrag { nr: string; text: string; gewerbe: number; praxis: number }
export interface BelListe { id: string; kzv: string; name: string; gueltigAb: string; eintraege: BelEintrag[] }
interface GozEintrag { nr: string; text: string; punkte?: number }

export const BEMA = bemaDaten.eintraege as BemaEintrag[]
const BEMA_MAP = new Map(BEMA.map((b) => [b.nr, b] as const))
export const bemaEintrag = (nr: string) => BEMA_MAP.get(nr)
export const BEMA_STAND = bemaDaten.stand
export const FORMULAR_NAME = bemaDaten.formular

export const istRoentgen = (nr: string) => nr.startsWith('Ä')

const gozDaten = aktuell('goz-2012.json', gozMitgeliefert)
export const GOZ_PUNKTWERT = gozDaten.punktwert
const GOZ = new Map((gozDaten.eintraege as GozEintrag[]).map((e) => [e.nr, e] as const))
export const gozText = (nr: string) => GOZ.get(nr)?.text ?? ''
export const gozBekannt = (nr: string) => GOZ.has(nr)
export const gozEinzel = (nr: string, faktor: number) => runden((GOZ.get(nr)?.punkte ?? 0) * GOZ_PUNKTWERT * faktor)
export const GOZ_SCHWELLE = 2.3
export const GOZ_HOECHSTSATZ = 3.5

const DATEIEN = import.meta.glob<BelListe>('../data/bel/*.json', { eager: true, import: 'default' })
const MITGELIEFERT = Object.entries(DATEIEN).map(([pfad, l]) => ({ datei: pfad.replace('../data/', ''), liste: l }))

/** Listen, die "Preislisten aktualisieren" erneuert: BEL II je KZV und die GOZ für die Privatleistungen. */
export const GENUTZTE_LISTEN: GenutzteListe[] = [
  ...MITGELIEFERT.map(({ datei, liste }) => ({ datei, name: liste.name, mitgeliefert: liste, aktuell: aktuell(datei, liste) })),
  { datei: 'goz-2012.json', name: 'GOZ (Mehr- und Zusatzleistungen)', mitgeliefert: gozMitgeliefert, aktuell: gozDaten },
]
export const LISTEN_ORDNER = ['bel/']

export const BEL_LISTEN: BelListe[] = [
  ...GENUTZTE_LISTEN.filter((g) => g.datei.startsWith('bel/')).map((g) => g.aktuell as unknown as BelListe),
  ...zusaetzliche<BelListe>('bel/', MITGELIEFERT.map((m) => m.datei)),
]

/** BEL-II-Liste der KZV, die am Stichtag gilt (sonst die jüngste dieser KZV). */
export function belListeFuer(kzvNr: string, stichtag: string): BelListe | undefined {
  const eigene = BEL_LISTEN.filter((l) => l.kzv === kzvNr).sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb))
  return eigene.find((l) => l.gueltigAb <= stichtag) ?? eigene[eigene.length - 1]
}

export const kzvName = (nr: string) => kzvNachNr(nr)?.name ?? nr

/** "7010" → "701 0" (Schreibweise der BEL II) */
export const belNr = (nr: string) => (/^\d{4}$/.test(nr) ? `${nr.slice(0, 3)} ${nr[3]}` : nr)

export const runden = (x: number) => Math.round(x * 100) / 100
