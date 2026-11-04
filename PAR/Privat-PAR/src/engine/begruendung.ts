// Standardbegründungen für Faktoren über 2,3 (§ 10 Abs. 3 GOZ): je Leistungsgruppe ein fachlich passender Text.
// Analogleistungen („a“) bemessen sich nach fachfremden Nummern – sie werden über den Leistungstext zugeordnet.

import type { Zeile } from '../types'
import { GOZ_SCHWELLE } from './listen'

const NACH_TEXT: [RegExp, string][] = [
  [/Instrumentierung/i, 'Erschwerte subgingivale Instrumentierung durch tiefe Taschen, Furkationsbeteiligung, harte Konkremente und eingeschränkte Zugänglichkeit.'],
  [/Diagnostik|Staging/i, 'Erhöhter diagnostischer Aufwand bei generalisiertem Befund mit zahlreichen erhöhten Sondierungstiefen und komplexer Einstufung.'],
  [/Aufklärung|Therapiegespräch/i, 'Erhöhter Zeitaufwand der Aufklärung durch komplexe Befundlage, Risikofaktoren (z. B. Diabetes, Rauchen) und ausführliche Motivation.'],
  [/Befundevaluation/i, 'Erhöhter Aufwand bei der Befundevaluation durch zahlreiche Messstellen und differenzierte Weiterplanung.'],
  [/Index/i, 'Erhöhter Aufwand bei der Indexerhebung durch zahlreiche entzündete Messstellen und engmaschige Verlaufskontrolle.'],
  [/Formblatt/i, 'Erhöhter Dokumentationsaufwand bei umfangreichem Befund.'],
]

const NACH_NR: [RegExp, string][] = [
  [/^400[05]$/, 'Erhöhter Aufwand bei der Befunderhebung durch zahlreiche erhöhte Sondierungstiefen, Furkations- und Lockerungsbefunde.'],
  [/^402[05]$/, 'Erhöhter Aufwand bei der Behandlung ausgedehnter Schleimhautentzündungen mit mehrfacher Applikation.'],
  [/^40(30|40)$/, 'Erhöhter Aufwand durch zahlreiche Retentionsstellen bzw. Vorkontakte und schwierige Zugänglichkeit.'],
  [/^40(50|55|60)$/, 'Erhöhter Zeitaufwand bei ausgeprägten harten und weichen Belägen, auch subgingival, und erschwerter Zugänglichkeit.'],
  [/^40(70|75)$/, 'Erschwerte geschlossene Therapie durch tiefe Taschen, Furkationsbeteiligung und harte subgingivale Konkremente.'],
  [/^40(80|90)$|^4100$/, 'Erschwerte chirurgische Darstellung bei ausgeprägten Knochendefekten, Furkationsbeteiligung und eingeschränkter Zugänglichkeit.'],
  [/^41(10|36|38)$/, 'Aufwändige regenerative Maßnahme bei ausgedehntem vertikalem Knochendefekt mit erschwerter Darstellung und Fixierung.'],
  [/^41(20|30|33)$/, 'Aufwändige plastische Weichgewebschirurgie mit spannungsfreier Adaptation und erhöhtem Nahtaufwand.'],
  [/^4150$/, 'Erhöhter Aufwand bei der Nachbehandlung durch verzögerte Wundheilung bzw. ausgedehntes Operationsgebiet.'],
  [/^10(00|10)$/, 'Erhöhter Instruktions- und Zeitaufwand bei schwierigen Mundhygieneverhältnissen und eingeschränkter Mitarbeit.'],
  [/^1040$/, 'Erhöhter Zeitaufwand der professionellen Zahnreinigung bei ausgeprägten Belägen und zahlreichen Nischen.'],
  [/^0(090|100)$/, 'Erhöhter Aufwand der Anästhesie bei entzündetem Gewebe und mehreren Injektionsorten.'],
  [/^0030$/, 'Erhöhter Planungsaufwand bei komplexem Befund mit mehrphasiger Therapie.'],
]

export function begruendungText(z: Pick<Zeile, 'nr' | 'text'>): string {
  const [liste, wert] = /a$/.test(z.nr) ? [NACH_TEXT, z.text] : [NACH_NR, z.nr]
  for (const [re, text] of liste) if (re.test(wert)) return text
  return 'Überdurchschnittlicher Schwierigkeitsgrad und Zeitaufwand im konkreten Behandlungsfall.'
}

/** Eine Begründung je Leistung über 2,3 (höchster Faktor), in der Reihenfolge des Plans. */
export function begruendungen(zeilen: Zeile[]): { zeile: Zeile; text: string }[] {
  const je = new Map<string, Zeile>()
  for (const z of zeilen) {
    if (z.fest || z.nr === 'Mat.' || z.faktor <= GOZ_SCHWELLE) continue
    const da = je.get(z.nr)
    if (!da || z.faktor > da.faktor) je.set(z.nr, z)
  }
  return [...je.values()].map((zeile) => ({ zeile, text: begruendungText(zeile) }))
}
