/**
 * Gesprochener HKP-Auftrag → Plan. Deterministisch (kein LLM): Satz verstehen, gegen den Befund prüfen,
 * Therapiezeile setzen und mit der Regelengine rechnen. Was nicht eindeutig ist, wird als Rückfrage
 * zurückgegeben – es wird nie ein Befund erfunden.
 */
import type { Abformung, HkpPlan } from '../types'
import { leererPlan } from '../store/plan'
import { regelOptionen, regelversorgungErmitteln, therapieAnwenden } from './regeln'
import { privatStufeAnwenden, regelUebernehmen } from './aufwertung'
import { BEFUND_KUERZEL, FEHLEND, KRONE_NOETIG, OBERKIEFER, UNTERKIEFER, imVerblendbereich, istWeisheitszahn, kieferVon } from './zahnschema'
import { WERKSTOFFE, WERKSTOFFE_FUER, kronenEinheiten, type Werkstoff } from './material'
import { ausfuehrungIn, zaehneFuerVerblendung, type Verblendung } from './ausfuehrung'
import { ALLON_SITZ, prothetikIn, type AbutmentArt, type AnkerArt, type KronenArt, type Retention } from './vokabular'

export type Versorgung = 'teleskopprothese' | 'totalprothese' | 'kronen' | 'bruecke' | 'implantatkronen' | 'locator' | 'steg' | 'allon' | 'inlay'
export type Kiefer = 'OK' | 'UK'

export interface HkpAuftrag {
  /** der Satz, wie er gesprochen wurde */
  text: string
  versorgung?: Versorgung
  kiefer?: Kiefer
  /** Teleskop- bzw. Kronenzähne, bei Brücken die Anker */
  pfeiler: string[]
  /** Brückenglieder (genannt oder zwischen „14 auf 16“) */
  glieder?: string[]
  coverDenture: boolean
  mitAchtern: boolean
  /** Interimsprothese (Befundklasse 5), nur für den genannten Kiefer */
  interim?: boolean
  /** Immediatprothese, nur für den genannten Kiefer */
  immediat?: boolean
  abformung?: Exclude<Abformung, ''>
  werkstoff?: Werkstoff
  labor?: HkpPlan['einstellungen']['labor']
  /** ID aus dem Katalog der Implantatsysteme */
  implantatSystem?: string
  /** Eigenlabor-Stufe „Kasse → Privat“ */
  privatStufe?: number
  /** Teilverblendung, vestibuläre Verblendung, Vollverblendung oder unverblendet */
  verblendung?: Verblendung
  /** Locator, Kugelkopf, Steg oder Teleskop – steuert die Ankerzeile */
  anker?: AnkerArt
  /** All-on-4 oder All-on-6, wenn keine Sitze genannt wurden */
  allon?: 4 | 6
  retention?: Retention
  abutment?: AbutmentArt
  kronenart?: KronenArt
  /** monolithisch, ohne Verblendschicht */
  form?: 'vollanatomisch'
  flaechen?: 1 | 2 | 3 | 4
  flaechenGenannt?: boolean
  aufImplantat?: boolean
  sekundaer?: boolean
  loeffel?: 'offen' | 'geschlossen'
  /** laut Ansage zu entfernen bzw. zu erhalten */
  entfernen: string[]
  erhalten: string[]
  bonus?: HkpPlan['zuschuss']['bonus']
  haertefall?: boolean
  /** Versorgung je Kiefer, wenn der Auftrag beide Kiefer plant („im OK eine Totale, im UK Teleskope“) */
  teile?: HkpAuftrag[]
}

/** Befund je Zahn mit eHKP-Kürzel; '' = vorhanden ohne Befund */
export type Befund = Record<string, string>

export interface Rueckfrage {
  status: 'rueckfrage'
  grund: 'versorgung' | 'kiefer' | 'pfeiler' | 'befund_fehlt' | 'pfeiler_fehlt' | 'restzaehne' | 'krone_befund' | 'nicht_unterstuetzt' | 'glied_vorhanden' | 'zahn_vorhanden'
  frage: string
  zaehne?: string[]
}

export interface PlanOptionen {
  bonus?: HkpPlan['zuschuss']['bonus']
  haertefall?: boolean
  labor?: HkpPlan['einstellungen']['labor']
  abformung?: Exclude<Abformung, ''>
  /** Praxis-Standard, wenn der Auftrag kein System nennt */
  implantatSystem?: string
  privatStufe?: number
  patient?: Partial<HkpPlan['patient']>
  kzv?: string
  praxisPlz?: string
  /** Praxis-Standard aus PlanR (Labor, PLZ, KZV, GOZ-Faktor …) */
  einstellungen?: Partial<HkpPlan['einstellungen']>
}

export interface PlanErgebnis {
  status: 'ok'
  plan: HkpPlan
  auftrag: HkpAuftrag
  /** Annahmen und Prüfhinweise, die im Entwurf stehen */
  hinweise: string[]
}

const ZAHL_WORT: Record<string, string> = {
  einser: '1', zweier: '2', dreier: '3', eckzahn: '3', eckzaehne: '3', eckzähne: '3', vierer: '4', fuenfer: '5', fünfer: '5',
  sechser: '6', siebener: '7', siebner: '7', achter: '8',
}
const QUADRANT: Record<Kiefer, { rechts: string; links: string }> = { OK: { rechts: '1', links: '2' }, UK: { rechts: '4', links: '3' } }
const REIHE: Record<Kiefer, string[]> = { OK: OBERKIEFER, UK: UNTERKIEFER }
const FDI = /\b([1-4][1-8])\b/g

/**
 * Gesprochene Kiefer-Wörter vereinheitlichen: „Oberkieferprothese“ → „oberkiefer prothese“,
 * STT-Hörfehler „Oberkäfer“, „Ober- und Unterkiefer“ → beide Kiefer ausgeschrieben.
 */
const kieferWorte = (t: string) => t
  .replace(/\bober-?\s+(und|oder|sowie)\s+unter/g, 'oberkiefer $1 unter')
  .replace(/\bunter-?\s+(und|oder|sowie)\s+ober/g, 'unterkiefer $1 ober')
  .replace(/\b(ober|unter)-?\s?k(?:ie|ä|ae|i|e)ff?er(s)?\b-?/g, ' $1kiefer ')
  .replace(/\b(ober|unter)k(?:ie|ä|ae|i|e)ff?er(?=[a-zäöüß])/g, ' $1kiefer ')

/**
 * Gesprochene Stellen (Live 15.10.2026): „die Zähne vier, fünf, sechs, sieben“ → „die vierer, fünfer, sechser und siebener“,
 * „Zähne vier bis sieben“ ebenso; „Weisheitszähne“ → „achter“. Nur direkt nach „Zähne“ – „zwei Teleskopprothesen“ bleibt.
 */
const STELLE: Record<string, number> = { eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8 }
const STELLE_NAME = ['', 'einser', 'zweier', 'dreier', 'vierer', 'fünfer', 'sechser', 'siebener', 'achter']
const STELLE_WORT = '(?:eins|zwei|drei|vier|f(?:ü|ue)nf|sechs|sieben|acht|[1-8])'
const STELLEN_LISTE = new RegExp(`\\bz(?:ä|ae)hne?\\s+(${STELLE_WORT}(?:\\s*(?:,|und|bis|-)\\s*${STELLE_WORT})*)\\b`, 'g')
const stellenWorte = (t: string) => t
  .replace(/\bweisheitsz(?:ä|ae)hnen?\b(?!\s*\d)/g, 'achter')
  .replace(STELLEN_LISTE, (_, liste: string) => {
    const stellen: number[] = []
    let bis = false
    for (const w of liste.match(new RegExp(`${STELLE_WORT}|bis|-`, 'g')) ?? []) {
      if (w === 'bis' || w === '-') { bis = true; continue }
      const n = STELLE[w] ?? Number(w)
      const von = stellen[stellen.length - 1]
      if (bis && von && n > von) for (let i = von + 1; i < n; i++) stellen.push(i)
      if (!stellen.includes(n)) stellen.push(n)
      bis = false
    }
    const namen = stellen.map((n) => STELLE_NAME[n])
    return namen.length > 1 ? `${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}` : namen.join('')
  })

const norm = (t: string) => ` ${stellenWorte(kieferWorte(t.toLowerCase().replace(/[‐–—]/g, '-'))).replace(/\s+/g, ' ')} `

function kieferIn(t: string): Kiefer | undefined {
  const ok = /\b(ok|o\.k\.|oberkiefer|oben)\b/.test(t)
  const uk = /\b(uk|u\.k\.|unterkiefer|unten)\b/.test(t)
  return ok && !uk ? 'OK' : uk && !ok ? 'UK' : undefined
}

/** „Teleskopprothese im Ober- und Unterkiefer …“, „sowohl im Oberkiefer als auch im Unterkiefer“: eine Angabe für beide */
const KIEFER_GEMEINSAM = /\b(?:oberkiefer|ok)\s+(?:und|sowie|als auch)\s+(?:(?:im|in|den|dem)\s+)?(?:unterkiefer|uk)\b|\b(?:unterkiefer|uk)\s+(?:und|sowie|als auch)\s+(?:(?:im|in|den|dem)\s+)?(?:oberkiefer|ok)\b/

/** Zähne von a bis b entlang der Zahnreihe (auch über die Mitte, z. B. 13 bis 23) */
export function zahnSpanne(a: string, b: string): string[] {
  if (kieferVon(a) !== kieferVon(b)) return [a, b]
  const reihe = REIHE[kieferVon(a)]
  const i = reihe.indexOf(a), j = reihe.indexOf(b)
  return reihe.slice(Math.min(i, j), Math.max(i, j) + 1)
}

/** Zahnangaben eines Satzteils: FDI-Nummern, Spannen („15 bis 18“), „OK-Vierer“, „Frontzähne“ */
export function zaehneIn(teil: string, kiefer?: Kiefer): string[] {
  const t = norm(teil)
  const out: string[] = []
  const dazu = (zs: string[]) => zs.forEach((z) => !out.includes(z) && out.push(z))
  const spannen = /\b([1-4][1-8])\s*(?:bis|-)\s*([1-4][1-8])\b/g
  let rest = t
  for (const m of t.matchAll(spannen)) { dazu(zahnSpanne(m[1], m[2])); rest = rest.replace(m[0], ' ') }
  for (const m of rest.matchAll(FDI)) dazu([m[1]])
  const k = kieferIn(t) ?? kiefer
  const re = /\brechte?[nmrs]?\b/.test(t), li = /\blinke?[nmrs]?\b/.test(t)
  const seiten = re && !li ? ['rechts'] as const : li && !re ? ['links'] as const : ['rechts', 'links'] as const
  for (const m of t.matchAll(/\b(\d)er(?:n|s)?\b|\b(einser|zweier|dreier|eckz(?:ah|äh|aeh)ne?|vierer|f(?:ü|ue)nfer|sechser|siebe?ner|achter)n?\b/g)) {
    const stelle = m[1] ?? ZAHL_WORT[m[2].replace(/n$/, '')] ?? (m[2].startsWith('eckz') ? '3' : undefined)
    if (!stelle || !k || stelle === '0' || stelle === '9') continue
    dazu(seiten.map((s) => QUADRANT[k][s] + stelle))
  }
  if (k && /\bfront(?:z(?:ä|ae)hne?)?\b/.test(t)) dazu(zahnSpanne(k === 'OK' ? '13' : '43', k === 'OK' ? '23' : '33'))
  return out
}

const STELLE_EINZEL = '[1-8]|eins|zwei|drei|vier|f(?:ü|ue)nf|sechs|sieben|acht'

function stelleNummer(w: string): string | undefined {
  if (/^[1-8]$/.test(w)) return w
  const n = STELLE[w]
  return n ? String(n) : undefined
}

