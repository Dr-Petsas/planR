/**
 * Einstieg für MAS/Clara: privater Kons-Kostenvoranschlag per Sprache. Versteht den gesprochenen Auftrag
 * ("Keramikinlay 46 mod, Wurzelbehandlung 36 dreikanalig"), prüft ihn gegen den 01 und rechnet mit der Engine
 * dieses Planers. `npm run build:engine` baut daraus MAS-2/backend/src/vendor/kons-engine.mjs.
 * Zahn- und Flächenerkennung wie im Füllungs-MKV-Planer (KONS/MKV/src/clara).
 */
import { BEFUND_KUERZEL, konsHinweis, type KonsArt } from '../befund01'
import { euro, rechnen } from '../engine/kons'
import { ALLE_ZAEHNE } from '../engine/zahnschema'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../planNeu'
import type { Einstellungen, Patient, Plan, Rechnung, Therapie, Vereinbarungsart, VitalArt, ZahnLeistung } from '../types'

export type { Plan, Rechnung }

declare const __KONS_ENGINE_STAND__: string | undefined
export const ENGINE_STAND = typeof __KONS_ENGINE_STAND__ === 'string' ? __KONS_ENGINE_STAND__ : 'dev'

export interface Rueckfrage {
  status: 'rueckfrage'
  grund: 'zaehne' | 'therapie' | 'flaechen' | 'kanaele' | 'befund_konflikt'
  frage: string
  /** bei befund_konflikt: der Zahn, an dem laut Befund die Leistung nicht geht */
  zahn?: string
}

export interface KonsOptionen {
  patient?: Partial<Patient>
  einstellungen?: Partial<Einstellungen>
}

export interface KonsZahnKurz {
  zahn: string
  titel: string
  summe: number
  ausgeschlossen?: string
}

export interface KonsZusammenfassung {
  zaehne: KonsZahnKurz[]
  vereinbarung: Vereinbarungsart
  /** Gesamtbetrag einschließlich Begleitleistungen und Labor */
  summe: number
}

export interface KonsEntwurf {
  status: 'ok'
  plan: Plan
  /** Für die Ablage: ohne Regler, damit der Planer mit Faktor und Stufe der Praxis rechnet */
  ablagePlan: Omit<Plan, 'regler'>
  rechnung: Rechnung
  zusammenfassung: KonsZusammenfassung
  hinweise: string[]
}

interface Fund { pos: number; ende: number }
interface ZahlFund extends Fund { n: number; text: string }
interface TherapieFund extends Fund { therapie: Therapie; labor?: string }
interface ZahnFund extends Fund { zahn: string }

const GUELTIG = new Set(ALLE_ZAEHNE)
const ZAHL: Record<string, number> = { ein: 1, eine: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6 }
const zahlVon = (w: string) => ZAHL[w.toLowerCase().replace('ü', 'ue')] ?? Number(w)
const FLAECHE_WORT: [RegExp, string][] = [
  [/^okklusal/, 'o'], [/^mesial/, 'm'], [/^distal/, 'd'], [/^(?:bukkal|vestibul|labial)/, 'b'],
  [/^(?:lingual|palatinal|oral)/, 'l'], [/^(?:inzisal|incisal)/, 'i'],
]
const KEIN_KUERZEL = new Set(['ob', 'do', 'lob', 'dom', 'pol', 'bold', 'mob', 'im', 'bild', 'blid'])
/** Therapien mit Flächenangabe bzw. Kanalzahl als Pflicht */
const MIT_FLAECHEN = new Set<Therapie>(['komposit', 'inlay', 'goldhaemmer'])
const MIT_KANAELEN = new Set<Therapie>(['endo', 'revision'])
/** je Zahn rechnet der Planer genau eine Leistung; bei mehreren genannten gilt die erste dieser Reihe */
const VORRANG: Therapie[] = ['revision', 'endo', 'aufbau', 'inlay', 'goldhaemmer', 'veneer', 'komposit', 'vital', 'infiltration', 'versiegelung', 'bleaching']
const NAME: Record<Therapie, string> = {
  komposit: 'Kompositfüllung', inlay: 'Inlay', goldhaemmer: 'Goldhämmerfüllung', endo: 'Wurzelbehandlung', revision: 'Revision',
  vital: 'Überkappung', versiegelung: 'Versiegelung', aufbau: 'Aufbau', infiltration: 'Kariesinfiltration', veneer: 'Veneer', bleaching: 'Bleaching',
}
const KEIN_ARTIKEL = new Set<Therapie>(['inlay', 'aufbau', 'veneer', 'bleaching'])
const NUR_VERBINDUNG = /^[\s,]*(?:(?:und|sowie|auch|plus|bei|an|auf|zahn|zähnen|zaehnen|jeweils|je)[\s,]*)*$/i

