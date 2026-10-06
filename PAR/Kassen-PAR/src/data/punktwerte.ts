// BEMA-Punktwerte fuer Teil 4 (PAR) je KZV und Kassenart.
//
// WICHTIG: Es gibt KEINE bundeseinheitliche Punktwerttabelle. Die Punktwerte
// werden regional zwischen KZV und Kassen(-verbaenden) vereinbart und aendern
// sich (meist jaehrlich). Fuer Primaerkassen gelten KZV-/kassenspezifische
// Werte, fuer Ersatzkassen der vdek-Punktwert nach Regionalkennzeichen.
//
// Die hier hinterlegten Werte sind REFERENZ-/RICHTWERTE (Stand s.u.) und MUESSEN
// von der Praxis gegen die aktuelle KZV-Rundschreiben-Lage geprueft werden.
// Dafuer gibt es: (1) manuellen Override in den Einstellungen, (2) CSV-Import
// der praxiseigenen Punktwerte. Beides hat Vorrang vor der Richtwert-Tabelle.

import { kzvNachNr, regionalkennzeichen } from './kzv'
import type { Einstellungen, Kassenart, Patient } from '../types'

export const PUNKTWERT_STAND = '2025 (Richtwerte, bitte pruefen)'
export const PUNKTWERT_QUELLE = 'KZV-Rundschreiben / KZBV Punktwertuebersicht'

export interface ParPunktwert {
  primaer: number // EUR je BEMA-Punkt (Primaerkassen)
  ersatz: number // EUR je BEMA-Punkt (Ersatzkassen / vdek)
}

/** Richtwerttabelle je KZV-Nr. Klar als Richtwert gekennzeichnet. */
export const PUNKTWERTE: Record<string, ParPunktwert> = {
  '02': { primaer: 1.1716, ersatz: 1.2088 }, // Baden-Wuerttemberg
  '11': { primaer: 1.1532, ersatz: 1.1900 }, // Bayern
  '30': { primaer: 1.1300, ersatz: 1.1650 }, // Berlin
  '53': { primaer: 1.1150, ersatz: 1.1480 }, // Brandenburg
  '31': { primaer: 1.1400, ersatz: 1.1750 }, // Bremen
  '32': { primaer: 1.1600, ersatz: 1.1950 }, // Hamburg
  '20': { primaer: 1.1450, ersatz: 1.1820 }, // Hessen
  '52': { primaer: 1.1080, ersatz: 1.1420 }, // Mecklenburg-Vorpommern
  '04': { primaer: 1.1380, ersatz: 1.1740 }, // Niedersachsen
  '13': { primaer: 1.1550, ersatz: 1.1900 }, // Nordrhein
  '06': { primaer: 1.1420, ersatz: 1.1780 }, // Rheinland-Pfalz
  '35': { primaer: 1.1360, ersatz: 1.1720 }, // Saarland
  '56': { primaer: 1.1120, ersatz: 1.1460 }, // Sachsen
  '54': { primaer: 1.1100, ersatz: 1.1440 }, // Sachsen-Anhalt
  '36': { primaer: 1.1480, ersatz: 1.1840 }, // Schleswig-Holstein
  '55': { primaer: 1.1140, ersatz: 1.1480 }, // Thueringen
  '37': { primaer: 1.1520, ersatz: 1.1880 }, // Westfalen-Lippe
}

/** Fallback, wenn keine KZV bestimmbar ist. */
export const PUNKTWERT_FALLBACK = 1.1900

const K_IMPORT = 'kassen-par.punktwerte-import.v1'

/** Praxiseigene, importierte Punktwerte (localStorage). Vorrang vor Richtwerten. */
export function ladeImport(): Record<string, ParPunktwert> {
  try {
    const roh = localStorage.getItem(K_IMPORT)
    return roh ? (JSON.parse(roh) as Record<string, ParPunktwert>) : {}
  } catch {
    return {}
  }
}

export function speichereImport(tab: Record<string, ParPunktwert>): void {
  localStorage.setItem(K_IMPORT, JSON.stringify(tab))
}

