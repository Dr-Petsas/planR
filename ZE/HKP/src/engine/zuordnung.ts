/**
 * Zuordnung der Praxis- bzw. Fremdlabor-Positionen zu den Leistungsschritten, die PlanR plant.
 * PlanR plant mit den Nummern der BEB-Standardliste (BEB-ITZ 2024 + Standardpositionen + digitale Schritte).
 * Praxislisten stammen aus anderen BEB-Ausgaben (BEB 97, BEB Zahntechnik, VDZI) oder haben eigene Nummern –
 * gleiche Nummer heißt dort nicht gleiche Leistung (z. B. BEB 97 2955 „Glasieren“, BEB-ITZ 2955 „Fräsen je Glied“).
 * Deshalb wird jede Position über ihren Text einem Schritt zugeordnet; Varianten (gegossen/gefräst) gelten nur
 * für den passenden Ablauf (Abdruck/Intraoralscan). Material ohne BEB-Nummer bekommt eine Rolle (Prothesenzahn,
 * Abformmaterial …), mit der die Planung es dort ansetzt, wo es anfällt. Von Hand festgelegte Zuordnungen bleiben.
 */
import itz from '../data/beb-itz-2024.json'
import type { BebEintrag } from '../types'
import { BEB_STANDARD, bebErgaenzen } from './beb-standard'
import { DIGITAL_KATALOG } from './digital'
import { bebNorm, type EigenPosition } from './eigenlabor'

export type Ablauf = 'scan' | 'abdruck'

export interface RolleInfo {
  titel: string
  /** wann und wie oft die Planung die Rolle ansetzt */
  je: string
}

/** Material und Teile, die die Planung aus der Leistung ableitet (`fuer: 'MAT:<rolle>'`) */
export const ROLLEN = {
  'zahn-front': { titel: 'Konfektionszahn Front', je: 'je Prothesenzahn 13–23 / 33–43' },
  'zahn-seite': { titel: 'Konfektionszahn Seitenzahn', je: 'je Prothesenzahn im Seitenzahnbereich' },
  'abform-alginat': { titel: 'Alginatabformung', je: 'je Kiefer, nur bei Abdruck (Situations- bzw. Gegenkiefermodell)' },
  'abform-praezision': { titel: 'Präzisionsabformung', je: 'je präpariertem Kiefer, nur bei Abdruck' },
  'abform-funktion': { titel: 'Funktionsabformung', je: 'je Kiefer mit Funktionsabformung' },
  registrat: { titel: 'Bissregistrat', je: 'je Auftrag festsitzend, nur bei Abdruck' },
  'rohling-zirkon': { titel: 'Rohling Zirkon', je: 'je Zirkon-Einheit (statt Mittelwert)' },
  'rohling-presskeramik': { titel: 'Rohling Presskeramik', je: 'je Presskeramik-Einheit (statt Mittelwert)' },
  'rohling-lithiumdisilikat': { titel: 'Block Lithiumdisilikat', je: 'je LiSi-Einheit (statt Mittelwert)' },
  'legierung-nem': { titel: 'Legierung NEM', je: 'je Gramm (statt Mittelwert)' },
  'legierung-goldreduziert': { titel: 'Legierung goldreduziert', je: 'je Gramm (statt Tagespreis-Mittelwert)' },
  'legierung-hochgold': { titel: 'Legierung Hochgold', je: 'je Gramm (statt Tagespreis-Mittelwert)' },
  'implantat-abdruckpfosten': { titel: 'Implantat-Abformpfosten', je: 'je Implantat bei Abdruck, Hersteller laut Text' },
  'implantat-scanbody': { titel: 'Scanbody', je: 'je Implantat bei Intraoralscan, Hersteller laut Text' },
  'implantat-laboranalog': { titel: 'Laboranalog', je: 'je Implantat, Hersteller laut Text' },
  'implantat-abutmentStandard': { titel: 'Abutment konfektioniert', je: 'je Implantat, Hersteller laut Text' },
  'implantat-tiBase': { titel: 'Klebebasis / Ti-Base', je: 'je Implantat, Hersteller laut Text' },
  'implantat-schraube': { titel: 'Prothetikschraube', je: 'je Implantat, Hersteller laut Text' },
} as const satisfies Record<string, RolleInfo>

