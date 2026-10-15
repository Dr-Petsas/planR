import { useEffect, useState } from 'react'
import type { Einstellungen, Plan } from './types'
import { markeLesen } from './engine/bruecken'
import { useAblage } from './ablage'
import { mk } from './mandant'
import { patientMigrieren, praxisMigrieren } from './stammdaten'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from './planNeu'

export { heute, neuerPlan, STANDARD_EINSTELLUNGEN, STANDARD_REGLER } from './planNeu'

const PLAN_KEY = mk('privat-kv.plan.v1')
const EINST_KEY = mk('privat-kv.einstellungen.v1')
const LISTE_KEY = mk('privat-kv.liste.v1')

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

/** früher eine Wahl 'beides' = Zähne gescannt, Überabdruck für den herausnehmbaren Teil */
export function planMigrieren(p: Plan): Plan {
  const abformung: Partial<Plan> = (p.abformung as string) === 'beides' ? { abformung: 'scan', abformungProthese: 'abdruck' } : {}
  return { ...p, ...abformung, patient: patientMigrieren(p.patient), zaehne: markenMigrieren(p.zaehne) }
}

/** Brückenstriche, die im Kürzel selbst stehen („-KM“), in die Brückenmarken übernehmen */
function markenMigrieren(zaehne: Plan['zaehne']): Plan['zaehne'] {
  return Object.fromEntries(Object.entries(zaehne).map(([z, d]) => {
    if (!d.TP.includes('-')) return [z, d]
    const m = markeLesen(d.TP)
    return [z, { ...d, TP: m.kuerzel, bAnfang: d.bAnfang || m.bAnfang, bEnde: d.bEnde || m.bEnde }]
  }))
}

export function useGespeichert<T>(key: string, standard: () => T, migrieren: (w: T) => T = (w) => w) {
  const [wert, setWert] = useState<T>(() => migrieren(laden(key, standard())))
  useEffect(() => localStorage.setItem(key, JSON.stringify(wert)), [key, wert])
  return [wert, setWert] as const
}

export const usePlan = (nummer: number) => useGespeichert<Plan>(PLAN_KEY, () => neuerPlan(nummer), planMigrieren)
export const useZeAblage = () => useAblage<Plan>(LISTE_KEY)
export const einstMigrieren = (e: Einstellungen): Einstellungen => ({ ...e, praxis: praxisMigrieren(e.praxis) })
export const useEinstellungen = () => useGespeichert<Einstellungen>(EINST_KEY, () => STANDARD_EINSTELLUNGEN, einstMigrieren)
