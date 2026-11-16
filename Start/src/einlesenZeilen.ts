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

export interface BlattPosition {
  ebene: 'GOZ' | 'GOÄ' | 'BEL' | 'BEB' | 'MAT'
  nr: string
  zahn: string
  anzahl: number
  betrag?: number
  text?: string
  /** Nur Privatplan: Steigerungsfaktor der Zeile */
  faktor?: number
  /** Nur Privatplan: Analogleistung nach § 6 Abs. 1 GOZ, nr ist die Vergleichsziffer */
  analog?: boolean
  /** Nur Privatplan: Sitzung laut Zwischenüberschrift, ab 1 */
  sitzung?: number
  /** Nur Privatplan: betrag ist der Betrag der ganzen Zeile, auch beim Material (dort brutto) */
  zeilenbetrag?: true
}

export interface BlattSummen {
  honorarGoz?: number
  honorarBema?: number
  labor?: number
  gesamt?: number
  festzuschuss?: number
  eigenanteil?: number
  festzuschussVoll?: number
  laborBeleg?: number
  /** MwSt.-Blöcke des Laborbelegs: Satz in Prozent, Netto und Steuerbetrag */
  laborMwst?: { satz: number; netto: number; betrag: number }[]
}

const kopfMit = (z: PdfZeile, ...worte: string[]) => worte.every((w) => z.teile.some((t) => t.text.toLowerCase().startsWith(w)))

/** Anlage Teil 2: Zahn/Gebiet, GOZ-Nummer, Anzahl, Betrag. Der Betrag gilt für die ganze Zeile. */
function gozZeilen(zeilen: PdfZeile[]): BlattPosition[] {
  const aus: BlattPosition[] = []
  // Zwei Vordrucke: „Zahn/Gebiet · GOZ · Anzahl · Betrag" und „Gebiet · GOZ · Anz · Faktor · Betrag".
  // Steht „Gebiet" unter „Zahn/" in einer eigenen Zeile, beginnt die Kopfzeile nur mit „Zahn/".
  let mitFaktor = false
  const kopf = zeilen.findIndex((z) => {
    if (kopfMit(z, 'zahn/', 'goz', 'anzahl')) return true
    if (kopfMit(z, 'gebiet', 'goz', 'anz', 'faktor', 'betrag')) { mitFaktor = true; return true }
    return false
  })
  if (kopf < 0) return aus
  const istNr = (s: string) => {
    const ziffern = s.length === 5 ? s.slice(0, 4) : s
    return ziffern.length === 4 && nurZiffern(ziffern)
  }
  for (const z of zeilen.slice(kopf + 1)) {
    const t = z.teile.map((e) => e.text)
    const anfang = t[0]?.toLowerCase() ?? ''
    if (anfang.startsWith('zahnärztliches') || anfang === 'summe') break
    // Zeile ohne Zahnangabe (Beratung, Planung): Sie beginnt gleich mit der Nummer.
    const ohneZahn = istNr(anfang)
    if (t.length < (ohneZahn ? 3 : 4)) continue
    const zaehne = ohneZahn ? [] : t[0].split(',').map((s) => s.trim()).filter(Boolean)
    const nr = (ohneZahn ? t[0] : t[1]).toLowerCase()
    if (!ohneZahn && (!zaehne.length || !zaehne.every(istZahn) || !istNr(nr))) continue
    const anzahl = Number(t[t.length - (mitFaktor ? 3 : 2)])
    const betrag = betragVon(t[t.length - 1])
    if (!Number.isInteger(anzahl) || anzahl < 1) continue
    if (mitFaktor && betragVon(t[t.length - 2]) === undefined) continue
    if (zaehne.length && anzahl === zaehne.length) {
      for (const zahn of zaehne) {
        aus.push({ ebene: 'GOZ', nr, zahn, anzahl: 1, ...(betrag !== undefined ? { betrag: Math.round(betrag / anzahl * 100) / 100 } : {}) })
      }
    } else {
      aus.push({ ebene: 'GOZ', nr, zahn: zaehne.length === 1 ? zaehne[0] : '', anzahl, ...(betrag !== undefined ? { betrag } : {}) })
    }
  }
  return aus
}

