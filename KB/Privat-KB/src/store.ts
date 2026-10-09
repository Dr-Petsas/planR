import { useEffect, useState } from 'react'
import type { Einstellungen, Plan, Regler } from './types'
import { useAblage } from './ablage'
import { mk } from './mandant'
import { leererPatient, patientMigrieren, praxisMigrieren, standardPraxis } from './stammdaten'

const KEY_PLAN = mk('privat-kb.plan.v1')
const KEY_EINST = mk('privat-kb.einstellungen.v1')
const KEY_LISTE = mk('privat-kb.liste.v1')

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  praxis: standardPraxis(),
  faktor: 2.3,
  faFaktor: 2.3,
  gueltigMonate: 6,
  naechsteNummer: 1,
  laborName: '',
  laborPreise: {},
  ukpsAnalog: '5220',
}

export const reglerAus = (e: Einstellungen): Regler => ({ faktor: e.faktor, faFaktor: e.faFaktor, laborKlasse: 1 })

export const nummerFormat = (n: number) => `PKB-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`

export function neuerPlan(nummer: string, einst: Einstellungen): Plan {
  return {
    nummer,
    datum: new Date().toISOString().slice(0, 10),
    patient: leererPatient(),
    diagnose: '',
    positionen: [],
    regler: reglerAus(einst),
    abformung: 'abdruck',
    fremdlabor: { name: einst.laborName },
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
    regler: { ...basis.regler, ...p.regler },
    positionen: Array.isArray(p.positionen) ? p.positionen : [],
    abformung: p.abformung === 'scan' ? 'scan' : 'abdruck',
    fremdlabor: { ...basis.fremdlabor, ...p.fremdlabor },
    diagnose: p.diagnose ?? '',
    bemerkung: p.bemerkung ?? '',
  }
}

export function einstMigrieren(roh: unknown): Einstellungen {
  if (!roh || typeof roh !== 'object') return { ...STANDARD_EINSTELLUNGEN, praxis: standardPraxis() }
  const e = roh as Partial<Einstellungen>
  return { ...STANDARD_EINSTELLUNGEN, ...e, praxis: praxisMigrieren(e.praxis), laborPreise: e.laborPreise ?? {} }
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
