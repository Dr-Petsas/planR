/**
 * HKP als PDF: Befund und Positionen aus dem Text, ohne Namen und ohne Beträge.
 * Daraus macht der Fallkatalog die festen Praxisregeln.
 */
import type { FallPosition } from './fallkatalog'

export interface PdfTeil { x: number; text: string; w?: number }
export interface PdfZeile { teile: PdfTeil[] }

const ZAHN = /^[1-4][1-8]$/
const BEFUND = /^(ww|kw|f|x|k|pw|pkw|e|ew|b|bw|ur|a|aw|ab|abw|i|ix|sk|skw|t|tw|r|rw|sb|sbw|se|sew|so|sow|st|stw)$/i
const ZEILEN_ART: Record<string, 'B' | 'R' | 'TP'> = {
  b: 'B', befund: 'B', bef: 'B',
  r: 'R', regelversorgung: 'R', regelvers: 'R', rv: 'R',
  tp: 'TP', therapie: 'TP', therapieplanung: 'TP', th: 'TP',
}

function wortNackt(wort: string) {
  let s = wort.trim()
  while (s.startsWith('(') || s.startsWith('[') || s.startsWith('|')) s = s.slice(1)
  while (s.endsWith(':') || s.endsWith('.') || s.endsWith(',') || s.endsWith(')') || s.endsWith(']') || s.endsWith('|')) s = s.slice(0, -1)
  return s
}

function artVon(wort: string): 'B' | 'R' | 'TP' | '' {
  return ZEILEN_ART[wortNackt(wort).toLowerCase()] ?? ''
}

function ebeneWort(wort: string): FallPosition['ebene'] | '' {
  const s = wortNackt(wort)
  if (!s) return ''
  const direkt = ebeneVon(s)
  if (direkt) return direkt
  const kopf = s.split('-')[0]
  return kopf !== s ? ebeneVon(kopf) : ''
}

/** Ein Textstück mit mehreren Wörtern auseinanderziehen. Abstände bleiben, damit die Spalte zum Zahn passt. */
function teileWoerter(teile: PdfTeil[]): PdfTeil[] {
  const aus: PdfTeil[] = []
  for (const teil of teile) {
    const text = teil.text
    const stuecke: { text: string; start: number }[] = []
    let i = 0
    while (i < text.length) {
      while (i < text.length && text[i] === ' ') i++
      if (i >= text.length) break
      const start = i
      while (i < text.length && text[i] !== ' ') i++
      stuecke.push({ text: text.slice(start, i), start })
    }
    if (stuecke.length <= 1) {
      if (text.trim()) aus.push({ x: teil.x, text: text.trim(), w: teil.w })
      continue
    }
    const breite = teil.w && teil.w > 0 ? teil.w : text.length * 6
    const pro = breite / Math.max(text.length, 1)
    for (const s of stuecke) aus.push({ x: teil.x + pro * s.start, text: s.text, w: pro * s.text.length })
  }
  return aus
}

/** Großes K, E, B ist Therapie. Dieselben Buchstaben klein sind Befund. ww und f gelten in jeder Schreibung. */
function istBefundToken(text: string) {
  if (!BEFUND.test(text)) return false
  const kern = text.trim()
  if (kern.length > 1) return true
  if (kern === kern.toLowerCase()) return true
  return !THERAPIE.has(kern.toUpperCase())
}
const POSITION = /\b(BEMA|GOZ|GOÄ|GOAE|BEL(?:\s*II)?|BEB)\s*[:.]?\s*(\d{1,4}[a-z]?(?:\/\d)?)\b/gi

const ebeneVon = (s: string): FallPosition['ebene'] | '' => {
  const e = s.replace(/\s*II$/i, '').toUpperCase().replace('GOAE', 'GOÄ')
  if (e === 'BEMA' || e === 'GOZ' || e === 'BEL' || e === 'BEB' || e === 'GOÄ') return e
  return ''
}

