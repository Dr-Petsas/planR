import { useEffect, useState } from 'react'
import type { Einstellungen, GlobalOptionen, Plan, Regler } from './types'
import { useAblage } from './ablage'
import { mk } from './mandant'
import { leererPatient, patientMigrieren, praxisMigrieren, standardPraxis } from './stammdaten'

const PLAN_KEY = mk('privat-impl.plan.v1')
const EINST_KEY = mk('privat-impl.einstellungen.v1')
const LISTE_KEY = mk('privat-impl.liste.v1')

export const heute = () => new Date().toISOString().slice(0, 10)

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  praxis: standardPraxis(),
  gozFaktor: 2.3,
  goaeFaktor: 2.3,
  mwst: 19,
  gueltigMonate: 6,
  naechsteNummer: 1,
  erlaubeUeber35: false,
  stundensatz: 450,
  materialAnalog: true,
  materialPreise: {},
}

export const STANDARD_REGLER: Regler = {
  begleitStufe: 1,
  analogStufe: 1,
  analogBewertung: 1,
  gozFaktor: 0,
  goaeFaktor: 0,
  materialKlasse: 1,
  schabloneStufe: 0,
  laborAufschlag: 0,
  aus: [],
}

export const STANDARD_GLOBAL: GlobalOptionen = {
  bildgebung: 'dvt',
  navigation: false,
  sedierung: 'lokal',
  risiko: false,
  blut: 'keine',
  roehrchen: 0,
  eigenesBlutlabor: true,
}

export function neuerPlan(nummer: number): Plan {
  return {
    nummer: `IMPL-${new Date().getFullYear()}-${String(nummer).padStart(3, '0')}`,
    datum: heute(),
    patient: leererPatient(),
    zaehne: {},
    implantate: {},
    regionen: {},
    global: { ...STANDARD_GLOBAL },
    manuell: [],
    anpassungen: {},
    entfernt: [],
    regler: { ...STANDARD_REGLER },
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