/** Ohne genannten Kiefer alle vier Quadranten. „im Oberkiefer“ nur 1 und 2. */
function quadrantenAus(t: string, kiefer?: Kiefer): string[] {
  const okWort = /\b(ok|oberkiefer|oben)\b/.test(t)
  const ukWort = /\b(uk|unterkiefer|unten)\b/.test(t)
  const ok = kiefer === 'OK' || (okWort && !ukWort)
  const uk = kiefer === 'UK' || (ukWort && !okWort)
  if (ok && !uk) return ['1', '2']
  if (uk && !ok) return ['4', '3']
  return ['1', '2', '4', '3']
}

/**
 * „Implantate in der Region 3, 4 und 6 in jedem Quadranten“
 * → 13, 14, 16, 23, 24, 26, 33, 34, 36, 43, 44, 46.
 * Gesprochen, auch ohne Komma und mit STT „regione“.
 */
function implantRegionen(text: string, kiefer?: Kiefer): string[] {
  const t = norm(text)
  if (!/implantat/.test(t) || !/quadrant/.test(t)) return []
  const liste = new RegExp(`((?:${STELLE_EINZEL})(?:\\s*(?:,|und|sowie)?\\s+(?:${STELLE_EINZEL})){1,7})`, 'g')
  const fund = t.match(new RegExp(`\\bregi(?:o|on)\\w*\\s+${liste.source}`))
    ?? t.match(new RegExp(`\\b(?:in der|in den|an den)\\s+${liste.source}`))
  if (!fund) return []
  const stellen = [...fund[1].matchAll(new RegExp(STELLE_EINZEL, 'g'))].map((x) => stelleNummer(x[0])).filter((x): x is string => !!x)
  const out: string[] = []
  for (const q of quadrantenAus(t, kiefer)) for (const s of stellen) {
    const z = q + s
    if (/^[1-4][1-8]$/.test(z) && !out.includes(z)) out.push(z)
  }
  return out
}

/** „von 4 auf 6“, „von 3 auf 3“: Stellen im Quadranten, nicht die FDI-Nummer 46. */
function positionsSpannen(t: string, kiefer?: Kiefer): { anker: string[]; glieder: string[] } {
  const anker: string[] = []
  const glieder: string[] = []
  const re = new RegExp(`(?:\\bvon|\\bab)\\s+(?:(?:der|dem|die|den|zahn)\\s+)?(${STELLE_EINZEL})(?!\\d)\\s+(?:auf|bis|nach|zu)\\s+(?:(?:die|den|der|dem|zahn)\\s+)?(${STELLE_EINZEL})(?!\\d)`, 'g')
  const qs = quadrantenAus(t, kiefer)
  const dazuAnker = (z: string) => { if (!anker.includes(z)) anker.push(z) }
  const dazuGlied = (z: string) => { if (!glieder.includes(z) && !anker.includes(z)) glieder.push(z) }
  const ausSpanne = (von: string, bis: string) => {
    const zs = zahnSpanne(von, bis)
    if (zs.length < 2) return
    dazuAnker(zs[0])
    dazuAnker(zs[zs.length - 1])
    for (const z of zs.slice(1, -1)) dazuGlied(z)
  }
  for (const m of t.matchAll(re)) {
    const a = stelleNummer(m[1])
    const b = stelleNummer(m[2])
    if (!a || !b) continue
    if (a === b) {
      const kieferSet = new Set(qs.map((q) => (q === '1' || q === '2' ? 'OK' : 'UK')))
      if (kieferSet.has('OK')) ausSpanne(`1${a}`, `2${b}`)
      if (kieferSet.has('UK')) ausSpanne(`4${a}`, `3${b}`)
      continue
    }
    for (const q of qs) ausSpanne(q + a, q + b)
  }
  return { anker, glieder }
}

const satzteile = (t: string) => norm(t).split(/[,;.]| und nach | sowie | dazu | außerdem | ausserdem /).map((s) => s.trim()).filter(Boolean)

const KIEFER_WORT = /\b(ok|o\.k\.|oberkiefer|oben|uk|u\.k\.|unterkiefer|unten)\b/g

/** Text an jeder Kiefer-Nennung schneiden: „Im Oberkiefer … und im Unterkiefer …“ → je Kiefer ein Abschnitt */
function kieferAbschnitte(text: string): { kiefer: Kiefer; text: string }[] {
  const t = norm(text)
  const treffer = [...t.matchAll(KIEFER_WORT)]
  const out: { kiefer: Kiefer; text: string }[] = []
  // Schnitt an der Satzgrenze VOR dem Kiefer-Wort: „… und totale Unterkieferprothese“ gehört
  // samt „totale“ zum Unterkiefer, nicht zum Oberkiefer-Abschnitt davor.
  const schnitt = (i: number) => {
    if (i === 0) return 0
    const von = (treffer[i - 1].index ?? 0) + treffer[i - 1][0].length
    const davor = t.slice(von, treffer[i].index)
    const grenzen = [...davor.matchAll(/[,;.]| und | sowie | dazu | außerdem | ausserdem /g)]
    const g = grenzen[grenzen.length - 1]
    return g ? von + (g.index ?? 0) : treffer[i].index!
  }
  treffer.forEach((m, i) => {
    const kiefer: Kiefer = /^(ok|o\.k\.|oberkiefer|oben)$/.test(m[1]) ? 'OK' : 'UK'
    const stueck = t.slice(schnitt(i), i + 1 < treffer.length ? schnitt(i + 1) : t.length)
    const letzter = out[out.length - 1]
    if (letzter?.kiefer === kiefer) letzter.text += stueck
    else out.push({ kiefer, text: stueck })
  })
  return out
}

/** „Totalprothese für beide Kiefer“, „oben und unten“ – eine Versorgung für OK und UK */
const BEIDE_KIEFER = /\bbeide(n)? kiefer|\bbeidkiefer|\bok und uk\b|\buk und ok\b|\boben und unten\b|\bunten und oben\b/

const KIEFERWEIT = new Set<Versorgung>(['teleskopprothese', 'totalprothese', 'locator', 'steg', 'allon'])

function versorgungIn(t: string, coverDenture: boolean): Versorgung | undefined {
  return prothetikIn(t).versorgung ?? (coverDenture ? 'teleskopprothese' : undefined)
}

export function auftragVerstehen(text: string): HkpAuftrag {
  const ohne = ohneKieferBefund(text)
  if (ohne) return { ...auftragVerstehen(ohne), text }
  const auftrag = einzelAuftrag(text)
  const abschnitte = kieferAbschnitte(text)
  const beide = BEIDE_KIEFER.test(norm(text))
  // Gleiche Prothese für beide Kiefer: jeder Kiefer liest den ganzen Satz („auf den Eckzähnen“ gilt oben und unten)
  const gemeinsam = KIEFER_GEMEINSAM.test(norm(text))
    && KIEFERWEIT.has(auftrag.versorgung ?? 'kronen')
    && new Set(abschnitte.map((a) => einzelAuftrag(a.text).versorgung).filter(Boolean)).size <= 1
  const fuerBeide = beide && (auftrag.versorgung === 'totalprothese' || auftrag.versorgung === 'allon')
  if (abschnitte.length < 2 && !fuerBeide && !gemeinsam)
    return brueckenKiefer(auftrag) ?? auftrag
  const roh = gemeinsam
    ? (['OK', 'UK'] as Kiefer[]).map((k) => einzelAuftrag(text, k))
    : abschnitte.map((a) => ({ ...einzelAuftrag(a.text), kiefer: a.kiefer }))
  // Abschnitt nur mit Kiefer-Wort („… im Oberkiefer und Unterkiefer“) erbt die Versorgung des Nachbarn –
  // nicht, wenn dort ein Befund steht („unten bleibt alles“, „im Unterkiefer ist die 36 kariös“).
  if (!gemeinsam) roh.forEach((x, i) => {
    const t = norm(abschnitte[i].text)
    if (x.versorgung || /nichts|kein/.test(t) || befundWort(t, true)) return
    const nachbar = roh.slice(0, i).reverse().find((y) => y.versorgung) ?? roh.slice(i + 1).find((y) => y.versorgung)
    if (nachbar?.versorgung) {
      x.versorgung = nachbar.versorgung
      // „All-on-6 oben und unten“: der zweite Kiefer trägt nur „unten“ und würde sonst zu All-on-4.
      if (x.allon == null && nachbar.allon) x.allon = nachbar.allon
      // „im Unterkiefer von 44 auf 46“ enthält das Wort Brücke nicht. Die Spanne wird erst hier gelesen.
      if (x.versorgung === 'bruecke') brueckeVerstehen(norm(abschnitte[i].text), x)
    }
  })
  if (fuerBeide)
    for (const k of ['OK', 'UK'] as const)
      if (!roh.some((x) => x.kiefer === k && x.versorgung))
        roh.push({ ...einzelAuftrag(text), kiefer: k, versorgung: auftrag.versorgung, allon: auftrag.allon })
  const teile = roh
    .filter((x) => x.versorgung && x.versorgung !== 'kronen' && x.versorgung !== 'implantatkronen' && x.versorgung !== 'inlay')
    .filter((x, i, alle) => alle.findIndex((y) => y.kiefer === x.kiefer) === i)
  const kiefer = new Set(teile.map((x) => x.kiefer))
  if (!teile.length) return auftrag
  for (const x of teile) {
    x.pfeiler = x.pfeiler.filter((z) => kieferVon(z) === x.kiefer)
    if (x.glieder) x.glieder = x.glieder.filter((z) => kieferVon(z) === x.kiefer)
  }
  if (kiefer.size === 1) return { ...auftrag, ...teile[0], text, bonus: auftrag.bonus, haertefall: auftrag.haertefall }
  return { ...auftrag, versorgung: teile[0].versorgung, kiefer: undefined, teile,
    pfeiler: teile.flatMap((x) => x.pfeiler), glieder: teile.flatMap((x) => x.glieder ?? []),
    coverDenture: teile.some((x) => x.coverDenture) }
}

type ListenArt = 'entfernen' | 'erhalten'
const LISTEN_VERB: Record<ListenArt, RegExp> = { entfernen: /entfern|extrah|ziehen|gezogen|raus/, erhalten: /bleib|erhalt|behalt|stehen/ }
const listenArt = (teil: string): ListenArt | undefined =>
  LISTEN_VERB.entfernen.test(teil) ? 'entfernen' : LISTEN_VERB.erhalten.test(teil) ? 'erhalten' : undefined
const ersterZahnIn = (teil: string) => teil.search(new RegExp(`\\b${ZAHN_WORT}`))
/** „Entfernung der Zähne 15“: das Verb steht vor dem ersten Zahn, die Aufzählung danach gehört dazu */
const verbVorn = (teil: string, art: ListenArt) => {
  const zahn = ersterZahnIn(teil)
  return zahn >= 0 && teil.search(LISTEN_VERB[art]) < zahn
}
/** „…, 22 und 25 werden entfernt“: Verb in der Mehrzahl hinter den Zähnen nimmt die Aufzählung davor mit */
function listeDanach(teil?: string): ListenArt | undefined {
  const art = teil ? listenArt(teil) : undefined
  if (!art || !teil || /\b(?:wird|soll|muss|ist|bleibt|steht)\b/.test(teil)) return undefined
  const zahn = ersterZahnIn(teil)
  return zahn < 0 || teil.search(LISTEN_VERB[art]) > zahn ? art : undefined
}
const ZAEHNE_VORWORT = /^\s*(?:(?:die|der|den)\s+)?(?:zahn|z(?:ä|ae)hne)\s+/
const nurZaehne = (teil: string) => NUR_ZAEHNE.test(teil) || NUR_ZAEHNE.test(teil.replace(ZAEHNE_VORWORT, ''))

