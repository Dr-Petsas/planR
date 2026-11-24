/**
 * Sitzungs-Cookie. Direkt auf planr.pickadoc.de bleibt es SameSite=Lax.
 * Die Übergabe aus DENS ONE läuft in einem Rahmen einer anderen Domain: Lax verwirft der Browser dort,
 * die Planliste bleibt unsichtbar. SameSite=None mit Partitioned gilt nur für genau diese Einbettung.
 */
export function sitzungsCookie(name: string, wert: string, sekunden: number, secure: boolean, rahmen: boolean): string {
  const same = rahmen && secure ? '; SameSite=None; Partitioned' : '; SameSite=Lax'
  return `${name}=${wert}; Path=/; Max-Age=${sekunden}; HttpOnly${same}${secure ? '; Secure' : ''}`
}

/** Sitzung aus dem DENS-ONE-Rahmen. Der Browser behält dort kein Cookie, der Kopf ersetzt es. */
export function rahmenToken(kopf: string | string[] | undefined): string {
  const roh = (Array.isArray(kopf) ? kopf[0] : kopf) ?? ''
  return /^[A-Za-z0-9_-]{20,200}$/.test(roh) ? roh : ''
}