export type Rolle = keyof typeof ROLLEN
export const rolleZiel = (r: Rolle) => `MAT:${r}`
export const istRolle = (fuer: string | undefined): fuer is `MAT:${Rolle}` => !!fuer && fuer.startsWith('MAT:') && fuer.slice(4) in ROLLEN

const STOPP = new Set(['aus', 'auf', 'fur', 'fuer', 'der', 'die', 'das', 'des', 'dem', 'den', 'und', 'oder', 'mit', 'ohne', 'von', 'vom',
  'zum', 'zur', 'bei', 'nach', 'pro', 'eines', 'einer', 'einem', 'einen', 'eine', 'ein', 'inkl', 'incl', 'zzgl', 'als', 'nur', 'auch', 'in', 'an', 'je',
  'voll'])

/** Begriffe, die auch in zusammengesetzten oder abgekürzten Wörtern stecken („Kompositverblendung“, „teilverbl.“) */
const BEGRIFFE: readonly [RegExp, string][] = [
  [/verblendschalen?|veneers?/, 'veneer'],
  [/verblend(ungen|ung|eten|ete|et)?|verbl$/, 'verblendung'],
  [/keramik(en)?/, 'keramik'],
  [/komposit(en|e)?|polymer(en|e)?|polyme$/, 'komposit'],
  [/kunststoff(en|e)?/, 'kunststoff'],
  // Die BEB unterscheidet Keramiken nicht: Zirkon und Lithiumdisilikat sind „Keramik“
  [/zirkon(dioxid|oxid)?|lithiumdisilikat/, 'keramik'],
  [/monolithisch(en|er|es|e)?|(voll)?anatomisch(en|er|es|e)?/, 'vollanatomisch'],
  [/gefrae?s+t(en|er|es|e)?/, 'gefraest'],
  [/^g?egossen(en|er|es|e)?|^gossen(en|er|es|e)?|^guss(?!s)/, 'gegossen'],
]

/** Metall ist in der BEB der Normalfall; nennt der Schritt keinen Werkstoff, zählt die Legierung der Praxis nicht */
const METALL = /^(nem|edelmetall|hochgold|gold|titan|cocr|cocrmo|palladium|metall|legierung)$/
const WERKSTOFF = /^(nem|edelmetall|hochgold|gold|titan|metall\w*|legierung|keramik|komposit|kunststoff|pmma|wachs)$/
const NICHT_METALL = new Set(['keramik', 'komposit', 'kunststoff'])
const RESTAURATION = /(krone|inlay|onlay|glied)$/
const VERFAHREN = new Set(['gegossen', 'gefraest', 'gebogen', 'gepresst'])
/** Alternativen im Text des Schritts („gegossen/gefräst“, „Keramik/Kompositverblendung“) */
const ALTERNATIVEN: readonly [string, string][] = [['gegossen', 'gefraest'], ['keramik', 'komposit']]

const klein = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')

/** Kleinbuchstaben ohne Umlaute, Wörter ohne Füllwörter; Komposita mit einem Begriff werden zerlegt */
export function woerter(s: string): string[] {
  const roh = klein(s).split(/[^a-z0-9]+/).filter((w) => (w.length >= 3 || w === 'nem') && !STOPP.has(w) && !/^\d+$/.test(w))
  const aus: string[] = []
  for (const w of roh) {
    let teile = [w]
    for (const [re, begriff] of BEGRIFFE) {
      teile = teile.flatMap((t) => {
        const m = re.exec(t)
        if (!m) return [t]
        aus.push(begriff)
        return [t.slice(0, m.index), t.slice(m.index + m[0].length)]
      })
    }
    if (teile.length === 1 && teile[0] === w) aus.push(w)
    else aus.push(...teile.filter((t) => t.length >= 4 && !STOPP.has(t)))
  }
  return [...new Set(aus)]
}

