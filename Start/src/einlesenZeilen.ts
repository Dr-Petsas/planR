/**
 * Antwort des Einlese-Dienstes (tools/einlesen) als Zeilen für den HKP-Leser in hkpPdf.ts.
 * Der Dienst liefert Textstücke mit Kasten. Hier werden sie zu Zeilen gruppiert,
 * x ist die Mitte des Worts, damit Kürzel und Zahnnummer in derselben Spalte landen.
 */
import { schemaAusZeilen, type PdfTeil, type PdfZeile, type ZahnSchema } from './hkpPdf'

export interface EinleseTeil { x: number; y: number; b: number; h: number; text: string; sicher?: number | null }
export interface EinleseSeite { seite: number; breite: number; hoehe: number; teile: EinleseTeil[] }
export interface EinleseZelle { zeile: number; spalte: number; zeilen: number; spalten: number; kopf: boolean; text: string }
export interface EinleseTabelle { seite: number; zeilen: number; spalten: number; zellen: EinleseZelle[] }
export interface EinleseAntwort {
  seiten: { seite: number; breite: number; hoehe: number; zeichen: number; tabellen: number }[]
  tabellen: EinleseTabelle[]
  ergaenzung: { seiten?: EinleseSeite[]; fehler?: string } | null
}

/** Unter diesem Wert gilt ein Textstück als unsicher gelesen. */
export const UNSICHER_AB = 0.9

function mitte(werte: number[]) {
  if (!werte.length) return 0
  const s = [...werte].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Ein Stück mit mehreren Wörtern auseinanderziehen, jedes Wort bekommt seine eigene Mitte. */
function woerter(t: EinleseTeil): (PdfTeil & { sicher: number })[] {
  const sicher = t.sicher ?? 1
  const text = t.text
  const pro = t.b / Math.max(text.length, 1)
  const aus: (PdfTeil & { sicher: number })[] = []
  let i = 0
  while (i < text.length) {
    while (i < text.length && text[i] === ' ') i++
    if (i >= text.length) break
    const start = i
    while (i < text.length && text[i] !== ' ') i++
    const breite = pro * (i - start)
    aus.push({ x: t.x + pro * start + breite / 2, text: text.slice(start, i), w: breite, sicher })
  }
  return aus
}

export interface ZeilenMitSicherheit { zeilen: PdfZeile[]; unsicher: string[] }

/** Eine Seite als Zeilen von oben nach unten. */
export function zeilenAusSeite(seite: EinleseSeite): ZeilenMitSicherheit {
  const teile = seite.teile.filter((t) => t.text.trim())
  const hoehe = mitte(teile.map((t) => t.h)) || 12
  const sortiert = [...teile].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2))
  const gruppen: { y: number; teile: EinleseTeil[] }[] = []
  for (const t of sortiert) {
    const y = t.y + t.h / 2
    const letzte = gruppen[gruppen.length - 1]
    if (letzte && Math.abs(letzte.y - y) <= hoehe * 0.6) {
      letzte.teile.push(t)
      letzte.y = letzte.teile.reduce((s, e) => s + e.y + e.h / 2, 0) / letzte.teile.length
    } else {
      gruppen.push({ y, teile: [t] })
    }
  }
  const unsicher: string[] = []
  const zeilen = gruppen.map((g) => {
    const stuecke = g.teile.flatMap(woerter).sort((a, b) => a.x - b.x)
    for (const s of stuecke) if (s.sicher < UNSICHER_AB) unsicher.push(s.text)
    return { teile: stuecke.map(({ x, text, w }) => ({ x, text, w })) }
  })
  return { zeilen, unsicher }
}

const istZiffer = (c: string) => c >= '0' && c <= '9'
const nurZiffern = (s: string) => s.length > 0 && [...s].every(istZiffer)
const istZahn = (s: string) => s.length === 2 && s[0] >= '1' && s[0] <= '4' && s[1] >= '1' && s[1] <= '8'

