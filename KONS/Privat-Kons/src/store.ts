import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { Einstellungen, Plan } from './types'
import { nummerMitReihe, useAblage } from './ablage'
import { mk } from './mandant'
import { neuerPlan, nummerFormat, STANDARD_EINSTELLUNGEN } from './planNeu'
import { patientMigrieren, praxisMigrieren } from './stammdaten'

export { neuerPlan, nummerFormat, STANDARD_EINSTELLUNGEN } from './planNeu'

const KEY_PLAN = mk('privat-kons.plan.v2')
const KEY_EINST = mk('privat-kons.einstellungen.v2')
const KEY_LISTE = mk('privat-kons.liste.v2')

export function planMigrieren(roh: unknown, einst: Einstellungen): Plan {
  const basis = neuerPlan(nummerFormat(einst.naechsteNummer), einst)
  if (!roh || typeof roh !== 'object') return basis
  const p = roh as Partial<Plan>
  return {
    ...basis,
    ...p,
    patient: patientMigrieren(p.patient),
    regler: { ...basis.regler, ...p.regler },
    zaehne: p.zaehne ?? {},
    frei: p.frei ?? [],
    bemerkung: p.bemerkung ?? '',
    nummer: nummerMitReihe(p.nummer || basis.nummer),
  }
}

function einstMigrieren(roh: unknown): Einstellungen {
  if (!roh || typeof roh !== 'object') return { ...STANDARD_EINSTELLUNGEN }
  const e = roh as Partial<Einstellungen>
  return {
    ...STANDARD_EINSTELLUNGEN,
    ...e,
    praxis: praxisMigrieren(e.praxis),
    laborPreise: e.laborPreise?.length ? e.laborPreise : STANDARD_EINSTELLUNGEN.laborPreise,
    materialPreise: e.materialPreise?.length ? e.materialPreise : STANDARD_EINSTELLUNGEN.materialPreise,
  }
}

function lade(key: string): unknown | null {
  try {
    const s = localStorage.getItem(key)
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}

export function useEinstellungen(): [Einstellungen, Dispatch<SetStateAction<Einstellungen>>] {
  const [einst, setEinst] = useState<Einstellungen>(() => einstMigrieren(lade(KEY_EINST)))
  useEffect(() => {
    localStorage.setItem(KEY_EINST, JSON.stringify(einst))
  }, [einst])
  return [einst, setEinst]
}

export function usePlan(einst: Einstellungen): [Plan, Dispatch<SetStateAction<Plan>>] {
  const [plan, setPlan] = useState<Plan>(() => planMigrieren(lade(KEY_PLAN), einst))
  useEffect(() => {
    localStorage.setItem(KEY_PLAN, JSON.stringify(plan))
  }, [plan])
  return [plan, setPlan]
}

export const useKonsAblage = () => useAblage<Plan>(KEY_LISTE)