function einzelAuftrag(text: string, kiefer?: Kiefer): HkpAuftrag {
  const t = norm(text)
  const auftrag: HkpAuftrag = {
    text, pfeiler: [], entfernen: [], erhalten: [],
    coverDenture: /co?ver.?dent|kover.?dent|deckprothese/.test(t),
    mitAchtern: /(mit|inklusive|inkl\.?|samt) (den )?achter/.test(t),
    interim: /interim|provisorisch|übergangsprothese|uebergangsprothese/.test(t),
    immediat: /immediat|sofortprothese/.test(t),
  }
  auftrag.versorgung = versorgungIn(t, auftrag.coverDenture)
  auftrag.kiefer = kiefer ?? kieferIn(t)
  const nummern = [...t.matchAll(FDI)].map((m) => kieferVon(m[1]))
  if (!auftrag.kiefer && nummern.length && nummern.every((k) => k === nummern[0])) auftrag.kiefer = nummern[0]
  Object.assign(auftrag, ausfuehrungIn(text))
  const worte = prothetikIn(t)
  if (worte.versorgung) auftrag.versorgung = worte.versorgung
  if (worte.anker) auftrag.anker = worte.anker
  if (worte.allon) auftrag.allon = worte.allon
  if (worte.retention) auftrag.retention = worte.retention
  if (worte.abutment) auftrag.abutment = worte.abutment
  if (worte.kronenart) auftrag.kronenart = worte.kronenart
  if (worte.form) auftrag.form = worte.form
  if (worte.flaechen) auftrag.flaechen = worte.flaechen
  if (worte.flaechenGenannt) auftrag.flaechenGenannt = true
  if (worte.aufImplantat) auftrag.aufImplantat = true
  if (worte.sekundaer) auftrag.sekundaer = true
  if (worte.loeffel) auftrag.loeffel = worte.loeffel
  if (worte.kronenart === 'galvano' && !auftrag.verblendung) auftrag.verblendung = 'keine'

  if (/h(ä|ae)rtefall/.test(t)) auftrag.haertefall = true
  if (/(kein|ohne)(en)? bonus/.test(t)) auftrag.bonus = '60'
  else if (/\b(75|fünfundsiebzig|fuenfundsiebzig) ?(%|prozent)|\b(30|dreißig|dreissig) ?(%|prozent) bonus|bonus (von )?(30|dreißig|dreissig)\b|zehn jahre bonus|bonus (über |ueber )?zehn jahre/.test(t)) auftrag.bonus = '75'
  else if (/\b(70|siebzig) ?(%|prozent)|\b(20|zwanzig) ?(%|prozent) bonus|bonus (von )?(20|zwanzig)\b|fünf jahre bonus|fuenf jahre bonus|bonusheft/.test(t)) auftrag.bonus = '70'
  else if (/\b(60|sechzig) ?(%|prozent)/.test(t)) auftrag.bonus = '60'

  const alleTeile = satzteile(text)
  let pfeilerDavor = false
  let listeDavor: ListenArt | undefined
  alleTeile.forEach((teil, i) => {
    const zs = zaehneIn(teil, auftrag.kiefer)
    if (!zs.length) {
      listeDavor = undefined
      return
    }
    // „nach Entfernung der Zähne 15, 12, 11 und 25“ / „die Zähne 12, 11 und 25 werden entfernt“:
    // die ganze Aufzählung gehört zum Verb, nicht nur ihr erster Zahn (Anruf 06.11.2026 08:38)
    if (nurZaehne(teil)) {
      // „…, die Zähne 12, 11“ beginnt eine neue Aufzählung, auch direkt hinter Pfeilern
      const fortsetzung = pfeilerDavor && !ZAEHNE_VORWORT.test(teil)
      const art = listeDavor ?? (fortsetzung ? undefined : listeDanach(alleTeile.slice(i + 1).find((u) => !nurZaehne(u))))
      if (art) {
        auftrag[art].push(...zs.filter((z) => !auftrag[art].includes(z)))
        pfeilerDavor = false
        return
      }
    }
    if (NUR_ZAEHNE.test(teil)) {
      // „Teleskope auf 13, 23 und 14“: Aufzählung setzt die Pfeiler fort – außer „…, 34, 35 fehlen“
      const weiter = alleTeile.slice(i + 1).find((u) => !NUR_ZAEHNE.test(u))
      // nur ein nachgestelltes Befund-Wort beendet die Aufzählung, „…, nach Entfernung der Zähne 15“ nicht
      const befund = weiter ? befundWort(weiter, true) : undefined
      const zahnDort = weiter ? ersterZahnIn(weiter) : -1
      if (pfeilerDavor && !(befund && (zahnDort < 0 || befund.index > zahnDort)))
        auftrag.pfeiler.push(...zs.filter((z) => !auftrag.pfeiler.includes(z)))
      return
    }
    pfeilerDavor = false
    listeDavor = undefined
    const art = listenArt(teil)
    if (art) {
      auftrag[art].push(...zs)
      if (verbVorn(teil, art)) listeDavor = art
    }
    else if (/teleskop|konus|doppelkrone|pfeiler|krone|anker|locator|locater|druckknopf|kugel(?:kopf|anker)|novaloc|equator|steg|inlay|onlay|tabletop|teilkrone|veneer|galvano|suprakonstruktion|abutment|auf (den|dem|die)\b|\bauf [1-4][1-8]\b/.test(teil)
      // Einzelzahn: „Implantat am Zahn 26“, „in Region 26“ (Anruf 07.10.2026 19:36)
      || ((auftrag.versorgung === 'implantatkronen' || auftrag.versorgung === 'kronen' || auftrag.versorgung === 'inlay')
        && /implantat|\b(?:am|an|bei|f(?:ü|ue)r) (?:zahn )?[1-4][1-8]\b|\bzahn [1-4][1-8]\b|\bregion?\b/.test(teil))) {
      // „Teleskop auf 13 und 23 ersetzte Zähne 14 …“: ab dem Befund-Wort sind es keine Pfeiler mehr,
      // ebenso ab „und die Zähne 14 bis 17 ersetzen“ (Verb hinten)
      const vorBefund = teil.split(BEFUND_BEGINN)[0].split(ZAEHNE_NACHGESTELLT)[0]
      const pf = vorBefund === teil ? zs : zaehneIn(vorBefund, auftrag.kiefer)
      auftrag.pfeiler.push(...pf.filter((z) => !auftrag.pfeiler.includes(z)))
      pfeilerDavor = vorBefund === teil
    }
  })
  if (auftrag.versorgung === 'bruecke') brueckeVerstehen(t, auftrag)
  if (!auftrag.kiefer && auftrag.pfeiler.length && auftrag.pfeiler.every((z) => kieferVon(z) === kieferVon(auftrag.pfeiler[0]))) auftrag.kiefer = kieferVon(auftrag.pfeiler[0])
  return auftrag
}

const BRUECKEN_SPANNE = /\b([1-4][1-8])\s*(?:bis|auf|nach|zu|-)\s*(?:zahn\s*)?([1-4][1-8])\b/g
const GLIED_WORT = '(?:br(?:ü|ue)cken|zwischen)?glied(?:er|ern)?'
const ZAHN_LISTE = '[1-4][1-8](?:\\s*(?:,|und)\\s*[1-4][1-8])*'
const GLIED_DAVOR = new RegExp(`\\b(${ZAHN_LISTE})\\s+(?:(ist|sind|wird|werden|als)\\s+)?(?:(?:ein|eine|das|die|der|zum|zu)\\s+)?${GLIED_WORT}`, 'g')
const GLIED_DANACH = new RegExp(`${GLIED_WORT}\\s+(?:(?:auf|in|bei|regio|f(?:ü|ue)r|an)\\s+)?(?:zahn\\s*)?(${ZAHN_LISTE})`, 'g')

/**
 * Brücke: Anker sind die Enden („von 14 auf 16“, „14 bis 16“) bzw. die genannten Kronen, Glieder die genannten
 * („15 ist ein Brückenglied“) oder die Zähne zwischen genau zwei Ankern. Einzahl-Form („16 und 15 ist ein Glied“)
 * nimmt nur den Zahn direkt am Glied-Wort.
 */
/** Brücken in beiden Kiefern aus einem Satz („jeweils von 4 auf 6 und von 3 auf 3“) */
function brueckenKiefer(a: HkpAuftrag): HkpAuftrag | undefined {
  if (a.versorgung !== 'bruecke') return undefined
  const zs = [...a.pfeiler, ...(a.glieder ?? [])]
  if (new Set(zs.map(kieferVon)).size < 2) return undefined
  const teile = (['OK', 'UK'] as const).map((k) => ({
    ...a,
    kiefer: k,
    pfeiler: a.pfeiler.filter((z) => kieferVon(z) === k),
    glieder: (a.glieder ?? []).filter((z) => kieferVon(z) === k),
  })).filter((t) => t.pfeiler.length >= 2 && (t.glieder?.length ?? 0) > 0)
  if (teile.length < 2) return undefined
  return {
    ...a, kiefer: undefined, teile,
    pfeiler: teile.flatMap((t) => t.pfeiler),
    glieder: teile.flatMap((t) => t.glieder ?? []),
  }
}

function brueckeVerstehen(t: string, a: HkpAuftrag) {
  const nummern = (s: string) => [...s.matchAll(FDI)].map((m) => m[1])
  const spannen = [...t.matchAll(BRUECKEN_SPANNE)].filter((m) => kieferVon(m[1]) === kieferVon(m[2]))
  const anker: string[] = []
  for (const m of spannen) for (const z of [m[1], m[2]]) if (!anker.includes(z)) anker.push(z)
  const stellen = positionsSpannen(t, a.kiefer)
  for (const z of stellen.anker) if (!anker.includes(z)) anker.push(z)
  const glieder: string[] = []
  const dazu = (zs: string[]) => zs.forEach((z) => !glieder.includes(z) && !anker.includes(z) && glieder.push(z))
  for (const m of t.matchAll(GLIED_DAVOR)) {
    const zs = nummern(m[1]).filter((z) => !anker.includes(z))
    dazu(/sind|werden/.test(m[2] ?? '') || /glieder/.test(m[0]) ? zs : zs.slice(-1))
  }
  for (const m of t.matchAll(GLIED_DANACH)) {
    const zs = nummern(m[1]).filter((z) => !anker.includes(z))
    dazu(/glieder/.test(m[0]) ? zs : zs.slice(0, 1))
  }
  for (const m of spannen) dazu(zahnSpanne(m[1], m[2]).slice(1, -1))
  for (const z of stellen.glieder) dazu([z])
  const pfeiler = [...anker, ...a.pfeiler.filter((z) => !anker.includes(z))].filter((z) => !glieder.includes(z))
  if (!glieder.length && pfeiler.length === 2 && kieferVon(pfeiler[0]) === kieferVon(pfeiler[1]))
    dazu(zahnSpanne(pfeiler[0], pfeiler[1]).slice(1, -1))
  a.pfeiler = pfeiler
  a.glieder = glieder
}

const BEFUND_BEGINN = /\b(?:ersetz\w*|(?:es )?fehl\w*|vorhanden|extrah\w*|entfern\w*)\b/
/** „… und die Zähne 14 bis 17 ersetzen“: ab hier stehen Befund-Zähne, das Verb folgt erst am Ende */
const ZAEHNE_NACHGESTELLT = / und (?:die |der )?z(?:ä|ae)hne? (?=[1-4][1-8]\b)/

/**
 * Befundwörter → eHKP-Kürzel, das erste passende gilt. Die Grundart (Krone, Brückenglied, Teleskop …) bekommt
 * bei „erneuerungsbedürftig“ ihr w (b → bw). `versorgung`: das Wort nennt auch eine Versorgung – im Auftrag
 * („15 ist ein Brückenglied“) ist es Therapie, kein Befund.
 */
