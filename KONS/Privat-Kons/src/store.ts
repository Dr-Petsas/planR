import { useEffect, useState } from 'react'
import type { Einstellungen, Plan } from './types'
import { STANDARD_LABOR, STANDARD_MATERIAL } from './data/katalog'
import { useAblage } from './ablage'
import { mk } from './mandant'

const KEY_PLAN = mk('privat-kons.plan.v2')
const KEY_EINST = mk('privat-kons.einstellungen.v2')
const KEY_LISTE = mk('privat-kons.liste.v2')

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  praxis: { name: 'Zahnarztpraxis', zahnarzt: '', strasse: '', plz: '', ort: '', telefon: '', email: '' },
  faktor: 2.3,
  stufe: 2,
  gueltigMonate: 6,
  naechsteNummer: 1,
  laborPreise: STANDARD_LABOR.map((l) => ({ ...l })),
  materialPreise: STANDARD_MATERIAL.map((m) => ({ ...m })),
}

export const nummerFormat = (n: number) => `PK-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`

export function neuerPlan(nummer: string, einst: Einstellungen): Plan {
  return {
    nummer,
    datum: new Date().toISOString().slice(0, 10),
    patient: { name: '', geburtsdatum: '', versicherung: '', versichertennr: '' },
    vereinbarung: 'pkv',
    behandlungstage: 0,
    zaehne: {},
    frei: [],
    regler: { faktor: einst.faktor, stufe: einst.stufe, materialKlasse: 1 },
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
    frei: p.frei ?? [],
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

export const useKonsAblage = () => useAblage<Plan>(KEY_LISTE)
