/**
 * Ausführung eines HKP, wie sie die Helferin in PlanR einstellt: Kronenmaterial, Abformung,
 * Eigen-/Fremdlabor, Implantatsystem und Eigenlabor-Stufe „Kasse → Privat“. Wird aus dem
 * gesprochenen Auftrag bzw. einer Korrektur verstanden und auf einen bestehenden Plan angewendet.
 */
import type { Abformung, HkpPlan, Position } from '../types'
import { IMPLANTATSYSTEME } from '../data/implantatsysteme'
import { PRIVAT_STUFEN, PRIVAT_STUFE_MAX, privatStufeAnwenden } from './aufwertung'
import { IMPLANTAT_TP } from './implantat'
import { WERKSTOFFE_FUER, kronenEinheiten, werkstoffVon, type Werkstoff } from './material'

export interface Ausfuehrung {
  werkstoff?: Werkstoff
  abformung?: Exclude<Abformung, ''>
  labor?: HkpPlan['einstellungen']['labor']
  /** ID aus IMPLANTATSYSTEME */
  implantatSystem?: string
  /** Eigenlabor-Stufe „Kasse → Privat“ (0 … PRIVAT_STUFE_MAX) */
  privatStufe?: number
}

type Muster<T> = readonly (readonly [T, RegExp])[]

const WERKSTOFF_MUSTER: Muster<Werkstoff> = [
  ['hochgold', /hochgold|\bgold(?! ?reduz)/],
  ['goldreduziert', /gold ?reduziert|reduzierte?[snm]? gold|edelmetallreduziert/],
  ['nem', /\bn\.? ?e\.? ?m\b|nichtedel|kobalt|chrom|edelmetallfrei/],
  // „Keramik“ allein meint Vollkeramik (Standard Zirkon) – nicht die Verblendung auf Metall
  ['zirkon', /zirkon|\b(?:voll ?)?keramik(?! ?verblend)|\bvollkeramisch/],
  ['presskeramik', /press ?keramik|e\.? ?max press|\bpress\b/],
  ['lithiumdisilikat', /lithium|e\.? ?max(?! press)|cad ?block/],
]

const ABFORMUNG_MUSTER: Muster<Exclude<Abformung, ''>> = [
  ['scan', /scan|intraoral|gescannt|digital/],
  ['abdruck', /abdr(?:ü|u|ue)ck|konventionell|herk(?:ö|oe)mmlich|analog/],
]
const ABFORM_ALLGEMEIN = /abform|l(?:ö|oe)ffel/

const LABOR_MUSTER: Muster<HkpPlan['einstellungen']['labor']> = [
  ['praxis', /eigen ?labor|eigene[snm]? labor|praxis ?labor|haus ?labor|labor im haus|\bim haus\b|in ?house|unsere[mns]? labor|bei uns gefertigt/],
  ['gewerbe', /fremd ?labor|fremde[snm]? labor|gewerbliche[snm]? labor|gewerbe ?labor|externe[snm]? labor|ausw(?:ä|ae)rtige[snm]? labor|\bextern\b|au(?:ß|ss)er haus/],
]

/** Erkennung gesprochener Systemnamen (auch typische Hörfehler) → ID aus IMPLANTATSYSTEME */
export const SYSTEM_MUSTER: Muster<string> = [
  ['medentis-icx', /medentis|medendis|\bi ?c ?x\b/],
  ['straumann-bl', /strau ?mann?/],
  ['nobel-active', /nobel/],
  ['astra-ev', /astra/],
  ['ankylos', /ankylos|ankilos/],
  ['xive', /\bxive\b|\bxi ve\b/],
  ['camlog', /camlog|kamlog|conelog|konelog/],
  ['zimmer-tsv', /biomet|zimmer biomet/],
  ['biohorizons', /bio ?horizon/],
  ['bego-semados', /\bbego\b|semados/],
  ['bredent-copasky', /bredent|copa ?sky/],
  ['champions-revolution', /champions?\b/],
  ['mis-c1', /\bmis (?:c ?1|v ?3|implantat|system)/],
  ['neoss-proactive', /neoss/],
  ['osstem-tsiii', /osstem|ostem/],
  ['megagen-anyridge', /mega ?gen|any ?ridge/],
  ['thommen-element', /thommen|thomen/],
  ['sic-invent', /sic ?(?:invent|ace|max)/],
  ['dentaurum-tiologic', /dentaurum|tio ?logic/],
  ['implantdirect-legacy', /implant ?direct/],
]