const textVon = (z: PdfZeile) => z.teile.map((t) => t.text).join(' ').replace(/\s+/g, ' ').trim()

function zahnreihe(z: PdfZeile): { zahn: string; x: number }[] | null {
  const zaehne = z.teile.filter((t) => ZAHN.test(t.text))
  if (zaehne.length < 8) return null
  if (zaehne.length < z.teile.filter((t) => t.text.trim()).length * 0.6) return null
  return zaehne.map((t) => ({ zahn: t.text, x: t.x }))
}

/** Therapie- und Regelkürzel des HKP-Planers. Die Zeile entscheidet, das Kürzel muss dazugehören. */
const THERAPIE = new Set([
  'A', 'ABV', 'ABM', 'B', 'BM', 'BV', 'E', 'EO', 'H', 'K', 'KH', 'KM', 'KMH', 'KMO', 'KO', 'KV', 'KVH', 'KVO',
  'PK', 'PKM', 'VE', 'ZA', 'ZAB', 'ZAS', 'I1', 'I2', 'I3', 'I4', 'C1', 'C2', 'C3', 'C4', 'ON', 'ONK',
  'TZ', 'TZV', 'STZ', 'STZV', 'PKV', 'R', 'SB', 'SBV', 'SBM', 'SE', 'SEO', 'SK', 'SKM', 'SKMO', 'SKO', 'SKV', 'SKVO',
  'SO', 'ST', 'STM', 'STV', 'T', 'TM', 'TV', 'T2', 'T2M', 'T2V', ')(',
])

export interface ZahnSchema {
  B: Record<string, string>
  R: Record<string, string>
  TP: Record<string, string>
}

function spalteVon(kopf: { x: number }[]) {
  const xs = kopf.map((z) => z.x).sort((a, b) => a - b)
  const abstaende = xs.slice(1).map((x, i) => x - xs[i]).filter((d) => d > 4).sort((a, b) => a - b)
  return abstaende.length ? abstaende[Math.floor(abstaende.length / 2)] : 28
}

function naechsterZahn(x: number, kopf: { zahn: string; x: number }[], grenze: number) {
  let best: { zahn: string; d: number } | null = null
  for (const z of kopf) {
    const d = Math.abs(z.x - x)
    if (d <= grenze && (!best || d < best.d)) best = { zahn: z.zahn, d }
  }
  return best?.zahn ?? ''
}

function kleineZahl(s: string) {
  return s.length > 0 && s.length <= 2 && [...s].every((c) => c >= '0' && c <= '9')
}

function zeilenArt(teile: PdfTeil[]): { art: 'B' | 'R' | 'TP'; codes: PdfTeil[] } | null {
  if (!teile.length) return null
  const erste = artVon(teile[0].text)
  if (erste) return { art: erste, codes: teile.slice(1) }
  if (teile.length > 1 && kleineZahl(teile[0].text)) {
    const zweite = artVon(teile[1].text)
    if (zweite) return { art: zweite, codes: teile.slice(2) }
  }
  if (teile.every((t) => istBefundToken(t.text))) return { art: 'B', codes: teile }
  return null
}

function codeGueltig(art: 'B' | 'R' | 'TP', text: string) {
  if (art === 'B') return BEFUND.test(text)
  const kern = text.trim().replace(/^-+|-+$/g, '').toUpperCase()
  return THERAPIE.has(kern)
}

function schreiben(schema: ZahnSchema, art: 'B' | 'R' | 'TP', zahn: string, text: string) {
  if (!zahn || schema[art][zahn] || !codeGueltig(art, text)) return
  if (art === 'B') schema.B[zahn] = text.toLowerCase()
  else schema[art][zahn] = text.trim()
}

function eintragen(schema: ZahnSchema, art: 'B' | 'R' | 'TP', codes: PdfTeil[], kopf: { zahn: string; x: number }[]) {
  const gueltig = codes.filter((c) => codeGueltig(art, c.text))
  if (gueltig.length === kopf.length && kopf.length >= 8) {
    gueltig.forEach((c, i) => schreiben(schema, art, kopf[i].zahn, c.text))
    return
  }
  const grenze = Math.max(24, spalteVon(kopf) * 0.49)
  for (const c of codes) schreiben(schema, art, naechsterZahn(c.x, kopf, grenze), c.text)
}

