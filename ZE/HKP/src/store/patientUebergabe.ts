import type { Patient } from '../stammdaten'

/** Felder, die PlanR aus der Patientensuche mitgibt (alles andere bleibt beim leeren Plan) */
const FELDER = ['anrede', 'vorname', 'name', 'geburtsdatum', 'strasse', 'plz', 'ort', 'kasse', 'kassenNr', 'versichertenNr'] as const

/**
 * „Neuen HKP für …“ aus der PlanR-Patientensuche: #patient=<base64url-JSON>.
 * Steht im Fragment, damit Name und Kasse in keinem Server-Log landen. Ungültiges → null.
 */
export function patientAusFragment(hash: string): Partial<Patient> | null {
  const m = /(?:^#|&)patient=([A-Za-z0-9_-]{1,4000})(?:&|$)/.exec(hash)
  if (!m) return null
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0))
    const roh = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    if (!roh || typeof roh !== 'object') return null
    const p: Partial<Patient> = {}
    for (const k of FELDER) {
      const v = roh[k]
      if (typeof v === 'string' && v.trim()) p[k] = v.trim().slice(0, 120)
    }
    if (p.anrede && p.anrede !== 'Frau' && p.anrede !== 'Herr') delete p.anrede
    if (p.geburtsdatum && !/^\d{4}-\d{2}-\d{2}$/.test(p.geburtsdatum)) delete p.geburtsdatum
    return p.name || p.vorname ? p : null
  } catch {
    return null
  }
}
