/**
 * Gesprochene Suprakonstruktionen und Kronenformen.
 * Die Abrechnung steht in therapie.ts (HKP) und planung.ts (privater Zahnersatz);
 * hier wird nur erkannt, welches Kürzel gemeint ist.
 *
 * Implantat-Suprakonstruktion (andersartig, außer ZE-Richtlinie Nr. 36):
 *   Einzelkrone GOZ 2200, Brücken- oder Prothesenanker GOZ 5000, Teleskop GOZ 5040,
 *   Steg GOZ 5030 + 5070 + 5080, Locator/Kugelkopf GOZ 5030 + 5080.
 *   Verschrauben und Zementieren stecken in 2200/5000/5030, nicht in 5080.
 *   Chirurgie (GOZ 9000 ff.) gehört nicht in den HKP.
 * Krone auf Zahn: GOZ 2210, Teilkrone/Tabletop/Veneer 2220, Inlay 2150/2160/2170.
 * Vollanatomisch (monolithisch) ist BEB 2251/2252, nicht die verblendete Keramikkrone 2281 + 2612.
 * Galvano hat in der BEB-Zahntechnikliste keine eigene Nummer.
 */

export type AnkerArt = 'teleskop' | 'locator' | 'kugel' | 'steg'
export type KronenArt = 'inlay' | 'onlay' | 'tabletop' | 'teilkrone' | 'veneer' | 'galvano'
export type Retention = 'verschraubt' | 'zementiert'
export type AbutmentArt = 'standard' | 'individuell' | 'keramik'

export interface Prothetik {
  versorgung?: 'teleskopprothese' | 'totalprothese' | 'kronen' | 'bruecke' | 'implantatkronen' | 'locator' | 'steg' | 'allon' | 'inlay'
  anker?: AnkerArt
  allon?: 4 | 6
  retention?: Retention
  abutment?: AbutmentArt
  kronenart?: KronenArt
  form?: 'vollanatomisch'
  flaechen?: 1 | 2 | 3 | 4
  flaechenGenannt?: boolean
  aufImplantat?: boolean
  sekundaer?: boolean
  loeffel?: 'offen' | 'geschlossen'
}

const wort = (t: string) => ` ${t.toLowerCase().replace(/[‐–—]/g, '-').replace(/\s+/g, ' ')} `

function letzte<T extends string>(t: string, muster: readonly (readonly [T, RegExp])[]): T | undefined {
  let bei = -1
  let wert: T | undefined
  for (const [v, re] of muster) {
    for (const m of t.matchAll(new RegExp(re.source, 'g'))) {
      const i = m.index ?? 0
      if (i >= bei) { bei = i; wert = v }
    }
  }
  return wert
}