const BEFUND_ARTEN: { re: RegExp; code: string; versorgung?: true }[] = [
  { re: /l(?:ü|ue)ckenschluss|l(?:ü|ue)cke (?:ist )?geschlossen/, code: ')(' },
  { re: /implantat\w*[- ]?(?:(?:regio |zahn )?[1-4][1-8] )?(?:ist |sind |wird |werden |soll |muss )?(?:nicht erhaltungsw|entfern|explant|raus)|zu entfernende\w* implantat|explantier/, code: 'ix' },
  { re: /implantat\w*[- ]?teleskop|teleskop\w* auf (?:dem |den |einem )?implantat/, code: 'st', versorgung: true },
  { re: /implantat\w*[- ]?br(?:ü|ue)cken[- ]?glied|br(?:ü|ue)cken[- ]?glied\w* auf implantat/, code: 'sb', versorgung: true },
  { re: /implantat\w*[- ]?(?:steg|verbindungselement)/, code: 'so', versorgung: true },
  { re: /implantat\w*[- ]?prothese|implantatgetragene\w* prothese/, code: 'se', versorgung: true },
  { re: /druckknopf|locator|locater|kugel(?:kopf|anker)|novaloc|equator/, code: 'so', versorgung: true },
  { re: /implantat[- ]?kron|implantatgetragene\w* kron|kronen? auf (?:dem |einem )?implantat|suprakonstruktion/, code: 'sk', versorgung: true },
  { re: /\b(?:ist|sind|hat|haben|mit|tr(?:ä|ae)gt) (?:ein(?:em)? )?implantat\w*|implantat\w* (?:ist |sind )?(?:vorhanden|intakt|drin|versorgt|in ordnung)|implantat\w*\s+(?:an|auf|in|bei|regio)|\b(?:ist|sind|bereits|schon) implantiert/, code: 'i', versorgung: true },
  { re: /\b[1-4][1-8] (?:ein )?implantate?$/, code: 'i', versorgung: true },
  { re: /(?:adh(?:ä|ae)siv|klebe)[- ]?br(?:ü|ue)cken[- ]?glied/, code: 'ab', versorgung: true },
  { re: /adh(?:ä|ae)siv|klebebr(?:ü|ue)cke|maryland/, code: 'a', versorgung: true },
  { re: /sekund(?:ä|ae)r[- ]?teil/, code: 't2w', versorgung: true },
  { re: /teleskop|doppelkrone|konuskrone/, code: 't', versorgung: true },
  { re: /br(?:ü|ue)cken[- ]?glied|zwischenglied|\bglied\b/, code: 'b', versorgung: true },
  { re: /wurzelstift[- ]?kappe|stiftkappe/, code: 'r', versorgung: true },
  { re: /teilkrone/, code: 'pk', versorgung: true },
  { re: /teil[- ]?defekt|partielle\w* (?:substanz)?defekt/, code: 'pw' },
  { re: /unzureichende\w* retention|retention (?:ist )?unzureichend/, code: 'ur' },
  { re: /(?:durch|mit) (?:eine\w* |die |der )?prothese ersetzt|ersetzt durch (?:eine |die )?prothese|prothesenzahn|ersetzter zahn/, code: 'e' },
  { re: /nicht erhaltungsw(?:ü|ue)rdig|hoffnungslos|extrah|entfern|ziehen/, code: 'x' },
  { re: /weitgehend zerst|(?:ü|ue)berkronungsbed(?:ü|ue)rftig|krone n(?:ö|oe)tig|braucht? (?:eine )?krone|kari(?:ö|oe)s|karies|\b(?:w ?w ?w?|weh ?weh)\b/, code: 'ww' },
  { re: /zerst(?:ö|oe)rt/, code: 'x' },
  { re: /erneuerungsbed(?:ü|ue)rftig|krone (?:ist )?(?:kaputt|defekt|insuffizient)|\b(?:k ?w|ka ?weh)\b/, code: 'kw' },
  { re: /(?:ü|ue)berkront|krone (?:ist )?(?:intakt|in ordnung|gut)|intakte krone|\b(?:hat|haben|mit|tr(?:ä|ae)gt|tragen) (?:eine )?kronen?\b/, code: 'k' },
  { re: /\b[1-4][1-8] (?:eine )?kronen?$/, code: 'k', versorgung: true },
  { re: /fehl|ohne zahn|l(?:ü|ue)cke|ersetz/, code: 'f' },
  { re: /vorhanden|gesund|intakt|da\b|steh|bleib|erhalt/, code: '' },
]
const MIT_W: Record<string, string> = { a: 'aw', ab: 'abw', b: 'bw', e: 'ew', k: 'kw', r: 'rw', sb: 'sbw', se: 'sew', sk: 'skw', so: 'sow', st: 'stw', t: 'tw' }
const ERNEUERN = /erneuer|kaputt|\bdefekt|insuffizient|undicht|gebrochen|locker/
/** „15 sk“, „16 ist k w“: das Kürzel selbst am Ende des Satzteils */
const KUERZEL_AM_ENDE = new RegExp(`(?:^|\\s)(${[...Object.keys(BEFUND_KUERZEL), 'i']
  .sort((a, b) => b.length - a.length).map((k) => k.replace(/[()]/g, '\\$&')).join('|')})$`)

/** Befund eines Satzteils → Kürzel und Fundstelle; `imAuftrag` überspringt Kürzel und Wörter, die auch eine Versorgung nennen */
function befundWort(teil: string, imAuftrag = false): { code: string; index: number } | undefined {
  if (!imAuftrag) {
    const k = KUERZEL_AM_ENDE.exec(teil.trimEnd().replace(/(?:\s[a-z2])+$/, (m) => ` ${m.replace(/\s/g, '')}`))
    if (k) return { code: k[1], index: k.index }
  }
  for (const art of BEFUND_ARTEN) {
    if (imAuftrag && art.versorgung) continue
    const m = art.re.exec(teil)
    if (!m) continue
    const w = ERNEUERN.test(teil)
    if (art.code === 'pk') return { code: w ? 'pkw' : /n(?:ö|oe)tig|braucht|bed(?:ü|ue)rftig/.test(teil) ? 'pw' : 'k', index: m.index }
    return { code: (w && MIT_W[art.code]) || art.code, index: m.index }
  }
  return undefined
}

const ZAHN_WORT = '(?:[1-4][1-8]|(?:einser|zweier|dreier|vierer|f(?:ü|ue)nfer|sechser|siebe?ner|achter)n?|eckz(?:ah|äh|aeh)ne?n?|front\\w*)'
const ZAHN_ANFANG = new RegExp(`^(?:(?:die|der|den|zahn|z(?:ä|ae)hne)\\s+)?(${ZAHN_WORT}(?:\\s*(?:bis|-|,)\\s*${ZAHN_WORT})*)\\s*(.*)$`)
const NUR_ZAHN = new RegExp(`^(?:(?:die|der|den|zahn|z(?:ä|ae)hne)\\s+)?${ZAHN_WORT}(?:\\s*(?:bis|-)\\s*${ZAHN_WORT})?$`)
const VERB_EINZAHL = /^(?:ist|hat|tr(?:ä|ae)gt|wird|fehlt|steht|bleibt)\b/
const VERB_MEHRZAHL = /^(?:sind|haben|tragen|werden|fehlen|stehen|bleiben)\b/

/**
 * „es fehlen 16 und 17 und 15 ist überkront“: ein zweiter Befund mit eigenen Zähnen beginnt einen neuen Satzteil.
 * Die Zähne dazwischen gehören nach Einzahl/Mehrzahl des Verbs zum zweiten; steht das erste Verb vorn
 * („es fehlen …“), setzt die Aufzählung es so weit wie möglich fort.
 */
function befundTeilen(teil: string): string[] {
  const st = teil.split(/\s+und\s+/)
  const out: string[] = []
  let s = 0
  for (let j = 1; j < st.length; j++) {
    const m = ZAHN_ANFANG.exec(st[j])
    if (!m || NUR_ZAHN.test(st[j]) || !befundWort(st[j])) continue
    let b = j - 1
    while (b >= s && !befundWort(st[b])) b--
    if (b < s) continue
    const zahnVorn = st[b].search(new RegExp(`\\b${ZAHN_WORT}\\b`))
    const verbVorn = zahnVorn < 0 || befundWort(st[b])!.index < zahnVorn
    const passt = (i: number) => {
      if (!st.slice(i, j).every((x) => NUR_ZAHN.test(x))) return false
      const mehrere = j > i || !/^[1-4][1-8]$/.test(m[1])
      return !(VERB_EINZAHL.test(m[2]) && mehrere) && !(VERB_MEHRZAHL.test(m[2]) && !mehrere)
    }
    const moeglich = Array.from({ length: j - b }, (_, k) => b + 1 + k).filter(passt)
    if (!moeglich.length) continue
    const i = verbVorn ? moeglich[moeglich.length - 1] : moeglich[0]
    out.push(st.slice(s, i).join(' und '))
    s = i
  }
  out.push(st.slice(s).join(' und '))
  return out
}