/** so spricht Clara das System aus */
const SYSTEM_SPRECH: Record<string, string> = {
  'medentis-icx': 'medentis ICX', 'straumann-bl': 'Straumann', 'nobel-active': 'Nobel Biocare', 'astra-ev': 'Astra Tech',
  ankylos: 'Ankylos', xive: 'Xive', camlog: 'Camlog', 'zimmer-tsv': 'Zimmer Biomet', biohorizons: 'BioHorizons',
  'bego-semados': 'BEGO Semados', 'bredent-copasky': 'bredent copaSKY', 'champions-revolution': 'Champions',
  'mis-c1': 'MIS', 'neoss-proactive': 'Neoss', 'osstem-tsiii': 'Osstem', 'megagen-anyridge': 'MegaGen', 'thommen-element': 'Thommen',
  'sic-invent': 'SIC invent', 'dentaurum-tiologic': 'Dentaurum tioLogic', 'implantdirect-legacy': 'Implant Direct',
  durchschnitt: 'noch nicht gewählt',
}

const STUFE_MUSTER: Muster<number> = [
  [PRIVAT_STUFE_MAX, /premium|maximal teuer|m(?:ö|oe)glichst teuer|so teuer wie m(?:ö|oe)glich|h(?:ö|oe)chste[nr]? stufe|maximale[nr]? stufe|stufe maximal|alles privat|voll privat|komplett privat|stufe (?:vier|4)\b/],
  [3, /(?:ä|ae)sthetik|stufe (?:drei|3)\b/],
  [2, /stufe vollkeramik|vollkeramik ?stufe|stufe (?:zwei|2)\b/],
  [1, /teilverblend|stufe (?:eins|1)\b/],
  [0, /stufe kasse|kassenstufe|nur kasse|zur(?:ü|ue)ck auf kasse|ohne privat|keine privat|stufe (?:null|0)\b/],
]

const VERNEINT_DAVOR = /(?:\bstatt|\banstatt|\banstelle|\bnicht|\bkein\w*|\bohne|\bweg von)\s+(?:(?:dem|der|den|das|des|mit|im|in|von|vom|einem|einer|einen|eine)\s+)?$/
const VERNEINT_DANACH = /^\s+(?:bitte\s+|doch\s+|lieber\s+)?(?:nicht\b|war falsch|ist falsch|stimmt nicht)/

/**
 * Letzte nicht verneinte Nennung gewinnt („Zirkon statt NEM“, „NEM – nein, doch Zirkon“).
 * Ein Treffer innerhalb eines längeren Treffers anderer Art zählt nicht („reduziertes Gold“).
 */
function letzteNennung<T>(t: string, muster: Muster<T>): T | undefined {
  const treffer: { wert: T; von: number; bis: number }[] = []
  for (const [wert, re] of muster)
    for (const m of t.matchAll(new RegExp(re.source, 'g'))) {
      const von = m.index ?? 0
      treffer.push({ wert, von, bis: von + m[0].length })
    }
  const gueltig = treffer
    .filter((x) => !treffer.some((y) => y.wert !== x.wert && y.von <= x.von && y.bis >= x.bis && y.bis - y.von > x.bis - x.von))
    .filter((x) => !VERNEINT_DAVOR.test(t.slice(Math.max(0, x.von - 30), x.von)) && !VERNEINT_DANACH.test(t.slice(x.bis, x.bis + 30)))
  return gueltig.sort((a, b) => b.von - a.von)[0]?.wert
}

/** Ausführung aus gesprochenem Text; nicht Genanntes bleibt weg */
export function ausfuehrungIn(text: string): Ausfuehrung {
  const t = ` ${text.toLowerCase().replace(/[‐–—-]/g, ' ').replace(/\s+/g, ' ')} `
  const a: Ausfuehrung = {}
  const werkstoff = letzteNennung(t, WERKSTOFF_MUSTER)
  if (werkstoff) a.werkstoff = werkstoff
  const abformung = letzteNennung(t, ABFORMUNG_MUSTER) ?? (ABFORM_ALLGEMEIN.test(t) ? 'abdruck' : undefined)
  if (abformung) a.abformung = abformung
  const labor = letzteNennung(t, LABOR_MUSTER)
  if (labor) a.labor = labor
  const system = letzteNennung(t, SYSTEM_MUSTER)
  if (system) a.implantatSystem = system
  const stufe = letzteNennung(t, STUFE_MUSTER)
  if (stufe !== undefined) a.privatStufe = stufe
  return a
}

