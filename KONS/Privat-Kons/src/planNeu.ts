import type { Einstellungen, Plan } from './types'
import { planNummer } from './ablage'
import { STANDARD_LABOR, STANDARD_MATERIAL } from './data/katalog'
import { leererPatient, standardPraxis } from './stammdaten'

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  praxis: standardPraxis(),
  faktor: 2.3,
  stufe: 2,
  gueltigMonate: 6,
  naechsteNummer: 1,
  laborPreise: STANDARD_LABOR.map((l) => ({ ...l })),
  materialPreise: STANDARD_MATERIAL.map((m) => ({ ...m })),
}

export const nummerFormat = (n: number) => planNummer('PK', n)

export function neuerPlan(nummer: string, einst: Einstellungen): Plan {
  return {
    nummer,
    datum: new Date().toISOString().slice(0, 10),
    patient: leererPatient(),
    vereinbarung: 'pkv',
    behandlungstage: 0,
    zaehne: {},
    frei: [],
    regler: { faktor: einst.faktor, stufe: einst.stufe, materialKlasse: 1 },
    bemerkung: '',
  }
}