/**
 * Zeilen B, R und TP am Zahnschema. Die Kürzel stehen auf dem Vordruck über oder unter der Zahnleiste.
 * Ein einzelnes ungültiges Feld wirft die Zeile nicht weg.
 */
export function schemaAusZeilen(zeilen: PdfZeile[]): ZahnSchema {
  const schema: ZahnSchema = { B: {}, R: {}, TP: {} }
  const rows = zeilen.map((z) => teileWoerter(z.teile).filter((t) => t.text.trim()))
  const koepfe: { i: number; kopf: { zahn: string; x: number }[] }[] = []
  rows.forEach((teile, i) => {
    const kopf = zahnreihe({ teile })
    if (kopf) koepfe.push({ i, kopf })
  })
  rows.forEach((teile, j) => {
    if (koepfe.some((k) => k.i === j)) return
    const art = zeilenArt(teile)
    if (!art) return
    let nah: { i: number; kopf: { zahn: string; x: number }[] } | null = null
    for (const k of koepfe) {
      const d = Math.abs(k.i - j)
      if (d < 1 || d > 6) continue
      if (!nah || d < Math.abs(nah.i - j)) nah = k
    }
    if (nah) eintragen(schema, art.art, art.codes, nah.kopf)
  })
  for (const z of zeilen) {
    const t = textVon(z)
    for (const m of t.matchAll(/\b(?:Zahn\s*)?([1-4][1-8])\s*[:/]?\s*(ww|kw|f|x|k|pw|e|ew|b|bw|ur|sk|t|r)\b/gi)) {
      if (!schema.B[m[1]]) schema.B[m[1]] = m[2].toLowerCase()
    }
  }
  return schema
}

function befundAusZeilen(zeilen: PdfZeile[]): Record<string, string> {
  return schemaAusZeilen(zeilen).B
}

/** Eurobetrag am Zeilenende (1.234,56). Ein Faktor wie 2,3 hat nur eine Nachkommastelle und zählt nicht. */
function betragAuf(zeile: string): number | undefined {
  const treffer = [...zeile.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g)]
  if (!treffer.length) return undefined
  const n = Number(treffer[treffer.length - 1][1].replace(/\./g, '').replace(',', '.'))
  return n > 0 && n < 100_000 ? Math.round(n * 100) / 100 : undefined
}

function faktorAuf(zeile: string): number | undefined {
  const m = /(?<!\d)([1-3][,.][0-9])(?!\d)/.exec(zeile)
  if (!m) return undefined
  const n = Number(m[1].replace(',', '.'))
  return n >= 1 && n <= 3.5 ? Math.round(n * 10) / 10 : undefined
}

function zaehneAuf(zeile: string): string[] {
  return [...new Set([...zeile.matchAll(/\b([1-4][1-8])\b/g)].map((m) => m[1]))]
}

function abschnittVon(zeile: string): FallPosition['ebene'] | '' {
  const m = /^(BEMA|GOZ|GOÄ|GOAE|BEL(?:\s*II)?|BEB)\b/i.exec(zeile)
  if (m) return ebeneVon(m[1])
  const worte = zeile.split(/\s+/).filter(Boolean)
  if (worte.length > 8) return ''
  const treffer = [...new Set(worte.map(ebeneWort).filter((e) => e))]
  return treffer.length === 1 ? treffer[0] : ''
}

const nackt: Record<string, RegExp> = {
  BEMA: /\b(\d{2}[a-z]?(?:\/\d)?)\b/gi,
  GOZ: /\b(\d{4}[a-z]?)\b/gi,
  BEL: /\b(\d{4})\b/gi,
  BEB: /\b(\d{4})\b/gi,
  'GOÄ': /\b(\d{3,4})\b/gi,
}

