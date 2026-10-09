// Liest Labor-XML im Format „Laborabrechnungsdaten“ (KZBV / VDZI / VDDS), Version 4.x –
// Kostenvoranschlag oder Rechnung des Fremdlabors. Beträge ganzzahlig in Cent, Mengen in
// Tausendstel, Mehrwertsteuersatz in Promille (wie im HKP-Planer, ZE/HKP/src/engine/laborxml.ts).

export const XML_VERSION = '4.5'

const ART = ['BEL', 'NBL', 'EDM', 'MAT', 'RBT'] as const
export type PositionsArt = (typeof ART)[number]

export interface XmlPosition {
  art: PositionsArt
  /** vierstellige BEL-Nummer (nur Art BEL) */
  nummer?: string
  beschreibung: string
  /** Euro je Einheit */
  einzelpreis: number
  /** Einheiten (Menge / 1000) */
  menge: number
  /** Euro, bei Rabatt negativ */
  betrag: number
  mwstSatz: number
}

export interface LaborXml {
  version: string
  laborname: string
  herstellungsort: string
  lieferdatum: string
  rechnungsnummer: string
  auftragsnummer: string
  netto: number
  mwst: number
  brutto: number
  positionen: XmlPosition[]
  fehler: string[]
  warnungen: string[]
}

/** Was vom eingelesenen Labor-XML am Plan hängen bleibt */
export interface LaborImport {
  datei: string
  eingelesen: string
  rechnungsnummer: string
  netto: number
  mwst: number
  brutto: number
}

const entities = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')

function attribute(tag: string): Record<string, string> {
  const r: Record<string, string> = {}
  for (const m of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) r[m[1]] = entities(m[2] ?? m[3] ?? '')
  return r
}

const ganz = (s: string | undefined) => (s && /^-?\d+$/.test(s.trim()) ? Number(s) : NaN)

export function laborXmlLesen(text: string): LaborXml {
  const fehler: string[] = []
  const warnungen: string[] = []
  const xml = text.replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '')
  const wurzel = /<Laborabrechnung\b([^>]*)>/.exec(xml)
  const rechnungTag = /<Rechnung\b([^>]*)>/.exec(xml)
  const leer: LaborXml = {
    version: '', laborname: '', herstellungsort: '', lieferdatum: '', rechnungsnummer: '', auftragsnummer: '',
    netto: 0, mwst: 0, brutto: 0, positionen: [], fehler, warnungen,
  }
  if (!wurzel || !rechnungTag) {
    fehler.push('Keine Laborabrechnungsdaten: Element <Laborabrechnung>/<Rechnung> fehlt.')
    return leer
  }
  const version = attribute(wurzel[1]).Version ?? ''
  if (!/^4\.\d$/.test(version)) warnungen.push(`Schnittstellenversion ${version || 'unbekannt'} – erwartet wird 4.x (aktuell ${XML_VERSION}).`)
  const r = attribute(rechnungTag[1])

  const positionen: XmlPosition[] = []
  let summeGruppen = 0
  let summeMwst = 0
  for (const g of xml.matchAll(/<MWST-Gruppe\b([^>]*)>([\s\S]*?)<\/MWST-Gruppe>/g)) {
    const ga = attribute(g[1])
    const satz = ganz(ga.Mehrwertsteuersatz)
    let summe = 0
    for (const p of g[2].matchAll(/<Position\b([^>]*?)\/?>/g)) {
      const pa = attribute(p[1])
      const art = pa.Art as PositionsArt
      const einzel = ganz(pa.Einzelpreis)
      const menge = ganz(pa.Menge)
      if (!ART.includes(art)) { fehler.push(`Unbekannte Positionsart „${pa.Art}“.`); continue }
      if (Number.isNaN(einzel) || Number.isNaN(menge) || menge === 0) { fehler.push(`Position „${pa.Beschreibung ?? ''}“: Einzelpreis/Menge ungültig.`); continue }
      if (art === 'BEL' && !/^\d{4}$/.test(pa.Nummer ?? '')) fehler.push(`BEL-Position „${pa.Beschreibung ?? ''}“ ohne gültige vierstellige Nummer.`)
      const betragCent = Math.round((Math.abs(einzel) * menge) / 1000) * (art === 'RBT' ? -1 : 1)
      summe += betragCent
      positionen.push({
        art, nummer: art === 'BEL' ? pa.Nummer : undefined, beschreibung: pa.Beschreibung ?? '',
        einzelpreis: Math.abs(einzel) / 100, menge: menge / 1000, betrag: betragCent / 100, mwstSatz: Number.isNaN(satz) ? 0 : satz / 10,
      })
    }
    const zw = ganz(ga.Zwischensumme_netto)
    if (!Number.isNaN(zw) && Math.abs(zw - summe) > 1) warnungen.push(`MWST-Gruppe ${satz / 10} %: Summe der Positionen ${(summe / 100).toFixed(2)} € ≠ Zwischensumme ${(zw / 100).toFixed(2)} €.`)
    summeGruppen += Number.isNaN(zw) ? summe : zw
    summeMwst += ganz(ga.Mehrwertsteuerbetrag) || 0
  }
  if (!positionen.length) fehler.push('Die Datei enthält keine Positionen.')
  const netto = ganz(r.Gesamtbetrag_netto)
  const mwst = ganz(r.Mehrwertsteuer_gesamt)
  const brutto = ganz(r.Gesamtbetrag_brutto)
  if (!Number.isNaN(netto) && netto !== summeGruppen) warnungen.push(`Gesamtbetrag netto ${(netto / 100).toFixed(2)} € ≠ Summe der MWST-Gruppen ${(summeGruppen / 100).toFixed(2)} €.`)
  if (!Number.isNaN(brutto) && !Number.isNaN(netto) && !Number.isNaN(mwst) && brutto !== netto + mwst) warnungen.push('Gesamtbetrag brutto ≠ netto + Mehrwertsteuer.')
  if (r.Herstellungsort && !/^D-/.test(r.Herstellungsort)) warnungen.push(`Herstellungsort im Ausland: ${r.Herstellungsort}.`)

  return {
    version, laborname: r.Laborname ?? '', herstellungsort: r.Herstellungsort ?? '', lieferdatum: r.Laborlieferdatum ?? '',
    rechnungsnummer: r.Laborrechnungsnummer ?? '', auftragsnummer: r.Auftragsnummer ?? '',
    netto: (Number.isNaN(netto) ? summeGruppen : netto) / 100, mwst: (Number.isNaN(mwst) ? summeMwst : mwst) / 100,
    brutto: (Number.isNaN(brutto) ? summeGruppen + summeMwst : brutto) / 100,
    positionen, fehler, warnungen,
  }
}

export const importVon = (x: LaborXml, datei: string): LaborImport => ({
  datei, eingelesen: new Date().toISOString().slice(0, 10), rechnungsnummer: x.rechnungsnummer, netto: x.netto, mwst: x.mwst, brutto: x.brutto,
})