/** Gesprochener Befund („es fehlen 15 bis 18 und 25 bis 28, 13 bis 23 vorhanden“) → eHKP-Kürzel je Zahn */
export function befundVerstehen(text: string, kiefer?: Kiefer): Befund {
  // Punkt trennt Sätze. Sonst übernimmt „vorhanden“ am Satzende die Aufzählung davor
  // („fehlen 18 bis 14, 12, 11. Nur 13 und 23 sind vorhanden“).
  const saetze = norm(text).split(/[.!?]+\s*/).map((s) => s.trim()).filter(Boolean)
  if (saetze.length > 1) {
    const befund: Befund = {}
    for (const s of saetze) Object.assign(befund, befundVerstehen(s, kiefer))
    return befund
  }
  const befund: Befund = {}
  const nurKiefer = new Set<Kiefer>()
  const roh = satzteile(text).flatMap(befundTeilen)
  const genannt = roh.map((teil) => kieferIn(norm(teil)))
  /** Satzteil ohne Kiefer („die Sechser fehlen“) erbt ihn vom Nachbarn – erst davor, sonst danach */
  const kieferFuer = (i: number) =>
    genannt[i] ?? kiefer ?? genannt.slice(0, i).reverse().find(Boolean) ?? genannt.slice(i + 1).find(Boolean)
  // „… auf jeder Seite fehlen, sowohl im Oberkiefer als auch im Unterkiefer“: ohne einzelnen Kiefer gelten beide
  const beide = !kiefer && !genannt.some(Boolean) && (KIEFER_GEMEINSAM.test(norm(text)) || BEIDE_KIEFER.test(norm(text)))
  const zaehneFuer = (teil: string, k?: Kiefer) =>
    k || !beide ? zaehneIn(teil, k) : [...new Set([...zaehneIn(teil, 'OK'), ...zaehneIn(teil, 'UK')])]
  const teile = roh.map((teil, i) => {
    const k = kieferFuer(i)
    const treffer = befundWort(teil)
    // „er“ ohne Wortanfang traf das „er“ in „Kiefer“. Die Aufzählung galt dann als
    // nachgestellt und übernahm das Verb des nächsten Satzes (live 05.11.2026).
    const ersterZahn = teil.search(/\b[1-4][1-8]\b|\b(?:einser|einer|zweier|dreier|vierer|f(?:ü|ue)nfer|sechser|siebe?ner|achter)n?\b|\bfront|\beckz/)
    return {
      teil, k, zs: zaehneFuer(teil, k), code: treffer?.code,
      /** Verb am Ende („…, die Sechser und Siebener fehlen“) gilt auch für die Satzteile davor */
      nachgestellt: !!treffer && ersterZahn >= 0 && treffer.index > ersterZahn,
    }
  })
  let letztes: string | undefined
  // „fehlen 18 bis 14, 12, 11 und 24 bis 28. Nur 13 und 23 sind vorhanden“:
  // die Aufzählung behält das vorn stehende Verb. Ein nachgestelltes Verb gilt
  // nur, solange keins davor steht. Sonst übernimmt der zweite Satz die Liste,
  // und das Handy zeigt andere Zähne als das Diktat (live 05.11.2026).
  let aufzaehlung = false
  teile.forEach((x, i) => {
    let code = x.code
    if (code === undefined) {
      const naechstes = teile.slice(i + 1).find((y) => y.code !== undefined)
      // „die Front, die Fünfer fehlen“: die zahnlosen Teile gehören zum nachgestellten Verb.
      // „fehlen 18, 12, 11“: ohne solches Verb bleibt das vorn stehende.
      code = naechstes?.nachgestellt ? naechstes.code
        : aufzaehlung && letztes !== undefined ? letztes
        : letztes
    }
    if (ALLE_FEHLEN.test(x.teil)) {
      const ausnahme = AUSSER.exec(x.teil)
      const bleiben = new Set(ausnahme ? zaehneIn(ausnahme[1], x.k) : [])
      for (const kk of x.k ? [x.k] : (['OK', 'UK'] as Kiefer[]))
        for (const z of REIHE[kk]) if (!(z in befund)) befund[z] = bleiben.has(z) ? '' : 'f'
      return
    }
    if (code === undefined || !x.zs.length) return
    const sammelbegriff = /\bfront/.test(x.teil)
    for (const z of x.zs) if (!(sammelbegriff && z in befund)) befund[z] = code
    if (code === '' && x.k && /\bnur\b/.test(x.teil)) nurKiefer.add(x.k)
    letztes = code
    if (x.code !== undefined) aufzaehlung = !x.nachgestellt
  })
  for (const k of nurKiefer) for (const z of REIHE[k]) if (!(z in befund)) befund[z] = 'f'
  // „Im Unterkiefer sind alle Zähne vorhanden“ gilt dem genannten Kiefer, auch wenn der Auftrag im OK liegt
  const alleDa = new Set<Kiefer>()
  const alleDaTeile = roh.map((teil, i) => (ALLE_DA.test(` ${teil} `) ? genannt[i] ?? null : undefined)).filter((k) => k !== undefined)
  for (const k of alleDaTeile) if (k) alleDa.add(k)
  if (alleDaTeile.includes(null) || (!alleDaTeile.length && ALLE_DA.test(norm(text))))
    for (const k of kiefer ? [kiefer] : (['OK', 'UK'] as Kiefer[])) alleDa.add(k)
  // „alle Zähne“ meint auch die Achter. „alle anderen“ lässt nicht genannte Achter,
  // wie bisher, aus – die nimmt ein neuer Befund sonst als fehlend.
  const mitAchten = /\balle z(?:ä|ae)hne\b/.test(norm(text)) && !/\balle (?:anderen|(?:ü|ue)brigen)\b/.test(norm(text))
  for (const k of alleDa) for (const z of REIHE[k]) if (!(z in befund) && (mitAchten || !istWeisheitszahn(z))) befund[z] = ''
  if (kiefer && /alle (anderen|übrigen|uebrigen|restlichen) fehlen|sonst (fehlt|fehlen) alle|rest fehlt|(anderen|übrigen|uebrigen|restlichen) z(ä|ae)hne (sind |werden )?(ersetzt|fehlen)/.test(norm(text)))
    for (const z of REIHE[kiefer]) if (!(z in befund)) befund[z] = 'f'
  // Zahnlos mit Implantaten in genannten Regionen: die Zähne fehlen, an den Implantaten steht i.
  const sitze = implantRegionen(text, kiefer)
  if (sitze.length && /\bzahnlos\b/.test(norm(text))) {
    for (const kk of new Set(sitze.map(kieferVon))) for (const z of REIHE[kk]) if (!(z in befund)) befund[z] = 'f'
    for (const z of sitze) befund[z] = 'i'
  }
  return befund
}

/** „Alle Zähne sind gesund“, „es fehlt keiner“: Antwort auf die Befundfrage – die übrigen Zähne sind vorhanden */
const ALLE_DA = /\balle (?:anderen |(?:ü|ue)brigen )?z(?:ä|ae)hne (?:sind )?(?:noch )?(?:gesund|vorhanden|da|intakt|in ordnung|erhalten)\b|\bes fehlt (?:kein zahn|keiner|nichts)\b|\bnichts fehlt\b|\bkeine z(?:ä|ae)hne fehlen\b|\bvoll ?bezahnt\b|\b(?:sind|ist) (?:noch )?alle (?:da|vorhanden|gesund|intakt|drin)\b|\bfehl(?:t|en) (?:kein(?:er|e)?|nichts)\b|\bkein(?:er|e)? fehl(?:t|en)\b/

/** „Unterkiefer ist voll bezahnt“, „unten sind alle da“: Befund über einen ganzen Kiefer, keine Versorgung */
const kieferBefundTeil = (teil: string) => !!kieferIn(` ${teil} `) && ALLE_DA.test(` ${teil} `) && !versorgungIn(teil, false) && !VERSORGUNGS_TEIL.test(teil)

/** Auftrag ohne seine Kiefer-Befundteile – sonst öffnet „Unterkiefer ist voll bezahnt“ einen eigenen Versorgungs-Abschnitt; '' wenn es keine gibt */
function ohneKieferBefund(text: string): string {
  const teile = satzteile(text)
  const rest = teile.filter((t) => !kieferBefundTeil(t))
  return rest.length && rest.length < teile.length ? rest.join(', ') : ''
}

const ALLE_FEHLEN = /\b(fehlen|fehlt) (ihm |ihr )?(schon )?alle z(ä|ae)hne\b|\balle z(ä|ae)hne (fehlen|sind (weg|raus|gezogen|fehlend)|(als |auf )?fehlend)\b|\bzahnlos\b|\bkeine z(ä|ae)hne mehr\b/
/** „alle Zähne fehlen außer 13 und 23“: was danach kommt, bleibt stehen */
const AUSSER = /\b(?:au(?:ß|ss)er|bis auf|mit ausnahme (?:von |der |des )?|ausgenommen)\s+(.+)$/

const VERSORGUNGS_TEIL = /prothese|teleskop|konus|doppelkrone|krone|anker|pfeiler|co?ver.?dent|kover|bonus|scan|abdruck|abform|gold|zirkon|keramik|\bnem\b|erstell|plan|hkp|kostenpl|inlay|onlay|tabletop|teilkrone|galvano|abutment|suprakonstruktion|locator|druckknopf|kugelkopf|novaloc|steg|all[\s-]*on|veneer/

/** Befund-Satzteile aus einem gesprochenen Auftrag („… die Sechser und Siebener fehlen …“), sonst '' */
/** Satzteil, der nur Zähne aufzählt („die Vierer“, „Fünfer“) – sein Verb steht weiter hinten */
const NUR_ZAEHNE = /^(?:(?:die|der|den|und|sowie|auch|noch|bis|[1-4][1-8]|\d(?:er|ern)|einser|zweier|dreier|eckz(?:ah|äh|aeh)ne?n?|vierer|f(?:ü|ue)nfer|sechser|siebe?ner|achter)n?\s*)+$/

export function befundAusAuftrag(text: string): string {
  const satz = befundSaetze(text)
  // Die Lücke einer Brücke steht im Auftrag selbst („Brücke von 14 auf 16“ → 15 fehlt)
  const a = auftragVerstehen(text)
  const luecke = (a.teile?.length ? a.teile : [a]).flatMap((x) =>
    x.versorgung === 'bruecke' ? x.glieder ?? [] : x.versorgung === 'implantatkronen' ? x.pfeiler.filter((z) => !x.entfernen.includes(z)) : [])
    .filter((z) => !(satz && zaehneIn(satz).includes(z)))
  if (!luecke.length) return satz
  return [satz, `${liste(luecke)} ${luecke.length > 1 ? 'fehlen' : 'fehlt'}`].filter(Boolean).join(', ')
}

function befundSaetze(text: string): string {
  // Kiefer-Befundteile stehen für sich (sie tragen ihren Kiefer) und hinten, damit kein Satzteil ihren Kiefer erbt
  const kieferBefund = satzteile(text).filter(kieferBefundTeil)
  if (kieferBefund.length) {
    const ohne = ohneKieferBefund(text)
    return [ohne ? befundSaetze(ohne) : '', ...kieferBefund].filter(Boolean).join(', ')
  }
  const ausTeil = (abschnitt: string) => {
    // „Teleskop auf 13 und 23 ersetzte Zähne 14“: der Befund hängt am Versorgungs-Satzteil;
    // „Teleskope auf 13 und 23 und die Zähne 14 bis 17 ersetzen“: er beginnt bei „die Zähne“
    const teile = satzteile(abschnitt).flatMap((t) => {
      const m = BEFUND_BEGINN.exec(t)
      if (!(m && m.index > 0 && VERSORGUNGS_TEIL.test(t.slice(0, m.index)) && !VERSORGUNGS_TEIL.test(t.slice(m.index)))) return [t]
      const z = ZAEHNE_NACHGESTELLT.exec(t.slice(0, m.index))
      const ab = z && !VERSORGUNGS_TEIL.test(t.slice(z.index, m.index)) ? z.index : m.index
      return [t.slice(0, ab).trim(), t.slice(ab).replace(/^ und /, '').trim()]
    })
    const istBefund = (t: string) => !VERSORGUNGS_TEIL.test(t) && !!befundWort(t, true)
    return teile.filter((t, i) => {
      if (istBefund(t)) return true
      if (!NUR_ZAEHNE.test(t)) return false
      // „die Vierer, Fünfer, Sechser und Achter fehlen“: Aufzählung vor dem Befund-Satzteil gehört dazu
      const weiter = teile.slice(i + 1).find((u) => !NUR_ZAEHNE.test(u))
      if (weiter && istBefund(weiter)) return true
      // „es fehlen 14, 15, 16“: Aufzählung nach dem Befund-Satzteil ebenso
      const davor = teile.slice(0, i).reverse().find((u) => !NUR_ZAEHNE.test(u))
      return !!davor && istBefund(davor)
    })
  }
  const abschnitte = kieferAbschnitte(text)
  if (abschnitte.length < 2) return ausTeil(text).join(', ')
  // Ober- und Unterkiefer gemeinsam genannt: der Befund gilt beiden, das sagt der angehängte Kiefer-Teil
  if (KIEFER_GEMEINSAM.test(norm(text))) {
    const teile = ausTeil(text)
    return teile.length && !teile.some((t) => kieferIn(norm(t))) ? [...teile, 'im oberkiefer und im unterkiefer'].join(', ') : teile.join(', ')
  }
  // Vorspann vor der ersten Kiefer-Nennung („Es fehlen alle Zähne, … OK … und … UK“) gilt für beide Kiefer
  const ersteTeile = satzteile(abschnitte[0].text)
  const k = ersteTeile.findIndex((t) => new RegExp(KIEFER_WORT.source).test(norm(t)))
  const vorspann = k > 0 ? ersteTeile.slice(0, k).join(', ') : ''
  if (vorspann) abschnitte[0] = { ...abschnitte[0], text: ersteTeile.slice(k).join(', ') }
  // Je Kiefer-Abschnitt: Kiefer voranstellen, sonst weiß „die Sechser fehlen“ nicht, wo
  return [...(vorspann ? ausTeil(vorspann) : []), ...abschnitte.flatMap((a) => {
    const name = a.kiefer === 'OK' ? 'oberkiefer' : 'unterkiefer'
    return ausTeil(a.text).map((t) => (kieferIn(norm(t)) ? t : `im ${name} ${t}`))
  })].join(', ')
}

