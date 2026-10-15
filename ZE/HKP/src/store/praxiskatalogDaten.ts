import type { GozEintrag, Komplex, Preisliste } from '../types'
import type { EigenPosition } from '../engine/eigenlabor'
import { PRAXIS_GOZ_ID } from './preislisten'

/** Preise & Positionen aus dem PVS der Praxis (PlanR /api/praxiskatalog, für MAS /api/intern/praxiskatalog) */
export interface PraxisKatalog {
  pvs: string
  stand: string
  listeName: string
  wahl?: { liste: number; spalte: number; faktoren: boolean; belListe?: number; belSpalte?: number }
  eigenlabor: { nr: string; text: string; preis: number; ersetzt?: string }[]
  goz: (GozEintrag & { eigen: boolean })[]
  komplexe: Komplex[]
  /** BEL-Preise des Praxislabors (Kasse) – unteres Ende des Kassen-Schiebereglers */
  belListeName?: string
  bel?: { nr: string; text: string; preis: number }[]
}

export function belPreise(k: PraxisKatalog): Record<string, number> {
  const bel: Record<string, number> = {}
  for (const z of k.bel ?? []) if (z.preis > 0) bel[z.nr] = z.preis
  return bel
}

/** Mitgelieferte GOZ plus Kürzel/Faktoren der Praxis, ergänzt um ihre eigenen und analogen Positionen */
export function praxisGozListe(basis: Preisliste<'goz'>, k: PraxisKatalog): Preisliste<'goz'> {
  const ausPvs = new Map(k.goz.map((g) => [g.nr, g]))
  const eintraege: GozEintrag[] = basis.eintraege.map((e) => {
    const g = ausPvs.get(e.nr)
    return g ? { ...e, ...(g.kuerzel ? { kuerzel: g.kuerzel } : {}), ...(g.faktor ? { faktor: g.faktor } : {}) } : e
  })
  const bekannt = new Set(basis.eintraege.map((e) => e.nr))
  for (const g of k.goz) if (!bekannt.has(g.nr)) eintraege.push(g)
  return {
    ...basis, id: PRAXIS_GOZ_ID, name: `GOZ mit Praxispositionen (${k.pvs})`, standard: false,
    quelle: `${basis.name} · Kürzel, Faktoren und eigene Positionen aus ${k.pvs} (Stand ${k.stand.slice(0, 10)})`, eintraege,
  }
}

/**
 * Eigenlabor-Katalog: Einträge aus dem PVS ersetzen die vorigen aus dem PVS und gleichnamige von Hand.
 * Eine von Hand festgelegte Zuordnung („Einsatz in der Planung“) bleibt bei gleicher Nummer erhalten.
 */
export function eigenlaborMischen(bisher: readonly EigenPosition[], k: PraxisKatalog): EigenPosition[] {
  const hand = new Map(bisher.filter((e) => e.quelle === 'pvs' && e.zuordnung === 'hand').map((e) => [e.nr, e]))
  const neu: EigenPosition[] = k.eigenlabor.map((e) => {
    const h = hand.get(e.nr)
    return {
      nr: e.nr, text: e.text, preis: e.preis, ...(e.ersetzt ? { ersetzt: e.ersetzt } : {}), quelle: 'pvs',
      ...(h ? { fuer: h.fuer ?? '', ...(h.wenn ? { wenn: h.wenn } : {}), zuordnung: 'hand' as const } : {}),
    }
  })
  const nummern = new Set(neu.map((e) => e.nr))
  return [...bisher.filter((e) => e.quelle !== 'pvs' && !nummern.has(e.nr)), ...neu]
}
