import { useEffect, useState } from 'react'
import type { Einstellungen, Plan, Regler } from './types'
import { STANDARD_LABOR } from './data/katalog'
import { useAblage } from './ablage'
import { mk } from './mandant'
import { leererPatient, patientMigrieren, praxisMigrieren, standardPraxis } from './stammdaten'

const KEY_PLAN = mk('kons-mkv.plan.v1')
const KEY_EINST = mk('kons-mkv.einstellungen.v1')
const KEY_LISTE = mk('kons-mkv.liste.v1')

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  praxis: standardPraxis(),
  modell: 'proFlaeche',
  proZahn: 50,
  proFlaeche: 20,
  faktor: 2.3,
  inlayFaktor: 2.3,
  gueltigMonate: 6,
  naechsteNummer: 1,
  punktwertFest: {},
  laborPreise: STANDARD_LABOR.map((l) => ({ ...l })),
}

export const reglerAus = (e: Einstellungen): Regler => ({
  modell: e.modell,
  proZahn: e.proZahn,
  proFlaeche: e.proFlaeche,
  faktor: e.faktor,
  inlayFaktor: e.inlayFaktor,
  laborKlasse: 1,
})

export const nummerFormat = (n: number) => `FMKV-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`

export function neuerPlan(nummer: string, einst: Einstellungen): Plan {
  return {
    nummer,
    datum: new Date().toISOString().slice(0, 10),
    patient: leererPatient(),
    zaehne: {},
    regler: reglerAus(einst),
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

export const useMkvAblage = () => useAblage<Plan>(KEY_LISTE)
