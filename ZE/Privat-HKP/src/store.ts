import { useEffect, useState } from 'react'
import type { Einstellungen, Plan, Regler } from './types'
import { STANDARD_IMPLANTAT } from './engine/planung'
import { markeLesen } from './engine/bruecken'
import { useAblage } from './ablage'
import { mk } from './mandant'
import { leererPatient, patientMigrieren, praxisMigrieren, standardPraxis } from './stammdaten'

const PLAN_KEY = mk('privat-kv.plan.v1')
const EINST_KEY = mk('privat-kv.einstellungen.v1')
const LISTE_KEY = mk('privat-kv.liste.v1')

export const heute = () => new Date().toISOString().slice(0, 10)

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  praxis: standardPraxis(),
  gozFaktor: 2.3,
  mwst: 7,
  gueltigMonate: 6,
  naechsteNummer: 1,
  eigenlabor: [],
}

export const STANDARD_REGLER: Regler = { gozStufe: 0, gozFaktor: 0, laborStufe: 0, laborAufschlag: 0, aus: [] }

export function neuerPlan(nummer: number): Plan {
  return {
    nummer: `KV-${new Date().getFullYear()}-${String(nummer).padStart(3, '0')}`,
    datum: heute(),
    patient: leererPatient(),
    zaehne: {},
    abformung: '',
    abformungProthese: '',
    implantat: STANDARD_IMPLANTAT,
    manuell: [],
    anpassungen: {},
    entfernt: [],
    regler: STANDARD_REGLER,
    bemerkung: '',
  }
}

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