const buchstabenZusammen = (t: string) =>
  t.replace(/\b[modblpvi](?:[\s.-]+[modblpvi])+\b\.?/gi, (m) => m.replace(/[\s.-]+/g, ''))

function zaehneFinden(t: string): ZahnFund[] {
  const funde: ZahnFund[] = []
  const re = /(?<!\d|\d[,.])([1-4])\s?[,.]?\s?([1-8])(?!\d|[,.]\d|\s*(?:euro|€|prozent|%|-?\s?fach|mal\b|kan(?:a|ä|ae)l|sitzung))/gi
  for (let m = re.exec(t); m; m = re.exec(t)) {
    if (/faktor\s*$/i.test(t.slice(Math.max(0, m.index - 8), m.index))) continue
    const zahn = m[1] + m[2]
    if (GUELTIG.has(zahn)) funde.push({ zahn, pos: m.index, ende: m.index + m[0].length })
  }
  return funde
}

function flaechenFinden(t: string): ZahlFund[] {
  const funde: ZahlFund[] = []
  const zahl = /\b(ein|eine|zwei|drei|vier|f(?:ü|ue)nf|[1-5])[\s-]*fl(?:ä|ae)ch(?:ig\w*|en|e)?\b/gi
  for (let m = zahl.exec(t); m; m = zahl.exec(t)) {
    const n = zahlVon(m[1])
    funde.push({ pos: m.index, ende: m.index + m[0].length, n, text: `${n}-flächig` })
  }
  const wort = /[a-zäöüß]+/gi
  let lauf: { pos: number; ende: number; buchstaben: Set<string> } | null = null
  const abschliessen = () => {
    if (lauf?.buchstaben.size) funde.push({ pos: lauf.pos, ende: lauf.ende, n: Math.min(5, lauf.buchstaben.size), text: [...lauf.buchstaben].join('') })
    lauf = null
  }
  for (let m = wort.exec(t); m; m = wort.exec(t)) {
    const w = m[0].toLowerCase()
    if (lauf && /[,;:!?]|\d/.test(t.slice(lauf.ende, m.index))) abschliessen()
    let buchstaben: string[] = []
    const fw = FLAECHE_WORT.find(([re]) => re.test(w))
    if (fw) buchstaben = [fw[1]]
    else if (/^[modblpvi]{1,5}$/.test(w) && w !== 'i' && new Set(w).size === w.length && !KEIN_KUERZEL.has(w)) buchstaben = [...w]
    if (buchstaben.length) {
      lauf ??= { pos: m.index, ende: m.index, buchstaben: new Set() }
      buchstaben.forEach((x) => lauf!.buchstaben.add(x))
      lauf.ende = m.index + m[0].length
    } else if (!(lauf && w === 'und')) abschliessen()
  }
  abschliessen()
  return funde.sort((a, b) => a.pos - b.pos)
}

/** "dreikanalig", "3 Kanäle", "zwei Sitzungen" */
function zahlenFinden(t: string, wort: RegExp): ZahlFund[] {
  const funde: ZahlFund[] = []
  const re = new RegExp(`\\b(ein|eine|einer|zwei|drei|vier|f(?:ü|ue)nf|sechs|[1-6])[\\s-]*(?:${wort.source})`, 'gi')
  for (let m = re.exec(t); m; m = re.exec(t)) funde.push({ pos: m.index, ende: m.index + m[0].length, n: zahlVon(m[1]), text: m[0] })
  return funde
}

