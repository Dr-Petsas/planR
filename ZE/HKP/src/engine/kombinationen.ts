import { OBERKIEFER, UNTERKIEFER } from './zahnschema'

/**
 * Kombinierbarkeit der Festzuschuss-Befunde (Befundklassen 1–4, 7.1, 7.2, 7.5) nach der
 * KZBV-Abrechnungshilfe „Schwere Kost für leichteres Arbeiten“, Stand 01.01.2026.
 * X = im selben Kiefer kombinierbar, O = auch am selben Zahn, Ziffer = Fußnote.
 */
const SPALTEN = ['1.1', '1.2', '1.4', '1.5', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '3.1', '3.2', '4.1', '4.2', '4.5', '4.6', '4.8', '4.9', '7.1', '7.2', '7.5'] as const

// prettier-ignore
const MATRIX: Record<string, string[]> = {
  '1.1': ['X', 'X', 'XO', 'XO', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', '', '', 'X', 'X', '', 'X', 'X', 'X3'],
  '1.2': ['X', 'X', 'XO', 'XO', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', '', '', '', '', '', 'X', 'X', 'X3'],
  '1.4': ['XO', 'XO', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'XO', 'X', '', 'X', 'XO', '', 'X', 'X', 'X', 'X3'],
  '1.5': ['XO', 'XO', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'XO', 'X', '', 'X', 'XO', '', 'X', 'X', 'X', 'X3'],
  '2.1': ['X', 'X', 'X', 'X', 'X', 'X', 'X', '', 'X', 'X', 'X2', 'X2', '', '', '', '', '', '', 'X', 'X', 'X3'],
  '2.2': ['X', 'X', 'X', 'X', 'X', 'X', '', '', 'X', 'X', 'X2', 'X2', '', '', '', '', '', '', 'X', 'X', 'X3'],
  '2.3': ['X', 'X', 'X', 'X', 'X', '', '', '', 'X', 'X', '', '', '', '', '', '', '', '', 'X', 'X', ''],
  '2.4': ['X', 'X', 'X', 'X', '', '', '', '', '', 'X', '', '', '', '', '', '', '', '', 'X', 'X', ''],
  '2.5': ['X', 'X', 'X', 'X', 'X', 'X', 'X', '', 'X', 'X', '', '', '', '', '', '', '', '', 'X', 'X', ''],
  '2.6': ['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X2', 'X2', '', '', '', '', '', '', 'X', 'X', ''],
  '3.1': ['X', 'X', 'X', 'X', 'X2', 'X2', '', '', '', 'X2', '', 'X', '', '', '', '', '', '', 'X', 'X', ''],
  '3.2': ['X', 'X', 'XO', 'XO', 'X2', 'X2', '', '', '', 'X2', 'X', 'X', '', '', '', '', '', '', 'X', 'X', ''],
  '4.1': ['X', 'X', 'X', 'X', '', '', '', '', '', '', '', '', '', '', 'X', 'X', 'X', 'X', '', '', ''],
  '4.2': ['', '', '', '', '', '', '', '', '', '', '', '', '', '', 'X', '', '', 'X', '', '', ''],
  '4.5': ['', '', 'X', 'X', '', '', '', '', '', '', '', '', 'X', 'X', '', 'X', 'X', 'X', '', '', 'X5'],
  '4.6': ['X', '', 'XO', 'XO', '', '', '', '', '', '', '', '', 'X', '', 'X', 'X', 'X4', 'X', '', '', ''],
  '4.8': ['X', '', '', '', '', '', '', '', '', '', '', '', 'X', '', 'X', 'X4', 'X', 'X', '', '', ''],
  '4.9': ['', '', 'X', 'X', '', '', '', '', '', '', '', '', 'X', 'X', 'X', 'X', 'X', '', '', '', ''],
  '7.1': ['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', '', '', '', '', '', '', 'X', 'X', 'X3'],
  '7.2': ['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', '', '', '', '', '', '', 'X', 'X', 'X3'],
  '7.5': ['X3', 'X3', 'X3', 'X3', 'X3', 'X3', '', '', '', '', '', '', '', '', 'X5', '', '', '', 'X3', 'X3', ''],
}

export const FUSSNOTEN: Record<string, string> = {
  '1': 'nur einmal je Gesamtbefund bei Total- und schleimhautgetragenen Deckprothesen',
  '2': 'nur bei beidseitiger Freiendsituation und maximal 2 nebeneinander fehlenden Oberkiefer-Schneidezähnen',
  '3': 'nur unter den Bedingungen „Erneuerung von Suprakonstruktionen“ der Gemeinsamen Erläuterungen kombinierbar',
  '4': 'nur bei Reparaturen',
  '5': 'nur bei Vorliegen der Voraussetzungen nach Nr. 36 der Zahnersatz-Richtlinie',
}

/** Zuschläge, deren Kombinierbarkeit sich nach dem Grundbefund richtet */
const ZUSCHLAG_ZU: Record<string, string[]> = {
  '1.3': ['1.1', '7.1', '7.2'],
  '2.7': ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6'],
  '4.7': ['3.2', '4.6', '6.10'],
}

const schluessel = (nr: string) => (nr === '4.3' ? '4.1' : nr === '4.4' ? '4.2' : nr)

/** Zelle der Kombinationstabelle oder undefined, wenn einer der Befunde nicht in der Tabelle steht */
export function kombination(a: string, b: string): string | undefined {
  const zeile = MATRIX[schluessel(a)]
  const i = SPALTEN.indexOf(schluessel(b) as (typeof SPALTEN)[number])
  if (!zeile || i < 0) return undefined
  return zeile[i]
}

const REIHE = [...OBERKIEFER, ...UNTERKIEFER]
const kieferVonZahn = (z: string) => (z[0] === '1' || z[0] === '2' ? 'OK' : 'UK')

/** Zähne und Kiefer aus einer Angabe wie „15-13“, „16“, „15,13,14“, „OK“ oder „OK,UK“ */
export function gebietAufloesen(gebiet: string): { zaehne: string[]; kiefer: Set<'OK' | 'UK'> } {
  const zaehne: string[] = []
  const kiefer = new Set<'OK' | 'UK'>()
  for (const teil of gebiet.split(/[,;\s]+/).filter(Boolean)) {
    const t = teil.toUpperCase()
    if (t === 'OK' || t === 'UK') { kiefer.add(t); continue }
    const m = /^(\d{2})-(\d{2})$/.exec(teil)
    if (m) {
      const a = REIHE.indexOf(m[1])
      const b = REIHE.indexOf(m[2])
      if (a >= 0 && b >= 0 && kieferVonZahn(m[1]) === kieferVonZahn(m[2])) {
        zaehne.push(...REIHE.slice(Math.min(a, b), Math.max(a, b) + 1))
        continue
      }
    }
    if (REIHE.includes(teil)) zaehne.push(teil)
  }
  for (const z of zaehne) kiefer.add(kieferVonZahn(z))
  return { zaehne, kiefer }
}

export interface KombiBefund { nr: string; zahnGebiet: string; anzahl: number }

/** Prüft alle Befundpaare gegen die Kombinationstabelle; liefert Warnungen. */
export function kombinationenPruefen(befunde: KombiBefund[]): string[] {
  const meldungen: string[] = []
  const aufgeloest = befunde.map((b) => ({ ...b, ...gebietAufloesen(b.zahnGebiet) }))

  for (const [zuschlag, basis] of Object.entries(ZUSCHLAG_ZU)) {
    for (const b of aufgeloest.filter((x) => x.nr === zuschlag)) {
      const passend = aufgeloest.some((x) => basis.includes(x.nr) && [...b.kiefer].some((k) => x.kiefer.has(k)))
      if (!passend) meldungen.push(`Befund ${zuschlag} (${b.zahnGebiet}) ist nur zusammen mit Befund ${basis.join('/')} im selben Kiefer ansetzbar.`)
    }
  }

  for (let i = 0; i < aufgeloest.length; i++) {
    for (let j = i + 1; j < aufgeloest.length; j++) {
      const a = aufgeloest[i]
      const b = aufgeloest[j]
      const gemeinsameKiefer = [...a.kiefer].filter((k) => b.kiefer.has(k))
      if (!gemeinsameKiefer.length) continue
      const zelle = kombination(a.nr, b.nr)
      if (zelle === undefined) continue
      const paar = `${a.nr} (${a.zahnGebiet}) und ${b.nr} (${b.zahnGebiet})`
      if (!zelle) {
        meldungen.push(`Befunde ${paar} sind im selben Kiefer nicht kombinierbar.`)
        continue
      }
      const gleicherZahn = a.zaehne.filter((z) => b.zaehne.includes(z))
      if (gleicherZahn.length && !zelle.includes('O')) {
        meldungen.push(`Befunde ${paar} sind am selben Zahn (${gleicherZahn.join(', ')}) nicht kombinierbar.`)
      }
      const fn = zelle.replace(/[XO]/g, '')
      if (fn) meldungen.push(`Befunde ${paar}: ${FUSSNOTEN[fn]}.`)
    }
  }

  const je = (nr: string) => aufgeloest.filter((b) => b.nr === nr)
  if (je('4.9').length > 1) meldungen.push('Befund 4.9 ist nur einmal je Gesamtbefund ansetzbar.')
  for (const k of ['OK', 'UK'] as const) {
    const n = je('3.2').filter((b) => b.kiefer.has(k)).reduce((s, b) => s + b.anzahl, 0)
    if (n > 2) meldungen.push(`Befund 3.2 ist höchstens zweimal je Kiefer ansetzbar (${k}: ${n}).`)
    const n72 = je('7.2').filter((b) => b.kiefer.has(k)).reduce((s, b) => s + b.anzahl, 0)
    if (n72 > 4) meldungen.push(`Befund 7.2 ist höchstens viermal je Kiefer ansetzbar (${k}: ${n72}).`)
  }
  return [...new Set(meldungen)]
}