/** Vollkeramische Ausführung je Therapiekürzel (Teleskope bleiben Metall) */
const KERAMIK_TP: Record<string, string> = {
  K: 'KM', KV: 'KM', KH: 'KMH', KVH: 'KMH', B: 'BM', BV: 'BM', PK: 'PKM', PKV: 'PKM', SK: 'SKM', SKV: 'SKM', SB: 'SBM', SBV: 'SBM',
}
const METALL_TP: Record<string, string> = { KM: 'K', KMH: 'KH', BM: 'B', PKM: 'PK', SKM: 'SK', SBM: 'SB' }
const KERAMIK = new Set(WERKSTOFFE_FUER.keramik)

/** Therapiezeile passend zum Werkstoff: Keramik → KM/BM/SKM …, Metall → zurück zur Regel bzw. K/B/SK */
function zaehneFuerWerkstoff(plan: HkpPlan, w: Werkstoff): { zaehne: HkpPlan['zaehne']; teleskope: string[] } {
  const keramik = KERAMIK.has(w)
  const teleskope: string[] = []
  const zaehne = Object.fromEntries(Object.entries(plan.zaehne).map(([z, v]) => {
    const tp = v.TP.trim().toUpperCase()
    const wirk = tp || v.R.trim().toUpperCase()
    if (keramik) {
      if (/^S?T/.test(wirk)) teleskope.push(z)
      return [z, KERAMIK_TP[wirk] ? { ...v, TP: KERAMIK_TP[wirk] } : v]
    }
    if (!METALL_TP[tp]) return [z, v]
    return [z, { ...v, TP: KERAMIK_TP[v.R.trim().toUpperCase()] === tp ? '' : METALL_TP[tp] }]
  }))
  return { zaehne, teleskope }
}

const implantateIn = (plan: HkpPlan) => Object.values(plan.zaehne).some((z) => IMPLANTAT_TP.test((z.TP.trim() || z.R.trim()).toUpperCase()))

/**
 * Wendet eine Ausführung auf einen bestehenden Plan an und rechnet die Regelengine neu – wie in PlanR:
 * manuelle Positionen und bewusst entfernte Positionen bleiben erhalten.
 */
export function ausfuehrungAnwenden(plan: HkpPlan, a: Ausfuehrung): { plan: HkpPlan; hinweise: string[] } {
  const hinweise: string[] = []
  let p: HkpPlan = { ...plan, einstellungen: { ...plan.einstellungen }, implantat: { ...plan.implantat } }
  if (a.werkstoff) {
    const r = zaehneFuerWerkstoff(p, a.werkstoff)
    p.zaehne = r.zaehne
    if (r.teleskope.length) hinweise.push(`Teleskope ${r.teleskope.join(', ')} bleiben aus Metall.`)
  }
  if (a.abformung) {
    p.abformung = a.abformung
    if (p.abformungProthese) p.abformungProthese = a.abformung
  }
  if (a.labor && a.labor !== p.einstellungen.labor) {
    p.einstellungen.labor = a.labor
    // Eigen/Fremd je Position folgt dem neuen Labor – sonst bliebe die alte Zuordnung kleben
    p.positionen = p.positionen.map((x): Position => {
      if (!(x.auto && (x.ebene === 'BEL' || x.ebene === 'BEB') && x.labor)) return x
      const { labor: _, ...ohne } = x
      return ohne
    })
  }
  if (a.implantatSystem) {
    if (implantateIn(p)) p.implantat.system = a.implantatSystem
    else hinweise.push('In diesem HKP sind keine Implantate geplant.')
  }
  let stufe = a.privatStufe ?? p.einstellungen.eigenPrivatStufe ?? 0
  if (stufe > 0 && p.einstellungen.labor !== 'praxis') {
    hinweise.push(a.privatStufe ? 'Die Stufe „Kasse → Privat“ gibt es nur im Eigenlabor.' : 'Im Fremdlabor entfällt die Eigenlabor-Stufe – zurück auf Kasse.')
    stufe = 0
  }
  const r = privatStufeAnwenden(p, stufe)
  p = r.plan
  hinweise.push(...r.hinweise)
  if (a.werkstoff) {
    const w = a.werkstoff
    const passend = kronenEinheiten(p.positionen).filter((e) => WERKSTOFFE_FUER[e.art].includes(w))
    p.werkstoffe = { ...(p.werkstoffe ?? {}), ...Object.fromEntries(passend.map((e) => [e.zahn, w])) }
  }
  return { plan: p, hinweise }
}

