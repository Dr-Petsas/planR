/**
 * Gesprochener HKP-Auftrag → Plan. Deterministisch (kein LLM): Satz verstehen, gegen den Befund prüfen,
 * Therapiezeile setzen und mit der Regelengine rechnen. Was nicht eindeutig ist, wird als Rückfrage
 * zurückgegeben – es wird nie ein Befund erfunden.
 */
import type { Abformung, HkpPlan } from '../types'
import { leererPlan } from '../store/plan'
import { regelOptionen, regelversorgungErmitteln, therapieAnwenden } from './regeln'
import { regelUebernehmen } from './aufwertung'
import { FEHLEND, KRONE_NOETIG, OBERKIEFER, UNTERKIEFER, imVerblendbereich, istWeisheitszahn, kieferVon } from './zahnschema'
import { WERKSTOFFE, WERKSTOFFE_FUER, kronenEinheiten, type Werkstoff } from './material'

export type Versorgung = 'teleskopprothese' | 'totalprothese' | 'kronen' | 'bruecke' | 'implantatkronen'
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
  abformung?: Exclude<Abformung, ''>
  werkstoff?: Werkstoff
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

const norm = (t: string) => ` ${kieferWorte(t.toLowerCase().replace(/[‐–—]/g, '-')).replace(/\s+/g, ' ')} `

function kieferIn(t: string): Kiefer | undefined {
  const ok = /\b(ok|o\.k\.|oberkiefer|oben)\b/.test(t)
  const uk = /\b(uk|u\.k\.|unterkiefer|unten)\b/.test(t)
  return ok && !uk ? 'OK' : uk && !ok ? 'UK' : undefined
}

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

function versorgungIn(t: string, coverDenture: boolean): Versorgung | undefined {
  if (/teleskop|konus|doppelkrone/.test(t) || coverDenture) return 'teleskopprothese'
  if (/totalprothese|vollprothese|totale/.test(t)) return 'totalprothese'
  if (/br(ü|ue)cke/.test(t)) return 'bruecke'
  if (/implantat/.test(t)) return 'implantatkronen'
  if (/krone/.test(t)) return 'kronen'
  return undefined
}

export function auftragVerstehen(text: string): HkpAuftrag {
  const auftrag = einzelAuftrag(text)
  const abschnitte = kieferAbschnitte(text)
  const beide = BEIDE_KIEFER.test(norm(text))
  if (abschnitte.length < 2 && !(beide && auftrag.versorgung === 'totalprothese')) return auftrag
  const roh = abschnitte.map((a) => ({ ...einzelAuftrag(a.text), kiefer: a.kiefer }))
  // Abschnitt nur mit Kiefer-Wort („… im Oberkiefer und Unterkiefer“) erbt die Versorgung des Nachbarn –
  // nicht, wenn dort ein Befund steht („unten bleibt alles“).
  roh.forEach((x, i) => {
    if (x.versorgung || /bleib|erhalt|vorhanden|fehl|nichts|kein|gesund|intakt/.test(norm(abschnitte[i].text))) return
    const nachbar = roh.slice(0, i).reverse().find((y) => y.versorgung) ?? roh.slice(i + 1).find((y) => y.versorgung)
    if (nachbar?.versorgung) x.versorgung = nachbar.versorgung
  })
  if (beide && auftrag.versorgung === 'totalprothese')
    for (const k of ['OK', 'UK'] as const)
      if (!roh.some((x) => x.kiefer === k && x.versorgung)) roh.push({ ...einzelAuftrag(text), kiefer: k, versorgung: 'totalprothese', pfeiler: [] })
  const teile = roh
    .filter((x) => x.versorgung && x.versorgung !== 'kronen' && x.versorgung !== 'implantatkronen')
    .filter((x, i, alle) => alle.findIndex((y) => y.kiefer === x.kiefer) === i)
  const kiefer = new Set(teile.map((x) => x.kiefer))
  if (!teile.length) return auftrag
  for (const x of teile) x.pfeiler = x.pfeiler.filter((z) => kieferVon(z) === x.kiefer)
  if (kiefer.size === 1) return { ...auftrag, ...teile[0], text, bonus: auftrag.bonus, haertefall: auftrag.haertefall }
  return { ...auftrag, versorgung: teile[0].versorgung, kiefer: undefined, teile,
    pfeiler: teile.flatMap((x) => x.pfeiler), coverDenture: teile.some((x) => x.coverDenture) }
}