/**
 * CSV-Import: Zeilen "KZV-Nr;Primaer;Ersatz" (Dezimalkomma oder -punkt).
 * Kopfzeile wird erkannt und uebersprungen. Gibt die geparste Tabelle zurueck.
 */
export function csvParsen(text: string): Record<string, ParPunktwert> {
  const out: Record<string, ParPunktwert> = {}
  for (const zeile of text.split(/\r?\n/)) {
    const s = zeile.trim()
    if (!s) continue
    const teile = s.split(/[;\t]/.test(s) ? /[;\t]/ : ',').map((t) => t.trim())
    if (teile.length < 2) continue
    const nr = teile[0].replace(/\D/g, '').padStart(2, '0')
    if (!kzvNachNr(nr)) continue // Kopfzeile / Unsinn ueberspringen
    const num = (x: string) => Number(x.replace(/\./g, '').replace(',', '.'))
    const primaer = num(teile[1])
    const ersatz = teile[2] !== undefined && teile[2] !== '' ? num(teile[2]) : primaer
    if (Number.isFinite(primaer) && primaer > 0) {
      out[nr] = { primaer, ersatz: Number.isFinite(ersatz) && ersatz > 0 ? ersatz : primaer }
    }
  }
  return out
}

export interface PunktwertErgebnis {
  wert: number
  kzvNr: string
  kassenart: Kassenart
  quelle: 'override' | 'import' | 'richtwert' | 'fallback'
  richtwert: boolean
  hinweis: string
}

/** Ermittelt die KZV-Nr fuer die Abrechnung (feste Einstellung oder aus PLZ). */
export function aktiveKzv(einst: Einstellungen): string {
  if (einst.kzvNr) return einst.kzvNr
  // PLZ-Ableitung uebernimmt der Aufrufer (hier nur feste Einstellung).
  return ''
}

/**
 * Loest den Punktwert auf. Reihenfolge:
 * Override > Import(KZV) > Richtwert(KZV) > Fallback.
 * Bei Ersatzkassen bestimmt das Regionalkennzeichen der Kassennummer die
 * Region, sonst die KZV der Praxis.
 */
export function ermittlePunktwert(
  einst: Einstellungen,
  patient: Patient,
  kzvAusPraxis: string,
): PunktwertErgebnis {
  const kassenart = patient.kassenart
  // Manueller Override hat immer Vorrang.
  if (einst.bemaPunktwertOverride != null && einst.bemaPunktwertOverride > 0) {
    return {
      wert: einst.bemaPunktwertOverride, kzvNr: einst.kzvNr || kzvAusPraxis,
      kassenart, quelle: 'override', richtwert: false,
      hinweis: 'Manuell gesetzter Punktwert (Einstellungen).',
    }
  }
  // KZV bestimmen: Ersatzkassen ueber Regionalkennzeichen, sonst Praxis-KZV.
  let kzvNr = einst.kzvNr || kzvAusPraxis
  if (kassenart === 'ersatz') {
    const rk = regionalkennzeichen(patient.kassennummer)
    if (rk && PUNKTWERTE[rk]) kzvNr = rk
  }
  const imp = ladeImport()[kzvNr]
  if (imp) {
    const wert = kassenart === 'ersatz' ? imp.ersatz : imp.primaer
    return {
      wert, kzvNr, kassenart, quelle: 'import', richtwert: false,
      hinweis: 'Importierter Praxis-Punktwert.',
    }
  }
  const tab = PUNKTWERTE[kzvNr]
  if (tab) {
    const wert = kassenart === 'ersatz' ? tab.ersatz : tab.primaer
    return {
      wert, kzvNr, kassenart, quelle: 'richtwert', richtwert: true,
      hinweis: `Richtwert ${PUNKTWERT_STAND} - bitte gegen KZV-Rundschreiben pruefen.`,
    }
  }
  return {
    wert: PUNKTWERT_FALLBACK, kzvNr: '', kassenart, quelle: 'fallback', richtwert: true,
    hinweis: 'Keine KZV bestimmbar - bundesweiter Richtwert. PLZ/KZV setzen.',
  }
}
