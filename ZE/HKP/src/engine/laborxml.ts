import type { HkpPlan, Position } from '../types'
import { belNrNorm, laborVon, runden, type BerechnetePosition, type Listen } from './berechnung'
import { kzvNachNr } from '../data/kzv'

/**
 * XML-Schnittstelle „Laborabrechnungsdaten“ (KZBV / VDZI / VDDS), Version 4.5 vom 05.11.2021.
 * Beträge ganzzahlig in Cent, Mengen in Tausendstel, Mehrwertsteuersatz in Promille.
 */
export const XML_VERSION = '4.5'

const ART = ['BEL', 'NBL', 'EDM', 'MAT', 'RBT'] as const
export type PositionsArt = (typeof ART)[number]

/** Prüfziffer der Auftragsnummer nach dem KZBV-Algorithmus (pz_aufnr.c) */
export function pruefziffer(text: string): string {
  let summe = 0
  let gewicht2 = true
  for (const ch of text) {
    let wert: number
    if (ch === '0' || ch === '*' || ch === '-') wert = 0
    else if (/[1-9]/.test(ch)) wert = Number(ch)
    else if (/[a-z]/i.test(ch)) wert = ch.toLowerCase().charCodeAt(0) % 10
    else throw new Error(`Unzulässiges Zeichen „${ch}“ in der Auftragsnummer`)
    if (gewicht2 && (wert *= 2) > 9) wert -= 9
    summe += wert
    gewicht2 = !gewicht2
  }
  return String(summe % 10)
}

export function auftragsnummerGueltig(an: string): boolean {
  const m = /^(\d{6}-[A-Za-z0-9]+-(?:ZE|KB|KFO)-[A-Za-z0-9]+-\d+-)(\d)$/.exec(an)
  return !!m && an.length <= 50 && pruefziffer(m[1]) === m[2]
}

const nurZiffern = (s: string, n: number) => s.replace(/\D/g, '').slice(-n).padStart(n, '0')

/** Patientenpseudonym: Prüfsumme über Name und Geburtsdatum, nur A–Z/0–9 */
function pseudonym(plan: HkpPlan): string {
  const quelle = `${plan.patient.name}|${plan.patient.vorname}|${plan.patient.geburtsdatum}`.toLowerCase()
  let h = 2166136261
  for (const ch of quelle) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return h.toString(36).toUpperCase().slice(0, 6)
}

/**
 * Auftragsnummer: Standortnummer (letzte 2 Ziffern Zahnarzt-Nr. + letzte 2 Ziffern PLZ + Zähler),
 * Patientenpseudonym, „ZE“, Planidentifikation, laufende Nummer, Prüfziffer.
 */
export function auftragsnummerErzeugen(plan: HkpPlan, zaehler = 1): string {
  const standort = nurZiffern(plan.verwaltung.zahnarztNr, 2) + nurZiffern(plan.einstellungen.praxisPlz, 2) + String(zaehler % 100).padStart(2, '0')
  const planId = (plan.verwaltung.antragsnummer.replace(/[^A-Za-z0-9]/g, '') || plan.verwaltung.ausstellungsdatum.replace(/\D/g, '').slice(2)).slice(0, 12) || '1'
  const ohne = `${standort}-${pseudonym(plan)}-ZE-${planId}-${plan.fremdlabor.laufendeNr || 1}-`
  return ohne + pruefziffer(ohne)
}

const BEREICHE: [RegExp, string][] = [
  [/sachsen-anhalt|sachsen anhalt/i, 'SAN'], [/niedersachsen/i, 'NS'], [/sachsen/i, 'SA'], [/bayern/i, 'BY'],
  [/berlin/i, 'BE'], [/brandenburg/i, 'BBG'], [/baden|w(ü|ue)rttemberg/i, 'BW'], [/bremen/i, 'HB'], [/hamburg/i, 'HH'],
  [/hessen/i, 'HS'], [/mecklenburg|vorpommern/i, 'MVO'], [/nordrhein/i, 'NR'], [/rheinland|pfalz/i, 'RP'],
  [/saarland/i, 'SAA'], [/schleswig|holstein/i, 'SH'], [/th(ü|ue)ringen/i, 'TH'], [/westfalen|lippe/i, 'WL'],
]

