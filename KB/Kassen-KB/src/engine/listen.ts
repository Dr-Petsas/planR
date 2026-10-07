import bemaDaten from '../data/bema-teil2.json'
import { aktuell, zusaetzliche } from '../daten'
import type { GenutzteListe } from '../components/Listen'
import { kzvNachNr } from '../data/kzv'

export interface BemaEintrag { nr: string; text: string; punkte: number; gruppe: string; bestimmung?: string }
export interface BelEintrag { nr: string; text: string; gewerbe: number; praxis: number }
export interface BelListe { id: string; kzv: string; name: string; gueltigAb: string; eintraege: BelEintrag[] }

export const BEMA: BemaEintrag[] = bemaDaten.eintraege
const BEMA_MAP = new Map(BEMA.map((b) => [b.nr, b] as const))
export const bemaEintrag = (nr: string) => BEMA_MAP.get(nr)
export const BEMA_STAND = bemaDaten.stand
export const FORMULAR_NAME = bemaDaten.formular
export const BEL_HINWEISE: Record<string, { bema?: string; abrechnung?: string }> = bemaDaten.belHinweise

/** Kieferbruch-Leistungen nach GOÄ (Ä…) – je nach KZV über KB oder KCH abgerechnet */
export const istGoae = (nr: string) => nr.startsWith('Ä')

const DATEIEN = import.meta.glob<BelListe>('../data/bel/*.json', { eager: true, import: 'default' })
const MITGELIEFERT = Object.entries(DATEIEN).map(([pfad, l]) => ({ datei: pfad.replace('../data/', ''), liste: l }))

/** BEL-II-Listen, die "Preislisten aktualisieren" erneuert (je KZV, neue Jahre kommen dazu). */
export const GENUTZTE_LISTEN: GenutzteListe[] = MITGELIEFERT.map(({ datei, liste }) => ({
  datei, name: liste.name, mitgeliefert: liste, aktuell: aktuell(datei, liste),
}))
export const LISTEN_ORDNER = ['bel/']

export const BEL_LISTEN: BelListe[] = [
  ...GENUTZTE_LISTEN.map((g) => g.aktuell as unknown as BelListe),
  ...zusaetzliche<BelListe>('bel/', MITGELIEFERT.map((m) => m.datei)),
]

/** BEL-II-Liste der KZV, die am Stichtag gilt (sonst die jüngste dieser KZV). */
export function belListeFuer(kzvNr: string, stichtag: string): BelListe | undefined {
  const eigene = BEL_LISTEN.filter((l) => l.kzv === kzvNr).sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb))
  return eigene.find((l) => l.gueltigAb <= stichtag) ?? eigene[eigene.length - 1]
}

export const kzvName = (nr: string) => kzvNachNr(nr)?.name ?? nr

/** "4010" → "401 0" (Schreibweise der BEL II) */
export const belNr = (nr: string) => (/^\d{4}$/.test(nr) ? `${nr.slice(0, 3)} ${nr[3]}` : nr)

export const runden = (x: number) => Math.round(x * 100) / 100