const liste = (zs: string[]) => (zs.length <= 1 ? zs.join('') : `${zs.slice(0, -1).join(', ')} und ${zs[zs.length - 1]}`)
const fehlt = (b: Befund, z: string) => FEHLEND.has((b[z] ?? '').trim().toLowerCase())
/** i/sk/st: Implantat oder implantatgetragene Krone. ix kommt raus und ist ebenfalls kein Zahn. */
const IMPLANTAT_BLEIBT = /^(i|sk|skw|st|stw)$/
const implantatBleibt = (code: string) => IMPLANTAT_BLEIBT.test(code.trim().toLowerCase())
/** Implantat ohne Suprakonstruktion. Das Kürzel ist immer i. ix ist schon als nicht erhaltungswürdig markiert und bleibt keine Lücke, die man noch einmal fragen muss. */
const implantatOhneAufbau = (code: string | undefined) => /^(i|ix)$/.test((code ?? '').trim().toLowerCase())
/** sk: Suprakonstruktion mit klinisch intakter Krone. Keine Behandlung, Zeile R und TP bleiben leer. */
const implantatkroneIntakt = (code: string | undefined) => (code ?? '').trim().toLowerCase() === 'sk'
const zahnStehtNoch = (b: Befund, z: string) => {
  if (!(z in b) || fehlt(b, z)) return false
  const k = (b[z] ?? '').trim().toLowerCase()
  return !implantatBleibt(k) && !implantatOhneAufbau(k)
}

/** Erzeugt aus Auftrag und Befund einen gerechneten Plan – oder eine Rückfrage. */
export function planAusAuftrag(auftrag: HkpAuftrag, befundRoh: Befund, optionen: PlanOptionen = {}): PlanErgebnis | Rueckfrage {
  const befund: Befund = Object.fromEntries(Object.entries(befundRoh).map(([z, b]) => {
    const code = (b ?? '').trim().toLowerCase()
    // Implantat ohne Suprakonstruktion ist immer i.
    return [z, code === 'j' ? 'i' : code]
  }))
  const hinweise: string[] = []

  const teile = auftrag.teile?.length ? auftrag.teile : [auftrag]
  // i/ix sind gesetzte Implantate, keine Zähne. "werden entfernt" im Plansatz zieht sie nicht.
  for (const teil of teile) for (const z of teil.entfernen) if (!implantatOhneAufbau(befund[z])) befund[z] = 'x'
  for (const teil of teile) {
    if (!teil.versorgung)
      return { status: 'rueckfrage', grund: 'versorgung', frage: 'Welche Versorgung soll ich planen – zum Beispiel Teleskopprothese, Totalprothese oder Kronen?' }
    if (!teil.kiefer && !['kronen', 'bruecke', 'implantatkronen', 'inlay'].includes(teil.versorgung ?? ''))
      return { status: 'rueckfrage', grund: 'kiefer', frage: 'Für welchen Kiefer – Oberkiefer oder Unterkiefer?' }
  }
  const ohneBefundOk = teile.every((x) => x.versorgung === 'totalprothese' || x.versorgung === 'allon')
  if (!Object.keys(befund).length && !ohneBefundOk)
    return { status: 'rueckfrage', grund: 'befund_fehlt', frage: 'Ich habe keinen Befund. Welche Zähne fehlen, und welche sind vorhanden?' }

  const tp: Record<string, string> = {}
  for (const teil of teile) {
    const r = teil.versorgung === 'kronen'
      ? kronenPlanen(teil, befund, tp)
      : teil.versorgung === 'inlay'
        ? inlayPlanen(teil, befund, tp, hinweise)
          : teil.versorgung === 'bruecke'
          ? brueckePlanen(teil, befund, tp, hinweise)
          : teil.versorgung === 'implantatkronen'
            ? implantatPlanen(teil, befund, tp)
            : teil.versorgung === 'allon'
              ? allonPlanen(teil, befund, tp, hinweise)
              : kieferPlanen(teil, teil.kiefer!, befund, tp, hinweise)
    if (r) return r
  }
  return planRechnen(auftrag, teile, befund, tp, hinweise, optionen)
}

function brueckePlanen(auftrag: HkpAuftrag, befund: Befund, tp: Record<string, string>, hinweise: string[]): Rueckfrage | undefined {
  const anker = auftrag.pfeiler
  const glieder = auftrag.glieder ?? []
  if (anker.length < 2 || !glieder.length || new Set([...anker, ...glieder].map(kieferVon)).size > 1)
    return { status: 'rueckfrage', grund: 'pfeiler', frage: 'Von welchem bis zu welchem Zahn soll die Brücke gehen – zum Beispiel von 14 auf 16?' }
  const implant = !!auftrag.aufImplantat || anker.some((z) => befund[z] === 'i' || (befund[z] ?? '').startsWith('s'))
  const ankerFehlt = anker.filter((z) => fehlt(befund, z) && befund[z] !== 'x' && !implant)
  if (ankerFehlt.length)
    return { status: 'rueckfrage', grund: 'pfeiler_fehlt', zaehne: ankerFehlt, frage: `Laut Befund ${ankerFehlt.length > 1 ? 'fehlen' : 'fehlt'} ${liste(ankerFehlt)}. Auf welchen Zähnen soll die Brücke stattdessen verankert sein?` }
  const stehen = glieder.filter((z) => z in befund && !fehlt(befund, z) && befund[z] !== 'i')
  if (stehen.length)
    return { status: 'rueckfrage', grund: 'glied_vorhanden', zaehne: stehen, frage: `Laut Befund ${stehen.length > 1 ? 'sind' : 'ist'} ${liste(stehen)} noch vorhanden. Soll ich ${stehen.length > 1 ? 'sie' : 'ihn'} als zu entfernen planen? Dann sagen Sie zum Beispiel: ${stehen[0]} wird entfernt.` }
  for (const z of glieder) if (!(z in befund)) befund[z] = 'f'
  const keramik = !!(auftrag.werkstoff && WERKSTOFFE[auftrag.werkstoff].art === 'keramik')
  const vollverblendet = auftrag.verblendung === 'voll'
  if (implant) {
    for (const z of anker) {
      if (!(z in befund)) befund[z] = 'f'
      tp[z] = implantKrone(auftrag)
    }
    for (const z of glieder) tp[z] = implantGlied(auftrag)
    const region = ['14', '16', '13', '23'].every((z) => anker.includes(z)) || ['44', '46', '43', '33'].every((z) => anker.includes(z))
    if (region && !hinweise.some((h) => h.startsWith('Brücken je Kiefer')))
      hinweise.push('Brücken je Kiefer von 4 auf 6 beidseits und von 3 auf 3. Die Siebener liegen außerhalb der Brücken und werden nicht ersetzt.')
    if (vollverblendet && auftrag.form === 'vollanatomisch' && !hinweise.some((h) => h.startsWith('Vollverblendung auf dem Zirkon')))
      hinweise.push('Vollverblendung auf dem Zirkon: keramische Verblendung (BEB 2612), nicht die unverblendete Vollanatomie.')
  } else if (vollverblendet || (keramik && auftrag.form !== 'vollanatomisch')) {
    for (const z of anker) tp[z] = 'KM'
    for (const z of glieder) tp[z] = 'BM'
  } else if (auftrag.form === 'vollanatomisch') {
    for (const z of anker) tp[z] = 'ZA'
    for (const z of glieder) tp[z] = 'ZAB'
  } else if (keramik) {
    for (const z of anker) tp[z] = 'KM'
    for (const z of glieder) tp[z] = 'BM'
  }
  return undefined
}

const keramikAuftrag = (a: HkpAuftrag) => !!(a.werkstoff && WERKSTOFFE[a.werkstoff].art === 'keramik')

/** Implantatkrone: 2200, als Brückenanker 5000. Eine genannte Vollverblendung geht vor der unverblendeten Vollanatomie. */
function implantKrone(a: HkpAuftrag) {
  if (a.verblendung === 'voll') return 'SKM'
  if (a.form === 'vollanatomisch') return 'ZAS'
  if (keramikAuftrag(a)) return 'SKM'
  if (a.verblendung === 'teil' || a.verblendung === 'vestibulaer') return 'SKV'
  return 'SK'
}

function implantGlied(a: HkpAuftrag) {
  if (a.verblendung === 'voll') return 'SBM'
  if (a.form === 'vollanatomisch') return 'ZAB'
  if (keramikAuftrag(a)) return 'SBM'
  return 'SB'
}

/** Implantatkronen (TP SK) auf fehlenden Zähnen; ein laut Befund stehender Zahn muss erst als „wird entfernt“ genannt sein */
function implantatPlanen(auftrag: HkpAuftrag, befund: Befund, tp: Record<string, string>): Rueckfrage | undefined {
  const sitze = auftrag.pfeiler
  if (!sitze.length) return { status: 'rueckfrage', grund: 'pfeiler', frage: 'Auf welche Zähne sollen die Implantatkronen – zum Beispiel auf 14 und 15?' }
  const stehen = sitze.filter((z) => zahnStehtNoch(befund, z))
  if (stehen.length)
    return { status: 'rueckfrage', grund: 'zahn_vorhanden', zaehne: stehen, frage: `Laut Befund ${stehen.length > 1 ? 'sind' : 'ist'} ${liste(stehen)} noch vorhanden. ${stehen.length > 1 ? 'Werden sie' : 'Wird er'} vorher entfernt? Dann sagen Sie zum Beispiel: ${stehen[0]} wird entfernt.` }
  for (const z of sitze) {
    if (!(z in befund)) befund[z] = 'f'
    tp[z] = implantKrone(auftrag)
  }
  return undefined
}

