const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const ZAHL = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 })

export const euro = (n: number) => EUR.format(n || 0)
export const zahlDe = (n: number) => ZAHL.format(n || 0)
/** Für die Euro/Ct-Spalten des Vordrucks */
export function euroCt(n: number): [string, string] {
  const cent = Math.round((n || 0) * 100)
  return [Math.trunc(cent / 100).toLocaleString('de-DE'), String(Math.abs(cent % 100)).padStart(2, '0')]
}
export const euroGanz = (n: number) => `${Math.round(n || 0).toLocaleString('de-DE')} €`

/** Liest Eingaben wie "2,3" oder "1.234,50" */
export function eingabeZahl(s: string): number {
  const t = s.trim()
  if (!t) return NaN
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) ? n : NaN
}

export const neueId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
