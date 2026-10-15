import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { Einstellungen, Plan } from './types'
import { useAblage } from './ablage'
import { mk } from './mandant'
import { patientMigrieren, praxisMigrieren } from './stammdaten'
import { neuerPlan, nummerFormat, STANDARD_EINSTELLUNGEN } from './planNeu'

export { neuerPlan, nummerFormat, reglerAus, STANDARD_EINSTELLUNGEN } from './planNeu'

const KEY_PLAN = mk('kons-mkv.plan.v1')
const KEY_EINST = mk('kons-mkv.einstellungen.v1')
const KEY_LISTE = mk('kons-mkv.liste.v1')

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
    bemerkung: p.bemerkung ?? '',
  }
}

function einstMigrieren(roh: unknown): Einstellungen {
  if (!roh || typeof roh !== 'object') return { ...STANDARD_EINSTELLUNGEN }
  // kzvNr / punktwertOverride: Stand vor den einheitlichen Anmeldedaten
  const { kzvNr, punktwertOverride, ...e } = roh as Partial<Einstellungen> & { kzvNr?: string; punktwertOverride?: number | null }
  return {
    ...STANDARD_EINSTELLUNGEN,
    ...e,
    praxis: praxisMigrieren(e.praxis, kzvNr),
    punktwertFest: e.punktwertFest ?? (punktwertOverride ? { KCH: punktwertOverride } : {}),
    laborPreise: e.laborPreise?.length ? e.laborPreise : STANDARD_EINSTELLUNGEN.laborPreise,
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

export const useMkvAblage = () => useAblage<Plan>(KEY_LISTE)