function therapienFinden(t: string): TherapieFund[] {
  const funde: TherapieFund[] = []
  const re = /(?<![\wäöüß])[\wäöüß-]*(revision|wurzel\w*behandlung|wurzelkanal|\bwkb\b|\bendo\w*|aufbau|goldh(?:ä|ae)mmer|goldhammer|inlay|einlagef(?:ü|ue)llung|veneer|komposit|kunststoff|f(?:ü|ue)llung|(?:ü|ue)berkapp\w*|pulpotomie|versiegel\w*|infiltration|\bicon\b|bleach\w*|bleich\w*)[\wäöüß-]*/gi
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const w = m[0].toLowerCase()
    let therapie: Therapie
    if (w.includes('revision')) therapie = 'revision'
    else if (/wurzel|wkb|endo/.test(w)) therapie = 'endo'
    else if (w.includes('aufbau')) therapie = 'aufbau'
    else if (/goldh/.test(w)) therapie = 'goldhaemmer'
    else if (/inlay|einlage/.test(w)) therapie = 'inlay'
    else if (w.includes('veneer')) therapie = 'veneer'
    else if (/berkapp|pulpotomie/.test(w)) therapie = 'vital'
    else if (w.includes('versiegel')) therapie = 'versiegelung'
    else if (/infiltration|icon/.test(w)) therapie = 'infiltration'
    else if (/bleach|bleich/.test(w)) therapie = 'bleaching'
    else therapie = 'komposit'
    const f: TherapieFund = { pos: m.index, ende: m.index + m[0].length, therapie }
    if (therapie === 'inlay') {
      const umfeld = t.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20).toLowerCase()
      f.labor = /gold/.test(umfeld) ? 'gold' : /cad|cerec|chairside/.test(umfeld) ? 'cadcam' : 'keramik'
    }
    funde.push(f)
  }
  return funde
}

/**
 * Ordnet Angaben (Flächen, Kanäle …) den Zähnen zu. Steht die erste Angabe vor dem ersten Zahn ("zweiflächig an 36"),
 * gilt jede für den folgenden Zahn, sonst für den vorangehenden; über bloße Verbindungswörter gilt sie auch für den Nachbarn.
 */
function zuordnen<F extends Fund>(t: string, zf: ZahnFund[], fs: F[]): (F | undefined)[] {
  const vor = (i: number) => [i ? zf[i - 1].ende : 0, zf[i].pos] as const
  const nach = (i: number) => [zf[i].ende, i + 1 < zf.length ? zf[i + 1].pos : t.length] as const
  const darin = ([a, b]: readonly [number, number]) => fs.filter((f) => f.pos >= a && f.ende <= b)
  const prefix = !!zf.length && !!fs.length && fs[0].ende <= zf[0].pos
  const von = zf.map((_, i): F | undefined => {
    if (prefix) return darin(vor(i)).at(-1) ?? (i === zf.length - 1 ? darin(nach(i))[0] : undefined)
    return darin(nach(i))[0] ?? (i === 0 ? darin(vor(i)).at(-1) : undefined)
  })
  for (let i = 0; i < zf.length; i++) {
    if (von[i]) continue
    if (i + 1 < zf.length && von[i + 1] && NUR_VERBINDUNG.test(t.slice(zf[i].ende, zf[i + 1].pos))) von[i] = von[i + 1]
    else if (i > 0 && von[i - 1] && NUR_VERBINDUNG.test(t.slice(zf[i - 1].ende, zf[i].pos))) von[i] = von[i - 1]
  }
  return von
}

export interface KonsAuftrag {
  zaehne: Record<string, ZahnLeistung>
  ohneTherapie: string[]
  ohneFlaechen: string[]
  ohneKanaele: string[]
  /** je Zahn genannte, aber nicht übernommene weitere Leistungen */
  verdraengt: Record<string, Therapie[]>
  vereinbarung: Vereinbarungsart
  abformung?: 'abdruck' | 'scan'
}

