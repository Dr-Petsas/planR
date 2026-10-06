import { useEffect, useState } from 'react'
import { ALLE_ZAEHNE } from './engine/zahnschema'
import type { Befund, Einstellungen, Plan, ZahnBefund } from './types'

const K_PLAN = 'kassen-par.plan.v1'
const K_EINST = 'kassen-par.einstellungen.v1'

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  praxis: {
    name: 'Zahnarztpraxis',
    strasse: '',
    plz: '',
    ort: '',
    telefon: '',
    zahnarztNr: '',
    abrechnungsNr: '',
    behandler: '',
  },
  bemaPunktwert: 1.2088, // regionaler KZV-Punktwert (€) – bitte an KZV anpassen
  naechsteNummer: 1,
}

export function leererZahnBefund(): ZahnBefund {
  return { zs: 0, st: [null, null, null, null, null, null], bop: [false, false, false, false, false, false], lockerung: 0, fb: 0, aitOverride: null }
}

export function leererBefund(datum = heute()): Befund {
  const zaehne: Record<string, ZahnBefund> = {}
  for (const z of ALLE_ZAEHNE) zaehne[z] = leererZahnBefund()
  return { datum, zaehne }
}

export function heute(): string {
  return new Date().toISOString().slice(0, 10)
}

export function nummerFormat(n: number): string {
  const jahr = new Date().getFullYear()
  return `PAR-${jahr}-${String(n).padStart(3, '0')}`
}

export function neuerPlan(nummer: number): Plan {
  return {
    nummer: nummerFormat(nummer),
    datum: heute(),
    patient: { name: '', geburtsdatum: '', kasse: '', versichertennr: '', kostentraegerkennung: '' },
    diagnose: {
      alter: 0,
      knochenabbauProzent: 0,
      knochenabbauZahn: '',
      calMax: 0,
      zahnverlustPar: 0,
      raucher: 'nein',
      diabetes: 'nein',
      st6plus: false,
      vertikalerKA3: false,
      furkationII_III: false,
      komplexeReha: false,
      diagnoseTyp: 'parodontitis',
    },
    befunde: { initial: leererBefund() },
    mitCPT: false,
    neben: { n108: 0, n111: 0 },
    bemerkung: '',
  }
}

function lade(key: string): unknown {
  try {
    const roh = localStorage.getItem(key)
    return roh ? JSON.parse(roh) : null
  } catch {
    return null
  }
}

/** Fehlende Zähne/Felder nach einem Schema-Update ergänzen. */
export function planMigrieren(p: Plan): Plan {
  const fix = (b: Befund): Befund => {
    const zaehne: Record<string, ZahnBefund> = {}
    for (const z of ALLE_ZAEHNE) {
      const alt = b.zaehne?.[z]
      zaehne[z] = alt ? { ...leererZahnBefund(), ...alt } : leererZahnBefund()
    }
    return { datum: b.datum ?? heute(), zaehne }
  }
  return {
    ...neuerPlan(1),
    ...p,
    patient: { ...neuerPlan(1).patient, ...p.patient },
    diagnose: { ...neuerPlan(1).diagnose, ...p.diagnose },
    neben: { ...neuerPlan(1).neben, ...p.neben },
    befunde: {
      initial: fix(p.befunde?.initial ?? leererBefund()),
      beva: p.befunde?.beva ? fix(p.befunde.beva) : undefined,
      bevb: p.befunde?.bevb ? fix(p.befunde.bevb) : undefined,
    },
  }
}

export function einstMigrieren(e: Einstellungen): Einstellungen {
  return {
    ...STANDARD_EINSTELLUNGEN,
    ...e,
    praxis: { ...STANDARD_EINSTELLUNGEN.praxis, ...e.praxis },
  }
}

export function usePlan() {
  const [plan, setPlan] = useState<Plan>(() => {
    const g = lade(K_PLAN) as Plan | null
    return g ? planMigrieren(g) : neuerPlan(1)
  })
  useEffect(() => {
    localStorage.setItem(K_PLAN, JSON.stringify(plan))
  }, [plan])
  return [plan, setPlan] as const
}

export function useEinstellungen() {
  const [einst, setEinst] = useState<Einstellungen>(() => {
    const g = lade(K_EINST) as Einstellungen | null
    return g ? einstMigrieren(g) : STANDARD_EINSTELLUNGEN
  })
  useEffect(() => {
    localStorage.setItem(K_EINST, JSON.stringify(einst))
  }, [einst])
  return [einst, setEinst] as const
}
