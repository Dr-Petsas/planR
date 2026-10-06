import type { Ebene, HkpPlan, Position } from '../types'
import { neueId } from '../format'

const zahnListe = (zahn: string) => zahn.split(/[^0-9]+/).filter((z) => z.length === 2)

type Teil = { ebene: Ebene; nr: string; anzahl?: number }

export interface NachtraeglicheLeistung {
  id: string
  titel: string
  /** Kassenleistung (Regelversorgung); fehlt sie, wird immer nach GOZ berechnet */
  bema?: Teil[]
  goz: Teil[]
  hinweis?: string
}

/**
 * Leistungen, die erst während der Behandlung anfallen und nicht aus Zeile B/TP folgen.
 * Stiftaufbauten mit Festzuschuss (1.4/1.5) laufen über die klinischen Angaben.
 */
export const NACHTRAEGLICHE_LEISTUNGEN: NachtraeglicheLeistung[] = [
  { id: 'krone-entfernen', titel: 'Alte Krone / Brückenanker entfernen', bema: [{ ebene: 'BEMA', nr: '23' }], goz: [{ ebene: 'GOZ', nr: '2290' }], hinweis: 'BEMA 23 je Trennstelle' },
  { id: 'wurzelstift-entfernen', titel: 'Wurzelstift entfernen', goz: [{ ebene: 'GOZ', nr: '2300' }], hinweis: 'keine BEMA-ZE-Leistung – Privatleistung nach GOZ' },
  { id: 'aufbau', titel: 'Aufbaufüllung (plastisch) ohne Stift', goz: [{ ebene: 'GOZ', nr: '2180' }], hinweis: 'bei Kassenkrone über KCH (BEMA 13), nicht im HKP' },
  { id: 'aufbau-adhaesiv', titel: 'Aufbaufüllung adhäsiv befestigt', goz: [{ ebene: 'GOZ', nr: '2180' }, { ebene: 'GOZ', nr: '2197' }] },
  { id: 'provisorium-stift', titel: 'Provisorische Krone mit Stiftverankerung', bema: [{ ebene: 'BEMA', nr: '21' }], goz: [{ ebene: 'GOZ', nr: '2270' }] },
  { id: 'krone-wiedereinsetzen', titel: 'Krone wieder einsetzen', bema: [{ ebene: 'BEMA', nr: '24a' }], goz: [{ ebene: 'GOZ', nr: '2310' }] },
  { id: 'provisorium-wiederbefestigen', titel: 'Provisorische Krone abnehmen und wieder befestigen', bema: [{ ebene: 'BEMA', nr: '24c' }], goz: [{ ebene: 'GOZ', nr: '2310' }] },
  { id: 'bruecke-wiedereinsetzen', titel: 'Brücke wieder einsetzen', bema: [{ ebene: 'BEMA', nr: '95a' }], goz: [{ ebene: 'GOZ', nr: '5110' }], hinweis: 'BEMA 95b bei mehr als 2 Ankern' },
  { id: 'krone-wiederherstellen', titel: 'Krone / Verblendung wiederherstellen', bema: [{ ebene: 'BEMA', nr: '24b' }], goz: [{ ebene: 'GOZ', nr: '2320' }] },
  { id: 'adhaesiv', titel: 'Adhäsive Befestigung', goz: [{ ebene: 'GOZ', nr: '2197' }] },
  { id: 'anaesthesie-infiltration', titel: 'Infiltrationsanästhesie', goz: [{ ebene: 'GOZ', nr: '0090' }], hinweis: 'bei Kassenleistungen über KCH (BEMA I), nicht im HKP' },
  { id: 'anaesthesie-leitung', titel: 'Leitungsanästhesie', goz: [{ ebene: 'GOZ', nr: '0100' }], hinweis: 'bei Kassenleistungen über KCH (BEMA L1), nicht im HKP' },
  { id: 'spanngummi', titel: 'Kofferdam / Spanngummi', goz: [{ ebene: 'GOZ', nr: '2040' }], hinweis: 'je Kieferhälfte oder Frontzahnbereich' },
]

const PRIVAT_ZAHN = /^(22[0-2]0|50[0-4]0|5120|2270|2195|2190)$/

/** Wird der Zahn privat (GOZ) versorgt? Dann fallen auch die Begleitleistungen nach GOZ an. */
export function zahnPrivat(plan: Pick<HkpPlan, 'positionen'>, zahn: string): boolean {
  const zs = zahnListe(zahn)
  return plan.positionen.some((p) => p.ebene === 'GOZ' && PRIVAT_ZAHN.test(p.nr) && zahnListe(p.zahn).some((z) => zs.includes(z)))
}

export function nachtraeglicheVariante(l: NachtraeglicheLeistung, plan: Pick<HkpPlan, 'positionen'>, zahn: string): Teil[] {
  return l.bema && !zahnPrivat(plan, zahn) ? l.bema : l.goz
}

export function nachtraeglichePositionen(id: string, zahn: string, plan: Pick<HkpPlan, 'positionen' | 'einstellungen'>): Position[] {
  const l = NACHTRAEGLICHE_LEISTUNGEN.find((x) => x.id === id)
  if (!l) return []
  return nachtraeglicheVariante(l, plan, zahn).map((t) => ({
    id: neueId(), ebene: t.ebene, nr: t.nr, zahn, anzahl: t.anzahl ?? 1, nachtraeglich: true,
    ...(t.ebene === 'GOZ' ? { faktor: plan.einstellungen.gozFaktor } : {}),
  }))
}
