/**
 * Diktierter Zahnbefund als eigene Datei am HKP (Chef 09.10.2026): Befundkürzel nach der
 * KZBV-Liste für den elektronischen HKP (_quellen/kuerzel.txt), Zähne nach FDI.
 */
import type { HkpPlan } from '../types'
import { ALLE_ZAEHNE, BEFUND_KUERZEL, OBERKIEFER, UNTERKIEFER } from '../engine/zahnschema'

export interface BefundZahn {
  zahn: string
  kuerzel: string
  bedeutung: string
  /** im Diktat genannt (sonst aus Lena-01, dem Auftrag oder angenommen) */
  diktiert: boolean
}

/** zaehne[i] trägt kuerzel[i] */
export interface BefundReihe {
  zaehne: string[]
  kuerzel: string[]
}

export interface BefundDatei {
  format: 'planr-zahnbefund'
  version: 1
  kuerzelliste: string
  zahnschema: 'FDI'
  erstellt: string
  erstelltVon: string
  hkpId: string
  patient: { name: string; vorname: string; geburtsdatum: string }
  quelle: { art: string; datum?: string; diktat: string }
  /** Befundzeile B des HKP je Kiefer in Formularreihenfolge ('' = ohne Befund) */
  befundzeile: { oberkiefer: BefundReihe; unterkiefer: BefundReihe }
  /** nur Zähne mit Befundkürzel */
  zaehne: BefundZahn[]
  legende: Record<string, string>
}

export interface BefundDateiAngaben {
  hkpId: string
  diktat: string
  diktiert: string[]
  quelle: { art: string; datum?: string }
  erstelltVon?: string
  erstellt?: string
}

const kuerzelVon = (plan: HkpPlan, z: string) => (plan.zaehne[z]?.B ?? '').trim().toLowerCase()

export function befundDatei(plan: HkpPlan, a: BefundDateiAngaben): BefundDatei {
  const diktiert = new Set(a.diktiert)
  const zeile = (reihe: string[]): BefundReihe => ({ zaehne: reihe, kuerzel: reihe.map((z) => kuerzelVon(plan, z)) })
  const zaehne = ALLE_ZAEHNE.map((zahn) => ({ zahn, kuerzel: kuerzelVon(plan, zahn) }))
    .filter((x) => x.kuerzel)
    .map((x) => ({ ...x, bedeutung: BEFUND_KUERZEL[x.kuerzel] ?? 'unbekanntes Kürzel', diktiert: diktiert.has(x.zahn) }))
  return {
    format: 'planr-zahnbefund',
    version: 1,
    kuerzelliste: 'KZBV – eHKP Zahnersatz, Liste zulässiger Befundkürzel',
    zahnschema: 'FDI',
    erstellt: a.erstellt ?? new Date().toISOString(),
    erstelltVon: a.erstelltVon ?? 'Clara (Sprachdiktat)',
    hkpId: a.hkpId,
    patient: { name: plan.patient.name ?? '', vorname: plan.patient.vorname ?? '', geburtsdatum: plan.patient.geburtsdatum ?? '' },
    quelle: { ...a.quelle, diktat: a.diktat },
    befundzeile: { oberkiefer: zeile(OBERKIEFER), unterkiefer: zeile(UNTERKIEFER) },
    zaehne,
    legende: Object.fromEntries([...new Set(zaehne.map((z) => z.kuerzel))].sort().map((k) => [k, BEFUND_KUERZEL[k] ?? 'unbekanntes Kürzel'])),
  }
}

const teil = (s: string) => s.trim().replace(/[^\p{L}\p{N}-]+/gu, '_').replace(/^_+|_+$/g, '')

/** „Befund_Meier_Hans_2026-10-09.json“ */
export function befundDateiName(d: BefundDatei): string {
  return `${['Befund', d.patient.name, d.patient.vorname, d.erstellt.slice(0, 10)].map(teil).filter(Boolean).join('_')}.json`
}
