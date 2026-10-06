import type { Befund, BefundPhase, ParFall, ZahnBefund } from '../types'
import { ALLE_ZAEHNE, istBehandelbar, istMehrwurzelig } from './zahnschema'

export const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} \u20ac`

/** Natuerliche, behandelbare Zaehne (ZS 0, 3, 4) in Formular-Reihenfolge. */
export const behandelbare = (b: Befund): [string, ZahnBefund][] =>
  ALLE_ZAEHNE.filter((z) => b.zaehne[z] && istBehandelbar(b.zaehne[z].zs)).map((z) => [z, b.zaehne[z]])

/** Befund einer Phase aus dem Fall holen (letzter passender). */
export function befundFuer(fall: ParFall, phase: BefundPhase): Befund | undefined {
  const treffer = fall.befunde.filter((b) => b.phase === phase)
  return treffer.length ? treffer[treffer.length - 1] : undefined
}

export function initialBefund(fall: ParFall): Befund {
  return befundFuer(fall, 'initial') ?? fall.befunde[0]
}

/** Juengster Befund (nach Datum, sonst Listenreihenfolge). */
export function letzterBefund(fall: ParFall): Befund {
  return [...fall.befunde].sort((a, b) => (a.datum || '').localeCompare(b.datum || '')).at(-1) ?? fall.befunde[0]
}

export interface ZahnTeilung { ein: string[]; mehr: string[] }

const teilen = (zaehne: string[]): ZahnTeilung => ({
  ein: zaehne.filter((z) => !istMehrwurzelig(z)),
  mehr: zaehne.filter((z) => istMehrwurzelig(z)),
})

export const zaehneAus = (t: ZahnTeilung) => ALLE_ZAEHNE.filter((z) => t.ein.includes(z) || t.mehr.includes(z))

/** AIT-Zaehne: ST >= 4 mm bzw. manuell gesetzte AIT-Zeile; Implantate zaehlen nicht. */
export function aitZaehne(b: Befund): ZahnTeilung {
  return teilen(behandelbare(b)
    .filter(([, z]) => (z.aitOverride == null ? z.st.some((w) => w != null && w >= 4) : z.aitOverride))
    .map(([zahn]) => zahn))
}

/** CPT-Zaehne: Resttaschen ST >= 6 mm. */
export function cptZaehne(b: Befund): ZahnTeilung {
  return teilen(behandelbare(b).filter(([, z]) => z.st.some((w) => w != null && w >= 6)).map(([zahn]) => zahn))
}

/** UPT e/f: ST >= 4 mm mit Sondierungsbluten ODER ST >= 5 mm. */
export function subgingivalZaehne(b: Befund): ZahnTeilung {
  return teilen(behandelbare(b)
    .filter(([, z]) => z.st.some((w, i) => w != null && ((w >= 4 && z.bop[i]) || w >= 5)))
    .map(([zahn]) => zahn))
}

/** Parodontal betroffene Zaehne (ST >= 4 mm) – Grundlage der Roentgen-Wahl. */
export function betroffeneZaehne(b: Befund): string[] {
  return behandelbare(b).filter(([, z]) => z.st.some((w) => w != null && w >= 4)).map(([zahn]) => zahn)
}

/** Leistungsblock Blatt 2 v2.1.0 (Anzahl je Gebuehrennummer, "geplant"). */
export interface Leistungsblock { '4': number; ATG: number; MHU: number; AITa: number; AITb: number; BEVa: number }

export function leistungsblock(fall: ParFall): Leistungsblock {
  const ait = aitZaehne(initialBefund(fall))
  const ohne22a = fall.planung.par22a ? 0 : 1
  return { '4': 1, ATG: ohne22a, MHU: ohne22a, AITa: ait.ein.length, AITb: ait.mehr.length, BEVa: ohne22a }
}

/** UPT-Haeufigkeit (a, b, c, e, f) und Mindestabstand in Monaten je Grad. */
export function uptFrequenz(grad: 'A' | 'B' | 'C') {
  if (grad === 'A') return { sitzungen: 2, abstandMon: 10, dMax: 0 }
  if (grad === 'B') return { sitzungen: 4, abstandMon: 5, dMax: 2 }
  return { sitzungen: 6, abstandMon: 3, dMax: 4 }
}
