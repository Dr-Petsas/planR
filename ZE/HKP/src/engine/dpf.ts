import type { FestzuschussBefund, HkpPlan, Position, Versorgungsart, ZahnZeilen } from '../types'
import { OBERKIEFER, UNTERKIEFER } from './zahnschema'

/**
 * Datei-Schnittstelle der "Digitalen Planungshilfe Festzuschusssystem" (DPF3) der KZBV,
 * beschrieben in Anbindung-DPF3.txt (Stand 18.4.2022). Format: Windows-INI.
 * Zahnindex 1..32 läuft im Uhrzeigersinn: 1 = 18 … 16 = 28, 17 = 38 … 32 = 48.
 */
export const DPF_INDEX: string[] = [...OBERKIEFER, ...[...UNTERKIEFER].reverse()]

export const dpfZahn = (index: number) => DPF_INDEX[index - 1]
export const dpfIndex = (zahn: string) => DPF_INDEX.indexOf(zahn) + 1

export interface DpfLeistung {
  nr: string
  zahn: string
  anzahl: number
  fakultativ: boolean
}

export type DpfArt = 'g' | 'a' | 'z' | 'p'

export interface DpfErgebnis {
  befund: Record<string, string>
  regel: Record<string, string>
  therapie: Record<string, string>
  bema: DpfLeistung[]
  goz: DpfLeistung[]
  festzuschuss: DpfLeistung[]
  gleichAnders: Record<string, DpfArt>
  patient: Record<string, string>
}

export function iniLesen(text: string): Record<string, [string, string][]> {
  const gruppen: Record<string, [string, string][]> = {}
  let aktuell = ''
  for (const roh of text.split(/\r?\n/)) {
    const zeile = roh.trim()
    if (!zeile || zeile.startsWith(';')) continue
    const g = /^\[(.+)\]$/.exec(zeile)
    if (g) {
      aktuell = g[1].trim().toLowerCase()
      gruppen[aktuell] ??= []
      continue
    }
    const i = zeile.indexOf('=')
    if (i > 0 && aktuell) gruppen[aktuell].push([zeile.slice(0, i).trim(), zeile.slice(i + 1).trim()])
  }
  return gruppen
}

function zahnschema(eintraege: [string, string][] | undefined): Record<string, string> {
  const r: Record<string, string> = {}
  for (const [k, v] of eintraege ?? []) {
    const zahn = dpfZahn(Number(k))
    if (zahn && v) r[zahn] = v
  }
  return r
}

function leistungen(eintraege: [string, string][] | undefined): DpfLeistung[] {
  return (eintraege ?? []).map(([nr, wert]) => {
    const i = wert.lastIndexOf(';')
    const zahn = i >= 0 ? wert.slice(0, i) : ''
    const rest = i >= 0 ? wert.slice(i + 1) : wert
    return { nr, zahn: zahn.trim(), anzahl: Number.parseFloat(rest) || 1, fakultativ: rest.includes('?') }
  })
}

export function dpfErgebnisLesen(text: string): DpfErgebnis {
  const g = iniLesen(text)
  const gleichAnders: Record<string, DpfArt> = {}
  for (const [k, v] of g['gleich-anders'] ?? []) {
    const zahn = dpfZahn(Number(k))
    if (zahn && /^[gazp]$/i.test(v)) gleichAnders[zahn] = v.toLowerCase() as DpfArt
  }
  return {
    befund: zahnschema(g.befund),
    regel: zahnschema(g.regelversorgung),
    therapie: zahnschema(g.therapieplan ?? g.therapie),
    bema: leistungen(g.bema),
    goz: leistungen(g.goz),
    festzuschuss: leistungen(g.festzuschuss),
    gleichAnders,
    patient: Object.fromEntries(g.patient ?? []),
  }
}

const datumDe = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : iso
}

/** Befunddatei für den Aufruf `DPF3.EXE <Datei>`; ohne [Programm]Aufruf schreibt die DPF das Ergebnis in dieselbe Datei. */
export function dpfBefundDatei(plan: HkpPlan, ergebnisDatei?: string): string {
  const z = [
    '[Patient]',
    `Nachname=${plan.patient.name}`,
    `Vorname=${plan.patient.vorname}`,
    `Geburtsdatum=${datumDe(plan.patient.geburtsdatum)}`,
    `Patientennummer=${plan.patient.versichertenNr}`,
    '',
    '[HKP]',
    `Nummer=${plan.verwaltung.antragsnummer}`,
    '',
    '[Befund]',
  ]
  for (let i = 1; i <= 32; i++) {
    const b = plan.zaehne[dpfZahn(i)]?.B.trim()
    if (b) z.push(`${i}=${b}`)
  }
  if (ergebnisDatei) z.push('', '[Programm]', `Aufruf=${ergebnisDatei}`)
  return z.join('\r\n') + '\r\n'
}

