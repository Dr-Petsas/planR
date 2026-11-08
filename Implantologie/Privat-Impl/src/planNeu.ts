import type { Einstellungen, GlobalOptionen, Plan, Regler } from './types'
import { planNummer } from './ablage'
import { leererPatient, standardPraxis } from './stammdaten'

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

export const nummerFormat = (n: number) => planNummer('IMPL', n)

export function neuerPlan(nummer: number): Plan {
  return {
    nummer: nummerFormat(nummer),
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