/** Erkennt Zähne, Therapie und Mengenangaben je Zahn. */
export function konsAuftragVerstehen(roh: string): KonsAuftrag {
  const t = buchstabenZusammen(roh.replace(/\s+/g, ' ').replace(/\b(\d\d),(?=\d\d\b)/g, '$1, '))
  const zf = zaehneFinden(t)
  const ueberlappt = (f: Fund) => zf.some((z) => f.pos < z.ende && z.pos < f.ende)
  const ff = flaechenFinden(t).filter((f) => !ueberlappt(f))
  const kf = zahlenFinden(t, /kan(?:a|ä|ae)l(?:ig\w*|e|en|s)?\b/).filter((f) => !ueberlappt(f))
  const sf = zahlenFinden(t, /sitzung(?:en)?\b/).filter((f) => !ueberlappt(f))
  const tf = therapienFinden(t)
  const flaechenVon = zuordnen(t, zf, ff)
  const kanaeleVon = zuordnen(t, zf, kf)
  const sitzungenVon = zuordnen(t, zf, sf)

  // Therapie: eigene Abschnitte, sonst weitertragen ("Komposit an 36, 37 und 45" bzw. "36, 37 und 45 Komposit")
  const thPrefix = !!zf.length && !!tf.length && tf[0].ende <= zf[0].pos
  const abschnitt = (i: number): [number, number] => thPrefix
    ? [i ? zf[i - 1].ende : 0, zf[i].pos]
    : [zf[i].ende, i + 1 < zf.length ? zf[i + 1].pos : t.length]
  const therapienVon = zf.map((z, i): TherapieFund[] => {
    const [a, b] = abschnitt(i)
    const eigene = tf.filter((f) => f.pos >= a && f.ende <= b)
    if (i === zf.length - 1 && thPrefix) eigene.push(...tf.filter((f) => f.pos >= z.ende))
    if (i === 0 && !thPrefix) eigene.push(...tf.filter((f) => f.ende <= z.pos))
    if (eigene.length) return eigene
    const getragen = thPrefix ? tf.filter((f) => f.ende <= z.pos).at(-1) : tf.find((f) => f.pos >= z.ende)
    return getragen ? [getragen] : []
  })

  const klein = t.toLowerCase()
  const avital = /\b(?:a|de)vital|nekrot|abgestorben|\btot\b/.test(klein)
  const vitalArt: VitalArt | undefined = /pulpotomie/.test(klein) ? 'pulpotomie' : /\bindirekt/.test(klein) ? 'indirekt' : /\bdirekt/.test(klein) ? 'direkt' : undefined
  const stift = /stift/.test(klein)
  const zaehne: Record<string, ZahnLeistung> = {}
  const verdraengt: Record<string, Therapie[]> = {}
  const ohneTherapie: string[] = []
  const ohneFlaechen: string[] = []
  const ohneKanaele: string[] = []
  zf.forEach((z, i) => {
    const kandidaten = [...therapienVon[i]].sort((a, b) => VORRANG.indexOf(a.therapie) - VORRANG.indexOf(b.therapie))
    const fl = flaechenVon[i]
    const th = kandidaten[0] ?? (fl ? { therapie: 'komposit' as Therapie, pos: 0, ende: 0 } : undefined)
    for (const liste of [ohneTherapie, ohneFlaechen, ohneKanaele]) {
      const weg = liste.indexOf(z.zahn)
      if (weg >= 0) liste.splice(weg, 1)
    }
    if (!th) {
      if (!zaehne[z.zahn]) ohneTherapie.push(z.zahn)
      return
    }
    const weitere = [...new Set(kandidaten.slice(1).map((k) => k.therapie))].filter((x) => x !== th.therapie)
    if (weitere.length) verdraengt[z.zahn] = weitere
    else delete verdraengt[z.zahn]
    const l: ZahnLeistung = { therapie: th.therapie }
    if (MIT_FLAECHEN.has(th.therapie) || th.therapie === 'veneer') {
      if (fl) l.flaechen = Math.min(th.therapie === 'komposit' ? 4 : 3, fl.n)
      else if (MIT_FLAECHEN.has(th.therapie)) ohneFlaechen.push(z.zahn)
    }
    if (MIT_KANAELEN.has(th.therapie)) {
      if (kanaeleVon[i]) l.kanaele = Math.min(4, kanaeleVon[i]!.n)
      else ohneKanaele.push(z.zahn)
    }
    if (th.therapie === 'endo') l.vital = !avital
    if ((th.therapie === 'endo' || th.therapie === 'revision' || th.therapie === 'bleaching') && sitzungenVon[i]) l.sitzungen = sitzungenVon[i]!.n
    if (th.therapie === 'vital') l.vitalArt = vitalArt ?? 'indirekt'
    if (th.therapie === 'aufbau' && stift) l.aufbauStift = true
    if (th.labor) l.labor = th.labor
    zaehne[z.zahn] = l
  })
  const vereinbarung: Vereinbarungsart = /kassen\w*patient|gesetzlich|\bgkv\b|privatvereinbarung|paragra(?:ph|f) ?acht|§ ?8/.test(klein)
    ? (/zusatzleistung|nur (?:die )?zus(?:a|ä)tz|neben der kasse|bema bleibt/.test(klein) ? 'gkvZusatz' : 'gkvPrivat')
    : 'pkv'
  const abformung = /scan|intraoral|digital/.test(klein) ? 'scan' as const : /abdruck|abform/.test(klein) ? 'abdruck' as const : undefined
  return { zaehne, ohneTherapie, ohneFlaechen, ohneKanaele, verdraengt, vereinbarung, abformung }
}