/** Die DPF ist ein ANSI-Programm (Windows-1252). */
export function alsAnsi(text: string): Uint8Array {
  const tabelle: Record<string, number> = { '€': 0x80, '„': 0x84, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97 }
  return Uint8Array.from([...text].map((c) => {
    const n = c.charCodeAt(0)
    return n < 256 ? n : tabelle[c] ?? 0x3f
  }))
}

let zaehler = 0
const id = () => `dpf-${Date.now().toString(36)}-${(zaehler++).toString(36)}`

export function dpfVersorgungsart(e: DpfErgebnis): Versorgungsart | undefined {
  const arten = new Set(Object.values(e.gleichAnders))
  if (arten.has('a') || arten.has('p')) return 'andersartig'
  if (arten.has('g')) return 'gleichartig'
  if (Object.keys(e.regel).length) return 'regel'
  return undefined
}

/**
 * Übernimmt ein DPF-Ergebnis in den Plan: Zahnschema, Festzuschuss-Befunde, BEMA- und GOZ-Positionen
 * stammen aus der DPF. Die DPF liefert keine Laborleistungen; BEL/BEB werden aus `labor` übernommen
 * (Vorschlag der eigenen Regelengine). Manuell erfasste Positionen bleiben erhalten.
 */
export function dpfUebernehmen(plan: HkpPlan, e: DpfErgebnis, labor: Position[]): HkpPlan {
  const zaehne: Record<string, ZahnZeilen> = {}
  for (const zahn of DPF_INDEX) {
    const alt = plan.zaehne[zahn] ?? { B: '', R: '', TP: '' }
    zaehne[zahn] = {
      B: e.befund[zahn] ?? (Object.keys(e.befund).length ? '' : alt.B),
      R: e.regel[zahn] ?? '',
      TP: e.therapie[zahn] ?? (Object.keys(e.therapie).length ? '' : alt.TP),
    }
  }
  const alsPos = (ebene: 'BEMA' | 'GOZ') => (l: DpfLeistung): Position => ({
    id: id(), ebene, nr: l.nr, zahn: l.zahn, anzahl: l.anzahl, auto: true,
    ...(l.fakultativ ? { fakultativ: true } : {}),
    ...(ebene === 'GOZ' ? { faktor: plan.einstellungen.gozFaktor } : {}),
  })
  const befunde: FestzuschussBefund[] = e.festzuschuss.map((l) => ({
    id: id(), nr: l.nr, zahnGebiet: l.zahn, anzahl: l.anzahl, auto: true, ...(l.fakultativ ? { fakultativ: true } : {}),
  }))
  return {
    ...plan,
    zaehne,
    befunde: [...befunde, ...plan.befunde.filter((b) => !b.auto)],
    positionen: [
      ...e.bema.map(alsPos('BEMA')),
      ...e.goz.map(alsPos('GOZ')),
      ...labor.filter((p) => p.ebene === 'BEL' || p.ebene === 'BEB'),
      ...plan.positionen.filter((p) => !p.auto),
    ],
    versorgungsart: dpfVersorgungsart(e) ?? plan.versorgungsart,
  }
}

const summieren = (liste: { nr: string; anzahl: number }[]) => {
  const m = new Map<string, number>()
  for (const x of liste) m.set(x.nr, (m.get(x.nr) ?? 0) + x.anzahl)
  return m
}

/** Unterschiede zwischen DPF und eigener Regelengine (Regelversorgung, Festzuschüsse, BEMA). */
export function dpfAbgleich(
  e: DpfErgebnis,
  eigen: { R: Record<string, string>; befunde: FestzuschussBefund[]; positionen: Position[] },
): string[] {
  const unterschiede: string[] = []
  const rAbw = DPF_INDEX.filter((z) => (e.regel[z] ?? '') !== (eigen.R[z] ?? ''))
  if (Object.keys(e.regel).length && rAbw.length) {
    unterschiede.push(`Regelversorgung weicht ab: ${rAbw.map((z) => `${z} DPF „${e.regel[z] ?? '–'}“ / Engine „${eigen.R[z] || '–'}“`).join(', ')}`)
  }
  const vergleich = (titel: string, dpf: Map<string, number>, eng: Map<string, number>) => {
    const abw = [...new Set([...dpf.keys(), ...eng.keys()])].sort()
      .filter((nr) => (dpf.get(nr) ?? 0) !== (eng.get(nr) ?? 0))
      .map((nr) => `${nr}: DPF ${dpf.get(nr) ?? 0} / Engine ${eng.get(nr) ?? 0}`)
    if (abw.length) unterschiede.push(`${titel} weichen ab – ${abw.join('; ')}`)
  }
  vergleich('Festzuschüsse', summieren(e.festzuschuss.filter((l) => !l.fakultativ)), summieren(eigen.befunde))
  vergleich('BEMA-Positionen', summieren(e.bema.filter((l) => !l.fakultativ)), summieren(eigen.positionen.filter((p) => p.ebene === 'BEMA')))
  return unterschiede
}