function einzelAuftrag(text: string): HkpAuftrag {
  const t = norm(text)
  const auftrag: HkpAuftrag = {
    text, pfeiler: [], entfernen: [], erhalten: [],
    coverDenture: /co?ver.?dent|kover.?dent|deckprothese/.test(t),
    mitAchtern: /(mit|inklusive|inkl\.?|samt) (den )?achter/.test(t),
  }
  auftrag.versorgung = versorgungIn(t, auftrag.coverDenture)
  auftrag.kiefer = kieferIn(t)
  const nummern = [...t.matchAll(FDI)].map((m) => kieferVon(m[1]))
  if (!auftrag.kiefer && nummern.length && nummern.every((k) => k === nummern[0])) auftrag.kiefer = nummern[0]
  if (/scan|intraoral|gescannt|digital/.test(t)) auftrag.abformung = 'scan'
  else if (/abdruck|konventionell|abform/.test(t)) auftrag.abformung = 'abdruck'
  if (/hochgold/.test(t)) auftrag.werkstoff = 'hochgold'
  else if (/gold ?reduziert|reduzierte?s? gold|edelmetallreduziert/.test(t)) auftrag.werkstoff = 'goldreduziert'
  else if (/\bgold/.test(t)) auftrag.werkstoff = 'hochgold'
  else if (/\bnem\b|nichtedel|kobalt|chrom/.test(t)) auftrag.werkstoff = 'nem'
  else if (/zirkon/.test(t)) auftrag.werkstoff = 'zirkon'
  else if (/press(keramik)?|e\.?max press/.test(t)) auftrag.werkstoff = 'presskeramik'
  else if (/lithium|e\.?max|cad-?block/.test(t)) auftrag.werkstoff = 'lithiumdisilikat'

  if (/h(ä|ae)rtefall/.test(t)) auftrag.haertefall = true
  if (/(kein|ohne)(en)? bonus/.test(t)) auftrag.bonus = '60'
  else if (/\b(75|fünfundsiebzig|fuenfundsiebzig) ?(%|prozent)|\b(30|dreißig|dreissig) ?(%|prozent) bonus|bonus (von )?(30|dreißig|dreissig)\b|zehn jahre bonus|bonus (über |ueber )?zehn jahre/.test(t)) auftrag.bonus = '75'
  else if (/\b(70|siebzig) ?(%|prozent)|\b(20|zwanzig) ?(%|prozent) bonus|bonus (von )?(20|zwanzig)\b|fünf jahre bonus|fuenf jahre bonus|bonusheft/.test(t)) auftrag.bonus = '70'
  else if (/\b(60|sechzig) ?(%|prozent)/.test(t)) auftrag.bonus = '60'

  const alleTeile = satzteile(text)
  let pfeilerDavor = false
  alleTeile.forEach((teil, i) => {
    const zs = zaehneIn(teil, auftrag.kiefer)
    if (!zs.length) return
    if (NUR_ZAEHNE.test(teil)) {
      // „Teleskope auf 13, 23 und 14“: Aufzählung setzt die Pfeiler fort – außer „…, 34, 35 fehlen“
      const weiter = alleTeile.slice(i + 1).find((u) => !NUR_ZAEHNE.test(u))
      if (pfeilerDavor && !(weiter && BEFUND_WORTE.some(([re]) => re.test(weiter))))
        auftrag.pfeiler.push(...zs.filter((z) => !auftrag.pfeiler.includes(z)))
      return
    }
    pfeilerDavor = false
    if (/entfern|extrah|ziehen|gezogen|raus/.test(teil)) auftrag.entfernen.push(...zs)
    else if (/bleib|erhalt|behalt|stehen/.test(teil)) auftrag.erhalten.push(...zs)
    else if (/teleskop|konus|doppelkrone|pfeiler|krone|anker|auf (den|dem|die)\b|\bauf [1-4][1-8]\b/.test(teil)) {
      // „Teleskop auf 13 und 23 ersetzte Zähne 14 …“: ab dem Befund-Wort sind es keine Pfeiler mehr
      const vorBefund = teil.split(BEFUND_BEGINN)[0]
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
function brueckeVerstehen(t: string, a: HkpAuftrag) {
  const nummern = (s: string) => [...s.matchAll(FDI)].map((m) => m[1])
  const spannen = [...t.matchAll(BRUECKEN_SPANNE)].filter((m) => kieferVon(m[1]) === kieferVon(m[2]))
  const anker: string[] = []
  for (const m of spannen) for (const z of [m[1], m[2]]) if (!anker.includes(z)) anker.push(z)
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
  const pfeiler = [...anker, ...a.pfeiler.filter((z) => !anker.includes(z))].filter((z) => !glieder.includes(z))
  if (!glieder.length && pfeiler.length === 2 && kieferVon(pfeiler[0]) === kieferVon(pfeiler[1]))
    dazu(zahnSpanne(pfeiler[0], pfeiler[1]).slice(1, -1))
  a.pfeiler = pfeiler
  a.glieder = glieder
}

const BEFUND_BEGINN = /\b(?:ersetzt\w*|(?:es )?fehl\w*|vorhanden|extrah\w*|entfern\w*)\b/

const BEFUND_WORTE: [RegExp, string][] = [
  [/nicht erhaltungsw(ü|ue)rdig|zerst(ö|oe)rt|extrah|entfern|ziehen/, 'x'],
  [/erneuerungsbed(ü|ue)rftig|krone (ist )?(kaputt|defekt|insuffizient)/, 'kw'],
  [/(ü|ue)berkronungsbed(ü|ue)rftig|krone n(ö|oe)tig|braucht? (eine )?krone|kariös|karies/, 'ww'],
  [/fehl|ohne zahn|l(ü|ue)cke|ersetzt/, 'f'],
  [/vorhanden|gesund|intakt|da\b|steh|bleib|erhalt/, ''],
]

/** Gesprochener Befund („es fehlen 15 bis 18 und 25 bis 28, 13 bis 23 vorhanden“) → eHKP-Kürzel je Zahn */
export function befundVerstehen(text: string, kiefer?: Kiefer): Befund {
  const befund: Befund = {}
  const nurKiefer = new Set<Kiefer>()
  const roh = satzteile(text)
  const genannt = roh.map((teil) => kieferIn(norm(teil)))
  /** Satzteil ohne Kiefer („die Sechser fehlen“) erbt ihn vom Nachbarn – erst davor, sonst danach */
  const kieferFuer = (i: number) =>
    genannt[i] ?? kiefer ?? genannt.slice(0, i).reverse().find(Boolean) ?? genannt.slice(i + 1).find(Boolean)
  const teile = roh.map((teil, i) => {
    const k = kieferFuer(i)
    const treffer = BEFUND_WORTE.map(([re, code]) => ({ m: re.exec(teil), code })).find((x) => x.m)
    const ersterZahn = teil.search(/\b[1-4][1-8]\b|er(n|s)?\b|front|eckz/)
    return {
      teil, k, zs: zaehneIn(teil, k), code: treffer?.code,
      /** Verb am Ende („…, die Sechser und Siebener fehlen“) gilt auch für die Satzteile davor */
      nachgestellt: !!treffer?.m && ersterZahn >= 0 && treffer.m.index > ersterZahn,
    }
  })
  let letztes: string | undefined
  teile.forEach((x, i) => {
    let code = x.code
    if (code === undefined) {
      const naechstes = teile.slice(i + 1).find((y) => y.code !== undefined)
      code = naechstes?.nachgestellt ? naechstes.code : letztes
    }
    if (ALLE_FEHLEN.test(x.teil)) {
      for (const kk of x.k ? [x.k] : (['OK', 'UK'] as Kiefer[])) for (const z of REIHE[kk]) if (!(z in befund)) befund[z] = 'f'
      return
    }
    if (code === undefined || !x.zs.length) return
    const sammelbegriff = /\bfront/.test(x.teil)
    for (const z of x.zs) if (!(sammelbegriff && z in befund)) befund[z] = code
    if (code === '' && x.k && /\bnur\b/.test(x.teil)) nurKiefer.add(x.k)
    letztes = code
  })
  for (const k of nurKiefer) for (const z of REIHE[k]) if (!(z in befund)) befund[z] = 'f'
  if (kiefer && /alle (anderen|übrigen|uebrigen|restlichen) fehlen|sonst (fehlt|fehlen) alle|rest fehlt|(anderen|übrigen|uebrigen|restlichen) z(ä|ae)hne (sind |werden )?(ersetzt|fehlen)/.test(norm(text)))
    for (const z of REIHE[kiefer]) if (!(z in befund)) befund[z] = 'f'
  return befund
}

const ALLE_FEHLEN = /\b(fehlen|fehlt) (ihm |ihr )?(schon )?alle z(ä|ae)hne\b|\balle z(ä|ae)hne (fehlen|sind (weg|raus|gezogen))\b|\bzahnlos\b|\bkeine z(ä|ae)hne mehr\b/

const VERSORGUNGS_TEIL = /prothese|teleskop|konus|doppelkrone|krone|anker|pfeiler|co?ver.?dent|kover|bonus|scan|abdruck|abform|gold|zirkon|keramik|\bnem\b|erstell|plan|hkp|kostenpl/

/** Befund-Satzteile aus einem gesprochenen Auftrag („… die Sechser und Siebener fehlen …“), sonst '' */
/** Satzteil, der nur Zähne aufzählt („die Vierer“, „Fünfer“) – sein Verb steht weiter hinten */
const NUR_ZAEHNE = /^(?:(?:die|der|den|und|sowie|auch|noch|[1-4][1-8]|\d(?:er|ern)|einser|zweier|dreier|eckz(?:ah|äh|aeh)ne?n?|vierer|f(?:ü|ue)nfer|sechser|siebe?ner|achter)n?\s*)+$/

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
  const ausTeil = (abschnitt: string) => {
    // „Teleskop auf 13 und 23 ersetzte Zähne 14“: der Befund hängt am Versorgungs-Satzteil
    const teile = satzteile(abschnitt).flatMap((t) => {
      const m = BEFUND_BEGINN.exec(t)
      return m && m.index > 0 && VERSORGUNGS_TEIL.test(t.slice(0, m.index)) && !VERSORGUNGS_TEIL.test(t.slice(m.index))
        ? [t.slice(0, m.index).trim(), t.slice(m.index)] : [t]
    })
    const istBefund = (t: string) => !VERSORGUNGS_TEIL.test(t) && BEFUND_WORTE.some(([re]) => re.test(t))
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

/** Erzeugt aus Auftrag und Befund einen gerechneten Plan – oder eine Rückfrage. */
export function planAusAuftrag(auftrag: HkpAuftrag, befundRoh: Befund, optionen: PlanOptionen = {}): PlanErgebnis | Rueckfrage {
  const befund: Befund = Object.fromEntries(Object.entries(befundRoh).map(([z, b]) => [z, (b ?? '').trim().toLowerCase()]))
  const hinweise: string[] = []

  const teile = auftrag.teile?.length ? auftrag.teile : [auftrag]
  for (const teil of teile) for (const z of teil.entfernen) befund[z] = 'x'
  for (const teil of teile) {
    if (!teil.versorgung)
      return { status: 'rueckfrage', grund: 'versorgung', frage: 'Welche Versorgung soll ich planen – zum Beispiel Teleskopprothese, Totalprothese oder Kronen?' }
    if (!teil.kiefer && !['kronen', 'bruecke', 'implantatkronen'].includes(teil.versorgung))
      return { status: 'rueckfrage', grund: 'kiefer', frage: 'Für welchen Kiefer – Oberkiefer oder Unterkiefer?' }
  }
  const nurTotal = teile.every((x) => x.versorgung === 'totalprothese')
  if (!Object.keys(befund).length && !nurTotal)
    return { status: 'rueckfrage', grund: 'befund_fehlt', frage: 'Ich habe keinen Befund. Welche Zähne fehlen, und welche sind vorhanden?' }

  const tp: Record<string, string> = {}
  for (const teil of teile) {
    const r = teil.versorgung === 'kronen'
      ? kronenPlanen(teil, befund, tp)
      : teil.versorgung === 'bruecke'
        ? brueckePlanen(teil, befund, tp)
        : teil.versorgung === 'implantatkronen'
          ? implantatPlanen(teil, befund, tp)
          : kieferPlanen(teil, teil.kiefer!, befund, tp, hinweise)
    if (r) return r
  }
  return planRechnen(auftrag, teile, befund, tp, hinweise, optionen)
}

function brueckePlanen(auftrag: HkpAuftrag, befund: Befund, tp: Record<string, string>): Rueckfrage | undefined {
  const anker = auftrag.pfeiler
  const glieder = auftrag.glieder ?? []
  if (anker.length < 2 || !glieder.length || new Set([...anker, ...glieder].map(kieferVon)).size > 1)
    return { status: 'rueckfrage', grund: 'pfeiler', frage: 'Von welchem bis zu welchem Zahn soll die Brücke gehen – zum Beispiel von 14 auf 16?' }
  const ankerFehlt = anker.filter((z) => fehlt(befund, z) && befund[z] !== 'x')
  if (ankerFehlt.length)
    return { status: 'rueckfrage', grund: 'pfeiler_fehlt', zaehne: ankerFehlt, frage: `Laut Befund ${ankerFehlt.length > 1 ? 'fehlen' : 'fehlt'} ${liste(ankerFehlt)}. Auf welchen Zähnen soll die Brücke stattdessen verankert sein?` }
  const stehen = glieder.filter((z) => z in befund && !fehlt(befund, z))
  if (stehen.length)
    return { status: 'rueckfrage', grund: 'glied_vorhanden', zaehne: stehen, frage: `Laut Befund ${stehen.length > 1 ? 'sind' : 'ist'} ${liste(stehen)} noch vorhanden. Soll ich ${stehen.length > 1 ? 'sie' : 'ihn'} als zu entfernen planen? Dann sagen Sie zum Beispiel: ${stehen[0]} wird entfernt.` }
  for (const z of glieder) if (!(z in befund)) befund[z] = 'f'
  const keramik = auftrag.werkstoff && WERKSTOFFE[auftrag.werkstoff].art === 'keramik'
  if (keramik) {
    for (const z of anker) tp[z] = 'KM'
    for (const z of glieder) tp[z] = 'BM'
  }
  return undefined
}

/** Implantatkronen (TP SK) auf fehlenden Zähnen; ein laut Befund stehender Zahn muss erst als „wird entfernt“ genannt sein */
function implantatPlanen(auftrag: HkpAuftrag, befund: Befund, tp: Record<string, string>): Rueckfrage | undefined {
  const sitze = auftrag.pfeiler
  if (!sitze.length) return { status: 'rueckfrage', grund: 'pfeiler', frage: 'Auf welche Zähne sollen die Implantatkronen – zum Beispiel auf 14 und 15?' }
  const stehen = sitze.filter((z) => z in befund && !fehlt(befund, z))
  if (stehen.length)
    return { status: 'rueckfrage', grund: 'zahn_vorhanden', zaehne: stehen, frage: `Laut Befund ${stehen.length > 1 ? 'sind' : 'ist'} ${liste(stehen)} noch vorhanden. ${stehen.length > 1 ? 'Werden sie' : 'Wird er'} vorher entfernt? Dann sagen Sie zum Beispiel: ${stehen[0]} wird entfernt.` }
  for (const z of sitze) {
    if (!(z in befund)) befund[z] = 'f'
    tp[z] = 'SK'
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
    const pfeiler = auftrag.versorgung === 'teleskopprothese' ? auftrag.pfeiler.filter((z) => kieferVon(z) === kiefer) : []
    if (auftrag.versorgung === 'teleskopprothese' && !pfeiler.length)
      return { status: 'rueckfrage', grund: 'pfeiler', frage: 'Auf welchen Zähnen sollen die Teleskope sitzen?' }
    const ohnePfeiler = pfeiler.filter((z) => fehlt(befund, z))
    if (ohnePfeiler.length)
      return { status: 'rueckfrage', grund: 'pfeiler_fehlt', zaehne: ohnePfeiler, frage: `Laut Befund ${ohnePfeiler.length > 1 ? 'fehlen' : 'fehlt'} ${liste(ohnePfeiler)}. Auf welchen Zähnen sollen die Teleskope stattdessen sitzen?` }
    const offen = reihe.filter((z) => !istWeisheitszahn(z) && z in befund && !fehlt(befund, z) && !pfeiler.includes(z) && !auftrag.erhalten.includes(z))
    const deckend = auftrag.coverDenture || auftrag.versorgung === 'totalprothese'
    if (deckend && offen.length)
      return { status: 'rueckfrage', grund: 'restzaehne', zaehne: offen, frage: `Im ${kiefer === 'OK' ? 'Oberkiefer' : 'Unterkiefer'} ${offen.length > 1 ? 'stehen' : 'steht'} noch ${liste(offen)}. ${offen.length > 1 ? 'Sollen die' : 'Soll er'} erhalten bleiben oder entfernt werden?` }
    if (unbekannt.length) hinweise.push(`Kein Befund für ${liste(unbekannt)} – als vorhanden angenommen.`)
    const achter = reihe.filter((z) => istWeisheitszahn(z) && !(z in befund))
    for (const z of achter) befund[z] = 'f'
    if (achter.length) hinweise.push(`${liste(achter)} nicht genannt – als fehlend angenommen.`)
    for (const z of pfeiler) tp[z] = imVerblendbereich(z) ? 'TV' : 'T'
    for (const z of reihe) {
      if (pfeiler.includes(z) || !fehlt(befund, z)) continue
      if (istWeisheitszahn(z) && !auftrag.mitAchtern) continue
      tp[z] = 'E'
    }
    if (auftrag.coverDenture) hinweise.push('Cover-Denture: gaumen- bzw. schleimhautgetragene Deckprothese auf den Teleskopen. Metallbasis (Befund 4.5) nur bei Notwendigkeit ankreuzen.')
  }
  return undefined
}

function kronenPlanen(auftrag: HkpAuftrag, befund: Befund, tp: Record<string, string>): Rueckfrage | undefined {
  const kronen = auftrag.pfeiler
  if (!kronen.length) return { status: 'rueckfrage', grund: 'pfeiler', frage: 'Welche Zähne sollen überkront werden?' }
  const ohneBefund = kronen.filter((z) => !KRONE_NOETIG.has(befund[z] ?? ''))
  if (ohneBefund.length)
    return { status: 'rueckfrage', grund: 'krone_befund', zaehne: ohneBefund, frage: `Für ${liste(ohneBefund)} steht im Befund keine Kronenbedürftigkeit. Ist ${ohneBefund.length > 1 ? 'sie' : 'er'} überkronungsbedürftig oder ist die Krone erneuerungsbedürftig?` }
  const keramik = auftrag.werkstoff && WERKSTOFFE[auftrag.werkstoff].art === 'keramik'
  if (keramik) for (const z of kronen) tp[z] = 'KM'
  return undefined
}

function planRechnen(auftrag: HkpAuftrag, teile: HkpAuftrag[], befund: Befund, tp: Record<string, string>, hinweise: string[], optionen: PlanOptionen): PlanErgebnis {
  const plan = leererPlan()
  plan.patient = { ...plan.patient, ...optionen.patient }
  for (const [z, b] of Object.entries(befund)) if (plan.zaehne[z]) plan.zaehne[z].B = b
  for (const [z, t] of Object.entries(tp)) plan.zaehne[z].TP = t
  plan.abformung = auftrag.abformung ?? optionen.abformung ?? 'abdruck'
  if (!auftrag.abformung && !optionen.abformung) hinweise.push('Abformung nicht genannt – konventioneller Abdruck angenommen.')
  if (teile.some((x) => x.versorgung === 'teleskopprothese')) plan.abformungProthese = plan.abformung
  const bonus = auftrag.bonus ?? optionen.bonus
  plan.zuschuss = { bonus: bonus ?? '60', haertefall: !!(auftrag.haertefall ?? optionen.haertefall) }
  if (!bonus) hinweise.push('Bonus nicht bekannt – 60 % angenommen.')
  plan.einstellungen = {
    ...plan.einstellungen,
    ...optionen.einstellungen,
    ...(optionen.labor ? { labor: optionen.labor } : {}),
    ...(optionen.kzv ? { kzv: optionen.kzv } : {}),
    ...(optionen.praxisPlz ? { praxisPlz: optionen.praxisPlz } : {}),
  }

  const regel = therapieAnwenden(regelversorgungErmitteln(plan.zaehne, regelOptionen(plan)), plan.zaehne, plan)
  const fertig = regelUebernehmen(plan, regel)
  hinweise.push(...regel.hinweise)
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