/** Betrag vom Blatt: 1.234,56 · 678,- · 106,-- · 1925.- · 3,00g. Ohne Ziffer am Anfang kommt nichts zurück. */
export function betragVon(wort: string): number | undefined {
  if (!wort || !istZiffer(wort[0])) return undefined
  let ganz = ''
  let i = 0
  while (i < wort.length && (istZiffer(wort[i]) || wort[i] === '.')) {
    if (wort[i] === '.' && !(nurZiffern(wort.slice(i + 1, i + 4)) && !istZiffer(wort[i + 4] ?? ''))) break
    if (wort[i] !== '.') ganz += wort[i]
    i++
  }
  let cent = ''
  if (wort[i] === ',' || wort[i] === '.') {
    i++
    while (i < wort.length && istZiffer(wort[i]) && cent.length < 2) cent += wort[i++]
  }
  if (!ganz) return undefined
  return Number(`${ganz}.${cent.padEnd(2, '0')}`)
}

export interface BlattPosition { ebene: 'GOZ' | 'BEL' | 'BEB'; nr: string; zahn: string; anzahl: number; betrag?: number }

export interface BlattSummen {
  honorarGoz?: number
  honorarBema?: number
  labor?: number
  gesamt?: number
  festzuschuss?: number
  eigenanteil?: number
  festzuschussVoll?: number
  laborBeleg?: number
}

const kopfMit = (z: PdfZeile, ...worte: string[]) => worte.every((w) => z.teile.some((t) => t.text.toLowerCase().startsWith(w)))

/** Anlage Teil 2: Zahn/Gebiet, GOZ-Nummer, Anzahl, Betrag. Der Betrag gilt für die ganze Zeile. */
function gozZeilen(zeilen: PdfZeile[]): BlattPosition[] {
  const aus: BlattPosition[] = []
  const kopf = zeilen.findIndex((z) => kopfMit(z, 'zahn/gebiet', 'goz', 'anzahl'))
  if (kopf < 0) return aus
  for (const z of zeilen.slice(kopf + 1)) {
    const t = z.teile.map((e) => e.text)
    if (t[0]?.toLowerCase().startsWith('zahnärztliches')) break
    if (t.length < 4) continue
    const zaehne = t[0].split(',').map((s) => s.trim()).filter(Boolean)
    const nr = t[1].toLowerCase()
    const ziffern = nr.length === 5 ? nr.slice(0, 4) : nr
    if (!zaehne.length || !zaehne.every(istZahn) || ziffern.length !== 4 || !nurZiffern(ziffern)) continue
    const anzahl = Number(t[t.length - 2])
    const betrag = betragVon(t[t.length - 1])
    if (!Number.isInteger(anzahl) || anzahl < 1) continue
    if (anzahl === zaehne.length) {
      for (const zahn of zaehne) {
        aus.push({ ebene: 'GOZ', nr, zahn, anzahl: 1, ...(betrag !== undefined ? { betrag: Math.round(betrag / anzahl * 100) / 100 } : {}) })
      }
    } else {
      aus.push({ ebene: 'GOZ', nr, zahn: zaehne.length === 1 ? zaehne[0] : '', anzahl, ...(betrag !== undefined ? { betrag } : {}) })
    }
  }
  return aus
}

/** Eigenbeleg oder Laborrechnung: Nummer, Einzelpreis, Anzahl. Der Betrag ist hier der Einzelpreis. */
function laborZeilen(zeilen: PdfZeile[]): BlattPosition[] {
  const aus: BlattPosition[] = []
  let grenze = -1
  for (const z of zeilen) {
    if (kopfMit(z, 'nr.', 'leistungsbezeichnung', 'einzelpreis')) {
      const text = z.teile.find((t) => t.text.toLowerCase().startsWith('leistungsbezeichnung'))!
      grenze = text.x - (text.w ?? 0) / 2 - 2
      continue
    }
    if (grenze < 0) continue
    const vorn = z.teile.filter((t) => t.x + (t.w ?? 0) / 2 <= grenze + 4)
    const hinten = z.teile.filter((t) => !vorn.includes(t) && !t.text.endsWith('%')).map((t) => t.text)
    if (!vorn.length || hinten.length < 4) continue
    const roh = vorn[vorn.length - 1].text
    if (roh.split('.').length === 3 && roh.length === 10) continue
    const [preis, menge, summe] = hinten.slice(-3).map(betragVon)
    if (preis === undefined || menge === undefined || summe === undefined || menge <= 0) continue
    if (Math.abs(preis * menge - summe) > 0.02) continue
    const kurz = roh.split('-').join('')
    const bel = roh.includes('-') && kurz.length === 4 && nurZiffern(kurz)
    aus.push({ ebene: bel ? 'BEL' : 'BEB', nr: bel ? kurz : roh, zahn: '', anzahl: menge, betrag: preis })
  }
  return aus
}

