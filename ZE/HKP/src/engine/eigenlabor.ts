/**
 * Praxiseigene Laborpositionen (Eigenlabor): freie Nummern, Bezeichnungen und Preise nach § 9 GOZ.
 * Gleiche Nummer wie eine BEB-Position oder „statt BEB-Nr.“ ersetzt deren Preis und Text.
 */

export interface EigenPosition {
  nr: string
  text: string
  /** Nettopreis in € */
  preis: number
  /** BEB-Nr., deren Preis und Text diese Position im Eigenlabor ersetzt */
  ersetzt?: string
  /** 'pvs' = aus dem Praxisprogramm übernommen, wird beim nächsten Abgleich ersetzt */
  quelle?: 'pvs'
  /** Einsatz in der Planung: Nummer des Leistungsschritts (BEB-Standardliste, D1xx) bzw. 'MAT:<rolle>'; '' = nicht automatisch */
  fuer?: string
  /** nur bei diesem Ablauf (gefräst nach Intraoralscan, gegossen nach Abdruck) */
  wenn?: 'scan' | 'abdruck'
  /** 'hand' = von der Praxis festgelegt (bleibt bei jedem Abgleich), sonst Vorschlag von PlanR */
  zuordnung?: 'auto' | 'hand'
}

export interface Kandidat {
  nr: string
  text: string
  /** alle Beträge der Zeile in Spaltenreihenfolge (z. B. netto/brutto) */
  preise: number[]
  roh: string
  /** in die Übernahme einbeziehen */
  an: boolean
  ersetzt?: string
  /** von Hand festgelegte Zuordnung aus einem exportierten Katalog */
  zuordnung?: Pick<EigenPosition, 'fuer' | 'wenn' | 'zuordnung'>
}

export interface Analyse {
  kandidaten: Kandidat[]
  /** größte Zahl von Beträgen in einer Zeile – ab 2 ist die Preisspalte wählbar */
  preisSpalten: number
  warnungen: string[]
}

export const bebNorm = (s: string) => s.trim().padStart(4, '0')

export interface FindenKontext {
  /** Abformung des Plans: bestimmt Varianten wie gefräst (Scan) / gegossen (Abdruck) */
  ablauf?: string
  /** von der Planung gesetzte Position (Leistungsschritt) statt einer von Hand gewählten Nummer */
  auto?: boolean
}

/**
 * Dieselbe Leistung unter mehreren BEB-Nummern: die Planung setzt eine davon (Keramikkrone 2281,
 * Keramik-Brückenglied 2351), Praxis- und Laborlisten führen oft die andere.
 */
const GLEICHWERTIG: readonly string[][] = [['2281', '2251', '2252'], ['2351', '2352', '2361']]

/**
 * Praxisposition zu einer Nummer. Von Hand gewählt: die Position mit genau dieser Nummer. Von der Planung
 * gesetzt: die dem Leistungsschritt zugeordnete Position (Variante des Ablaufs zuerst); Positionen ohne
 * Zuordnung wie bisher über gleiche Nummer bzw. „statt BEB-Nr.“.
 */
export function eigenFinden(katalog: readonly EigenPosition[] | undefined, nr: string, k: FindenKontext = {}): EigenPosition | undefined {
  if (!katalog?.length || !nr.trim()) return undefined
  const t = nr.trim()
  const ziel = /^\d{1,4}$/.test(t) ? bebNorm(t) : t
  const gleicheNr = katalog.find((e) => e.nr.trim() === t)
  if (!k.auto && gleicheNr) return gleicheNr
  const ablauf = k.ablauf === 'scan' ? 'scan' : 'abdruck'
  const gruppe = GLEICHWERTIG.find((g) => g.includes(ziel)) ?? [ziel]
  const fuerNorm = (e: EigenPosition) => (e.fuer && /^\d{1,4}$/.test(e.fuer) ? bebNorm(e.fuer) : e.fuer ?? '')
  const zugeordnet = katalog.filter((e) => e.fuer && gruppe.includes(fuerNorm(e)) && (!e.wenn || e.wenn === ablauf))
  // genau dieser Schritt vor einem gleichwertigen, die Variante für den Ablauf vor der allgemeinen, dann dieselbe Nummer
  const rang = (e: EigenPosition) => (fuerNorm(e) === ziel ? 0 : 4) + (e.wenn ? 0 : 2) + (e.nr.trim() === t ? 0 : 1)
  if (zugeordnet.length) return zugeordnet.reduce((a, b) => (rang(b) < rang(a) ? b : a))
  const ohneZuordnung = (e: EigenPosition) => e.fuer === undefined
  if (gleicheNr && ohneZuordnung(gleicheNr)) return gleicheNr
  return /^\d{1,4}$/.test(t) ? katalog.find((e) => ohneZuordnung(e) && e.ersetzt && bebNorm(e.ersetzt) === ziel) : undefined
}