/**
 * Gleiches Wort: Beugung oder abgeschnittenes Wort („individuellen/-er“, „Artikulat.“) und das Grundwort eines
 * Kompositums („Spezialmodell“ – „Modell“). Locker (bei gleicher Nummer) zählt auch ein gemeinsamer Wortanfang.
 */
function wortTreffer(a: string, b: string, locker: boolean): 'gleich' | 'teil' | undefined {
  if (a === b) return 'gleich'
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  const kurz = Math.min(a.length, b.length)
  const lang = Math.max(a.length, b.length)
  if (i >= 5 && kurz - i <= 2 && lang - i <= 4) return 'gleich'
  if (locker && (i >= 5 ? kurz - i <= 2 : i >= 4 && i === kurz)) return 'teil'
  const [k, l] = a.length <= b.length ? [a, b] : [b, a]
  return k.length >= 5 && l.endsWith(k) ? 'teil' : undefined
}
const gleichesWort = (a: string, b: string) => wortTreffer(a, b, false) === 'gleich'

interface Eintrag { nr: string; text: string; texte: string[][] }

const VOKABULAR: Eintrag[] = (() => {
  const basis = bebErgaenzen({ eintraege: (itz as { eintraege: BebEintrag[] }).eintraege }).eintraege
  const alle = new Map<string, string[]>()
  const dazu = (nr: string, text: string) => {
    const t = alle.get(nr) ?? []
    if (!t.includes(text)) t.push(text)
    alle.set(nr, t)
  }
  for (const e of basis) dazu(bebNorm(e.nr), e.text)
  // Standardpositionen meinen unter derselben Nummer oft die neuere Leistung (0009 „Scan Spezialmodell gedruckt“)
  for (const e of BEB_STANDARD) dazu(bebNorm(e.nr), e.text)
  for (const d of DIGITAL_KATALOG) dazu(d.nr, d.text)
  return [...alle].map(([nr, t]) => ({ nr, text: t[0], texte: t.map(woerter) }))
})()
const NACH_NR = new Map(VOKABULAR.map((e) => [e.nr, e]))
const DF = (() => {
  const df = new Map<string, number>()
  for (const e of VOKABULAR) for (const w of new Set(e.texte.flat())) df.set(w, (df.get(w) ?? 0) + 1)
  return df
})()
const gewicht = (w: string) => 1 + Math.log((VOKABULAR.length + 1) / ((DF.get(w) ?? 0) + 1))

/** Text des Leistungsschritts zu einer Nummer der Standardliste */
export const schrittText = (nr: string) => NACH_NR.get(/^\d{1,4}$/.test(nr.trim()) ? bebNorm(nr) : nr.trim())?.text

/** Bauteile, deren Arten eigene Leistungen sind (Dreiviertel-, Teil-, Teleskop-, Doppelkrone) */
const KOPF = new Set(['krone', 'glied', 'brueckenglied', 'inlay'])

/**
 * Anteil eines Worts, der in der anderen Wortliste wiederkommt. Teiltreffer zählen mit dem kleineren Gewicht,
 * über Nummern hinweg nur zu einem Viertel („Doppelkrone“ ist keine „Krone“); bei gleicher Nummer voll, außer
 * das Bauteil der Praxis ist allgemeiner als das des Schritts („Krone“ bestätigt nicht „Dreiviertelkrone“).
 */
function anteil(x: string, andere: string[], locker: boolean, xVonPraxis: boolean): number {
  let best = 0
  for (const y of andere) {
    const t = wortTreffer(x, y, locker)
    if (t === 'gleich') return gewicht(x)
    if (t !== 'teil') continue
    const [praxisWort, schrittWort] = xVonPraxis ? [x, y] : [y, x]
    const schrittSpezieller = schrittWort.length > praxisWort.length && KOPF.has(praxisWort)
    best = Math.max(best, Math.min(gewicht(x), gewicht(y)) * (!locker ? 0.25 : schrittSpezieller ? 0.5 : 1))
  }
  return best
}

/**
 * Ähnlichkeit 0…1 (gewichteter Dice-Koeffizient, seltene Wörter zählen mehr). Ein abgeschnittenes letztes
 * Wort der Praxisliste (PVS kürzen auf 40 Zeichen) zählt nicht gegen den Treffer; nennt der Schritt beide
 * Fertigungsarten („gegossen/gefräst“), zählt die nicht genannte nicht.
 */
