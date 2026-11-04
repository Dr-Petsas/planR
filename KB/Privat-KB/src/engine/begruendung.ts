// Standardbegründungen für Faktoren über der Schwelle (§ 10 Abs. 3 GOZ, GOÄ § 12 Abs. 3):
// je Leistungsgruppe ein fachlich passender Text, im Kostenvoranschlag und im PVS-Export.

import type { Zeile } from '../types'
import { grenzen } from './kb'

const UKPS: [RegExp, string][] = [
  [/Untersuchung/i, 'Erhöhter Untersuchungsaufwand bei Schlafapnoe: Beurteilung von Zahnhalt, Parodont, Kiefergelenken und Protrusionsfähigkeit als Voraussetzung der UKPS.'],
  [/Registrier|Startprotrusion/i, 'Erschwerte Bestimmung der Startprotrusionsposition durch eingeschränkte Protrusionsfähigkeit bzw. Kiefergelenkbefund mit mehrfacher Registrierung.'],
  [/Nachadaption|Titration|Protrusionsgrad/i, 'Erhöhter Aufwand bei der schrittweisen Titration des Protrusionsgrads mit Abgleich von Wirkung und Nebenwirkungen an Kiefergelenk und Zähnen.'],
  [/Kontrolle/i, 'Erhöhter Kontrollaufwand durch Beschwerden an Kiefergelenk, Muskulatur oder Zähnen und erforderliche Korrekturen der Schiene.'],
  [/instand|Wiederherstell|Reparatur/i, 'Erschwerte Wiederherstellung der Protrusionsmechanik mit erneuter Einstellung der therapeutischen Position.'],
  [/./, 'Erhöhter Aufwand bei der Eingliederung der Unterkieferprotrusionsschiene: Anpassung beider Schienenteile, Okklusionskontrolle und Einstellung der Protrusion unter Berücksichtigung von Kiefergelenk und Muskulatur.'],
]

const GRUPPEN: [RegExp, string][] = [
  [/^00(60|65)$/, 'Erhöhter Aufwand bei der Abformung bzw. digitalen Erfassung beider Kiefer einschließlich Bissregistrierung als Grundlage einer exakt passenden Schiene.'],
  [/^0040$/, 'Aufwändige Planung mit Abwägung mehrerer Therapieoptionen und ausführlicher Aufklärung über Wirkung, Tragezeit und Nachsorge.'],
  [/^70(00|10|20)$/, 'Erhöhter Aufwand bei Eingliederung und Adjustierung: wiederholte Okklusionskontrolle und Feinjustierung in statischer und dynamischer Okklusion bei funktionell auffälligem Befund.'],
  [/^70(30|40|50|60)$/, 'Erhöhter Aufwand bei Kontrolle und Korrektur durch funktionelle Veränderungen im Therapieverlauf mit mehrfacher Nachjustierung.'],
  [/^7(070|080|090|100)$/, 'Erhöhter Aufwand durch schwierige Zugänglichkeit, besondere Kau- und Parafunktionsbelastung und aufwändige Gestaltung.'],
  [/^8000$/, 'Erhöhter diagnostischer Aufwand bei komplexer funktioneller Befundlage von Kiefergelenken und Kaumuskulatur.'],
  [/^8010$/, 'Erschwerte Registrierung der Zentrallage durch muskuläre Verspannung bzw. eingeschränkte Unterkieferbeweglichkeit mit mehrfacher Wiederholung.'],
  [/^80(20|30|35)$/, 'Erhöhter Aufwand bei der Bestimmung der Scharnierachse durch eingeschränkte bzw. asymmetrische Unterkieferbeweglichkeit.'],
  [/^80(50|60|65)$/, 'Erhöhter Aufwand bei der Aufzeichnung der Unterkieferbewegungen durch gestörte Bewegungsabläufe und wiederholte Messungen.'],
  [/^80(80|90)|^8100$/, 'Erhöhter Aufwand bei der Modellanalyse bzw. dem diagnostischen Aufbau durch komplexe Okklusionsverhältnisse.'],
]

const ROENTGEN = 'Erhöhter Aufwand bei Einstellung, Aufnahme und Befundung (Kiefergelenke bzw. Atemweg) durch besondere anatomische Verhältnisse.'

export function begruendungText(z: Pick<Zeile, 'ebene' | 'nr' | 'text' | 'bemessung'>): string {
  if (z.ebene === 'GOAE') return ROENTGEN
  if (z.bemessung && /protrusion/i.test(z.text)) return UKPS.find(([re]) => re.test(z.text))![1]
  const nr = z.bemessung ?? z.nr
  for (const [re, text] of GRUPPEN) if (re.test(nr)) return text
  return 'Überdurchschnittlicher Schwierigkeitsgrad und Zeitaufwand im konkreten Behandlungsfall.'
}

/** Eine Begründung je Leistung über der Schwelle (höchster Faktor), in der Reihenfolge des Plans. */
export function begruendungen(honorar: Zeile[]): { zeile: Zeile; text: string }[] {
  const je = new Map<string, Zeile>()
  for (const z of honorar) {
    if ((z.faktor ?? 0) <= grenzen(z).schwelle) continue
    const k = `${z.ebene}|${z.nr}|${z.text}`
    const da = je.get(k)
    if (!da || (z.faktor ?? 0) > (da.faktor ?? 0)) je.set(k, z)
  }
  return [...je.values()].map((zeile) => ({ zeile, text: begruendungText(zeile) }))
}
