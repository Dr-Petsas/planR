import { readFileSync, writeFileSync } from 'node:fs'

const t = readFileSync('Start/src/schritte.ts', 'utf8')
const re = /'((?:GOZ|GOAE|BEMA):[^']+)':\s*r\('(\w+)',\s*(\d+)/g
const lines = []
let m
while ((m = re.exec(t))) lines.push(`  '${m[1]}': ['${m[2]}', ${m[3]}],`)
const zuschlag = (t.match(/const KEIN_SCHRITT = new Set\(\[([\s\S]*?)\]\)/)[1].match(/'[^']+'/g) || []).join(', ')
const stufenBlock = t.match(/const STUFEN:[\s\S]*?=\s*\[([\s\S]*?)\n\]/)
const stufen = stufenBlock[1].trim().replace(/\n\s*/g, ' ')

const body = `/**
 * Reihenfolge der Rechnungspositionen, dieselbe wie die Behandlungsschritte.
 * Überschriften stehen nur auf der Rechnung. Die Übergabe ans Praxisprogramm sortiert mit und lässt die Überschriften weg.
 * Die Tabelle muss zu Start/src/schritte.ts passen (Test dort).
 */
export type RechnungAbschnitt = 'vor' | 'haupt' | 'abschluss' | 'kontrolle' | 'sonst'

const ORT: Record<string, [RechnungAbschnitt, number]> = {
${lines.join('\n')}
}

export const RECHNUNG_ORT = ORT

const ZUSCHLAG = new Set<string>([${zuschlag}])

const STUFEN: [number, string][] = [${stufen}]

const TITEL: Record<Exclude<RechnungAbschnitt, 'sonst'>, string> = {
  vor: 'Vorbereitende Maßnahmen',
  haupt: 'Hauptbehandlung',
  abschluss: 'Abschließende Maßnahmen',
  kontrolle: 'Kontrollen',
}

const PHASE_IMPL = ['', 'Planung', 'Knochenaufbau', 'Implantation', 'Freilegung', 'Nachsorge']

export interface RechnungFeld { ebene: string; nr: string; sitzung?: number }

const klinisch = (ebene: string) => ebene === 'GOZ' || ebene === 'GOAE' || ebene === 'BEMA'

function zuschlagRang(schluessel: string): number {
  if (schluessel === 'GOZ:0110' || schluessel === 'GOZ:0120') return 103
  if (/^GOZ:05[0-3]0$/.test(schluessel)) return 191
  return 198
}

function phaseVon(rang: number, sitzung: number, impl: boolean): string {
  if (impl && sitzung > 0 && PHASE_IMPL[sitzung]) return PHASE_IMPL[sitzung]
  return STUFEN.find(([bis]) => rang <= bis)?.[1] ?? ''
}

interface Stelle { abschnitt: RechnungAbschnitt; rang: number; sitzung: number; phase: string; i: number }

function stellen<T>(zeilen: T[], feld: (z: T) => RechnungFeld, impl: boolean): Stelle[] {
  const felder = zeilen.map(feld)
  const mitSitzung = felder.some((f) => (f.sitzung ?? 0) > 0)
  const letzte = Math.max(0, ...felder.map((f) => f.sitzung ?? 0))
  const bildSchon = new Set<string>()
  return felder.map((f, i) => {
    const ebene = String(f.ebene || '')
    const nr = String(f.nr || '').trim()
    const sitzung = f.sitzung && f.sitzung > 0 ? f.sitzung : 0
    if (!klinisch(ebene) || !nr) return { abschnitt: 'sonst', rang: 0, sitzung: 0, phase: '', i }
    const schluessel = ebene + ':' + nr
    if (ZUSCHLAG.has(schluessel)) {
      const rang = zuschlagRang(schluessel)
      return { abschnitt: 'haupt', rang, sitzung, phase: phaseVon(rang, sitzung, impl), i }
    }
    const bekannt = ORT[schluessel]
    let abschnitt: RechnungAbschnitt = bekannt?.[0] ?? 'haupt'
    const rang = bekannt?.[1] ?? 250
    const bild = abschnitt === 'vor' && rang >= 30 && rang <= 33
    if (mitSitzung && sitzung) {
      if (sitzung === 1) abschnitt = 'vor'
      else if (impl && sitzung === letzte && letzte >= 5) abschnitt = 'kontrolle'
      else if (bild) abschnitt = 'kontrolle'
      else if (abschnitt === 'vor') abschnitt = 'haupt'
    } else if (bild && bildSchon.has(schluessel)) abschnitt = 'kontrolle'
    if (bild) bildSchon.add(schluessel)
    if (abschnitt === 'haupt' && rang >= 290 && rang < 300) abschnitt = 'abschluss'
    const phase = abschnitt === 'haupt' ? phaseVon(rang, sitzung, impl && mitSitzung) : ''
    return { abschnitt, rang, sitzung, phase, i }
  })
}

const FOLGE: Record<RechnungAbschnitt, number> = { vor: 0, haupt: 1, abschluss: 2, kontrolle: 3, sonst: 4 }

function geordnet<T>(zeilen: T[], feld: (z: T) => RechnungFeld, impl: boolean) {
  const liste = stellen(zeilen, feld, impl)
  return zeilen.map((zeile, i) => ({ zeile, s: liste[i] })).sort((a, b) =>
    FOLGE[a.s.abschnitt] - FOLGE[b.s.abschnitt] || a.s.sitzung - b.s.sitzung || a.s.rang - b.s.rang || a.s.i - b.s.i)
}

/** Dieselbe Folge wie die Behandlungsschritte. Labor und Material bleiben hinten, in ihrer bisherigen Folge. */
export function nachSchritten<T>(zeilen: T[], feld: (z: T) => RechnungFeld, impl = false): T[] {
  return geordnet(zeilen, feld, impl).map((x) => x.zeile)
}

export interface Glied<T> { zeile: T; ueberschrift?: string }

/** Sortierte Zeilen. Eine Überschrift steht nur an der ersten Zeile eines Abschnitts oder einer Stufe. */
export function mitUeberschrift<T>(zeilen: T[], feld: (z: T) => RechnungFeld, impl = false): Glied<T>[] {
  let zuletzt = ''
  return geordnet(zeilen, feld, impl).map(({ zeile, s }) => {
    if (s.abschnitt === 'sonst') return { zeile }
    const titel = s.phase ? TITEL[s.abschnitt] + ' · ' + s.phase : TITEL[s.abschnitt]
    const ueberschrift = titel === zuletzt ? undefined : titel
    zuletzt = titel
    return ueberschrift ? { zeile, ueberschrift } : { zeile }
  })
}
`
writeFileSync('_gemeinsam/src/rechnungGliederung.ts', body)
console.log('zeilen', lines.length, 'bytes', body.length)