export function aehnlichkeit(praxis: string, standard: string | string[], locker = false): number {
  return aehnlichWorte({ w: woerter(praxis), gekuerzt: praxis.trim().length >= 38 }, Array.isArray(standard) ? standard : woerter(standard), locker)
}

interface PraxisWorte { w: string[]; gekuerzt: boolean }

function aehnlichWorte(p: PraxisWorte, standard: string[], locker: boolean): number {
  let a = p.w
  let b = standard
  if (!a.length || !b.length) return 0
  const letztes = a[a.length - 1]
  if (p.gekuerzt && !b.some((x) => wortTreffer(letztes, x, true))) a = a.slice(0, -1)
  for (const [x, y] of ALTERNATIVEN) {
    if (!b.includes(x) || !b.includes(y)) continue
    if (a.includes(x) !== a.includes(y)) b = b.filter((w) => w !== (a.includes(x) ? y : x))
    else if (!a.includes(x)) b = b.filter((w) => w !== x && w !== y)
  }
  // Metall und Guss sind der Normalfall: nennt der Schritt sie nicht, zählen sie wenig (ein wörtlicher Treffer gewinnt)
  const neutral = new Set<string>()
  if (!b.some((w) => WERKSTOFF.test(w))) for (const w of a) if (METALL.test(w)) neutral.add(w)
  if (!b.some((w) => VERFAHREN.has(w) || NICHT_METALL.has(w))) neutral.add('gegossen')
  if (a.every((w) => neutral.has(w))) return 0
  let treffer = 0
  let summe = 0
  for (const x of a) { summe += gewicht(x) * (neutral.has(x) ? 0.3 : 1); treffer += anteil(x, b, locker, true) }
  for (const y of b) { summe += gewicht(y); treffer += anteil(y, a, locker, false) }
  return summe ? treffer / summe : 0
}

const aehnlichsterText = (p: PraxisWorte, e: Eintrag, locker = false) => Math.max(...e.texte.map((t) => aehnlichWorte(p, t, locker)))

/** Variante nur für einen Ablauf: der Schritt nennt beide Fertigungsarten („gegossen/gefräst“), die Praxisposition eine */
function ablaufVon(praxis: string, e: Eintrag): Ablauf | undefined {
  if (!e.texte.some((t) => t.includes('gegossen') && t.includes('gefraest'))) return undefined
  const p = woerter(praxis)
  if (p.includes('gegossen') === p.includes('gefraest')) return undefined
  return p.includes('gefraest') ? 'scan' : 'abdruck'
}

const OHNE_ZAHN = /krone|bruecke|provisor|verblend|stift|charakteris|reparatur|instandsetz|erweiter|gnatholog|aufstell|modell|wachs/
/** Material und Teile ohne BEB-Nummer: Rolle aus dem Text */
const ROLLEN_REGELN: readonly [Rolle, RegExp, RegExp?][] = [
  ['zahn-front', /\bfront ?z(ae|a)hne?\b/, OHNE_ZAHN],
  ['zahn-seite', /\bseiten ?z(ae|a)hne?\b/, OHNE_ZAHN],
  ['abform-alginat', /alginat.*(kiefer|abdruck|abformung)|(kiefer|abdruck|abformung).*alginat/],
  ['abform-praezision', /doppelmisch|korrekturabform|praezisionsabform|praezisionsabdruck/],
  ['abform-funktion', /funktionsabform|funktionsabdruck/],
  ['registrat', /registrier\w*material|registratmaterial|bissregistrat\b|\bfutar\b|occlufast|regisil|blu ?mousse/],
  ['rohling-zirkon', /zirkon\w*.*(rohling|ronde|multilayer|block|disc)|(rohling|ronde|multilayer|block|disc).*zirkon/],
  ['rohling-lithiumdisilikat', /(lithium|e ?max).*(rohling|block|cad)/],
  ['rohling-presskeramik', /press ?keramik.*rohling|e ?max press/],
  ['legierung-nem', /\b(nem|cocr|kobalt ?chrom)\b.*legierung|legierung.*\b(nem|cocr)\b|wirobond|remanium/],
  ['legierung-hochgold', /hochgold/],
  ['legierung-goldreduziert', /gold ?reduziert|edelmetall ?reduziert/],
  ['implantat-abdruckpfosten', /abformpfosten|abdruckpfosten|abformkappe|abdruckkappe/],
  ['implantat-scanbody', /scan ?body|scanpfosten/],
  ['implantat-laboranalog', /laboranalog|implantatanalog|modellanalog/],
  ['implantat-tiBase', /ti ?base|klebebasis/],
  ['implantat-schraube', /prothetikschraube|abutmentschraube|halteschraube|okklusalschraube/],
  ['implantat-abutmentStandard', /abutment.*(konfektion|titan|standard|gerade)|(konfektion|titan|standard).*abutment/],
]

