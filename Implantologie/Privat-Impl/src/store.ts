import { useEffect, useState } from 'react'
import type { Einstellungen, Plan } from './types'
import { useAblage } from './ablage'
import { mk } from './mandant'
import { patientMigrieren, praxisMigrieren } from './stammdaten'
import { heute, neuerPlan, STANDARD_EINSTELLUNGEN, STANDARD_GLOBAL, STANDARD_REGLER } from './planNeu'

const PLAN_KEY = mk('privat-impl.plan.v1')
const EINST_KEY = mk('privat-impl.einstellungen.v1')
const LISTE_KEY = mk('privat-impl.liste.v1')

export { heute, neuerPlan, STANDARD_EINSTELLUNGEN, STANDARD_GLOBAL, STANDARD_REGLER }

function laden<T>(key: string, standard: T): T {
  try {
    const roh = localStorage.getItem(key)
    if (!roh) return standard
    const wert = JSON.parse(roh)
    return typeof standard === 'object' && standard && !Array.isArray(standard) ? { ...standard, ...wert } : wert
  } catch {
    return standard
  }
}

/** alte Stände auf das aktuelle Plan-Schema anheben (Regler/Global ergänzen) */
export function planMigrieren(p: Plan): Plan {
  return {
    ...neuerPlan(1),
    ...p,
    patient: patientMigrieren(p.patient),
    global: { ...STANDARD_GLOBAL, ...(p.global ?? {}) },
    regler: { ...STANDARD_REGLER, ...(p.regler ?? {}) },
    regionen: p.regionen ?? {},
    implantate: p.implantate ?? {},
  }
}

export function useGespeichert<T>(key: string, standard: () => T, migrieren: (w: T) => T = (w) => w) {
  const [wert, setWert] = useState<T>(() => migrieren(laden(key, standard())))
  useEffect(() => localStorage.setItem(key, JSON.stringify(wert)), [key, wert])
  return [wert, setWert] as const
}

export const usePlan = (nummer: number) => useGespeichert<Plan>(PLAN_KEY, () => neuerPlan(nummer), planMigrieren)
export const useImplAblage = () => useAblage<Plan>(LISTE_KEY)
export const useEinstellungen = () => useGespeichert<Einstellungen>(EINST_KEY, () => STANDARD_EINSTELLUNGEN, (e) => ({ ...STANDARD_EINSTELLUNGEN, ...e, praxis: praxisMigrieren(e.praxis) }))
