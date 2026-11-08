import type { LinkZugang } from './register'

/** Zugang aus der Adresse (?hkp=…&t=…[&f=…][&c=…]) oder null */
export function linkZugang(search: string): LinkZugang | null {
  const q = new URLSearchParams(search)
  const id = q.get('hkp'), t = q.get('t')
  if (!id || !t) return null
  return { id, t, f: q.get('f') ?? undefined, c: q.get('c') ?? undefined }
}

/**
 * Handy-Karte: ansicht=mobil (Clara) oder ein SMS-Link im schmalen Browser.
 * In der PlanR-Übersicht (iframe) bleibt der Planer, sonst lädt der HKP über
 * /mas/planr, das es dort nicht gibt.
 */
export function mobilGewuenscht(search: string, schmal: boolean, eingebettet = false) {
  if (!linkZugang(search)) return false
  const ansicht = new URLSearchParams(search).get('ansicht')
  if (ansicht === 'voll') return false
  if (ansicht === 'mobil') return true
  if (eingebettet) return false
  return schmal
}

/** Derselbe HKP in der Desktop-Ansicht – ohne Freigabe-Schlüssel */
export function vollansichtSuche(z: LinkZugang) {
  return `?${new URLSearchParams({ hkp: z.id, t: z.t, ...(z.c ? { c: z.c } : {}), ansicht: 'voll' })}`
}