const hatBuchstabe = (w: string) => [...w].some((c) => c.toLowerCase() !== c.toUpperCase())
const istDatum = (w: string) => (w.length === 10 || w.length === 8) && w.split('.').length === 3 && w.split('.').every(nurZiffern)

interface LaborStand { grenze: number; mengeVorn: boolean }

/**
 * Eigenbeleg oder Laborrechnung: Nummer, Einzelpreis, Anzahl. Der Betrag ist hier der Einzelpreis.
 * Zeilen ohne Nummer (Zirkon, Legierung) sind Material. Läuft die Bezeichnung in die nächste Zeile, gehört sie dazu.
 */
function laborZeilen(zeilen: PdfZeile[], stand: LaborStand = { grenze: -1, mengeVorn: false }): BlattPosition[] {
  const aus: BlattPosition[] = []
  // Die Folgeseite eines Belegs hat keinen Tabellenkopf: Spalten gelten weiter, solange dort Belegzeilen stehen.
  let { grenze, mengeVorn } = stand
  let letzte: BlattPosition | undefined
  for (const z of zeilen) {
    const vorher = letzte
    letzte = undefined
    if (kopfMit(z, 'nr.', 'leistungsbe', 'einzelpreis')) {
      // Die Nummer beginnt in der Spalte Nr.: links von der Mitte zwischen den Anfängen von Nr. und Leistungsbezeichnung.
      const links = (t: PdfTeil) => t.x - (t.w ?? 0) / 2
      const nr = z.teile.find((t) => t.text.toLowerCase().startsWith('nr.'))!
      const text = z.teile.find((t) => t.text.toLowerCase().startsWith('leistungsbe'))!
      grenze = (links(nr) + links(text)) / 2
      // Manche Belege führen die Menge vor dem Einzelpreis (Anz./Gramm · Einzelpreis · Gesamtpreis).
      const preis = z.teile.find((t) => t.text.toLowerCase().startsWith('einzelpreis'))!
      const menge = z.teile.find((t) => t.text.toLowerCase().startsWith('anz') || t.text.toLowerCase().startsWith('menge'))
      mengeVorn = !!menge && menge.x < preis.x
      continue
    }
    if (grenze < 0) continue
    const worte = z.teile.filter((t) => !istDatum(t.text))
    const vorn = worte.length && worte[0].x - (worte[0].w ?? 0) / 2 < grenze ? [worte[0]] : []
    const hinten = worte.slice(vorn.length).filter((t) => !t.text.endsWith('%')).map((t) => t.text)
    if (!vorn.length && vorher && hinten.length && hinten.every((w) => hatBuchstabe(w) && !w.endsWith(':'))) {
      vorher.text = [vorher.text, ...hinten].filter(Boolean).join(' ')
      letzte = vorher
      continue
    }
    if (hinten.length < 3) continue
    const [eins, zwei, summe] = hinten.slice(-3).map(betragVon)
    const [preis, menge] = mengeVorn ? [zwei, eins] : [eins, zwei]
    if (preis === undefined || menge === undefined || summe === undefined || menge <= 0) continue
    if (Math.abs(preis * menge - summe) > 0.02) continue
    const text = hinten.slice(0, -3).filter((w) => hatBuchstabe(w) || betragVon(w) === undefined).join(' ')
    if (!vorn.length) {
      if (!text) continue
      letzte = { ebene: 'MAT', nr: '', zahn: '', anzahl: menge, betrag: preis, text }
    } else {
      const roh = vorn[vorn.length - 1].text
      const kurz = roh.split('-').join('')
      const bel = roh.includes('-') && kurz.length === 4 && nurZiffern(kurz)
      letzte = { ebene: bel ? 'BEL' : 'BEB', nr: bel ? kurz : roh, zahn: '', anzahl: menge, betrag: preis, ...(text ? { text } : {}) }
    }
    aus.push(letzte)
  }
  stand.grenze = aus.length ? grenze : -1
  stand.mengeVorn = mengeVorn
  return aus
}

interface PrivatStand { sitzung: number; letzte?: BlattPosition }

const linkerRand = (t: PdfTeil) => t.x - (t.w ?? 0) / 2