const liste = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} und ${xs.at(-1)}`)
const sortiert = (zs: string[]) => [...zs].sort((a, b) => ALLE_ZAEHNE.indexOf(a) - ALLE_ZAEHNE.indexOf(b))
const befundArt = (th?: Therapie): KonsArt => (th === 'endo' || th === 'revision' ? 'endo' : th === 'aufbau' ? 'aufbau' : 'fuellung')
const befundName = (code: string) => {
  const n = BEFUND_KUERZEL[code]
  if (!n) return code
  const kopf = n.match(/\p{Lu}[\p{L}-]*/u)?.[0] ?? ''
  return `ein${/(?:zahn|implantat|glied|element|teil|schluss)$/i.test(kopf) ? '' : 'e'} ${n}`
}

/** Gesprochener Auftrag + 01 → gerechneter Kons-Kostenvoranschlag (ohne Nummer) oder Rückfrage */
export function konsEntwurf(auftragText: string, befund: Record<string, string> = {}, optionen: KonsOptionen = {}): KonsEntwurf | Rueckfrage {
  const a = konsAuftragVerstehen(auftragText)
  const geplant = sortiert(Object.keys(a.zaehne))
  if (!geplant.length && !a.ohneTherapie.length) {
    return { status: 'rueckfrage', grund: 'zaehne', frage: 'An welchen Zähnen soll ich was planen?' }
  }
  for (const zahn of sortiert([...geplant, ...a.ohneTherapie])) {
    const code = (befund[zahn] ?? '').trim().toLowerCase()
    const th = a.zaehne[zahn]?.therapie
    if (!konsHinweis(code, befundArt(th)).geht) {
      return {
        status: 'rueckfrage', grund: 'befund_konflikt', zahn,
        frage: `Laut Befund ist ${zahn} ${befundName(code)}, dort geht ${th ? `${KEIN_ARTIKEL.has(th) ? 'kein' : 'keine'} ${NAME[th]}` : 'keine Kons-Leistung'}. Welchen Zahn meinen Sie?`,
      }
    }
  }
  if (a.ohneTherapie.length) {
    const z = sortiert(a.ohneTherapie)
    return { status: 'rueckfrage', grund: 'therapie', frage: `Was soll ich an ${liste(z)} planen?` }
  }
  if (a.ohneFlaechen.length) {
    const z = sortiert(a.ohneFlaechen)
    return { status: 'rueckfrage', grund: 'flaechen', frage: `Wie viele Flächen ${z.length > 1 ? `jeweils an ${liste(z)}` : `an ${z[0]}`}?` }
  }
  if (a.ohneKanaele.length) {
    const z = sortiert(a.ohneKanaele)
    return { status: 'rueckfrage', grund: 'kanaele', frage: `Wie viele Kanäle ${z.length > 1 ? `jeweils an ${liste(z)}` : `an ${z[0]}`}?` }
  }

  const einst: Einstellungen = {
    ...STANDARD_EINSTELLUNGEN, ...optionen.einstellungen,
    praxis: { ...STANDARD_EINSTELLUNGEN.praxis, ...optionen.einstellungen?.praxis },
  }
  const basis = neuerPlan('', einst)
  const zaehne = Object.fromEntries(geplant.map((z) => [z, a.zaehne[z]]))
  const plan: Plan = {
    ...basis,
    patient: { ...basis.patient, ...optionen.patient },
    vereinbarung: a.vereinbarung,
    zaehne,
    ...(a.abformung && geplant.some((z) => zaehne[z].therapie === 'inlay') ? { abformung: a.abformung } : {}),
  }
  const rechnung = rechnen(plan, einst)
  const hinweise: string[] = []
  for (const zahn of geplant) {
    const h = konsHinweis((befund[zahn] ?? '').trim().toLowerCase(), befundArt(zaehne[zahn].therapie))
    if (h.text) hinweise.push(`Zahn ${zahn}: ${h.text}.`)
    if (a.verdraengt[zahn]) {
      hinweise.push(`Zahn ${zahn}: je Zahn plant der Planer eine Leistung, ${a.verdraengt[zahn].map((x) => NAME[x]).join(' und ')} bitte im Planer ergänzen.`)
    }
  }
  for (const z of rechnung.zaehne) {
    if (z.ausgeschlossen) hinweise.push(`Zahn ${z.zahn}: ${z.ausgeschlossen}`)
    hinweise.push(...z.warnungen.map((w) => `Zahn ${z.zahn}: ${w}`))
  }
  if (geplant.some((z) => zaehne[z].therapie === 'inlay') && !a.abformung) hinweise.push('Für die Inlays habe ich Abdruck angenommen.')
  if (geplant.some((z) => zaehne[z].therapie === 'endo') && !/vital|nekrot|abgestorben|\btot\b/i.test(auftragText)) {
    hinweise.push('Bei der Wurzelbehandlung habe ich eine vitale Pulpa angenommen.')
  }
  const { regler: _, ...ablagePlan } = plan
  return {
    status: 'ok', plan, ablagePlan, rechnung, hinweise: [...new Set(hinweise)],
    zusammenfassung: {
      zaehne: rechnung.zaehne.map((z) => ({ zahn: z.zahn, titel: z.titel, summe: z.summe, ...(z.ausgeschlossen ? { ausgeschlossen: z.ausgeschlossen } : {}) })),
      vereinbarung: plan.vereinbarung, summe: rechnung.summe,
    },
  }
}

/** "Einlagefüllung, dreiflächig an 46; Wurzelkanalbehandlung, 3 Kanäle, vital an 36" */
export function konsVersorgungSatz(z: KonsZusammenfassung): string {
  const gruppen = new Map<string, string[]>()
  for (const x of z.zaehne) if (!x.ausgeschlossen) gruppen.set(x.titel, [...(gruppen.get(x.titel) ?? []), x.zahn])
  return [...gruppen].map(([titel, zs]) => `${titel} an ${liste(zs)}`).join('; ')
}

export const VEREINBARUNG_TEXT: Record<Vereinbarungsart, string> = {
  pkv: 'Privatpatient',
  gkvPrivat: 'Kassenpatient, komplett privat nach Paragraph 8 Absatz 7',
  gkvZusatz: 'Kassenpatient, nur die privaten Zusatzleistungen',
}

export { euro }
