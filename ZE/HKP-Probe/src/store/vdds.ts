/**
 * VDDS-Laborpreisformat der KZVen (BEL II): Nr; Nr; Text; Kz; danach Preispaare Praxis/Gewerbe
 * für Kons, ZE, KFO, KB, PA. Manche KZVen liefern nur das erste Paar, manche füllen nur die ZE-Spalten.
 * Ohne Imports – wird auch vom Aktualisierungsdienst (Node) verwendet.
 */

export interface VddsEintrag {
  nr: string
  text: string
  gewerbe: number
  praxis: number
}

/** Deutsche und englische Zahlenformate: "1.234,56", "1234,56", "1234.56" */
export function zahl(wert: unknown): number {
  if (typeof wert === 'number') return wert
  let s = String(wert ?? '').replace(/[€\s]/g, '')
  if (!s) return 0
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/** Dekodiert UTF-8 und fällt bei ungültigen Bytes auf Windows-1252 zurück (KZV-CSV-Dateien). */
export function dekodieren(buf: ArrayBuffer | Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

export function csvZeilen(text: string): string[][] {
  const erste = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const trenner = [';', '\t', ','].sort((a, b) => erste.split(b).length - erste.split(a).length)[0]
  const zeilen: string[][] = []
  let feld = ''
  let zeile: string[] = []
  let inAnf = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inAnf) {
      if (c === '"' && text[i + 1] === '"') { feld += '"'; i++ }
      else if (c === '"') inAnf = false
      else feld += c
    } else if (c === '"') inAnf = true
    else if (c === trenner) { zeile.push(feld); feld = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      zeile.push(feld); zeilen.push(zeile); zeile = []; feld = ''
    } else feld += c
  }
  if (feld || zeile.length) { zeile.push(feld); zeilen.push(zeile) }
  return zeilen
}

/** Platzhalter wie „**“ oder „-“ (Preis entfällt, z. B. Versand beim Praxislabor) zählen als 0 */
const preis = (v: unknown) => (/^[\s*\-–]+$/.test(String(v ?? '')) ? 0 : zahl(v))

const istNr = (v: unknown) => /^\d{1,4}$/.test(String(v ?? '').trim())
const datenzeilen = (zeilen: unknown[][]) => zeilen.filter((z) => z.length >= 6 && istNr(z[0]) && istNr(z[1]))

/** Erkennt das VDDS-Format (auch mit Kopfzeile): mindestens 6 Spalten, Spalten 1 und 2 = BEL-Nr. */
export function istVdds(zeilen: unknown[][]) {
  const daten = datenzeilen(zeilen)
  const gesamt = zeilen.filter((z) => z.some((c) => String(c ?? '').trim())).length
  return daten.length > 0 && daten.length >= Math.min(gesamt * 0.8, gesamt - 2)
}

/** ZE zuerst (Zahnersatz), dann Kons (6-spaltige Listen), dann die übrigen Bereiche */
const PAARE = [6, 4, 8, 10, 12]

export function vddsAuswerten(zeilen: unknown[][], optionen: { nurPraxis?: boolean } = {}): { eintraege: VddsEintrag[]; warnungen: string[] } {
  const warnungen: string[] = []
  const roh: { nr: string; text: string; a: number; b: number; spalte: number }[] = []
  const gesehen = new Set<string>()
  let ungueltig = 0
  for (const z of datenzeilen(zeilen)) {
    const nr = String(z[0]).trim().padStart(4, '0')
    if (gesehen.has(nr)) continue
    const spalte = PAARE.find((i) => preis(z[i]) > 0 || preis(z[i + 1]) > 0) ?? 4
    const a = preis(z[spalte])
    const b = preis(z[spalte + 1])
    if (Number.isNaN(a) || Number.isNaN(b)) { ungueltig++; continue }
    gesehen.add(nr)
    roh.push({ nr, text: String(z[2] ?? '').trim().replace(/\s+/g, ' '), a, b, spalte })
  }
  // Praxislabor liegt 5 % unter dem Gewerbelabor – daraus folgt die Reihenfolge des Spaltenpaars.
  let aGroesser = 0
  let bGroesser = 0
  for (const r of roh) {
    if (r.a > r.b && r.b > 0) aGroesser++
    else if (r.b > r.a && r.a > 0) bGroesser++
  }
  const vertauscht = aGroesser > bGroesser
  const nurEinPreis = roh.length > 0 && roh.every((r) => r.b === 0)
  const nurPraxis = optionen.nurPraxis || nurEinPreis
  const eintraege = roh.map((r) => {
    const praxis = vertauscht ? r.b : r.a
    let gewerbe = vertauscht ? r.a : r.b
    if (nurPraxis && !gewerbe) gewerbe = Math.round((praxis / 0.95) * 100) / 100
    return { nr: r.nr, text: r.text, gewerbe, praxis }
  })
  const spalten = new Set(roh.map((r) => r.spalte))
  warnungen.push(`VDDS-Laborpreisformat der KZV erkannt (${spalten.has(6) ? 'Preise aus den ZE-Spalten' : 'Preispaar Praxis/Gewerbe'}${vertauscht ? ', Gewerbe vor Praxis' : ''}).`)
  if (nurPraxis) warnungen.push('Die Datei enthält nur Praxislaborpreise – Gewerbepreise wurden als Praxispreis ÷ 0,95 berechnet (§ 57 Abs. 2 SGB V). Bitte mit der Gewerbe-Liste der KZV abgleichen.')
  if (ungueltig) warnungen.push(`${ungueltig} Zeile(n) mit ungültigen Zahlen wurden übersprungen.`)
  return { eintraege, warnungen }
}

/** Gültigkeitsbeginn aus dem VDDS-Dateinamen „<KZV>la<MMJJ>…“ */
export function vddsDateiname(name: string): { kzv: string; gueltigAb: string } | null {
  const m = /(\d{2})la(\d{2})(\d{2})/i.exec(name)
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null
  return { kzv: m[1], gueltigAb: `20${m[3]}-${m[2]}-01` }
}
