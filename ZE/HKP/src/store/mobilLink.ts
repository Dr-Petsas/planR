import type { LinkZugang } from './register'

/** Zugang aus der Adresse (?hkp=…&t=…[&f=…][&c=…]) oder null */
export function linkZugang(search: string): LinkZugang | null {
  const q = new URLSearchParams(search)
  const id = q.get('hkp'), t = q.get('t')
  if (!id || !t) return null
  return { id, t, f: q.get('f') ?? undefined, c: q.get('c') ?? undefined }
}

/** Handy-Ansicht: ansicht=mobil (Karte in der Clara-App) oder Link auf schmalem Bildschirm */
export function mobilGewuenscht(search: string, schmal: boolean) {
  if (!linkZugang(search)) return false
  const ansicht = new URLSearchParams(search).get('ansicht')
  return ansicht === 'mobil' || (ansicht !== 'voll' && schmal)
}

/** Derselbe HKP in der Desktop-Ansicht – ohne Freigabe-Schlüssel */
export function vollansichtSuche(z: LinkZugang) {
  return `?${new URLSearchParams({ hkp: z.id, t: z.t, ...(z.c ? { c: z.c } : {}), ansicht: 'voll' })}`
}
