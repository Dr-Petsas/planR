import type { EigenPosition } from './eigenlabor'

/**
 * Digitaler Workflow im Eigenlabor nach Intraoralscan: nur Arbeitsschritte ohne Entsprechung in der BEB.
 * Was die BEB schon kennt, bleibt BEB (0009 gedrucktes Modell, 0105 Druckstumpf, 0401 Steckartikulator,
 * 0833 Wax-up/Mock-up, 0723 Farbbestimmung). CAD-Konstruktion, Verbinder, Fräsen/Drucken sowie Sinter- und
 * Kristallisationsbrand sind in den gefrästen Kronen-, Gerüst- und Brückengliedpositionen enthalten –
 * gesondert berechnet wären sie doppelt.
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

/** Eigener Katalog der Praxis zuerst; fehlende Schritte des digitalen Workflows mit Standardpreis */
export function mitDigital(katalog: readonly EigenPosition[] | undefined): EigenPosition[] {
  const eigene = katalog ?? []
  return [...eigene, ...DIGITAL_KATALOG.filter((d) => !eigene.some((e) => e.nr.trim() === d.nr))]
}
