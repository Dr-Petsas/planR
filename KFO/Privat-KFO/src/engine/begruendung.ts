// Standardbegründungen für Faktoren über der Schwelle (§ 10 Abs. 3 GOZ, § 12 Abs. 3 GOÄ):
// je Leistungsgruppe ein fachlich passender Text.

import type { Zeile } from '../types'
import { GOZ_SCHWELLE, istRoentgen } from './listen'

const GOZ: [RegExp, string][] = [
  [/^60(00|10|20)$/, 'Erhöhter diagnostischer Aufwand bei komplexer Dysgnathie mit skelettaler Komponente und aufwändiger Auswertung.'],
  [/^60[3-9]0$/, 'Überdurchschnittlicher Schwierigkeitsgrad der Behandlungsaufgabe über die Einstufungskriterien hinaus durch ausgeprägte Fehlstellung, skelettale Komponente und ungünstiges Wachstumsmuster.'],
  [/^61[0-3]0a?$/, 'Erhöhter Aufwand bei der Positionierung durch Engstand, Rotationen, Teilretention bzw. eingeschränkte Zugänglichkeit und schwierige Trockenlegung.'],
  [/^61[4-8]0$/, 'Erhöhter Aufwand bei Eingliederung und Aktivierung der Apparatur durch komplexe Zahnbewegungen und mehrfache Nachjustierung.'],
  [/^6(19|2[0-6])0$/, 'Erhöhter Aufwand durch schwierige Zugänglichkeit, komplexe Verankerungsverhältnisse bzw. eingeschränkte Mitarbeit.'],
  [/^00(60|65)$/, 'Erhöhter Aufwand bei der Abformung bzw. digitalen Erfassung durch Engstand, Bracketsituation oder ausgeprägten Würgereiz.'],
  [/^0040$/, 'Erhöhter Planungsaufwand bei komplexer kieferorthopädischer Befundlage mit Abwägung mehrerer Therapieoptionen.'],
]

export function begruendungText(z: Pick<Zeile, 'ebene' | 'nr'>): string {
  if (z.ebene === 'GOAE') {
    return istRoentgen(z.nr)
      ? 'Erhöhter Aufwand bei Einstellung, Aufnahme und Befundung durch besondere anatomische Verhältnisse und eingeschränkte Mitarbeit.'
      : 'Erhöhter Zeitaufwand der Beratung bzw. Untersuchung durch komplexe Befundlage und ausführliche Aufklärung von Patient/in und Eltern.'
  }
  for (const [re, text] of GOZ) if (re.test(z.nr)) return text
  return 'Überdurchschnittlicher Schwierigkeitsgrad und Zeitaufwand im konkreten Behandlungsfall.'
}

/** Eine Begründung je Leistung über ihrer Schwelle (höchster Faktor), in der Reihenfolge des Plans. */
export function begruendungen(zeilen: Zeile[]): { zeile: Zeile; text: string }[] {
  const je = new Map<string, Zeile>()
  for (const z of zeilen) {
    if ((z.ebene !== 'GOZ' && z.ebene !== 'GOAE') || (z.faktor ?? 0) <= (z.schwelle ?? GOZ_SCHWELLE)) continue
    const k = `${z.ebene}|${z.nr}`
    const da = je.get(k)
    if (!da || (z.faktor ?? 0) > (da.faktor ?? 0)) je.set(k, z)
  }
  return [...je.values()].map((zeile) => ({ zeile, text: begruendungText(zeile) }))
}
