import { useEffect, useState } from 'react'
import type { Angaben, Einstellungen, Plan } from './types'
import { useAblage } from './ablage'
import { mk } from './mandant'
import { leererPatient, patientMigrieren, praxisMigrieren, standardPraxis } from './stammdaten'

const KEY_PLAN = mk('kassen-kb.plan.v1')
const KEY_EINST = mk('kassen-kb.einstellungen.v1')
const KEY_LISTE = mk('kassen-kb.liste.v1')

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  praxis: standardPraxis(),
  labor: 'gewerbe',
  fremdlaborName: '',
  kieferbruchKch: false,
  abformPauschale: 3,
  naechsteNummer: 1,
  punktwertFest: {},
}

export const leereAngaben = (): Angaben => ({
  art: 'kiefergelenk', unfall: false, verletzung: '', befund: '', behandlung: '',
  stationaer: false, krankenhaus: '', von: '', bis: '', schlafmedizin: false, genehmigungsverzicht: false, antragsnummer: '',
})

export const nummerFormat = (n: number) => `KB-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`

export function neuerPlan(nummer: string, einst: Einstellungen): Plan {
  return {
    nummer,
    datum: new Date().toISOString().slice(0, 10),
    patient: leererPatient(),
    angaben: leereAngaben(),
    positionen: [],
    labor: einst.labor,
    abformung: 'abdruck',
    fremdlabor: { name: einst.fremdlaborName },
    bemerkung: '',
  }
}

/** Ältere Pläne führten die UKPS unter „Kiefergelenkserkrankung“. */
function artMigrieren(p: Partial<Plan>, angaben: Angaben): Angaben {
  const pos = Array.isArray(p.positionen) ? p.positionen : []
  const nurUkps = pos.some((x) => x.ebene === 'BEMA' && x.nr.startsWith('UP')) && !pos.some((x) => x.ebene === 'BEMA' && /^K\d/.test(x.nr))
  return p.angaben?.art === 'kiefergelenk' && nurUkps ? { ...angaben, art: 'ukps' } : angaben
}

export function planMigrieren(roh: unknown, einst: Einstellungen): Plan {
  const basis = neuerPlan(nummerFormat(einst.naechsteNummer), einst)
  if (!roh || typeof roh !== 'object') return basis
  const p = roh as Partial<Plan>
  return {
    ...basis,
    ...p,
    patient: patientMigrieren(p.patient),
    angaben: artMigrieren(p, { ...basis.angaben, ...p.angaben }),
    positionen: Array.isArray(p.positionen) ? p.positionen : [],
    abformung: p.abformung === 'scan' ? 'scan' : 'abdruck',
    fremdlabor: { ...basis.fremdlabor, ...p.fremdlabor },
    bemerkung: p.bemerkung ?? '',
  }
}

export function einstMigrieren(roh: unknown): Einstellungen {
  if (!roh || typeof roh !== 'object') return { ...STANDARD_EINSTELLUNGEN, praxis: standardPraxis() }
  const e = roh as Partial<Einstellungen>
  return { ...STANDARD_EINSTELLUNGEN, ...e, praxis: praxisMigrieren(e.praxis), punktwertFest: e.punktwertFest ?? {} }
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