function kieferPlanen(auftrag: HkpAuftrag, kiefer: Kiefer, befund: Befund, tp: Record<string, string>, hinweise: string[]): Rueckfrage | undefined {
  const name = kiefer === 'OK' ? 'Oberkiefer' : 'Unterkiefer'
  {
    const reihe = REIHE[kiefer]
    const unbekannt = reihe.filter((z) => !(z in befund) && !istWeisheitszahn(z))
    if (unbekannt.length === reihe.filter((z) => !istWeisheitszahn(z)).length) {
      if (auftrag.versorgung !== 'totalprothese')
        return { status: 'rueckfrage', grund: 'befund_fehlt', frage: `Für den ${name} habe ich keinen Befund. Welche Zähne fehlen dort?` }
      for (const z of reihe) befund[z] = 'f'
      hinweise.push(`${name}: kein Befund genannt – für die Totalprothese als zahnlos angenommen.`)
      unbekannt.length = 0
    }
    const ankerVersorgung = auftrag.versorgung === 'teleskopprothese' || auftrag.versorgung === 'locator' || auftrag.versorgung === 'steg'
    const pfeiler = ankerVersorgung ? auftrag.pfeiler.filter((z) => kieferVon(z) === kiefer) : []
    if (ankerVersorgung && !pfeiler.length) {
      const was = auftrag.versorgung === 'locator' ? 'die Druckknöpfe oder Kugelköpfe' : auftrag.versorgung === 'steg' ? 'der Implantatsteg' : 'die Teleskope'
      return { status: 'rueckfrage', grund: 'pfeiler', frage: `Auf welchen Zähnen oder Implantaten soll ${was} sitzen?` }
    }
    const aufImplantat = auftrag.versorgung === 'locator' || auftrag.versorgung === 'steg' || !!auftrag.aufImplantat
    if (aufImplantat && pfeiler.length) {
      const stehen = pfeiler.filter((z) => z in befund && !fehlt(befund, z))
      if (stehen.length)
        return { status: 'rueckfrage', grund: 'zahn_vorhanden', zaehne: stehen, frage: `Laut Befund ${stehen.length > 1 ? 'sind' : 'ist'} ${liste(stehen)} noch vorhanden. ${stehen.length > 1 ? 'Werden sie' : 'Wird er'} vorher entfernt? Dann sagen Sie zum Beispiel: ${stehen[0]} wird entfernt.` }
      for (const z of pfeiler) if (!(z in befund)) befund[z] = 'f'
    } else {
      const ohnePfeiler = pfeiler.filter((z) => fehlt(befund, z))
      if (ohnePfeiler.length)
        return { status: 'rueckfrage', grund: 'pfeiler_fehlt', zaehne: ohnePfeiler, frage: `Laut Befund ${ohnePfeiler.length > 1 ? 'fehlen' : 'fehlt'} ${liste(ohnePfeiler)}. Auf welchen Zähnen sollen die Teleskope stattdessen sitzen?` }
    }
    // Nackte Implantate sind keine Restzähne. sk bleibt liegen, R und TP leer. skw/st bleiben eine Rückfrage.
    const nackt = reihe.filter((z) => implantatOhneAufbau(befund[z]) && !pfeiler.includes(z))
    const kronen = reihe.filter((z) => implantatkroneIntakt(befund[z]) && !pfeiler.includes(z))
    const offen = reihe.filter((z) => !istWeisheitszahn(z) && z in befund && !fehlt(befund, z) && !nackt.includes(z) && !kronen.includes(z) && !pfeiler.includes(z) && !auftrag.erhalten.includes(z))
    const deckend = auftrag.coverDenture || auftrag.versorgung === 'totalprothese' || auftrag.versorgung === 'locator' || auftrag.versorgung === 'steg'
    if (deckend && offen.length)
      return { status: 'rueckfrage', grund: 'restzaehne', zaehne: offen, frage: `Im ${kiefer === 'OK' ? 'Oberkiefer' : 'Unterkiefer'} ${offen.length > 1 ? 'stehen' : 'steht'} noch ${liste(offen)}. ${offen.length > 1 ? 'Sollen die' : 'Soll er'} erhalten bleiben oder entfernt werden?` }
    if (unbekannt.length) hinweise.push(`Kein Befund für ${liste(unbekannt)} – als vorhanden angenommen.`)
    const achter = reihe.filter((z) => istWeisheitszahn(z) && !(z in befund))
    for (const z of achter) befund[z] = 'f'
    if (achter.length) hinweise.push(`${liste(achter)} nicht genannt – als fehlend angenommen.`)
    const keramikTel = keramikAuftrag(auftrag)
    const bogen = pfeiler.map((z) => reihe.indexOf(z)).filter((i) => i >= 0)
    const von = bogen.length ? Math.min(...bogen) : -1
    const bis = bogen.length ? Math.max(...bogen) : -1
    for (const z of pfeiler) tp[z] = ankerKuerzel(auftrag, z, keramikTel)
    for (const z of reihe) {
      if (pfeiler.includes(z) || (!fehlt(befund, z) && !nackt.includes(z))) continue
      if (istWeisheitszahn(z) && !auftrag.mitAchtern) continue
      const i = reihe.indexOf(z)
      tp[z] = auftrag.versorgung === 'steg' && i > von && i < bis ? 'SEO' : 'E'
    }
    if (nackt.length && (auftrag.versorgung === 'totalprothese' || auftrag.coverDenture))
      hinweise.push(`${name}: Implantate an ${liste(nackt)} ohne Suprakonstruktion bleiben liegen und gelten für die Prothese wie fehlende Zähne.`)
    if (kronen.length) hinweise.push(`${name}: Implantatkronen an ${liste(kronen)} sind intakt (sk). In Zeile R und TP bleibt das Feld leer.`)
    if (auftrag.versorgung === 'locator') hinweise.push(`${auftrag.anker === 'kugel' ? 'Kugelkopfanker' : 'Druckknopfanker'} angenommen: GOZ 5030 je Implantat und GOZ 5080 je Verbindungselement, Matrize und Patrize zusammen.`)
    if (auftrag.versorgung === 'steg') hinweise.push('Implantatsteg angenommen: je Spanne eine Stegverbindung, je Implantat eine Kappe zur Aufnahme des Stegs.')
    if (keramikTel && auftrag.versorgung === 'teleskopprothese') hinweise.push('Zirkon-Primärteleskop angenommen: Teleskopkrone plus Zuschlag für Keramik, das Sekundärteil bleibt das Teleskop.')
    if (auftrag.coverDenture) hinweise.push('Cover-Denture: gaumen- bzw. schleimhautgetragene Deckprothese auf den Teleskopen. Metallbasis (Befund 4.5) nur bei Notwendigkeit ankreuzen.')
  }
  return undefined
}

function ankerKuerzel(a: HkpAuftrag, z: string, keramikTel: boolean) {
  if (a.versorgung === 'locator' || a.versorgung === 'steg') return 'SO'
  if (a.sekundaer) return a.verblendung === 'voll' ? 'T2M' : a.verblendung === 'keine' ? 'T2' : imVerblendbereich(z) ? 'T2V' : 'T2'
  if (keramikTel) return `${a.aufImplantat ? 'STZ' : 'TZ'}${a.verblendung === 'voll' ? 'V' : ''}`
  if (a.aufImplantat) return a.verblendung === 'voll' ? 'STM' : a.verblendung === 'keine' ? 'ST' : imVerblendbereich(z) ? 'STV' : 'ST'
  if (a.verblendung === 'voll') return 'TM'
  if (a.verblendung === 'keine') return 'T'
  return imVerblendbereich(z) ? 'TV' : 'T'
}

function kronenKuerzel(a: HkpAuftrag) {
  const keramik = keramikAuftrag(a)
  if (a.kronenart === 'veneer') return 'VE'
  if (a.kronenart === 'teilkrone' || a.kronenart === 'tabletop') return keramik ? 'PKM' : 'PK'
  if (a.kronenart === 'galvano') return 'K'
  if (a.form === 'vollanatomisch') return 'ZA'
  if (keramik) return 'KM'
  return undefined
}

function kronenPlanen(auftrag: HkpAuftrag, befund: Befund, tp: Record<string, string>): Rueckfrage | undefined {
  const kronen = auftrag.pfeiler
  if (!kronen.length) return { status: 'rueckfrage', grund: 'pfeiler', frage: 'Welche Zähne sollen überkront werden?' }
  const sonder = !!(auftrag.kronenart || auftrag.form === 'vollanatomisch')
  if (sonder) {
    const weg = kronen.filter((z) => fehlt(befund, z))
    if (weg.length)
      return { status: 'rueckfrage', grund: 'zahn_vorhanden', zaehne: weg, frage: `${liste(weg)} ${weg.length > 1 ? 'fehlen' : 'fehlt'}. Eine Krone, ein Tabletop oder ein Veneer braucht den Zahn.` }
    for (const z of kronen) if (!(z in befund)) befund[z] = ''
  } else {
    const ohneBefund = kronen.filter((z) => !KRONE_NOETIG.has(befund[z] ?? ''))
    if (ohneBefund.length)
      return { status: 'rueckfrage', grund: 'krone_befund', zaehne: ohneBefund, frage: `Für ${liste(ohneBefund)} steht im Befund keine Kronenbedürftigkeit. Ist ${ohneBefund.length > 1 ? 'sie' : 'er'} überkronungsbedürftig oder ist die Krone erneuerungsbedürftig?` }
  }
  for (const z of kronen) {
    const k = kronenKuerzel(auftrag)
    if (k) tp[z] = k
  }
  return undefined
}

function inlayPlanen(auftrag: HkpAuftrag, befund: Befund, tp: Record<string, string>, hinweise: string[]): Rueckfrage | undefined {
  const zs = auftrag.pfeiler
  if (!zs.length) return { status: 'rueckfrage', grund: 'pfeiler', frage: 'Auf welchen Zähnen soll das Inlay oder Onlay sitzen?' }
  const weg = zs.filter((z) => fehlt(befund, z))
  if (weg.length)
    return { status: 'rueckfrage', grund: 'zahn_vorhanden', zaehne: weg, frage: `${liste(weg)} ${weg.length > 1 ? 'fehlen' : 'fehlt'}. Ein Inlay oder Onlay braucht den Zahn.` }
  const keramik = keramikAuftrag(auftrag)
  const fl = auftrag.flaechen ?? 2
  for (const z of zs) {
    if (!(z in befund)) befund[z] = ''
    tp[z] = auftrag.kronenart === 'onlay' ? (keramik ? 'ONK' : 'ON') : `${keramik ? 'C' : 'I'}${fl}`
  }
  if (auftrag.kronenart === 'onlay') hinweise.push('Onlay mehrflächig nach GOZ 2170 angenommen. Deckt es Höcker, ist es eine Teilkrone nach GOZ 2220 – dann Teilkrone sagen.')
  else if (!auftrag.flaechenGenannt) hinweise.push('Flächen nicht genannt, zweiflächig angenommen (GOZ 2160).')
  return undefined
}

const zahnFrage = (zs: string[]) => zs.length > 1
  ? `Die Zähne ${liste(zs)} stehen noch. Werden sie vorher entfernt?`
  : `Der Zahn ${zs[0]} steht noch. Wird er vorher entfernt?`

