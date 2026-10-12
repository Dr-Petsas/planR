/** Pakete und Auswahllisten der Buchung – gemeinsam für Formular und Server */
export const PAKETE = {
  planr: { name: 'PlanR', monat: 69, sprachsteuerung: false },
  planr_clara: { name: 'PlanR + Sprach-KI', monat: 118, sprachsteuerung: true },
} as const
export type Paket = keyof typeof PAKETE
export const PRO_PLAN = 1.59
export const RECHTSFORMEN = ['Einzelpraxis', 'Berufsausübungsgemeinschaft', 'Praxisgemeinschaft', 'MVZ', 'Sonstige'] as const
export const SERVER = { server: 'Eigener Praxisserver', arbeitsplatz: 'Arbeitsplatz-PC, der dauerhaft läuft', unbekannt: 'Weiß ich nicht' } as const

export const ibanNorm = (iban: string) => iban.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Prüfziffer nach ISO 13616 (mod 97); deutsche IBAN haben 22 Stellen */
export function ibanGueltig(roh: string): boolean {
  const iban = ibanNorm(roh)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  if (iban.startsWith('DE') && iban.length !== 22) return false
  const zahl = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  let rest = 0
  for (const z of zahl) rest = (rest * 10 + Number(z)) % 97
  return rest === 1
}
