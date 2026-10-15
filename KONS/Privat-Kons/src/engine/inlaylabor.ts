// Inlay-Labor nach BEB für die Kons-Planer (Füllungs-MKV, Privat-Kons), abgestimmt mit Privat-ZE:
// Inlay je Zahn; nach Abdruck je Kiefer mit Inlay ein Sägemodell, Gegenkiefer in Hartgips und die Montage im
// Mittelwertartikulator; nach Intraoralscan gedruckte Modelle und der digitale Ablauf (Oralscan aufbereiten,
// CAD-Auftragsdaten, Registrierung, Segmentierung je Kiefer, je Zahn Präp freilegen, Druckstumpf, Segment,
// Präpgrenze, CAD-Kaufläche und CAM-Nacharbeit, bei Keramik Kristallisationsbrand).
//
// Preise: Position der Praxis (DS-Win-Eigenlabor, zugeordnet wie im HKP) vor der BEB-Liste. Einzeln gerechnet
// wird ein Inlay nur, wenn die Praxis die Inlay-Position selbst führt – sonst gilt die Laborpauschale.

import { DIGITAL_BEB } from './digital'
import { eigenFinden, type EigenPosition } from './eigenlabor'

export type InlayWerkstoff = 'keramik' | 'gold'
export type Abformung = 'abdruck' | 'scan'

/** BEB: Keramik gefräst 2551–2554, Metall (gegossen) 2301–2304, nach Flächen */
export const INLAY_BEB: Record<InlayWerkstoff, readonly string[]> = {
  keramik: ['2551', '2552', '2553', '2554'],
  gold: ['2301', '2302', '2303', '2304'],
}
export const inlayBebNr = (w: InlayWerkstoff, flaechen: number) => INLAY_BEB[w][Math.min(4, Math.max(1, flaechen)) - 1]

export interface InlayAuftrag { zahn: string; werkstoff: InlayWerkstoff; flaechen: number }

export interface LaborPosten {
  nr: string
  /** Zahn, Kiefer (OK/UK) oder '' für den ganzen Auftrag */
  zahn: string
  anzahl: number
  text?: string
}

const kiefer = (zahn: string): string => (zahn[0] === '1' || zahn[0] === '2' ? 'OK' : 'UK')

export function inlayPositionen(inlays: readonly InlayAuftrag[], abformung: Abformung): LaborPosten[] {
  if (!inlays.length) return []
  const out: LaborPosten[] = []
  const p = (nr: string, zahn: string, text?: string) => out.push({ nr, zahn, anzahl: 1, ...(text ? { text } : {}) })
  const sortiert = [...inlays].sort((a, b) => a.zahn.localeCompare(b.zahn))
  const mitInlay = new Set(sortiert.map((i) => kiefer(i.zahn)))
  for (const i of sortiert) p(inlayBebNr(i.werkstoff, i.flaechen), i.zahn)
  if (abformung === 'abdruck') {
    for (const k of ['OK', 'UK']) p(mitInlay.has(k) ? '0021' : '0001', k)
    p('0402', '')
    return out
  }
  const D = DIGITAL_BEB
  for (const k of ['OK', 'UK']) p('0009', k)
  // ITZ führt unter 0007 noch das Kontrollmodell
  p(D.oralscan, '', 'Oralscan aufbereiten')
  p(D.auftragsdaten, '')
  p(D.registrierung, '')
  for (const k of mitInlay) p(D.segmentierung, k)
  for (const i of sortiert) for (const nr of [D.praepFreilegen, D.druckstumpf, D.segment, D.praepgrenze, D.kauflaeche, D.nacharbeiten]) p(nr, i.zahn)
  for (const i of sortiert) if (i.werkstoff === 'keramik') p(D.glanzbrand, i.zahn)
  return out
}

export interface LaborZeile extends LaborPosten {
  text: string
  preis: number
  /** Nummer der Praxisposition, wenn der Preis aus dem Praxiskatalog kommt */
  praxis?: string
}

/** Inlays mit eigener Praxisposition einzeln nach BEB, die übrigen bleiben für die Pauschale */
export function inlayLabor(
  inlays: readonly InlayAuftrag[], abformung: Abformung, katalog: readonly EigenPosition[],
  beb: ReadonlyMap<string, { text: string; preis: number }>,
): { zeilen: LaborZeile[]; pauschal: InlayAuftrag[] } {
  const ablauf = { auto: true, ablauf: abformung }
  const einzeln = inlays.filter((i) => eigenFinden(katalog, inlayBebNr(i.werkstoff, i.flaechen), ablauf))
  const zeilen = inlayPositionen(einzeln, abformung).map((p): LaborZeile => {
    const e = eigenFinden(katalog, p.nr, ablauf)
    const liste = beb.get(p.nr)
    return { ...p, text: e?.text ?? p.text ?? liste?.text ?? 'Laborleistung', preis: Math.round((e?.preis ?? liste?.preis ?? 0) * 100) / 100, ...(e ? { praxis: e.nr } : {}) }
  })
  return { zeilen, pauschal: inlays.filter((i) => !einzeln.includes(i)) }
}
