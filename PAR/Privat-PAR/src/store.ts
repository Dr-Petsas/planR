import { useEffect, useState } from 'react'
import type { Einstellungen, Plan } from './types'
import { useAblage } from './ablage'
import { mk } from './mandant'
import { leererPatient, patientMigrieren, praxisMigrieren, standardPraxis } from './stammdaten'

const KEY_PLAN = mk('privat-par.plan.v1')
const KEY_EINST = mk('privat-par.einstellungen.v1')
const KEY_LISTE = mk('privat-par.liste.v1')

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  praxis: standardPraxis(),
  faktor: 2.3,
  variante: 'beratungsforum',
  gueltigMonate: 6,
  naechsteNummer: 1,
}

export const nummerFormat = (n: number) => `PPAR-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`

export function neuerPlan(nummer: string, einst: Einstellungen): Plan {
  return {
    nummer,
    datum: new Date().toISOString().slice(0, 10),
    patient: leererPatient(),
    gkv: false,
    stadium: 'III',
    grad: 'B',
    diagnose: '',
    fehlend: ['18', '28', '38', '48'],
    cpt: [],
    variante: einst.variante,
    optionen: { hkp: true, pzrAit: false, bevCpt: true },
    uptJahre: 2,
    resttaschen: 30,
    faktor: einst.faktor,
    faktoren: {},
    zusatz: [],
    bemerkung: '',
  }
}

export function planMigrieren(roh: unknown, einst: Einstellungen): Plan {
  const basis = neuerPlan(nummerFormat(einst.naechsteNummer), einst)
  if (!roh || typeof roh !== 'object') return basis
  const p = roh as Partial<Plan>
  return {
    ...basis,
    ...p,
    patient: patientMigrieren(p.patient),
    optionen: { ...basis.optionen, ...p.optionen },
    fehlend: Array.isArray(p.fehlend) ? p.fehlend : basis.fehlend,
    cpt: Array.isArray(p.cpt) ? p.cpt : [],
    faktoren: p.faktoren ?? {},
    zusatz: Array.isArray(p.zusatz) ? p.zusatz : [],
    bemerkung: p.bemerkung ?? '',
  }
}

export function einstMigrieren(roh: unknown): Einstellungen {
  if (!roh || typeof roh !== 'object') return { ...STANDARD_EINSTELLUNGEN, praxis: standardPraxis() }
  const e = roh as Partial<Einstellungen>
  return { ...STANDARD_EINSTELLUNGEN, ...e, praxis: praxisMigrieren(e.praxis) }
}

function lade(key: string): unknown | null {
  try {
    const s = localStorage.getItem(key)
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}

export function useEinstellungen(): [Einstellungen, (e: Einstellungen) => void] {
  const [einst, setEinst] = useState<Einstellungen>(() => einstMigrieren(lade(KEY_EINST)))
  useEffect(() => {
    localStorage.setItem(KEY_EINST, JSON.stringify(einst))
  }, [einst])
  return [einst, setEinst]
}

export function usePlan(einst: Einstellungen): [Plan, (p: Plan) => void] {
  const [plan, setPlan] = useState<Plan>(() => planMigrieren(lade(KEY_PLAN), einst))
  useEffect(() => {
    localStorage.setItem(KEY_PLAN, JSON.stringify(plan))
  }, [plan])
  return [plan, setPlan]
}

export const usePlanAblage = () => useAblage<Plan>(KEY_LISTE)
