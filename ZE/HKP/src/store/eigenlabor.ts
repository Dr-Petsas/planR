import { useSyncExternalStore } from 'react'
import type { EigenPosition } from '../engine/eigenlabor'
import { mk } from '../mandant'

const SPEICHER_KEY = mk('hkp.eigenlabor.v1')

function laden(): EigenPosition[] {
  try {
    const d = JSON.parse(localStorage.getItem(SPEICHER_KEY) ?? '[]')
    return Array.isArray(d) ? d : []
  } catch {
    return []
  }
}

let katalog = laden()
const abonnenten = new Set<() => void>()

export function eigenlaborSpeichern(neu: EigenPosition[]) {
  katalog = neu
  localStorage.setItem(SPEICHER_KEY, JSON.stringify(neu))
  abonnenten.forEach((f) => f())
}

export function useEigenlabor() {
  return useSyncExternalStore(
    (f) => {
      abonnenten.add(f)
      return () => abonnenten.delete(f)
    },
    () => katalog,
  )
}