export interface ProbePosition extends FallPosition { betrag?: number }

function positionenAusZeilen(zeilen: PdfZeile[]): ProbePosition[] {
  const aus: ProbePosition[] = []
  const gesehen = new Set<string>()
  let abschnitt: FallPosition['ebene'] | '' = ''
  const merken = (ebene: FallPosition['ebene'], nr: string, zeile: string) => {
    const faktor = ebene === 'GOZ' ? (faktorAuf(zeile) ?? 2.3) : undefined
    const betrag = betragAuf(zeile)
    const zaehne = zaehneAuf(zeile).filter((z) => z !== nr)
    const ziele = zaehne.length >= 1 && zaehne.length <= 6 ? zaehne : ['']
    for (const zahn of ziele) {
      const key = `${ebene}|${nr}|${zahn}`
      if (gesehen.has(key)) continue
      gesehen.add(key)
      const p: ProbePosition = { ebene, nr, zahn, anzahl: 1 }
      if (faktor !== undefined) p.faktor = faktor
      if (betrag !== undefined) p.betrag = betrag
      aus.push(p)
    }
  }
  for (const z of zeilen) {
    const zeile = textVon(z)
    if (!zeile || /festzuschuss/i.test(zeile)) continue
    const kopf = abschnittVon(zeile)
    if (kopf) abschnitt = kopf
    let getroffen = false
    for (const m of zeile.matchAll(POSITION)) {
      const ebene = ebeneVon(m[1])
      if (!ebene || ZAHN.test(m[2])) continue
      merken(ebene, m[2].toLowerCase(), zeile)
      getroffen = true
    }
    if (getroffen) continue
    const genannt = [...new Set(zeile.split(/\s+/).map(ebeneWort).filter((e) => e))]
    const ebene = genannt.length === 1 ? genannt[0] : abschnitt
    if (!ebene || !nackt[ebene]) continue
    if (genannt.length === 1 && zaehneAuf(zeile).length === 0 && betragAuf(zeile) === undefined) continue
    for (const m of zeile.matchAll(nackt[ebene])) {
      if (ZAHN.test(m[1])) continue
      merken(ebene, m[1].toLowerCase(), zeile)
    }
  }
  return aus.slice(0, 80)
}

/** Für den Fallkatalog: ohne Beträge. */
function ohneBetraege(positionen: ProbePosition[]): FallPosition[] {
  return positionen.map(({ betrag: _, ...p }) => p)
}

/** Zahnschema und Gebührenzeilen (GOZ, BEL, BEB, BEMA) aus demselben Blatt. */
export function blattAusZeilen(zeilen: PdfZeile[]): { schema: ZahnSchema; positionen: ProbePosition[] } {
  return { schema: schemaAusZeilen(zeilen), positionen: positionenAusZeilen(zeilen) }
}

/** Befund und Positionen aus den PDF-Zeilen. */
export function planAusHkpZeilen(zeilen: PdfZeile[]): { befund: Record<string, string>; positionen: FallPosition[] } | { fehler: string } {
  if (!zeilen.some((z) => textVon(z))) return { fehler: 'Das PDF enthält keinen Text. Bitte den HKP aus dem Praxisprogramm speichern, nicht als Scan.' }
  const befund = befundAusZeilen(zeilen)
  const positionen = ohneBetraege(positionenAusZeilen(zeilen))
  if (!Object.keys(befund).length) return { fehler: 'Im PDF steht kein Befund je Zahn.' }
  if (!positionen.length) return { fehler: 'Im PDF stehen keine BEMA-, GOZ- oder Laborpositionen.' }
  return { befund, positionen }
}

/**
 * HKP und Anlagen für die öffentliche Probe. Beträge bleiben drin, wenn sie als Text im PDF stehen.
 * Eine Anlage ohne Befund (nur Labor) ist gültig und wird später dazugelegt.
 */
