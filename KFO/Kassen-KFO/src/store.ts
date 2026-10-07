import { useEffect, useState } from 'react'
import type { Angaben, Einstellungen, Einstufung, Plan } from './types'
import { useAblage } from './ablage'
import { mk } from './mandant'
import { leererPatient, patientMigrieren, praxisMigrieren, standardPraxis } from './stammdaten'

const KEY_PLAN = mk('kassen-kfo.plan.v1')
const KEY_EINST = mk('kassen-kfo.einstellungen.v1')
const KEY_LISTE = mk('kassen-kfo.liste.v1')

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  praxis: standardPraxis(),
  labor: 'gewerbe',
  naechsteNummer: 1,
  punktwertFest: {},
  gozFaktor: 2.3,
  roentgenKfo: false,
  ohneEigenanteil121: false,
  materialPreise: {},
}

export const leereAngaben = (): Angaben => ({
  planArt: 'plan', behandlungsArt: 'regel', kigGruppe: '', kigGrad: 0, e34Uk: false, unfall: false, geschwister: false,
  anamnese: '', diagnoseOk: '', diagnoseUk: '', diagnoseBiss: '', therapieOk: '', therapieUk: '', therapieBiss: '',
  geraete: '', quartale: 12, antragsnummer: '', bezugsantrag: '',
})

export const leereEinstufung = (): Einstufung => ({
  okAktiv: false, ok: [null, null, null, null, null],
  ukAktiv: false, uk: [null, null, null, null, null],
  bissAktiv: false, biss: [null, null, null, null],
})

export const nummerFormat = (n: number) => `KFO-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`

export function neuerPlan(nummer: string, einst: Einstellungen): Plan {
  return {
    nummer,
    datum: new Date().toISOString().slice(0, 10),
    patient: leererPatient(),
    angaben: leereAngaben(),
    einstufung: leereEinstufung(),
    positionen: [],
    labor: einst.labor,
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
    angaben: { ...basis.angaben, ...p.angaben },
    einstufung: { ...basis.einstufung, ...p.einstufung },
    positionen: Array.isArray(p.positionen) ? p.positionen : [],
    bemerkung: p.bemerkung ?? '',
  }
}

export function einstMigrieren(roh: unknown): Einstellungen {
  if (!roh || typeof roh !== 'object') return { ...STANDARD_EINSTELLUNGEN, praxis: standardPraxis() }
  const e = roh as Partial<Einstellungen>
  return {
    ...STANDARD_EINSTELLUNGEN, ...e, praxis: praxisMigrieren(e.praxis),
    punktwertFest: e.punktwertFest ?? {}, materialPreise: e.materialPreise ?? {},
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