/** All-on-4/6, Steg, Locator, Inlay, Teleskop, Brücke, Krone, Suprakonstruktion – das Speziellere gewinnt */
export function prothetikIn(text: string): Prothetik {
  const t = wort(text)
  const aus: Prothetik = {}
  // „Orlon-6“ ist das Live-Verhörer von All-on-6 (05.11.2026). Allon/Olon/Ollon/Alon ebenso.
  const all = t.match(/\b(?:all[\s-]*on|allon|orlon|olon|ollon|alon)[\s-]*(4|vier|four|6|sechs|six)\b/)
  const sekundaer = /sekund(?:ä|ae)r/.test(t) && /teleskop|krone|teil/.test(t) && !/prim(?:ä|ae)r/.test(t)
  const teleskop = /teleskop|konus|doppelkrone|prim(?:ä|ae)r(?:krone|teleskop)/.test(t) || sekundaer
  const locator = /druckknopf|locator|locater|kugel(?:kopf|anker)|novaloc|equator/.test(t)
    || (/patri(?:ze|ce)|matri(?:ze|ce)/.test(t) && /implantat|prothese/.test(t))
  const steg = /steg|mesostruktur|hybridprothese/.test(t)
  const inlay = /inlay|onlay|einlagef/.test(t) && !/krone|teleskop|br(?:ü|ue)cke/.test(t)

  if (all) {
    aus.versorgung = 'allon'
    aus.allon = /6|sechs|six/.test(all[1]) ? 6 : 4
  } else if (steg) {
    aus.versorgung = 'steg'
    aus.anker = 'steg'
  } else if (locator) {
    aus.versorgung = 'locator'
    aus.anker = /kugel/.test(t) && !/locator|druckknopf|novaloc|equator/.test(t) ? 'kugel' : 'locator'
  } else if (inlay) {
    aus.versorgung = 'inlay'
  } else if (teleskop) {
    aus.versorgung = 'teleskopprothese'
    aus.anker = 'teleskop'
    aus.sekundaer = sekundaer
  } else if (/br(?:ü|ue)cke/.test(t)) {
    aus.versorgung = 'bruecke'
  } else if (/totalprothese|vollprothese|\btotale\b/.test(t)) {
    aus.versorgung = 'totalprothese'
  } else if (/prothese/.test(t) && /implantat/.test(t)) {
    aus.versorgung = 'locator'
    aus.anker = 'locator'
  } else if (/implantat|suprakonstruktion/.test(t)) {
    aus.versorgung = 'implantatkronen'
  } else if ((/ger(?:ü|ue)st/.test(t) && /verblend/.test(t))
    || /teilkrone|dreiviertel|table[\s-]?top|okklusionsschale|kaufl(?:ä|ae)chenschale|veneer|verblendschale|galvano|krone/.test(t)) {
    aus.versorgung = 'kronen'
  }

  if (/table[\s-]?top|okklusionsschale|kaufl(?:ä|ae)chenschale/.test(t)) aus.kronenart = 'tabletop'
  else if (/teilkrone|dreiviertelkrone|3\/4/.test(t)) aus.kronenart = 'teilkrone'
  else if (/veneer|verblendschale/.test(t)) aus.kronenart = 'veneer'
  else if (/onlay/.test(t)) aus.kronenart = 'onlay'
  else if (/inlay|einlagef/.test(t)) aus.kronenart = 'inlay'
  else if (/galvano/.test(t)) aus.kronenart = 'galvano'

  if (/vollanatom|monolith|vollzirkon/.test(t)) aus.form = 'vollanatomisch'
  aus.retention = letzte(t, [
    ['verschraubt', /verschraub|schraubenkrone|schraubkrone/],
    ['zementiert', /zementier/],
  ] as const)
  aus.abutment = letzte(t, [
    ['keramik', /keramik\s*abutment|zirkon\s*abutment|abutment\w* aus (?:zirkon|keramik)|individuelle[snm]? keramik/],
    ['individuell', /individuell\w* abutment|custom[\s-]?abutment|cad\s?cam\s*abutment|hybrid\s*abutment|ti[\s-]?base/],
    ['standard', /konfektioniert\w* abutment|standard\s*abutment|titan\s*abutment|multi[\s-]?unit/],
  ] as const)
  if (/multi[\s-]?unit/.test(t) && !aus.retention) aus.retention = 'verschraubt'
  aus.loeffel = letzte(t, [
    ['offen', /offene[mnrs]? (?:l(?:ö|oe)ffel|abform)/],
    ['geschlossen', /geschlossene[mnrs]? l(?:ö|oe)ffel/],
  ] as const)

  const fl = letzte(t, [
    ['4', /vier[\s-]*fl|4[\s-]*fl|mehr[\s-]*fl/],
    ['3', /drei[\s-]*fl|3[\s-]*fl|\bmod\b|\bmol\b|\bdol\b/],
    ['1', /ein[\s-]*fl|1[\s-]*fl/],
    ['2', /zwei[\s-]*fl|2[\s-]*fl|\bmo\b|\bod\b|\bdo\b/],
  ] as const)
  if (fl) {
    aus.flaechen = Number(fl) as 1 | 2 | 3 | 4
    aus.flaechenGenannt = true
  }
  aus.aufImplantat = /implantat|suprakonstruktion|all[\s-]*on/.test(t)
    || aus.versorgung === 'locator' || aus.versorgung === 'steg' || aus.versorgung === 'allon' || aus.versorgung === 'implantatkronen'
  if (!aus.anker && !aus.allon && !aus.retention && !aus.abutment && !aus.kronenart && !aus.form && !aus.versorgung) return {}
  return aus
}

/** Übliche Implantatsitze, wenn keine Zähne genannt sind (Maló). Distal davon keine Freiendglieder. */
export const ALLON_SITZ: Record<4 | 6, Record<'OK' | 'UK', string[]>> = {
  4: { OK: ['15', '12', '22', '25'], UK: ['45', '42', '32', '35'] },
  6: { OK: ['16', '14', '12', '22', '24', '26'], UK: ['46', '44', '42', '32', '34', '36'] },
}
