import { BEMA_PAR } from '../data/bema-par'
import type { Befund, DiagnoseErgebnis, Einstellungen, Plan, StreckePosition, UptTermin, ZahnBefund } from '../types'
import { istMehrwurzelig } from './zahnschema'

export const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`

const vorhandene = (b: Befund): [string, ZahnBefund][] =>
  Object.entries(b.zaehne).filter(([, z]) => z.zs !== 1)

/** Zähne, die in der AIT behandelt werden (ST >= 4 mm bzw. manuell gesetzte AIT-Zeile). */
export function aitZaehne(b: Befund): { ein: string[]; mehr: string[] } {
  const ein: string[] = []
  const mehr: string[] = []
  for (const [zahn, z] of vorhandene(b)) {
    const auto = z.st.some((w) => w != null && w >= 4)
    const behandelt = z.aitOverride == null ? auto : z.aitOverride
    if (!behandelt) continue
    if (istMehrwurzelig(zahn)) mehr.push(zahn)
    else ein.push(zahn)
  }
  return { ein, mehr }
}

/** Zähne mit Resttaschen ST >= 6 mm für die chirurgische Therapie (CPT). */
export function cptZaehne(b: Befund): { ein: string[]; mehr: string[] } {
  const ein: string[] = []
  const mehr: string[] = []
  for (const [zahn, z] of vorhandene(b)) {
    if (!z.st.some((w) => w != null && w >= 6)) continue
    if (istMehrwurzelig(zahn)) mehr.push(zahn)
    else ein.push(zahn)
  }
  return { ein, mehr }
}

/**
 * Zähne für die subgingivale Instrumentierung in der UPT (UPT e/f):
 * ST >= 4 mm mit Sondierungsbluten ODER eine Stelle mit ST >= 5 mm.
 */
export function subgingivalZaehne(b: Befund): { ein: string[]; mehr: string[] } {
  const ein: string[] = []
  const mehr: string[] = []
  for (const [zahn, z] of vorhandene(b)) {
    const treffer = z.st.some((w, i) => w != null && ((w >= 4 && z.bop[i]) || w >= 5))
    if (!treffer) continue
    if (istMehrwurzelig(zahn)) mehr.push(zahn)
    else ein.push(zahn)
  }
  return { ein, mehr }
}

/** Anzahl UPT-Sitzungen und Einzelmengen je Grad (zweijähriger UPT-Zeitraum). */
export function uptFrequenz(grad: 'A' | 'B' | 'C') {
  if (grad === 'A') return { sitzungen: 2, d: 0, g: 1, abstandMon: 10 }
  if (grad === 'B') return { sitzungen: 4, d: 2, g: 1, abstandMon: 5 }
  return { sitzungen: 6, d: 4, g: 1, abstandMon: 3 }
}

/** UPT-Terminplan über zwei Jahre mit frühestmöglichen Monatsabständen. */
export function uptPlan(grad: 'A' | 'B' | 'C'): UptTermin[] {
  const f = uptFrequenz(grad)
  // Monatsraster (frühestmöglich); UPT g frühestens 10 Monate nach erster UPT.
  const raster: Record<'A' | 'B' | 'C', number[]> = {
    A: [0, 10],
    B: [0, 5, 10, 15],
    C: [0, 3, 6, 10, 13, 16],
  }
  // In welcher Sitzung läuft UPT d / UPT g?
  const gSitzung: Record<'A' | 'B' | 'C', number> = { A: 2, B: 3, C: 4 }
  const dSitzungen: Record<'A' | 'B' | 'C', number[]> = { A: [], B: [2, 4], C: [2, 3, 5, 6] }

  const termine: UptTermin[] = []
  for (let i = 1; i <= f.sitzungen; i++) {
    const leistungen = ['UPT a', 'UPT b', 'UPT c', 'UPT e', 'UPT f']
    if (dSitzungen[grad].includes(i)) leistungen.push('UPT d')
    if (gSitzung[grad] === i) leistungen.push('UPT g')
    termine.push({
      index: i,
      label: `${i}. UPT`,
      monatAbStart: raster[grad][i - 1] ?? 0,
      leistungen,
    })
  }
  return termine
}

interface StreckeErgebnis {
  positionen: StreckePosition[]
  punkteGesamt: number
  summe: number
}

function pos(nr: keyof typeof BEMA_PAR, anzahl: number, phase: string, detail?: string): StreckePosition {
  const b = BEMA_PAR[nr]
  const punkteGesamt = b.punkte * anzahl
  return { nr: b.nr, titel: b.titel, anzahl, punkteEinzel: b.punkte, punkteGesamt, phase, detail }
}

/** Komplette Behandlungsstrecke als abrechenbare BEMA-Positionen. */
export function berechnen(plan: Plan, einst: Einstellungen, diag: DiagnoseErgebnis): StreckeErgebnis {
  const pw = einst.bemaPunktwert
  const p: StreckePosition[] = []
  const initial = plan.befunde.initial
  const ait = aitZaehne(initial)

  // 1. Diagnostik & Antrag
  p.push(pos('04', 1, 'Diagnostik'))
  p.push(pos('4', 1, 'Diagnostik'))
  p.push(pos('ATG', 1, 'Diagnostik'))
  p.push(pos('MHU', 1, 'Diagnostik'))

  // 2. Antiinfektiöse Therapie
  if (ait.ein.length) p.push(pos('AITa', ait.ein.length, 'AIT', ait.ein.join(', ')))
  if (ait.mehr.length) p.push(pos('AITb', ait.mehr.length, 'AIT', ait.mehr.join(', ')))

  // 3. Befundevaluation nach AIT
  p.push(pos('BEVa', 1, 'BEV'))

  // 4. Chirurgische Therapie (optional)
  if (plan.mitCPT) {
    const basis = plan.befunde.beva ?? initial
    const cpt = cptZaehne(basis)
    if (cpt.ein.length) p.push(pos('CPTa', cpt.ein.length, 'CPT', cpt.ein.join(', ')))
    if (cpt.mehr.length) p.push(pos('CPTb', cpt.mehr.length, 'CPT', cpt.mehr.join(', ')))
    p.push(pos('BEVb', 1, 'CPT'))
  }

  // 5. Unterstützende Parodontitistherapie (2 Jahre)
  const f = uptFrequenz(diag.grad)
  const basisUpt = plan.befunde.bevb ?? plan.befunde.beva ?? initial
  const sub = subgingivalZaehne(basisUpt)
  const zaehneGesamt = vorhandene(basisUpt).length
  p.push(pos('UPTa', f.sitzungen, 'UPT', `${f.sitzungen} Sitzungen`))
  p.push(pos('UPTb', f.sitzungen, 'UPT'))
  if (zaehneGesamt) p.push(pos('UPTc', f.sitzungen * zaehneGesamt, 'UPT', `${zaehneGesamt} Zähne × ${f.sitzungen}`))
  if (f.d) p.push(pos('UPTd', f.d, 'UPT'))
  if (sub.ein.length) p.push(pos('UPTe', f.sitzungen * sub.ein.length, 'UPT', `${sub.ein.length} Zähne × ${f.sitzungen}`))
  if (sub.mehr.length) p.push(pos('UPTf', f.sitzungen * sub.mehr.length, 'UPT', `${sub.mehr.length} Zähne × ${f.sitzungen}`))
  p.push(pos('UPTg', f.g, 'UPT'))

  // 6. Nebenleistungen
  if (plan.neben.n108 > 0) p.push(pos('108', plan.neben.n108, 'Nebenleistung'))
  if (plan.neben.n111 > 0) p.push(pos('111', plan.neben.n111, 'Nebenleistung'))

  const punkteGesamt = p.reduce((s, x) => s + x.punkteGesamt, 0)
  const summe = punkteGesamt * pw
  return { positionen: p, punkteGesamt, summe }
}
