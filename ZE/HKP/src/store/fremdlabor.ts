import { useSyncExternalStore } from 'react'
import type { EigenPosition } from '../engine/eigenlabor'
import { mk } from '../mandant'

/** Preisliste des Fremdlabors (eigene Nummern und Preise), zugeordnet wie die Eigenlabor-Positionen */
const SPEICHER_KEY = mk('hkp.fremdlabor.v1')

function laden(): EigenPosition[] {
  try {
    const d = JSON.parse(localStorage.getItem(SPEICHER_KEY) ?? '[]')
    return Array.isArray(d) ? d : []
  } catch {
    return []
  }
}

let katalog = typeof localStorage === 'undefined' ? [] : laden()
const abonnenten = new Set<() => void>()

export function fremdlaborSpeichern(neu: EigenPosition[]) {
  katalog = neu
  localStorage.setItem(SPEICHER_KEY, JSON.stringify(neu))
  abonnenten.forEach((f) => f())
}

export const fremdlaborLesen = () => katalog

export function useFremdlabor() {
  return useSyncExternalStore(
    (f) => {
      abonnenten.add(f)
      return () => abonnenten.delete(f)
    },
    () => katalog,
  )
}