const MARKEN: [keyof BlattSummen, string][] = [
  ['honorarGoz', 'zahnärztliches honorar goz ('],
  ['honorarBema', 'zahnärztliches honorar bema ('],
  ['labor', 'material und laborkosten ('],
  ['gesamt', 'gesamtkosten ('],
  ['festzuschuss', 'abzüglich festzuschüsse'],
  ['eigenanteil', 'ihr voraussichtlicher eigenanteil'],
  ['festzuschussVoll', 'festzuschuss 100%'],
  ['laborBeleg', 'laborkosten gesamt'],
]

function summenAus(zeilen: PdfZeile[]): BlattSummen {
  const aus: BlattSummen = {}
  for (const z of zeilen) {
    const text = z.teile.map((t) => t.text).join(' ').toLowerCase()
    const marke = MARKEN.find(([, anfang]) => text.startsWith(anfang))
    if (!marke || aus[marke[0]] !== undefined) continue
    const wert = betragVon(z.teile[z.teile.length - 1].text)
    if (wert !== undefined) aus[marke[0]] = wert
  }
  return aus
}

export interface EinleseBlatt {
  schema: ZahnSchema
  positionen: BlattPosition[]
  summen: BlattSummen
  /** Kürzel im Zahnschema, die der Leser nur unsicher erkannt hat, zum Gegenlesen. */
  pruefen: string[]
}

/** Zahnschema, GOZ- und Laborzeilen und die Summen aus der Antwort des Einlese-Dienstes. */
export function blattAusEinlesen(antwort: EinleseAntwort): EinleseBlatt {
  const blatt: EinleseBlatt = { schema: { B: {}, R: {}, TP: {} }, positionen: [], summen: {}, pruefen: [] }
  for (const seite of antwort.ergaenzung?.seiten ?? []) {
    const { zeilen } = zeilenAusSeite(seite)
    const schema = schemaAusZeilen(zeilen)
    for (const art of ['B', 'R', 'TP'] as const) {
      for (const [zahn, wert] of Object.entries(schema[art])) blatt.schema[art][zahn] ??= wert
    }
    if (Object.keys(schema.B).length + Object.keys(schema.R).length + Object.keys(schema.TP).length) {
      const werte = new Set([...Object.values(schema.B), ...Object.values(schema.R), ...Object.values(schema.TP)].map((w) => w.toLowerCase()))
      for (const t of seite.teile) {
        if ((t.sicher ?? 1) >= UNSICHER_AB) continue
        for (const wort of t.text.split(' ')) if (werte.has(wort.toLowerCase())) blatt.pruefen.push(wort)
      }
    }
    blatt.positionen.push(...gozZeilen(zeilen), ...laborZeilen(zeilen))
    blatt.summen = { ...summenAus(zeilen), ...blatt.summen }
  }
  return blatt
}

/** Alle Seiten der Ergänzung hintereinander. Ohne Ergänzung kommt nichts zurück. */
export function zeilenAusEinlesen(antwort: EinleseAntwort): ZeilenMitSicherheit {
  const aus: ZeilenMitSicherheit = { zeilen: [], unsicher: [] }
  for (const seite of antwort.ergaenzung?.seiten ?? []) {
    const z = zeilenAusSeite(seite)
    aus.zeilen.push(...z.zeilen)
    aus.unsicher.push(...z.unsicher)
  }
  return aus
}
