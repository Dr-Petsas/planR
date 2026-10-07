import { useEffect, useState } from 'react'
import type { Einstellungen, Plan, Regler } from './types'
import { STANDARD_LABOR } from './data/katalog'
import { useAblage } from './ablage'

const KEY_PLAN = 'kons-mkv.plan.v1'
const KEY_EINST = 'kons-mkv.einstellungen.v1'
const KEY_LISTE = 'kons-mkv.liste.v1'

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  praxis: { name: 'Zahnarztpraxis', zahnarzt: '', strasse: '', plz: '', ort: '', telefon: '', email: '' },
  modell: 'proFlaeche',
  proZahn: 50,
  proFlaeche: 20,
  faktor: 2.3,
  inlayFaktor: 2.3,
  gueltigMonate: 6,
  naechsteNummer: 1,
  kzvNr: '',
  punktwertOverride: null,
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
    patient: { name: '', geburtsdatum: '', kasse: '', kassennummer: '', versichertennr: '', kassenart: 'primaer' },
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
    patient: { ...basis.patient, ...p.patient },
    regler: { ...basis.regler, ...p.regler },
    zaehne: p.zaehne ?? {},
    bemerkung: p.bemerkung ?? '',
  }
}

function einstMigrieren(roh: unknown): Einstellungen {
  if (!roh || typeof roh !== 'object') return { ...STANDARD_EINSTELLUNGEN }
  const e = roh as Partial<Einstellungen>
  return {
    ...STANDARD_EINSTELLUNGEN,
    ...e,
    praxis: { ...STANDARD_EINSTELLUNGEN.praxis, ...e.praxis },
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