const BETRAG = /^(?:€\s*)?(-?\d{1,3}(?:[.\s]\d{3})+,\d{2}|-?\d+,\d{2}|-?\d+\.\d{2})\s*(?:€|EUR|Euro)?$/i
const BETRAG_IM_TEXT = /(?:€\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d+\.\d{2})\s*(?:€|EUR|Euro)?(?=\s|$)/gi
const NUMMER = /^(?:[A-ZÄÖÜ]{1,4}[-\s.]?)?\d{1,5}(?:[-./]\d{1,4})?[a-z]?$/i
const SUMMENZEILE = /\b(summe|zwischensumme|gesamt|mwst|ust|umsatzsteuer|netto|brutto|übertrag|rabatt|skonto)\b/i
const KOPFZEILE = /^(nr|nummer|pos|position|leistung|bezeichnung|beschreibung|preis|betrag|euro|einheit|menge|bemerkung)\b/i
const SEITENZEILE = /^(seite|page)\s*\d+|^\d+\s*(\/|von)\s*\d+$|^stand[:\s]/i

export function betrag(s: string): number {
  const t = s.replace(/[€\s]|EUR|Euro/gi, '')
  if (/,\d{2}$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'))
  return Number(t)
}

/** Zeile in Zellen: Tabulator bzw. Spaltenlücken aus dem PDF, Semikolon aus CSV */
export function zellen(zeile: string): string[] {
  const teile = zeile.includes('\t') ? zeile.split('\t') : zeile.includes(';') ? zeile.split(';') : zeile.split(/\s{3,}/)
  return teile.map((z) => z.trim().replace(/^"|"$/g, '')).filter(Boolean)
}

function zeileZerlegen(zeile: string): { nr: string; text: string; preise: number[] } {
  const z = zellen(zeile)
  if (z.length > 1) {
    const preise: number[] = []
    const texte: string[] = []
    let nr = ''
    z.forEach((c, i) => {
      if (BETRAG.test(c)) preise.push(betrag(c))
      else if (!nr && i === 0 && NUMMER.test(c) && c.length <= 10) nr = c
      else if (!/^(stk|stück|je|pro|einheit|€|eur)\.?$/i.test(c)) texte.push(c)
    })
    if (preise.length || nr) return { nr, text: texte.join(' '), preise }
  }
  let rest = zeile.trim()
  const preise = [...rest.matchAll(BETRAG_IM_TEXT)].map((m) => betrag(m[1]))
  rest = rest.replace(BETRAG_IM_TEXT, ' ')
  const m = /^((?:[A-ZÄÖÜ]{1,4}[-.]?)?\d{1,5}(?:[-./]\d{1,4})?[a-z]?)\s+(.*)$/i.exec(rest)
  const nr = m && m[1].length <= 10 ? m[1] : ''
  return { nr, text: (nr ? m![2] : rest).replace(/\s+/g, ' ').trim(), preise }
}

/** Zeilen einer Preisliste (PDF-Text oder CSV) in Positionen zerlegen */
export function zeilenAnalysieren(zeilen: string[]): Analyse {
  const kandidaten: Kandidat[] = []
  let offen: Kandidat | undefined
  let uebersprungen = 0
  for (const roh of zeilen) {
    const zeile = roh.replace(/\u00a0/g, ' ').trimEnd()
    if (!zeile.trim() || SEITENZEILE.test(zeile.trim())) continue
    const { nr, text, preise } = zeileZerlegen(zeile)
    if (!preise.length) {
      if (KOPFZEILE.test(zeile.trim()) && !nr) continue
      if (nr) {
        offen = { nr, text, preise: [], roh: zeile, an: true }
        kandidaten.push(offen)
      } else if (offen && text) {
        offen.text = `${offen.text} ${text}`.trim()
        offen.roh += `\n${zeile}`
      }
      continue
    }
    if (SUMMENZEILE.test(text) && !nr) {
      uebersprungen++
      offen = undefined
      continue
    }
    if (!nr && offen && !offen.preise.length) {
      offen.preise = preise
      if (text) offen.text = `${offen.text} ${text}`.trim()
      offen.roh += `\n${zeile}`
      continue
    }
    offen = { nr, text, preise, roh: zeile, an: !!text }
    kandidaten.push(offen)
  }
  const ergebnis = kandidaten.filter((k) => k.preise.length && k.text)
  const ohnePreis = kandidaten.length - ergebnis.length
  const warnungen: string[] = []
  if (!ergebnis.length) warnungen.push('Keine Positionen mit Preis erkannt. Bei eingescannten PDFs (Bild statt Text) ist eine Texterkennung nicht möglich – bitte eine PDF mit Text, CSV oder Excel verwenden.')
  if (ohnePreis) warnungen.push(`${ohnePreis} Zeile(n) mit Nummer, aber ohne erkennbaren Preis wurden nicht übernommen.`)
  if (uebersprungen) warnungen.push(`${uebersprungen} Summen-/Steuerzeile(n) übersprungen.`)
  const ohneNr = ergebnis.filter((k) => !k.nr).length
  if (ohneNr) warnungen.push(`${ohneNr} Position(en) ohne Nummer – es werden fortlaufende Nummern „E-…“ vergeben.`)
  return { kandidaten: ergebnis, preisSpalten: Math.max(0, ...ergebnis.map((k) => k.preise.length)), warnungen }
}

/** Ausgewählte Kandidaten in Katalogpositionen; vorhandene Nummern werden aktualisiert */
export function uebernehmen(katalog: EigenPosition[], kandidaten: Kandidat[], spalte: number): EigenPosition[] {
  const neu = [...katalog]
  let lfd = Math.max(0, ...katalog.map((e) => Number(/^E-(\d+)$/.exec(e.nr)?.[1] ?? 0)))
  for (const k of kandidaten) {
    if (!k.an) continue
    const preis = k.preise[Math.min(spalte, k.preise.length - 1)]
    const nr = k.nr || `E-${String(++lfd).padStart(3, '0')}`
    const i = neu.findIndex((e) => e.nr === nr)
    const pos: EigenPosition = { ...(i >= 0 ? neu[i] : {}), nr, text: k.text, preis, ...(k.ersetzt ? { ersetzt: k.ersetzt } : {}), ...k.zuordnung }
    if (i >= 0) neu[i] = pos
    else neu.push(pos)
  }
  return neu
}

/** Katalog aus einer exportierten JSON-Datei als Kandidaten */
export function jsonAnalysieren(text: string): Analyse {
  const daten = JSON.parse(text)
  const roh: unknown[] = Array.isArray(daten) ? daten : daten?.positionen
  if (!Array.isArray(roh)) return { kandidaten: [], preisSpalten: 0, warnungen: ['Die JSON-Datei enthält keine Liste „positionen“.'] }
  const kandidaten = roh.flatMap((e): Kandidat[] => {
    const o = e as Partial<EigenPosition>
    const preis = Number(o.preis)
    if (!o.text || !Number.isFinite(preis)) return []
    const zuordnung = o.zuordnung === 'hand'
      ? { fuer: String(o.fuer ?? ''), ...(o.wenn === 'scan' || o.wenn === 'abdruck' ? { wenn: o.wenn } : {}), zuordnung: 'hand' as const }
      : undefined
    return [{ nr: String(o.nr ?? ''), text: String(o.text), preise: [preis], roh: JSON.stringify(o), an: true, ...(o.ersetzt ? { ersetzt: String(o.ersetzt) } : {}), ...(zuordnung ? { zuordnung } : {}) }]
  })
  return { kandidaten, preisSpalten: 1, warnungen: kandidaten.length ? [] : ['Keine gültigen Positionen in der JSON-Datei.'] }
}

export interface TextStueck {
  str: string
  x: number
  y: number
  breite: number
  hoehe: number
}

/** Textstücke einer PDF-Seite zu Zeilen; größere Lücken werden zu Tabulatoren (Spalten) */
export function textZeilen(stuecke: TextStueck[]): string[] {
  const sortiert = stuecke.filter((s) => s.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const gruppen: TextStueck[][] = []
  for (const s of sortiert) {
    const g = gruppen[gruppen.length - 1]
    const toleranz = Math.max(2, (s.hoehe || 10) * 0.4)
    if (g && Math.abs(g[0].y - s.y) <= toleranz) g.push(s)
    else gruppen.push([s])
  }
  return gruppen.map((g) => {
    g.sort((a, b) => a.x - b.x)
    let zeile = ''
    let ende = -Infinity
    for (const s of g) {
      const luecke = s.x - ende
      const zeichen = (s.hoehe || 10) * 0.5
      if (zeile) zeile += luecke > zeichen * 2.5 ? '\t' : luecke > zeichen * 0.15 ? ' ' : ''
      zeile += s.str
      ende = s.x + s.breite
    }
    return zeile.replace(/ {2,}/g, ' ')
  })
}
