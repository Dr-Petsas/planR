import { datenBasen } from './daten'
import { MANDANT_ID } from './mandant'
import type { EigenPosition } from './engine/eigenlabor'

/** Laborteil des Praxiskatalogs, den der PlanR-Server aus dem PVS liefert (derselbe wie im HKP) */
export interface PraxisKatalogLabor {
  pvs: string
  stand: string
  eigenlabor: { nr: string; text: string; preis: number; ersetzt?: string }[]
}

export interface KatalogStand {
  pvs: string
  stand: string
  anzahl: number
}

/**
 * EintrÃ¤ge aus dem PVS ersetzen die vorigen aus dem PVS und gleichnamige von Hand.
 * Eine von Hand festgelegte Zuordnung bleibt bei gleicher Nummer erhalten.
 */
export function eigenlaborMischen(bisher: readonly EigenPosition[], k: PraxisKatalogLabor): EigenPosition[] {
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

/** Praxiskatalog vom PlanR-Server (Sitzung nÃ¶tig); undefined, wenn keiner da oder nicht angemeldet */
export async function praxiskatalogHolen(): Promise<PraxisKatalogLabor | undefined> {
  for (const basis of datenBasen()) {
    try {
      const url = basis.replace(/daten\/$/, `api/praxiskatalog?mandant=${encodeURIComponent(MANDANT_ID)}`)
      const r = await fetch(url, { cache: 'no-store', credentials: 'include', signal: AbortSignal.timeout(8000) })
      if (!r.ok) continue
      const k = ((await r.json()) as { katalog?: PraxisKatalogLabor | null }).katalog
      return k && Array.isArray(k.eigenlabor) ? k : undefined
    } catch {
      /* nÃ¤chste Adresse */
    }
  }
  return undefined
}