export interface Vorschlag {
  fuer: string
  wenn?: Ablauf
  /** wie sicher: 'nummer' = gleiche Nummer, Text bestätigt; 'text' = über den Text gefunden; 'rolle' = Material */
  grund: 'nummer' | 'text' | 'rolle' | 'eingetragen'
  aehnlich?: number
}

/** gleiche Nummer: der Text muss nur erkennbar dieselbe Leistung meinen */
const NUMMER_MIN = 0.35
/** andere Nummer: der Text muss klar passen und deutlich besser als der nächstbeste */
const TEXT_MIN = 0.72
const TEXT_ABSTAND = 0.06
/** gleiche Nummer, aber der Text ist fast wörtlich eine andere Leistung: die gilt */
const UMZUG_MIN = 0.85

/** Zuordnung, die PlanR einer Position vorschlägt (undefined = keine – nur über die Suche) */
export function zuordnungVorschlagen(e: Pick<EigenPosition, 'nr' | 'text' | 'ersetzt' | 'quelle'>): Vorschlag | undefined {
  const text = e.text ?? ''
  // Von Hand eingetragene „statt BEB-Nr.“ gilt wie bisher
  if (e.ersetzt?.trim() && e.quelle !== 'pvs') return { fuer: bebNorm(e.ersetzt), grund: 'eingetragen' }
  const nr = (e.ersetzt?.trim() || e.nr.trim())
  const kandidat = /^\d{1,4}$/.test(nr) ? NACH_NR.get(bebNorm(nr)) : NACH_NR.get(nr.toUpperCase())
  if (kandidat && /^D\d{3}$/.test(kandidat.nr)) return { fuer: kandidat.nr, grund: 'nummer' }
  const pw: PraxisWorte = { w: woerter(text), gekuerzt: text.trim().length >= 38 }
  const ueberText = () => {
    if (!pw.w.length) return undefined
    // „Kunststoffinlay“ ist kein „Inlay mehrflächig“: ohne Werkstoff meint die BEB eine Metall-Restauration
    const nichtMetall = pw.w.some((w) => NICHT_METALL.has(w)) && pw.w.some((w) => RESTAURATION.test(w)) && !pw.w.includes('verblendung')
      && !/\bfuer (keramik|kunststoff|komposit|polymer|kst)/.test(klein(text))
    const treffer = VOKABULAR
      .filter((v) => !nichtMetall || v.texte.some((t) => t.some((w) => WERKSTOFF.test(w))))
      .map((v) => ({ v, a: aehnlichsterText(pw, v) })).sort((x, y) => y.a - x.a)
    const beste = treffer[0]
    // Abstand zur nächstbesten anderen Leistung (gleicher Text unter zwei Nummern zählt nicht)
    const zweite = treffer.find((x) => x.v.text !== beste?.v.text)?.a ?? 0
    return beste && beste.a >= TEXT_MIN && beste.a - zweite >= TEXT_ABSTAND
      ? { fuer: beste.v.nr, wenn: ablaufVon(text, beste.v), grund: 'text' as const, aehnlich: beste.a }
      : undefined
  }
  if (kandidat) {
    const a = aehnlichsterText(pw, kandidat, true)
    if (a >= NUMMER_MIN) {
      // ältere Nummerierung: der Text meint klar eine andere Leistung (2361 „Brückenglied … Metall“ ist heute 2362)
      const anders = a < TEXT_MIN ? ueberText() : undefined
      if (anders && anders.fuer !== kandidat.nr && (anders.aehnlich ?? 0) >= UMZUG_MIN && (anders.aehnlich ?? 0) - a >= 0.3) return anders
      return { fuer: kandidat.nr, wenn: ablaufVon(text, kandidat), grund: 'nummer', aehnlich: a }
    }
  }
  const t = klein(text).replace(/[^a-z0-9]+/g, ' ')
  for (const [rolle, ja, nein] of ROLLEN_REGELN) if (ja.test(t) && !nein?.test(t)) return { fuer: rolleZiel(rolle), grund: 'rolle' }
  return ueberText()
}

