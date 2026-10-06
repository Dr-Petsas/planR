import type { EigenPosition } from './eigenlabor'

/**
 * Eigenlabor-Schritte des digitalen Workflows ohne BEB-Entsprechung. Den Ablauf nach Intraoralscan
 * (Oralscan, CAD, Druckstumpf, Sintern …) plant abformung.ts mit den BEB-Standardpositionen;
 * D101–D103 bleiben nur, damit ältere Pläne ihren Preis behalten.
 */
export const DIGITAL = {
  daten: 'D101',
  stumpf: 'D102',
  artikulation: 'D103',
  scanbody: 'D104',
  anprobe: 'D105',
} as const

export const DIGITAL_KATALOG: readonly EigenPosition[] = [
  { nr: DIGITAL.daten, text: 'Intraoralscan-Daten übernehmen, auf Vollständigkeit prüfen und für die Konstruktion aufbereiten (je Auftrag)', preis: 14 },
  { nr: DIGITAL.stumpf, text: 'Virtueller Stumpf: segmentieren, Präparationsgrenze festlegen, Zementspalt definieren (je Stumpf)', preis: 6.5 },
  { nr: DIGITAL.artikulation, text: 'Virtuelle Artikulation: Kieferrelation über Bukkalscan zuordnen, Okklusion im virtuellen Artikulator einstellen (je Auftrag)', preis: 14.5 },
  { nr: DIGITAL.scanbody, text: 'Scanbody-Matching: Implantatposition aus der Herstellerbibliothek zuordnen und prüfen (je Implantat)', preis: 9.5 },
  { nr: DIGITAL.anprobe, text: 'Anprobe gedruckt (Try-in aus Kunststoff) zur Passungs- und Ästhetikkontrolle (je Einheit)', preis: 9.5 },
]

/** Schritte, die der Ablauf nicht mehr plant, und ihre BEB-Nachfolger */
export const DIGITAL_ERSETZT: Readonly<Record<string, string>> = {
  [DIGITAL.daten]: 'BEB 0007, 0901',
  [DIGITAL.stumpf]: 'BEB 0013, 0904, 0905',
  [DIGITAL.artikulation]: 'BEB 0902',
}

/** Eigener Katalog der Praxis zuerst; fehlende Schritte des digitalen Workflows mit Standardpreis */
export function mitDigital(katalog: readonly EigenPosition[] | undefined): EigenPosition[] {
  const eigene = katalog ?? []
  return [...eigene, ...DIGITAL_KATALOG.filter((d) => !eigene.some((e) => e.nr.trim() === d.nr))]
}