export interface AusfuehrungStand {
  /** Kronenmaterial je vorkommender Einheit (gewählt oder Standard) */
  werkstoffe: Werkstoff[]
  abformung: Abformung
  labor: HkpPlan['einstellungen']['labor']
  /** nur wenn Implantate geplant sind */
  implantatSystem?: string
  privatStufe: number
}

export function ausfuehrungVon(plan: HkpPlan): AusfuehrungStand {
  const werkstoffe = [...new Set(kronenEinheiten(plan.positionen).map((e) => werkstoffVon(e, plan.werkstoffe ?? {}).werkstoff))]
  return {
    werkstoffe,
    abformung: plan.abformung,
    labor: plan.einstellungen.labor,
    ...(implantateIn(plan) ? { implantatSystem: plan.implantat.system } : {}),
    privatStufe: plan.einstellungen.eigenPrivatStufe ?? 0,
  }
}

export const WERKSTOFF_SPRECH: Record<Werkstoff, string> = {
  nem: 'Nichtedelmetall', goldreduziert: 'goldreduzierte Legierung', hochgold: 'Hochgold', zirkon: 'Zirkon',
  presskeramik: 'Presskeramik', lithiumdisilikat: 'Lithiumdisilikat',
}
const ABFORMUNG_SPRECH: Record<Abformung, string> = { scan: 'Intraoralscan', abdruck: 'konventioneller Abdruck', '': 'Abformung offen' }
const ABFORMUNG_KURZ: Record<Abformung, string> = { scan: 'Intraoralscan', abdruck: 'Abdruck', '': 'offen' }
export const LABOR_SPRECH: Record<HkpPlan['einstellungen']['labor'], string> = { praxis: 'Eigenlabor', gewerbe: 'Fremdlabor' }

export const systemSprech = (id: string) => SYSTEM_SPRECH[id] ?? IMPLANTATSYSTEME.find((s) => s.id === id)?.hersteller ?? id

const und = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}`)

/** „Zirkon, Intraoralscan, Eigenlabor, Implantatsystem medentis ICX“ */
export function ausfuehrungSatz(s: AusfuehrungStand): string {
  const teile = [
    ...(s.werkstoffe.length ? [und(s.werkstoffe.map((w) => WERKSTOFF_SPRECH[w]))] : []),
    ABFORMUNG_SPRECH[s.abformung],
    LABOR_SPRECH[s.labor],
    ...(s.implantatSystem ? [`Implantatsystem ${systemSprech(s.implantatSystem)}`] : []),
    ...(s.privatStufe > 0 ? [`Eigenlabor-Stufe ${PRIVAT_STUFEN[s.privatStufe].titel}`] : []),
  ]
  return teile.join(', ')
}

/** Was sich geändert hat: „Zirkon statt Nichtedelmetall, Intraoralscan statt Abdruck“ ('' = nichts) */
export function ausfuehrungUnterschied(vorher: AusfuehrungStand, nachher: AusfuehrungStand): string {
  const teile: string[] = []
  const wv = und(vorher.werkstoffe.map((w) => WERKSTOFF_SPRECH[w]))
  const wn = und(nachher.werkstoffe.map((w) => WERKSTOFF_SPRECH[w]))
  if (wn && wv !== wn) teile.push(wv ? `${wn} statt ${wv}` : wn)
  if (vorher.abformung !== nachher.abformung) teile.push(`${ABFORMUNG_KURZ[nachher.abformung]} statt ${ABFORMUNG_KURZ[vorher.abformung]}`)
  if (vorher.labor !== nachher.labor) teile.push(`${LABOR_SPRECH[nachher.labor]} statt ${LABOR_SPRECH[vorher.labor]}`)
  if (nachher.implantatSystem && vorher.implantatSystem !== nachher.implantatSystem)
    teile.push(`Implantatsystem ${systemSprech(nachher.implantatSystem)}${vorher.implantatSystem ? ` statt ${systemSprech(vorher.implantatSystem)}` : ''}`)
  if (vorher.privatStufe !== nachher.privatStufe)
    teile.push(`Eigenlabor-Stufe ${PRIVAT_STUFEN[nachher.privatStufe].titel} statt ${PRIVAT_STUFEN[vorher.privatStufe].titel}`)
  return teile.join(', ')
}
