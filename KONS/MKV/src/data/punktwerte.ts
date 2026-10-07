// BEMA-Punktwert (konservierend-chirurgisch, Teil 1) je KZV und Kassenart.
//
// Es gibt KEINE bundeseinheitliche Tabelle: die Punktwerte vereinbaren KZV und
// Kassen(-verbände) regional, meist jährlich neu. Die Werte hier sind
// RICHTWERTE (Kopie der Tabelle aus dem Kassen-PAR-Planer) und müssen gegen das
// aktuelle KZV-Rundschreiben geprüft werden. Der Override in den Einstellungen
// hat immer Vorrang.

import { kzvAusPlz, regionalkennzeichen } from './kzv'
import type { Einstellungen, Patient } from '../types'

export const PUNKTWERT_STAND = '2025 (Richtwerte, bitte prüfen)'

interface Paar { primaer: number; ersatz: number }

export const PUNKTWERTE: Record<string, Paar> = {
  '02': { primaer: 1.1716, ersatz: 1.2088 }, // Baden-Württemberg
  '11': { primaer: 1.1532, ersatz: 1.19 }, // Bayern
  '30': { primaer: 1.13, ersatz: 1.165 }, // Berlin
  '53': { primaer: 1.115, ersatz: 1.148 }, // Brandenburg
  '31': { primaer: 1.14, ersatz: 1.175 }, // Bremen
  '32': { primaer: 1.16, ersatz: 1.195 }, // Hamburg
  '20': { primaer: 1.145, ersatz: 1.182 }, // Hessen
  '52': { primaer: 1.108, ersatz: 1.142 }, // Mecklenburg-Vorpommern
  '04': { primaer: 1.138, ersatz: 1.174 }, // Niedersachsen
  '13': { primaer: 1.155, ersatz: 1.19 }, // Nordrhein
  '06': { primaer: 1.142, ersatz: 1.178 }, // Rheinland-Pfalz
  '35': { primaer: 1.136, ersatz: 1.172 }, // Saarland
  '56': { primaer: 1.112, ersatz: 1.146 }, // Sachsen
  '54': { primaer: 1.11, ersatz: 1.144 }, // Sachsen-Anhalt
  '36': { primaer: 1.148, ersatz: 1.184 }, // Schleswig-Holstein
  '55': { primaer: 1.114, ersatz: 1.148 }, // Thüringen
  '37': { primaer: 1.152, ersatz: 1.188 }, // Westfalen-Lippe
}

export const PUNKTWERT_FALLBACK = 1.19

export interface PunktwertErgebnis {
  wert: number
  kzvNr: string
  hinweis: string
}

/** Override > Richtwert der KZV (Ersatzkassen: Regionalkennzeichen der Kassennummer) > Fallback. */
export function ermittlePunktwert(einst: Einstellungen, patient: Patient): PunktwertErgebnis {
  if (einst.punktwertOverride != null && einst.punktwertOverride > 0) {
    return { wert: einst.punktwertOverride, kzvNr: einst.kzvNr, hinweis: 'Punktwert manuell gesetzt (Einstellungen).' }
  }
  let kzvNr = einst.kzvNr || kzvAusPlz(einst.praxis.plz)
  if (patient.kassenart === 'ersatz') {
    const rk = regionalkennzeichen(patient.kassennummer)
    if (rk && PUNKTWERTE[rk]) kzvNr = rk
  }
  const tab = PUNKTWERTE[kzvNr]
  if (tab) {
    return {
      wert: patient.kassenart === 'ersatz' ? tab.ersatz : tab.primaer,
      kzvNr,
      hinweis: `Richtwert ${PUNKTWERT_STAND} – gegen das KZV-Rundschreiben prüfen.`,
    }
  }
  return { wert: PUNKTWERT_FALLBACK, kzvNr: '', hinweis: 'Keine KZV bestimmbar (Praxis-PLZ fehlt) – bundesweiter Richtwert.' }
}
