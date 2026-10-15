import type { Einstellungen, Plan, Regler } from './types'
import { STANDARD_IMPLANTAT } from './engine/planung'
import { leererPatient, standardPraxis } from './stammdaten'

export const heute = () => new Date().toISOString().slice(0, 10)

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  praxis: standardPraxis(),
  gozFaktor: 2.3,
  mwst: 7,
  gueltigMonate: 6,
  naechsteNummer: 1,
  eigenlabor: [],
}

export const STANDARD_REGLER: Regler = { gozStufe: 0, gozFaktor: 0, laborStufe: 0, laborAufschlag: 0, aus: [] }

export function neuerPlan(nummer: number): Plan {
  return {
    nummer: `KV-${new Date().getFullYear()}-${String(nummer).padStart(3, '0')}`,
    datum: heute(),
    patient: leererPatient(),
    zaehne: {},
    abformung: '',
    abformungProthese: '',
    implantat: STANDARD_IMPLANTAT,
    manuell: [],
    anpassungen: {},
    entfernt: [],
    regler: STANDARD_REGLER,
    bemerkung: '',
  }
}
