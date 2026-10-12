import { useSyncExternalStore } from 'react'
import type { GozEintrag, Komplex, Preisliste } from '../types'
import type { EigenPosition } from '../engine/eigenlabor'
import { MANDANT_ID, mk } from '../mandant'
import { datenBasen } from '../daten'
import { eigenlaborLesen, eigenlaborSpeichern } from './eigenlabor'
import { getListen, listeLoeschen, listeSpeichern, PRAXIS_GOZ_ID, STANDARD_LISTEN } from './preislisten'

/**
 * Preise & Positionen aus dem PVS der Praxis (PlanR-Übersicht → Einstellungen, /api/praxiskatalog):
 * Eigenlabor-Preise und Materialien kommen in den Eigenlabor-Katalog (als `quelle: 'pvs'`, beim nächsten
 * Abgleich ersetzt), eigene GOZ-/Analogpositionen, Kürzel und Faktoren in eine Praxis-GOZ-Liste, die die
 * automatische Listenwahl der mitgelieferten vorzieht, Komplexe in die Positionssuche.
 */

export interface PraxisKatalog {
  pvs: string
  stand: string
  listeName: string
  wahl?: { liste: number; spalte: number; faktoren: boolean }
  eigenlabor: { nr: string; text: string; preis: number; ersetzt?: string }[]
  goz: (GozEintrag & { eigen: boolean })[]
  komplexe: Komplex[]
}

interface Stand {
  /** Lesestand plus Wahl (Liste/Spalte/Faktoren) – ändert sich eins davon, wird neu angelegt */
  kennung: string
  pvs: string
  stand: string
  listeName: string
  eigenlabor: number
  goz: number
  komplexe: Komplex[]
}

const kennung = (k: PraxisKatalog) => `${k.stand}|${JSON.stringify(k.wahl ?? null)}`
const SPEICHER_KEY = mk('hkp.praxiskatalog.v1')

function laden(): Stand | null {
  try {
    const d = JSON.parse(localStorage.getItem(SPEICHER_KEY) ?? 'null')
    return d && typeof d.stand === 'string' ? { ...d, komplexe: Array.isArray(d.komplexe) ? d.komplexe : [] } : null
  } catch {
    return null
  }
}

let stand = typeof localStorage === 'undefined' ? null : laden()
const abonnenten = new Set<() => void>()

export const praxiskatalogStand = () => stand
export function usePraxiskatalog() {
  return useSyncExternalStore(
    (f) => {
      abonnenten.add(f)
      return () => abonnenten.delete(f)
    },
    () => stand,
  )
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

/** Eigenlabor-Katalog: Einträge aus dem PVS ersetzen die vorigen aus dem PVS und gleichnamige von Hand. */
export function eigenlaborMischen(bisher: readonly EigenPosition[], k: PraxisKatalog): EigenPosition[] {
  const neu: EigenPosition[] = k.eigenlabor.map((e) => ({ nr: e.nr, text: e.text, preis: e.preis, ...(e.ersetzt ? { ersetzt: e.ersetzt } : {}), quelle: 'pvs' }))
  const nummern = new Set(neu.map((e) => e.nr))
  return [...bisher.filter((e) => e.quelle !== 'pvs' && !nummern.has(e.nr)), ...neu]
}

export function praxiskatalogAnwenden(k: PraxisKatalog) {
  eigenlaborSpeichern(eigenlaborMischen(eigenlaborLesen(), k))
  const basis = STANDARD_LISTEN.find((l) => l.typ === 'goz') as Preisliste<'goz'> | undefined
  if (basis && k.goz.length) listeSpeichern(praxisGozListe(basis, k))
  else if (getListen().some((l) => l.id === PRAXIS_GOZ_ID)) listeLoeschen(PRAXIS_GOZ_ID)
  stand = {
    kennung: kennung(k), pvs: k.pvs, stand: k.stand, listeName: k.listeName, komplexe: k.komplexe,
    eigenlabor: k.eigenlabor.length, goz: k.goz.filter((g) => g.eigen).length,
  }
  localStorage.setItem(SPEICHER_KEY, JSON.stringify(stand))
  abonnenten.forEach((f) => f())
}

/** Holt den Praxiskatalog bei PlanR und legt ihn an, wenn er neuer ist als der übernommene. */
export async function praxiskatalogAbgleichen(): Promise<boolean> {
  for (const basis of datenBasen()) {
    try {
      const url = basis.replace(/daten\/$/, `api/praxiskatalog?mandant=${encodeURIComponent(MANDANT_ID)}`)
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
      if (!r.ok) continue
      const d = await r.json() as { katalog?: PraxisKatalog | null }
      const k = d.katalog
      if (!k || !Array.isArray(k.eigenlabor) || !Array.isArray(k.goz)) return false
      if (stand?.kennung === kennung(k)) return false
      praxiskatalogAnwenden(k)
      return true
    } catch {
      /* nächste Adresse */
    }
  }
  return false
}