/** Festsitzende Ganzkieferbrücke auf 4 oder 6 Implantaten. Ohne genannte Sitze gelten die üblichen Positionen. */
function allonPlanen(auftrag: HkpAuftrag, befund: Befund, tp: Record<string, string>, hinweise: string[]): Rueckfrage | undefined {
  const kiefer = auftrag.kiefer
  if (!kiefer) return { status: 'rueckfrage', grund: 'kiefer', frage: 'All-on-4 oder All-on-6 – für welchen Kiefer?' }
  const n = auftrag.allon ?? 4
  const name = kiefer === 'OK' ? 'Oberkiefer' : 'Unterkiefer'
  const reihe = REIHE[kiefer]
  const genannt = auftrag.pfeiler.filter((z) => kieferVon(z) === kiefer)
  // All-on-6 bleibt sechs Implantate, auch wenn nur ein Teil der Sitze schon genannt ist.
  let sitze = genannt.length && genannt.length < n
    ? [...new Set([...ALLON_SITZ[n][kiefer], ...genannt])]
    : genannt.length >= n ? [...genannt] : [...ALLON_SITZ[n][kiefer]]
  if (genannt.length) sitze.sort((a, b) => reihe.indexOf(a) - reihe.indexOf(b))
  if (!genannt.length) hinweise.push(`All-on-${n} ${name}: übliche Implantatpositionen ${sitze.join(', ')} angenommen.`)
  const unbekannt = reihe.filter((z) => !(z in befund) && !istWeisheitszahn(z))
  if (unbekannt.length === reihe.filter((z) => !istWeisheitszahn(z)).length) {
    for (const z of reihe) befund[z] = 'f'
    hinweise.push(`${name}: kein Befund genannt – für All-on-${n} als zahnlos angenommen.`)
  }
  const enden = () => sitze.map((z) => reihe.indexOf(z)).filter((i) => i >= 0)
  let [von, bis] = [Math.min(...enden()), Math.max(...enden())]
  for (const z of reihe.slice(von, bis + 1)) if (implantatBleibt(befund[z] ?? '') && !sitze.includes(z)) sitze.push(z)
  sitze.sort((a, b) => reihe.indexOf(a) - reihe.indexOf(b))
  ;[von, bis] = [Math.min(...enden()), Math.max(...enden())]
  const imBogen = reihe.slice(von, bis + 1)
  const glieder = imBogen.filter((z) => !sitze.includes(z))
  const voraus = `All-on-${n} im ${name} ist eine festsitzende Brücke auf ${n === 6 ? 'sechs' : 'vier'} Implantaten. Dafür muss der Kiefer zahnlos sein.`
  const stehen = reihe.filter((z) => imBogen.includes(z) && zahnStehtNoch(befund, z))
  if (stehen.length)
    return { status: 'rueckfrage', grund: sitze.some((z) => stehen.includes(z)) ? 'zahn_vorhanden' : 'glied_vorhanden', zaehne: stehen, frage: `${voraus} ${zahnFrage(stehen)}` }
  const aussen = reihe.filter((z) => !imBogen.includes(z) && !istWeisheitszahn(z) && zahnStehtNoch(befund, z))
  if (aussen.length)
    return { status: 'rueckfrage', grund: 'restzaehne', zaehne: aussen, frage: `${voraus} ${zahnFrage(aussen)} Hinter dem letzten Implantat setze ich keine Freiendglieder.` }
  const bestehend = sitze.filter((z) => implantatBleibt(befund[z] ?? ''))
  const implantAussen = reihe.filter((z) => !sitze.includes(z) && implantatBleibt(befund[z] ?? ''))
  for (const z of reihe) {
    const k = (befund[z] ?? '').trim().toLowerCase()
    if (implantatBleibt(k) && k !== 'i') befund[z] = 'i'
    else if (k === 'ix') befund[z] = 'f'
  }
  if (bestehend.length) hinweise.push(`${name}: die Implantate an ${liste(bestehend)} bleiben. Die All-on-${n} sitzt darauf.`)
  if (implantAussen.length) hinweise.push(`${name}: Implantate an ${liste(implantAussen)} liegen außerhalb der All-on-${n} und bleiben.`)
  for (const z of sitze) {
    if (!(z in befund)) befund[z] = 'f'
    tp[z] = implantKrone(auftrag)
  }
  for (const z of glieder) {
    if (!(z in befund)) befund[z] = 'f'
    tp[z] = implantGlied(auftrag)
  }
  const distal: string[] = []
  for (const z of reihe) {
    if (tp[z]) continue
    if (!(z in befund)) befund[z] = 'f'
    tp[z] = ')('
    if (!istWeisheitszahn(z)) distal.push(z)
  }
  if (distal.length) hinweise.push(`All-on-${n}: hinter dem letzten Implantat keine Freiendglieder – ${liste(distal)} werden nicht ersetzt.`)
  hinweise.push(`All-on-${n} angenommen: festsitzende implantatgetragene Brücke, je Implantat ein Anker und je Spanne ein Brückenglied. Der Festzuschuss folgt dem Befund des zahnlosen Kiefers.`)
  return undefined
}

function planRechnen(auftrag: HkpAuftrag, teile: HkpAuftrag[], befund: Befund, tp: Record<string, string>, hinweise: string[], optionen: PlanOptionen): PlanErgebnis {
  const plan = leererPlan()
  plan.patient = { ...plan.patient, ...optionen.patient }
  for (const [z, b] of Object.entries(befund)) if (plan.zaehne[z]) plan.zaehne[z].B = b
  for (const [z, t] of Object.entries(tp)) plan.zaehne[z].TP = t
  plan.abformung = auftrag.abformung ?? optionen.abformung ?? 'abdruck'
  if (!auftrag.abformung && !optionen.abformung) hinweise.push('Abformung nicht genannt – konventioneller Abdruck angenommen.')
  if (teile.some((x) => x.versorgung === 'teleskopprothese' || x.versorgung === 'locator' || x.versorgung === 'steg')) plan.abformungProthese = plan.abformung
  const bonus = auftrag.bonus ?? optionen.bonus
  plan.zuschuss = { bonus: bonus ?? '60', haertefall: !!(auftrag.haertefall ?? optionen.haertefall) }
  if (!bonus) hinweise.push('Bonus nicht bekannt – 60 % angenommen.')
  const labor = auftrag.labor ?? optionen.labor
  plan.einstellungen = {
    ...plan.einstellungen,
    ...optionen.einstellungen,
    ...(labor ? { labor } : {}),
    ...(optionen.kzv ? { kzv: optionen.kzv } : {}),
    ...(optionen.praxisPlz ? { praxisPlz: optionen.praxisPlz } : {}),
  }
  const system = auftrag.implantatSystem ?? optionen.implantatSystem
  const abutment = auftrag.abutment ?? (auftrag.retention === 'verschraubt' ? 'individuell' : auftrag.retention === 'zementiert' ? 'standard' : undefined)
  if (system || abutment || (auftrag.loeffel && plan.abformung !== 'scan')) {
    plan.implantat = {
      ...plan.implantat,
      ...(system ? { system } : {}),
      ...(abutment ? { abutment } : {}),
      ...(auftrag.loeffel && plan.abformung !== 'scan' ? { abformung: auftrag.loeffel } : {}),
    }
  }
  const haltung = [
    auftrag.retention === 'verschraubt' ? 'verschraubte' : auftrag.retention === 'zementiert' ? 'zementierte' : '',
    auftrag.form === 'vollanatomisch' && auftrag.versorgung !== 'kronen' && auftrag.versorgung !== 'bruecke' ? 'vollanatomische' : '',
  ].filter(Boolean).join(' ')
  const ankerGesagt = auftrag.allon ? `All-on-${auftrag.allon}`
    : auftrag.anker === 'kugel' ? 'Kugelkopfanker'
      : auftrag.versorgung === 'locator' ? (/locator|novaloc|equator/i.test(auftrag.text) ? 'Locator' : 'Druckknopfanker')
        : auftrag.versorgung === 'steg' ? 'Implantatsteg'
          : auftrag.kronenart === 'galvano' && auftrag.versorgung === 'teleskopprothese' ? 'Galvanoteleskope'
            : keramikAuftrag(auftrag) && auftrag.versorgung === 'teleskopprothese' ? 'Zirkon-Primärteleskope'
              : undefined
  const kronenArt = auftrag.kronenart === 'inlay' ? (keramikAuftrag(auftrag) ? 'Keramikinlays' : 'Inlays')
    : auftrag.kronenart === 'onlay' ? 'Onlays'
      : auftrag.kronenart === 'tabletop' ? 'Tabletops'
        : auftrag.kronenart === 'teilkrone' ? 'Teilkronen'
          : auftrag.kronenart === 'veneer' ? 'Veneers'
            : auftrag.kronenart === 'galvano' && auftrag.versorgung !== 'teleskopprothese' ? 'Galvanokronen'
              : auftrag.form === 'vollanatomisch' && (auftrag.versorgung === 'kronen' || auftrag.versorgung === 'bruecke') ? 'vollanatomische Zirkonkronen'
                : undefined
  const abutmentWort = auftrag.abutment === 'keramik' ? 'mit Keramikabutment'
    : auftrag.abutment === 'individuell' ? 'mit individuellem Abutment'
      : auftrag.abutment === 'standard' ? 'mit konfektioniertem Abutment'
        : undefined
  plan.einstellungen = {
    ...plan.einstellungen,
    ...(ankerGesagt ? { ankerGesagt } : {}),
    ...(haltung ? { haltung } : {}),
    ...(kronenArt ? { kronenArt } : {}),
    ...(abutmentWort ? { abutmentWort } : {}),
  }
  if (auftrag.retention === 'verschraubt') {
    const welches = auftrag.abutment === 'keramik' ? 'Keramikabutment auf Ti-Base (BEB 6906)' : auftrag.abutment === 'standard' ? 'konfektioniertes Abutment (BEB 4421)' : 'individuelles Abutment auf Ti-Base (BEB 2033)'
    hinweise.push(`Verschraubt angenommen: Verschraubung und Schraubenkanal sind in der Kronenposition enthalten. ${welches}.`)
  } else if (auftrag.retention === 'zementiert') {
    const welches = auftrag.abutment === 'keramik' ? 'Keramikabutment (BEB 6906)' : auftrag.abutment === 'individuell' ? 'individuelles Abutment (BEB 2033)' : 'konfektioniertes Abutment (BEB 4421)'
    hinweise.push(`Zementiert angenommen: das Zementieren ist in der Kronenposition enthalten. ${welches}.`)
  } else if (auftrag.abutment) {
    hinweise.push(auftrag.abutment === 'keramik' ? 'Keramikabutment angenommen (BEB 6906 auf Ti-Base).' : auftrag.abutment === 'individuell' ? 'Individuelles Abutment angenommen (BEB 2033 auf Ti-Base).' : 'Konfektioniertes Abutment angenommen (BEB 4421).')
  }
  if (auftrag.kronenart === 'galvano') hinweise.push('Galvano angenommen: die Laborliste hat keine eigene Galvanoposition. Gerechnet wird die metallische Krone oder das Teleskop in Hochgold.')
  if (auftrag.kronenart === 'tabletop') hinweise.push('Tabletop als Teilkrone angenommen (GOZ 2220).')

  const prothese = (t: HkpAuftrag) => t.versorgung === 'totalprothese'
  plan.weitere = {
    ...plan.weitere,
    interimOK: teile.some((t) => !!t.interim && t.kiefer === 'OK' && prothese(t)),
    interimUK: teile.some((t) => !!t.interim && t.kiefer === 'UK' && prothese(t)),
    immediatOK: teile.some((t) => !!t.immediat && t.kiefer === 'OK' && prothese(t)),
    immediatUK: teile.some((t) => !!t.immediat && t.kiefer === 'UK' && prothese(t)),
  }
  const geplant = new Set<Kiefer>()
  for (const t of teile) if (t.kiefer) geplant.add(t.kiefer)
  if (!geplant.size) for (const z of Object.keys(tp)) geplant.add(kieferVon(z))
  const regelOpt = { ...regelOptionen(plan), ...(geplant.size ? { nurKiefer: [...geplant] } : {}) }
  const regel = therapieAnwenden(regelversorgungErmitteln(plan.zaehne, regelOpt), plan.zaehne, plan)
  let fertig = regelUebernehmen(plan, regel)
  hinweise.push(...regel.hinweise)
  if (auftrag.verblendung) {
    fertig = {
      ...fertig,
      zaehne: zaehneFuerVerblendung(fertig, auftrag.verblendung, auftrag.werkstoff),
      einstellungen: { ...fertig.einstellungen, verblendung: auftrag.verblendung },
    }
    const regel2 = therapieAnwenden(regelversorgungErmitteln(fertig.zaehne, { ...regelOptionen(fertig), ...regelOpt }), fertig.zaehne, fertig)
    fertig = regelUebernehmen(fertig, regel2)
    for (const h of regel2.hinweise) if (!hinweise.includes(h)) hinweise.push(h)
  }
  const stufe = auftrag.privatStufe ?? optionen.privatStufe ?? 0
  if (stufe > 0 && fertig.einstellungen.labor === 'praxis') {
    const r = privatStufeAnwenden(fertig, stufe)
    fertig = r.plan
    hinweise.push(...r.hinweise)
  } else if (stufe > 0) hinweise.push('Die Stufe „Kasse → Privat“ gibt es nur im Eigenlabor – im Fremdlabor nicht angewendet.')
  if (auftrag.werkstoff) {
    const art = WERKSTOFFE[auftrag.werkstoff].art
    const einheiten = kronenEinheiten(fertig.positionen)
    const passend = einheiten.filter((e) => WERKSTOFFE_FUER[e.art].includes(auftrag.werkstoff!))
    fertig.werkstoffe = Object.fromEntries(passend.map((e) => [e.zahn, auftrag.werkstoff!]))
    const andere = einheiten.filter((e) => e.art !== art).map((e) => e.zahn)
    if (andere.length) hinweise.push(`${WERKSTOFFE[auftrag.werkstoff].kurz} passt nicht zu ${liste(andere)} – dort Standardmaterial angenommen.`)
  }
  return { status: 'ok', plan: fertig, auftrag, hinweise }
}
