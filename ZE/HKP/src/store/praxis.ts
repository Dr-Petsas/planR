import { useSyncExternalStore } from 'react'
import { mk } from '../mandant'
import { praxisMigrieren, type Praxis } from '../stammdaten'

/**
 * Praxis-Stammdaten wie in allen Planern. PLZ und KZV laufen zusätzlich in
 * plan.einstellungen.praxisPlz/kzv – diese Namen lesen MAS und die Engine.
 */
const KEY = mk('hkp.praxis.v1')

function laden(): Praxis {
  try {
    return praxisMigrieren(typeof localStorage === 'undefined' ? null : JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return praxisMigrieren(null)
  }
}

let praxis = laden()
const abonnenten = new Set<() => void>()

export function praxisSetzen(p: Praxis) {
  praxis = p
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* Speicher voll oder gesperrt – Wert bleibt für diese Sitzung */
  }
  abonnenten.forEach((f) => f())
}

export const getPraxis = () => praxis

export function usePraxis(): [Praxis, (p: Praxis) => void] {
  const p = useSyncExternalStore(
    (f) => {
      abonnenten.add(f)
      return () => abonnenten.delete(f)
    },
    () => praxis,
  )
  return [p, praxisSetzen]
}
