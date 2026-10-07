// BEMA 13a-d (Stand 01.01.2025, Beschluss Bewertungsausschuss 02.10.2024) und
// die mehrkostenfähigen Füllungsarten nach BEMA-Abrechnungsbestimmung 1 zu Nr. 13:
// "Füllungen in Mehrfarbentechnik zur ästhetischen Optimierung, von Satz 3 nicht
// erfasste adhäsiv befestigte Füllungen im Seitenzahnbereich, Einlagefüllungen,
// Goldhämmerfüllungen". Kassenleistung bleiben adhäsive Füllungen im Frontzahn-
// bereich und selbstadhäsive (ausnahmsweise Bulkfill-)Füllungen im Seitenzahnbereich.

import type { LaborPreis, Therapie } from '../types'

export interface BemaFuellung { nr: string; kuerzel: string; text: string; punkte: number }

export const BEMA_13: BemaFuellung[] = [
  { nr: '13a', kuerzel: 'F1', text: 'Füllung einflächig', punkte: 33 },
  { nr: '13b', kuerzel: 'F2', text: 'Füllung zweiflächig', punkte: 41 },
  { nr: '13c', kuerzel: 'F3', text: 'Füllung dreiflächig', punkte: 53 },
  { nr: '13d', kuerzel: 'F4', text: 'Füllung mehr als dreiflächig oder Eckenaufbau', punkte: 63 },
]

/** Vergleichbare preisgünstigste plastische Füllung nach Flächenzahl. */
export const bemaFuer = (flaechen: number): BemaFuellung => BEMA_13[Math.min(4, Math.max(1, flaechen)) - 1]

export interface TherapieEintrag {
  id: Therapie
  kuerzel: string
  titel: string
  kurz: string
  /** GOZ-Hauptleistung nach Flächenzahl */
  goz: (flaechen: number) => string
  analog?: boolean
  plastisch: boolean
  hinweis: string
}

const komposit = (f: number) => (f <= 1 ? '2060' : f === 2 ? '2080' : f === 3 ? '2100' : '2120')
const einlage = (f: number) => (f <= 1 ? '2150' : f === 2 ? '2160' : '2170')

export const THERAPIEN: TherapieEintrag[] = [
  {
    id: 'komposit', kuerzel: 'K', titel: 'Kompositfüllung in Adhäsivtechnik', kurz: 'Komposit adhäsiv (Seitenzahn)',
    goz: komposit, plastisch: true,
    hinweis: 'Mehrkostenfähig im Seitenzahnbereich: adhäsiv befestigte Kompositfüllung statt selbstadhäsiver Kassenfüllung.',
  },
  {
    id: 'mehrfarben', kuerzel: 'M', titel: 'Kompositfüllung in Mehrfarbentechnik', kurz: 'Mehrfarbentechnik (ästhetisch)',
    goz: komposit, plastisch: true,
    hinweis: 'Mehrkostenfähig in Front- und Seitenzahnbereich: Mehrfarben-Schichttechnik zur ästhetischen Optimierung.',
  },
  {
    id: 'inlay', kuerzel: 'I', titel: 'Einlagefüllung (Inlay)', kurz: 'Inlay (Keramik, CAD/CAM, Gold)',
    goz: einlage, plastisch: false,
    hinweis: 'Einlagefüllung mit Laborleistung; Anästhesie und besondere Maßnahmen sind dabei keine Kassenleistung (BEMA-Bestimmung 2 zu Nr. 13).',
  },
  {
    id: 'goldhaemmer', kuerzel: 'G', titel: 'Goldhämmerfüllung', kurz: 'Goldhämmerfüllung (analog)',
    goz: einlage, analog: true, plastisch: false,
    hinweis: 'In der GOZ nicht beschrieben, analog nach § 6 Abs. 1 GOZ (BZÄK-Katalog); Vergleichsleistung Einlagefüllung nach Flächen.',
  },
]

export const THERAPIE: Record<Therapie, TherapieEintrag> = Object.fromEntries(THERAPIEN.map((t) => [t.id, t])) as Record<Therapie, TherapieEintrag>
export const THERAPIE_NACH_KUERZEL: Record<string, TherapieEintrag> = Object.fromEntries(THERAPIEN.map((t) => [t.kuerzel, t]))

export const STANDARD_LABOR: LaborPreis[] = [
  { id: 'keramik', name: 'Keramik-Inlay (Fremdlabor)', preis: 185 },
  { id: 'cadcam', name: 'CAD/CAM-Keramik (chairside)', preis: 120 },
  { id: 'gold', name: 'Gold-Inlay (Labor + Legierung)', preis: 330 },
]

export const LABOR_KLASSE_FAKTOR = [0.85, 1, 1.2] as const
export const laborKlasseName = (k: number) => ['günstig', 'Standard', 'hochwertig'][k] ?? 'Standard'