export function probeAusHkpZeilen(zeilen: PdfZeile[]): { befund: Record<string, string>; positionen: ProbePosition[] } | { fehler: string } {
  if (!zeilen.some((z) => textVon(z))) return { fehler: 'Das PDF enthält keinen Text. Bitte aus dem Praxisprogramm speichern, nicht als Scan.' }
  const befund = befundAusZeilen(zeilen)
  const positionen = positionenAusZeilen(zeilen)
  if (!Object.keys(befund).length && !positionen.length) return { fehler: 'Weder Befund noch Gebührenpositionen gefunden.' }
  return { befund, positionen }
}

/** Einfacher Text (txt oder Qwen-Abschrift) als Zeilen, damit derselbe Leser greift. */
export function zeilenAusText(text: string): PdfZeile[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => ({
    teile: line.split(/\s+/).map((text, i) => ({ x: i * 36, text })),
  }))
}

/** Textschicht für das Modell: Zeilen von links nach rechts, so wie auf dem Blatt. */
export function textSchicht(zeilen: PdfZeile[], seite = 1): string {
  const koerper = zeilen.map((z) => z.teile
    .map((t) => t.text.trim())
    .filter(Boolean)
    .join(' ')).filter(Boolean)
  return [`Seite ${seite}`, ...koerper].join('\n')
}

async function zeilenJeSeite(daten: ArrayBuffer): Promise<PdfZeile[][]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const aufgabe = pdfjs.getDocument({ data: new Uint8Array(daten) })
  const doc = await aufgabe.promise
  const seiten: PdfZeile[][] = []
  for (let s = 1; s <= doc.numPages; s++) {
    const inhalt = await (await doc.getPage(s)).getTextContent()
    const gruppen = new Map<number, PdfTeil[]>()
    for (const i of inhalt.items) {
      if (!('str' in i) || !i.str.trim()) continue
      const y = Math.round(i.transform[5])
      const key = [...gruppen.keys()].find((k) => Math.abs(k - y) <= 2) ?? y
      const liste = gruppen.get(key) ?? []
      liste.push({ x: i.transform[4], text: i.str.trim(), w: 'width' in i ? i.width : undefined })
      gruppen.set(key, liste)
    }
    const zeilen: PdfZeile[] = []
    for (const y of [...gruppen.keys()].sort((a, b) => b - a)) {
      zeilen.push({ teile: gruppen.get(y)!.sort((a, b) => a.x - b.x) })
    }
    const seitePdf = await doc.getPage(s)
    const notizen = await seitePdf.getAnnotations()
    for (const n of notizen) {
      const eintrag = n as { fieldValue?: unknown; contents?: unknown }
      const wert = String(eintrag.fieldValue ?? eintrag.contents ?? '').trim()
      if (!wert || wert.length > 200) continue
      zeilen.push({ teile: [{ x: 0, text: wert }] })
    }
    seiten.push(zeilen)
  }
  await aufgabe.destroy()
  return seiten
}

/** Text eines HKP-PDF, zeilenweise mit der waagerechten Lage. */
export async function zeilenAusPdf(daten: ArrayBuffer): Promise<PdfZeile[]> {
  return (await zeilenJeSeite(daten)).flat()
}

/** Textschicht je Seite, höchstens drei Seiten. */
export async function textSchichtenAusPdf(daten: ArrayBuffer): Promise<string[]> {
  const seiten = await zeilenJeSeite(daten)
  return seiten.slice(0, 3).map((z, i) => textSchicht(z, i + 1))
}

export async function planAusPdf(datei: File): Promise<{ befund: Record<string, string>; positionen: FallPosition[] } | { fehler: string }> {
  if (!datei.name.toLowerCase().endsWith('.pdf') && datei.type !== 'application/pdf') {
    return { fehler: 'Bitte den HKP als PDF hochladen.' }
  }
  try {
    return planAusHkpZeilen(await zeilenAusPdf(await datei.arrayBuffer()))
  } catch {
    return { fehler: 'Das PDF ließ sich nicht lesen.' }
  }
}