/**
 * Privater Kostenvoranschlag aus dem Praxisprogramm: „Zähne · Geb.-Nr. · Bezeichnung · Anz. · Faktor · Betrag".
 * GOZ steht als vier Ziffern, GOÄ mit „ä" davor, Analogleistungen mit „a" dahinter, Material mit „vm" davor.
 * Die Bezeichnung läuft über mehrere Zeilen, „1. Sitzung …" ist eine Zwischenüberschrift.
 * Der Betrag gilt für die ganze Zeile. Der Kopf steht auf jeder Seite neu, die Sitzung zählt über die Seiten weiter.
 */
function privatZeilen(zeilen: PdfZeile[], stand: PrivatStand): BlattPosition[] {
  const aus: BlattPosition[] = []
  const kopf = zeilen.findIndex((z) => kopfMit(z, 'zähne', 'geb', 'bezeichnung', 'anz', 'faktor', 'betrag'))
  if (kopf < 0) return aus
  const spalte = (anfang: string) => zeilen[kopf].teile.find((t) => t.text.toLowerCase().startsWith(anfang))!
  // Zähne stehen links der Mitte zwischen „Zähne“ und „Geb.-Nr.“, die Bezeichnung beginnt am linken Rand ihres Kopfworts.
  const zahnGrenze = (spalte('zähne').x + spalte('geb').x) / 2
  const textGrenze = linkerRand(spalte('bezeichnung')) - 5
  const faktorX = spalte('faktor').x
  for (const z of zeilen.slice(kopf + 1)) {
    const worte = z.teile
    const klein = worte.map((t) => t.text.toLowerCase())
    if (klein[0]?.startsWith('zahnarzthonorar') || klein[0]?.startsWith('verbrauchsmaterial')) break
    if (klein.some((w) => w.startsWith('zahnarzthonorar'))) { stand.letzte = undefined; continue }
    const f = worte.findIndex((t, i) => i > 0 && Math.abs(t.x - faktorX) <= 30 && t.text.includes(',') && betragVon(t.text) !== undefined)
    if (f < 0) {
      // Zwischenüberschrift: „1. Sitzung Implantat-Vorbehandlung", „4.Sitzung Implantat-Freilegung"
      if (klein.slice(0, 2).some((w) => w.includes('sitzung'))) { stand.sitzung++; stand.letzte = undefined; continue }
      if (stand.letzte && worte.length) stand.letzte.text = [stand.letzte.text, ...worte.map((t) => t.text)].filter(Boolean).join(' ')
      continue
    }
    stand.letzte = undefined
    const anzahl = Number(worte[f - 1].text)
    const betrag = f < worte.length - 1 ? betragVon(worte[worte.length - 1].text) : undefined
    const nrIndex = worte.findIndex((t, i) => i < f - 1 && t.x > zahnGrenze && t.x < textGrenze)
    if (nrIndex < 0 || !Number.isInteger(anzahl) || anzahl < 1 || betrag === undefined) continue
    const roh = worte[nrIndex].text.toLowerCase()
    const zahn = worte.slice(0, nrIndex).map((t) => t.text).join(' ')
    const text = worte.slice(nrIndex + 1, f - 1).map((t) => t.text).join(' ')
    const faktor = betragVon(worte[f].text)!
    let p: BlattPosition | undefined
    const grund = { zahn, anzahl, betrag, faktor, zeilenbetrag: true as const, ...(stand.sitzung ? { sitzung: stand.sitzung } : {}), ...(text ? { text } : {}) }
    if (roh.startsWith('vm')) p = { ebene: 'MAT', nr: worte[nrIndex].text, ...grund }
    else if (roh.startsWith('ä') && nurZiffern(roh.slice(1))) p = { ebene: 'GOÄ', nr: roh.slice(1), ...grund }
    else if (roh.length === 5 && roh.endsWith('a') && nurZiffern(roh.slice(0, 4))) p = { ebene: 'GOZ', nr: roh.slice(0, 4), analog: true, ...grund }
    else if (roh.length === 4 && nurZiffern(roh)) p = { ebene: 'GOZ', nr: roh, ...grund }
    if (!p) continue
    aus.push(p)
    stand.letzte = p
  }
  return aus
}

/** „… gemäß § 6 Abs. 1 GOZ entsprechend GOZ-Nr. 9050 …" steht oft erst in der Folgezeile: Analog gilt dann auch ohne „a". */
function analogNachtragen(positionen: BlattPosition[]) {
  for (const p of positionen) {
    if (p.zeilenbetrag && !p.analog && p.ebene !== 'MAT' && p.text?.includes('Abs. 1 GOZ entsprechend')) p.analog = true
  }
}

