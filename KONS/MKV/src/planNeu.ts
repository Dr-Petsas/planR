import type { Einstellungen, Plan, Regler } from './types'
import { STANDARD_LABOR } from './data/katalog'
import { leererPatient, standardPraxis } from './stammdaten'

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
  stiftPreis: 18,
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
