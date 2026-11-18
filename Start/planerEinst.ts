/**
 * Zentrale Planer-Einstellungen je Praxis (Faktoren, Preise, Eigenlabor): ein Stand für alle Arbeitsplätze,
 * gleich ob PlanR allein oder aus Pickadoc geöffnet ist. Jede Änderung zählt die Fassung hoch; wer auf einer
 * alten Fassung aufsetzt, bekommt den aktuellen Stand zurück statt ihn zu überschreiben.
 */
export interface EinstStand { v: number; zeit: string; von: string }
export type EinstAlle = Record<string, Record<string, unknown>>
export type EinstStaende = Record<string, EinstStand>

export const EINST_MAX = 200_000

export const istEinst = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

export function staendePruefen(roh: unknown): EinstStaende {
  if (!istEinst(roh)) return {}
  const aus: EinstStaende = {}
  for (const [modul, s] of Object.entries(roh)) {
    const e = s as Partial<EinstStand> | null
    if (e && Number.isInteger(e.v) && (e.v as number) >= 1) aus[modul] = { v: e.v as number, zeit: String(e.zeit ?? ''), von: String(e.von ?? '') }
  }
  return aus
}

export type EinstSetzen =
  | { ok: true; alle: EinstAlle; staende: EinstStaende; v: number }
  | { ok: false; grund: 'ungueltig' }
  | { ok: false; grund: 'konflikt'; v: number }

/** Neue Einstellungen eines Planers übernehmen – nur, wenn der Absender die aktuelle Fassung kennt. */
export function einstSetzen(alle: EinstAlle, staende: EinstStaende, modul: string, einst: unknown, basis: unknown, von: string, jetzt: string): EinstSetzen {
  if (!istEinst(einst) || JSON.stringify(einst).length > EINST_MAX) return { ok: false, grund: 'ungueltig' }
  const v = staende[modul]?.v ?? 0
  if (basis !== v) return { ok: false, grund: 'konflikt', v }
  return {
    ok: true, v: v + 1,
    alle: { ...alle, [modul]: einst },
    staende: { ...staende, [modul]: { v: v + 1, zeit: jetzt, von } },
  }
}

/** Alte Planer-Fassungen melden die Einstellungen ihres Browsers mit jedem Plan – das gilt nur, solange es keinen zentralen Stand gibt. */
export const altMeldungGilt = (staende: EinstStaende, modul: string) => !staende[modul]