/** Summe der Positionen mit 7,00% MwSt EUR 256,00 17,92 273,92 */
function mwstAus(zeilen: PdfZeile[]): NonNullable<BlattSummen['laborMwst']> {
  const aus: NonNullable<BlattSummen['laborMwst']> = []
  for (const z of zeilen) {
    const t = z.teile.map((e) => e.text)
    if (!t.join(' ').toLowerCase().startsWith('summe der positionen mit')) continue
    const satz = betragVon(t.find((w) => w.endsWith('%')) ?? '')
    const [netto, betrag, brutto] = t.slice(-3).map(betragVon)
    if (satz === undefined || netto === undefined || betrag === undefined || brutto === undefined) continue
    if (Math.abs(netto + betrag - brutto) > 0.02) continue
    aus.push({ satz, netto, betrag })
  }
  if (aus.length) return aus
  // Andere Schreibweise: „Summe techn. Leistungen", „Summe Metall", „Summe Material", dann „zzgl. 7% Mehrwertsteuer €: 110,44".
  let netto = 0
  for (const z of zeilen) {
    const t = z.teile.map((e) => e.text)
    const anfang = t[0]?.toLowerCase() ?? ''
    const wert = betragVon(t[t.length - 1] ?? '')
    if (anfang === 'summe' && wert !== undefined) { netto += wert; continue }
    if (anfang !== 'zzgl.' || !t.some((w) => w.toLowerCase().startsWith('mehrwertsteuer'))) continue
    const satz = betragVon(t.find((w) => w.endsWith('%')) ?? '')
    if (satz === undefined || wert === undefined || netto <= 0) continue
    // Gegenprobe: Der Steuerbetrag muss zum Satz und zur Nettosumme passen.
    if (Math.abs(netto * satz / 100 - wert) > 0.05) continue
    aus.push({ satz, netto: Math.round(netto * 100) / 100, betrag: wert })
    netto = 0
  }
  return aus
}

const MARKEN: [Exclude<keyof BlattSummen, 'laborMwst'>, string][] = [
  ['honorarGoz', 'zahnärztliches honorar goz ('],
  ['honorarBema', 'zahnärztliches honorar bema ('],
  ['labor', 'material und laborkosten ('],
  ['gesamt', 'gesamtkosten ('],
  ['festzuschuss', 'abzüglich festzuschüsse'],
  ['eigenanteil', 'ihr voraussichtlicher eigenanteil'],
  ['festzuschussVoll', 'festzuschuss 100%'],
  ['laborBeleg', 'laborkosten gesamt'],
  // Zweiter Vordruck für Teil 2 und den Praxislaborbeleg
  ['honorarGoz', 'summe der goz-honorarleistungen'],
  ['labor', 'material- und laborkosten ('],
  ['laborBeleg', 'gesamtsumme praxislaborkosten'],
  // Privater Kostenvoranschlag: Zwischensumme und Übertrag beginnen anders und zählen nicht.
  ['honorarGoz', 'zahnarzthonorar eur'],
  ['labor', 'verbrauchsmaterial eur'],
  ['gesamt', 'behandlungskosten insgesamt'],
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
  const mwst = mwstAus(zeilen)
  if (mwst.length) aus.laborMwst = mwst
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
  const gesehen = new Set<string>()
  const labor: LaborStand = { grenze: -1, mengeVorn: false }
  const privat: PrivatStand = { sitzung: 0 }
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
    // Teil 2 liegt oft mehrfach bei (Patient, Praxis, Kasse): Dieselbe Liste zählt nur einmal.
    for (const liste of [gozZeilen(zeilen), laborZeilen(zeilen, labor)]) {
      if (!liste.length) continue
      const marke = JSON.stringify(liste)
      if (gesehen.has(marke)) continue
      gesehen.add(marke)
      blatt.positionen.push(...liste)
    }
    // Der private Kostenvoranschlag geht über mehrere Seiten: jede Seite trägt eigene Zeilen, nichts liegt doppelt bei.
    blatt.positionen.push(...privatZeilen(zeilen, privat))
    blatt.summen = { ...summenAus(zeilen), ...blatt.summen }
  }
  analogNachtragen(blatt.positionen)
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
