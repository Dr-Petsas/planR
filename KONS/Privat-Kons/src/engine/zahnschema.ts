import type { Region } from '../types'

/** Zahnreihenfolge von links nach rechts (Blick auf den Patienten) */
export const OBERKIEFER = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
export const UNTERKIEFER = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']
export const ALLE_ZAEHNE = [...OBERKIEFER, ...UNTERKIEFER]

export const kieferVon = (zahn: string): 'OK' | 'UK' => (zahn[0] === '1' || zahn[0] === '2' ? 'OK' : 'UK')
export const istFrontzahn = (zahn: string) => ['1', '2', '3'].includes(zahn[1])
export const istMolar = (zahn: string) => ['6', '7', '8'].includes(zahn[1])
export const istWeisheitszahn = (zahn: string) => zahn.endsWith('8')

/** Kieferhälfte/Front einer Zahnregion – für GOZ-Positionen „je Kieferhälfte oder Frontzahnbereich". */
export function regionVon(zahn: string): Region {
  const ok = kieferVon(zahn) === 'OK'
  if (istFrontzahn(zahn)) return ok ? 'OK-F' : 'UK-F'
  const rechts = zahn[0] === '1' || zahn[0] === '4'
  if (ok) return rechts ? 'OK-R' : 'OK-L'
  return rechts ? 'UK-R' : 'UK-L'
}

/**
 * Typische Kanalzahl je Zahn – Vorschlag für die Endo-Eingabe.
 * (Oberkiefer-Molaren 3–4, Unterkiefer-Molaren 3, Prämolaren 1–2, Frontzähne 1.)
 */
export function kanaeleTypisch(zahn: string): number {
  const pos = zahn[1]
  if (['1', '2', '3'].includes(pos)) return 1
  if (['4', '5'].includes(pos)) return kieferVon(zahn) === 'OK' && pos === '4' ? 2 : 1
  // Molaren
  return kieferVon(zahn) === 'OK' ? 3 : 3
}
