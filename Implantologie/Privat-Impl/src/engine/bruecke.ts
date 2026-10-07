import type { Plan, ZeVerweis } from '../types'
import { STANDARD_IMPLANTAT } from '../components/ImplantatDetails'

/** Austauschformat zwischen Privat-ZE-Planer und Implantologie-Planer. */
export interface ZeExport {
  app: 'privat-ze'
  nummer: string
  datum: string
  /** voraussichtliche Gesamtkosten der Suprakonstruktion */
  betrag: number
  zusammenfassung: string
  /** Zähne mit geplanter Implantat-Suprakonstruktion */
  implantate: { zahn: string; art: string }[]
}

const istZeExport = (d: unknown): d is ZeExport =>
  !!d && typeof d === 'object' && (d as ZeExport).app === 'privat-ze' && Array.isArray((d as ZeExport).implantate)

/**
 * Übernimmt einen ZE-Export in den Implantologie-Plan: setzt den Verweis und
 * belegt die Implantatzähne vor (Planung „IK", Standard-Implantatdetails),
 * ohne bereits getroffene Eingaben zu überschreiben.
 */
export function importAusZe(plan: Plan, daten: unknown): Plan {
  if (!istZeExport(daten)) throw new Error('kein ZE-Export')
  const zaehne = { ...plan.zaehne }
  const implantate = { ...plan.implantate }
  for (const { zahn } of daten.implantate) {
    if (!/^\d\d$/.test(zahn)) continue
    if (!zaehne[zahn]?.TP) zaehne[zahn] = { B: zaehne[zahn]?.B ?? 'f', TP: 'IK' }
    if (!implantate[zahn]) implantate[zahn] = { ...STANDARD_IMPLANTAT }
  }
  const zeVerweis: ZeVerweis = {
    nummer: daten.nummer, datum: daten.datum, betrag: daten.betrag,
    zusammenfassung: daten.zusammenfassung || 'Implantatgetragene Suprakonstruktion laut separatem Zahnersatz-Kostenvoranschlag.',
  }
  return { ...plan, zaehne, implantate, zeVerweis }
}