/** Abrechnungsbereich (KZV-Bereich) aus dem Namen der BEL-Liste */
export function abrechnungsbereich(listen: Listen): string {
  const kzv = listen.bel?.kzv ? kzvNachNr(listen.bel.kzv) : undefined
  if (kzv) return kzv.bereich
  const text = `${listen.bel?.id ?? ''} ${listen.bel?.name ?? ''}`
  return BEREICHE.find(([re]) => re.test(text))?.[1] ?? 'BY'
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const cent = (euro: number) => Math.round(euro * 100)

function herstellungsortXml(ort: string): string {
  const t = ort.trim()
  if (!t) return 'D-'
  if (/^D[\s-]/i.test(t)) return `D-${t.slice(2).trim()}`.slice(0, 50)
  return t.slice(0, 50)
}

/**
 * Erstellt die Auftrags-/KVA-Datei für das Fremdlabor im Format der Laborabrechnungsdaten 4.5.
 * Enthält alle Fremdlabor-Positionen mit den vorläufigen Preisen; das Labor gibt sie mit seinen Preisen zurück.
 */
export function laborXmlErstellen(plan: HkpPlan, positionen: BerechnetePosition[], listen: Listen, auftragsnummer: string): string {
  const fremd = positionen.filter((p) => p.labor === 'fremd' && !p.material && (p.ebene === 'BEL' || p.ebene === 'BEB' || p.ebene === 'MAT'))
  const satz = Math.round(plan.einstellungen.mwstLabor * 10)
  const zeilen = fremd.map((p) => {
    const menge = Math.max(1, Math.round((p.anzahl || 1) * 1000))
    let art: PositionsArt = p.ebene === 'BEL' ? 'BEL' : p.ebene === 'BEB' ? 'NBL' : /gold|edelmetall|legierung|platin|palladium/i.test(p.bezeichnung) ? 'EDM' : 'MAT'
    if (p.ebene === 'MAT' && p.einzelpreis < 0) art = 'RBT'
    const einzel = Math.abs(cent(p.einzelpreis))
    const text = (p.ebene === 'BEB' && p.nr ? `${p.nr} ${p.bezeichnung}` : p.bezeichnung || 'Material').slice(0, 60)
    const nummer = art === 'BEL' ? ` Nummer="${belNrNorm(p.nr).padStart(4, '0')}"` : ''
    const betrag = Math.round((einzel * menge) / 1000) * (art === 'RBT' ? -1 : 1)
    return { xml: `      <Position Art="${art}"${nummer} Beschreibung="${esc(text)}" Einzelpreis="${einzel}" Menge="${menge}"/>`, betrag }
  })
  const netto = Math.max(0, zeilen.reduce((s, z) => s + z.betrag, 0))
  const mwst = Math.round((netto * satz) / 1000)
  const heute = new Date().toISOString().slice(0, 10)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- Auftrag / Kostenvoranschlag aus dem HKP-Planer – vorläufige Preise, bitte durch die Laborpreise ersetzen -->`,
    `<Laborabrechnung Version="${XML_VERSION}">`,
    `  <Rechnung Laborname="${esc(plan.fremdlabor.name || 'Fremdlabor')}" Herstellungsort="${esc(herstellungsortXml(plan.verwaltung.herstellungsort))}"` +
      ` Abrechnungsbereich="${abrechnungsbereich(listen)}" Laborlieferdatum="${heute}" Laborrechnungsnummer="KVA-${esc(auftragsnummer).slice(0, 46)}"` +
      ` Auftragsnummer="${esc(auftragsnummer)}" Gesamtbetrag_netto="${netto}" Mehrwertsteuer_gesamt="${mwst}" Gesamtbetrag_brutto="${netto + mwst}">`,
    `    <MWST-Gruppe Zwischensumme_netto="${netto}" Mehrwertsteuersatz="${satz}" Mehrwertsteuerbetrag="${mwst}">`,
    ...zeilen.map((z) => z.xml),
    '    </MWST-Gruppe>',
    '  </Rechnung>',
    '</Laborabrechnung>',
    '',
  ].join('\r\n')
}

export interface XmlPosition {
  art: PositionsArt
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
  abrechnungsbereich: string
  lieferdatum: string
  rechnungsnummer: string
  auftragsnummer: string
  software?: string
  netto: number
  mwst: number
  brutto: number
  positionen: XmlPosition[]
  fehler: string[]
  warnungen: string[]
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

const ganz = (s: string | undefined) => (s && /^\d+$/.test(s.trim()) ? Number(s) : NaN)

/** Liest eine Labor-XML (Laborabrechnungsdaten 4.x) und prüft Pflichtfelder und Summen. */
export function laborXmlLesen(text: string): LaborXml {
  const fehler: string[] = []
  const warnungen: string[] = []
  const xml = text.replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '')
  const wurzel = /<Laborabrechnung\b([^>]*)>/.exec(xml)
  const rechnungTag = /<Rechnung\b([^>]*)>/.exec(xml)
  if (!wurzel || !rechnungTag) {
    return { version: '', laborname: '', herstellungsort: '', abrechnungsbereich: '', lieferdatum: '', rechnungsnummer: '', auftragsnummer: '', netto: 0, mwst: 0, brutto: 0, positionen: [], fehler: ['Keine Laborabrechnungsdaten: Element <Laborabrechnung>/<Rechnung> fehlt.'], warnungen }
  }
  const version = attribute(wurzel[1]).Version ?? ''
  if (!/^4\.\d$/.test(version)) warnungen.push(`Schnittstellenversion ${version || 'unbekannt'} – erwartet wird 4.x (aktuell ${XML_VERSION}).`)
  const r = attribute(rechnungTag[1])
  for (const feld of ['Laborname', 'Herstellungsort', 'Abrechnungsbereich', 'Laborlieferdatum', 'Laborrechnungsnummer', 'Auftragsnummer', 'Gesamtbetrag_netto', 'Mehrwertsteuer_gesamt', 'Gesamtbetrag_brutto'])
    if (r[feld] === undefined) fehler.push(`Pflichtattribut ${feld} fehlt.`)

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
      const betragCent = Math.round((einzel * menge) / 1000) * (art === 'RBT' ? -1 : 1)
      summe += betragCent
      positionen.push({
        art, nummer: art === 'BEL' ? pa.Nummer : undefined, beschreibung: pa.Beschreibung ?? '',
        einzelpreis: einzel / 100, menge: menge / 1000, betrag: betragCent / 100, mwstSatz: Number.isNaN(satz) ? 0 : satz / 10,
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
  if (!Number.isNaN(mwst) && mwst !== summeMwst) warnungen.push('Mehrwertsteuer gesamt ≠ Summe der Mehrwertsteuerbeträge der Gruppen.')
  if (!Number.isNaN(brutto) && brutto !== netto + mwst) warnungen.push('Gesamtbetrag brutto ≠ netto + Mehrwertsteuer.')
  if (r.Auftragsnummer && !auftragsnummerGueltig(r.Auftragsnummer)) warnungen.push(`Auftragsnummer „${r.Auftragsnummer}“ entspricht nicht dem Format der Version 4 (Prüfziffer).`)
  if (r.Herstellungsort && !/^D-/.test(r.Herstellungsort)) warnungen.push(`Herstellungsort im Ausland: ${r.Herstellungsort}.`)
  const software = [r.Laborsoftwarehersteller, r.Laborsoftware, r.Laborsoftwareversion].filter(Boolean).join(' ')

  return {
    version, laborname: r.Laborname ?? '', herstellungsort: r.Herstellungsort ?? '', abrechnungsbereich: r.Abrechnungsbereich ?? '',
    lieferdatum: r.Laborlieferdatum ?? '', rechnungsnummer: r.Laborrechnungsnummer ?? '', auftragsnummer: r.Auftragsnummer ?? '',
    software: software || undefined,
    netto: (Number.isNaN(netto) ? summeGruppen : netto) / 100, mwst: (Number.isNaN(mwst) ? summeMwst : mwst) / 100,
    brutto: (Number.isNaN(brutto) ? summeGruppen + summeMwst : brutto) / 100,
    positionen, fehler, warnungen,
  }
}

let zaehler = 0
const xmlId = () => `xml-${Date.now().toString(36)}-${(zaehler++).toString(36)}`

/**
 * Ersetzt alle Fremdlabor-Positionen des Plans durch die Positionen der Labor-XML.
 * Zahnangaben werden von geplanten Positionen mit gleicher Nummer übernommen (die XML enthält keine Zähne).
 */
export function laborXmlUebernehmen(plan: HkpPlan, x: LaborXml, datei: string): { plan: HkpPlan; meldungen: string[] } {
  const meldungen = [...x.warnungen]
  const istFremd = (p: Position) => laborVon(p, plan) === 'fremd'
  const bisher = plan.positionen.filter(istFremd)
  const zahnFuer = (ebene: Position['ebene'], nr: string) =>
    [...new Set(bisher.filter((p) => p.ebene === ebene && p.nr && belNrNorm(p.nr).padStart(4, '0') === nr.padStart(4, '0')).map((p) => p.zahn).filter(Boolean))].join(',')

  const neu: Position[] = x.positionen.map((p) => {
    const basis = { id: xmlId(), anzahl: p.menge, preis: p.einzelpreis, labor: 'fremd' as const, ausXml: true }
    if (p.art === 'BEL') return { ...basis, ebene: 'BEL', nr: p.nummer ?? '', zahn: zahnFuer('BEL', p.nummer ?? ''), text: p.beschreibung }
    if (p.art === 'NBL') {
      const nr = /^\s*(\d{4})\b/.exec(p.beschreibung)?.[1] ?? ''
      return { ...basis, ebene: 'BEB', nr, zahn: nr ? zahnFuer('BEB', nr) : '', text: p.beschreibung.replace(/^\s*\d{4}\s*/, '') || p.beschreibung }
    }
    const rabatt = p.art === 'RBT'
    return { ...basis, ebene: 'MAT', nr: '', zahn: '', preis: rabatt ? -p.einzelpreis : p.einzelpreis, text: `${rabatt ? 'Rabatt' : p.art === 'EDM' ? 'Edelmetall' : 'Material'}: ${p.beschreibung}` }
  })

  const fl = plan.fremdlabor
  if (fl.auftragsnummer && x.auftragsnummer && fl.auftragsnummer !== x.auftragsnummer)
    meldungen.push(`Auftragsnummer der Datei (${x.auftragsnummer}) weicht vom Plan (${fl.auftragsnummer}) ab.`)
  const satz = plan.einstellungen.mwstLabor
  if (x.positionen.some((p) => p.mwstSatz !== satz)) meldungen.push(`Die Laborrechnung enthält einen anderen Mehrwertsteuersatz als ${satz} %.`)
  let herstellungsort = plan.verwaltung.herstellungsort
  const ortLabor = x.herstellungsort.replace(/^D-/, 'D ')
  if (ortLabor.trim() && ortLabor.trim() !== 'D' && ortLabor !== herstellungsort) {
    meldungen.push(`Herstellungsort aus der Laborrechnung übernommen: ${ortLabor}.`)
    herstellungsort = ortLabor
  }
  meldungen.unshift(`${x.positionen.length} Positionen aus ${datei} übernommen (Rechnung ${x.rechnungsnummer}, ${runden(x.netto).toFixed(2)} € netto).`)

  return {
    plan: {
      ...plan,
      verwaltung: { ...plan.verwaltung, herstellungsort },
      positionen: [...plan.positionen.filter((p) => !istFremd(p)), ...neu],
      fremdlabor: {
        ...fl,
        name: x.laborname || fl.name,
        auftragsnummer: fl.auftragsnummer || x.auftragsnummer,
        import: {
          datei, eingelesen: new Date().toISOString().slice(0, 10), rechnungsnummer: x.rechnungsnummer, lieferdatum: x.lieferdatum,
          herstellungsort: x.herstellungsort, abrechnungsbereich: x.abrechnungsbereich, netto: x.netto, mwst: x.mwst, brutto: x.brutto,
          software: x.software,
        },
      },
    },
    meldungen,
  }
}