const zugeordnet = new WeakMap<readonly EigenPosition[], EigenPosition[]>()

/**
 * Katalog mit Zuordnung: von Hand festgelegte bleiben, alle anderen bekommen den Vorschlag (fuer '' = keiner).
 * Das Ergebnis wird je Katalog zwischengespeichert.
 */
export function katalogZuordnen(katalog: readonly EigenPosition[] | undefined): EigenPosition[] {
  if (!katalog) return []
  const da = zugeordnet.get(katalog)
  if (da) return da
  const neu = katalog.map((e): EigenPosition => {
    if (e.zuordnung === 'hand') return e
    const v = zuordnungVorschlagen(e)
    const { wenn: _, ...ohne } = e
    return { ...ohne, fuer: v?.fuer ?? '', ...(v?.wenn ? { wenn: v.wenn } : {}), zuordnung: 'auto' }
  })
  zugeordnet.set(katalog, neu)
  return neu
}

const zielNorm = (s: string) => (/^\d{1,4}$/.test(s.trim()) ? bebNorm(s) : s.trim())

/** Positionen eines Katalogs, die für einen Leistungsschritt bzw. eine Rolle eingesetzt werden */
export function fuerSchritt(katalog: readonly EigenPosition[], ziel: string, ablauf: Ablauf): EigenPosition[] {
  const z = zielNorm(ziel)
  const passend = katalog.filter((e) => e.fuer && zielNorm(e.fuer) === z && (!e.wenn || e.wenn === ablauf))
  // die Variante für den Ablauf vor der allgemeinen
  return [...passend.filter((e) => e.wenn), ...passend.filter((e) => !e.wenn)]
}

const herstellerWort = (h: string) => woerter(h)[0] ?? ''

/** Praxisposition für eine Rolle; Implantatteile nur vom Hersteller des geplanten Systems */
export function rolleFinden(katalog: readonly EigenPosition[] | undefined, rolle: Rolle, ablauf: Ablauf = 'abdruck', hersteller = ''): EigenPosition | undefined {
  if (!katalog?.length) return undefined
  const k = katalogZuordnen(katalog)
  let passend = fuerSchritt(k, rolleZiel(rolle), ablauf)
  if (rolle.startsWith('implantat-')) {
    const h = herstellerWort(hersteller)
    passend = h ? passend.filter((e) => woerter(e.text).some((w) => gleichesWort(w, h))) : []
  }
  return passend[0]
}

/** Lesbare Beschreibung der Zuordnung für die Katalog-Ansicht */
export function zuordnungText(e: Pick<EigenPosition, 'fuer' | 'wenn'>): string {
  if (!e.fuer) return 'keine Zuordnung – nur über die Suche'
  const ablauf = e.wenn === 'scan' ? ' · nur bei Intraoralscan' : e.wenn === 'abdruck' ? ' · nur bei Abdruck' : ''
  if (istRolle(e.fuer)) {
    const r = ROLLEN[e.fuer.slice(4) as Rolle]
    return `Material: ${r.titel} (${r.je})${ablauf}`
  }
  const t = schrittText(e.fuer)
  return `für ${/^D\d{3}$/.test(e.fuer) ? '' : 'BEB '}${e.fuer}${t ? ` (${t})` : ''}${ablauf}`
}
