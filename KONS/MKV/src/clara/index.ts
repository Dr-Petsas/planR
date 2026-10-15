/**
 * Einstieg für MAS/Clara: Füllungs-Mehrkostenvereinbarung per Sprache. Versteht den gesprochenen Auftrag
 * ("Komposit an 36 mo und 37 okklusal", "zweiflächiges Keramikinlay an 46"), prüft ihn gegen den 01 und rechnet
 * mit der Engine dieses Planers. `npm run build:engine` baut daraus MAS-2/backend/src/vendor/mkv-engine.mjs.
 */
import { BEFUND_KUERZEL, konsHinweis } from '../befund01'
import { THERAPIE } from '../data/katalog'
import { euro, rechnen } from '../engine/mkv'
import { ALLE_ZAEHNE } from '../engine/zahnschema'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../planNeu'
import type { Einstellungen, Patient, Plan, Praxis, Rechnung, Therapie, ZahnLeistung } from '../types'

export type { Plan, Rechnung }

declare const __MKV_ENGINE_STAND__: string | undefined
export const ENGINE_STAND = typeof __MKV_ENGINE_STAND__ === 'string' ? __MKV_ENGINE_STAND__ : 'dev'

export interface Rueckfrage {
  status: 'rueckfrage'
  grund: 'zaehne' | 'flaechen' | 'befund_konflikt'
  frage: string
  /** bei befund_konflikt: der Zahn, an dem laut Befund keine Füllung geht */
  zahn?: string
}

export interface MkvOptionen {
  patient?: Partial<Patient>
  /** KZV der Praxis für den Kassenanteil (PLZ oder KZV-Nummer) */
  praxis?: Partial<Pick<Praxis, 'plz' | 'kzvNr'>>
  einstellungen?: Partial<Einstellungen>
}

export interface MkvZahnKurz {
  zahn: string
  titel: string
  mehrkosten: number
}

export interface MkvZusammenfassung {
  zaehne: MkvZahnKurz[]
  /** GOZ-Honorar und Labor der Mehrkostenleistungen */
  privat: number
  kassenanteil: number
  mehrkosten: number
  /** Privatvereinbarung nach § 8 Abs. 7 BMV-Z (Glasfaserstift, Fluorid …) */
  privat7: number
}

export interface MkvEntwurf {
  status: 'ok'
  plan: Plan
  /** Für die Ablage: ohne Regler, damit der Planer mit den Einstellungen der Praxis rechnet */
  ablagePlan: Omit<Plan, 'regler'>
  rechnung: Rechnung
  zusammenfassung: MkvZusammenfassung
  hinweise: string[]
}

interface Fund { pos: number; ende: number }
interface FlaechenFund extends Fund { flaechen: number; text: string }
interface TherapieFund extends Fund { therapie: Therapie; labor?: string }
interface ZahnFund extends Fund { zahn: string }

const GUELTIG = new Set(ALLE_ZAEHNE)
const ZAHL: Record<string, number> = { ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, 'fünf': 5 }
const FLAECHE_WORT: [RegExp, string][] = [
  [/^okklusal/, 'o'], [/^mesial/, 'm'], [/^distal/, 'd'], [/^(?:bukkal|vestibul|labial)/, 'b'],
  [/^(?:lingual|palatinal|oral)/, 'l'], [/^(?:inzisal|incisal)/, 'i'],
]
/** Wörter aus Flächenbuchstaben, die im Satz etwas anderes heißen */
const KEIN_KUERZEL = new Set(['ob', 'do', 'lob', 'dom', 'pol', 'bold', 'mob', 'im', 'bild', 'blid'])

/** "m-o-d", "M O D", "M.O.D." -> "mod" */
const buchstabenZusammen = (t: string) =>
  t.replace(/\b[modblpvi](?:[\s.-]+[modblpvi])+\b\.?/gi, (m) => m.replace(/[\s.-]+/g, ''))

function zaehneFinden(t: string): ZahnFund[] {
  const funde: ZahnFund[] = []
  const re = /(?<!\d|\d[,.])([1-4])\s?[,.]?\s?([1-8])(?!\d|[,.]\d|\s*(?:euro|€|prozent|%|-?\s?fach|mal\b))/gi
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const vorher = t.slice(Math.max(0, m.index - 8), m.index)
    if (/faktor\s*$/i.test(vorher)) continue
    const zahn = m[1] + m[2]
    if (GUELTIG.has(zahn)) funde.push({ zahn, pos: m.index, ende: m.index + m[0].length })
  }
  return funde
}

function flaechenFinden(t: string): FlaechenFund[] {
  const funde: FlaechenFund[] = []
  const zahl = /\b(ein|eine|zwei|drei|vier|f(?:ü|ue)nf|[1-5])[\s-]*fl(?:ä|ae)ch(?:ig\w*|en|e)?\b/gi
  for (let m = zahl.exec(t); m; m = zahl.exec(t)) {
    const n = ZAHL[m[1].toLowerCase().replace('ü', 'ue')] ?? Number(m[1])
    funde.push({ pos: m.index, ende: m.index + m[0].length, flaechen: n, text: `${n}-flächig` })
  }
  // Flächenbuchstaben und -wörter; aufeinanderfolgende ("mesial okklusal distal") bilden eine Angabe
  const wort = /[a-zäöüß]+/gi
  let lauf: { pos: number; ende: number; buchstaben: Set<string> } | null = null
  const abschliessen = () => {
    if (lauf?.buchstaben.size) {
      const b = [...lauf.buchstaben].join('')
      funde.push({ pos: lauf.pos, ende: lauf.ende, flaechen: Math.min(5, lauf.buchstaben.size), text: b })
    }
    lauf = null
  }
  for (let m = wort.exec(t); m; m = wort.exec(t)) {
    const w = m[0].toLowerCase()
    const zwischen = lauf ? t.slice(lauf.ende, m.index) : ''
    if (lauf && /[,;:!?]|\d/.test(zwischen)) abschliessen()
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

function therapienFinden(t: string): TherapieFund[] {
  const funde: TherapieFund[] = []
  const re = /\b[\wäöüß-]*(aufbau|goldh(?:ä|ae)mmer|goldhammer|inlay|einlagef(?:ü|ue)llung|mehrfarb|mehrschicht|komposit|kunststoff|f(?:ü|ue)llung)[\wäöüß-]*/gi
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const w = m[0].toLowerCase()
    let therapie: Therapie
    if (w.includes('aufbau')) therapie = 'aufbau'
    else if (/goldh/.test(w)) therapie = 'goldhaemmer'
    else if (/inlay|einlage/.test(w)) therapie = 'inlay'
    else if (/mehrfarb|mehrschicht/.test(w)) therapie = 'mehrfarben'
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

const VORRANG: Therapie[] = ['aufbau', 'inlay', 'goldhaemmer', 'mehrfarben', 'komposit']
const NUR_VERBINDUNG = /^[\s,]*(?:(?:und|sowie|auch|plus|bei|an|auf|zahn|zähnen|zaehnen)[\s,]*)*$/i

/** Erkennt Zähne, Flächen und Therapie je Zahn; ohne Flächen fehlt der Zahn in `zaehne` und steht in `ohneFlaechen`. */
export function mkvAuftragVerstehen(roh: string): {
  zaehne: Record<string, ZahnLeistung & { flaechenText: string }>
  ohneFlaechen: string[]
  abformung?: 'abdruck' | 'scan'
  privat: Plan['privat']
} {
  const t = buchstabenZusammen(roh.replace(/\s+/g, ' ').replace(/\b(\d\d),(?=\d\d\b)/g, '$1, '))
  const zf = zaehneFinden(t)
  const ff = flaechenFinden(t).filter((f) => !zf.some((z) => f.pos < z.ende && z.pos < f.ende))
  const tf = therapienFinden(t)
  const vor = (i: number) => [i ? zf[i - 1].ende : 0, zf[i].pos] as const
  const nach = (i: number) => [zf[i].ende, i + 1 < zf.length ? zf[i + 1].pos : t.length] as const
  const darin = <F extends Fund>(fs: F[], [a, b]: readonly [number, number]) => fs.filter((f) => f.pos >= a && f.ende <= b)

  // Stil: steht die erste Angabe vor dem ersten Zahn ("zweiflächig an 36"), gilt sie jeweils für den folgenden Zahn
  const flPrefix = !!zf.length && !!ff.length && ff[0].ende <= zf[0].pos
  const thPrefix = !!zf.length && !!tf.length && tf[0].ende <= zf[0].pos

  const flaechenVon = zf.map((_, i): FlaechenFund | undefined => {
    if (flPrefix) return darin(ff, vor(i)).at(-1) ?? (i === zf.length - 1 ? darin(ff, nach(i))[0] : undefined)
    return darin(ff, nach(i))[0] ?? (i === 0 ? darin(ff, vor(i)).at(-1) : undefined)
  })
  // "36 und 37 jeweils mo", "zweiflächig an 36 und 37": Nachbar über bloße Verbindungswörter
  for (let i = 0; i < zf.length; i++) {
    if (flaechenVon[i]) continue
    if (i + 1 < zf.length && flaechenVon[i + 1] && NUR_VERBINDUNG.test(t.slice(zf[i].ende, zf[i + 1].pos))) flaechenVon[i] = flaechenVon[i + 1]
    else if (i > 0 && flaechenVon[i - 1] && NUR_VERBINDUNG.test(t.slice(zf[i - 1].ende, zf[i].pos))) flaechenVon[i] = flaechenVon[i - 1]
  }
  const therapieVon = zf.map((z, i): TherapieFund | undefined => {
    const eigene = thPrefix ? darin(tf, vor(i)) : darin(tf, nach(i))
    const letzte = i === zf.length - 1 && thPrefix ? darin(tf, nach(i)) : []
    const erste = i === 0 && !thPrefix ? darin(tf, vor(i)) : []
    const kandidaten = [...eigene, ...letzte, ...erste]
    if (kandidaten.length) return kandidaten.sort((a, b) => VORRANG.indexOf(a.therapie) - VORRANG.indexOf(b.therapie))[0]
    // weitertragen: "Komposit an 36, 37 und 45" bzw. "36, 37 und 45 Komposit"
    return thPrefix ? tf.filter((f) => f.ende <= z.pos).at(-1) : tf.find((f) => f.pos >= z.ende)
  })

  const klein = t.toLowerCase()
  const kofferdam = /kofferdam/.test(klein)
  const bmf = /besondere\w* ma(?:ß|ss)nahme/.test(klein)
  const anaesthesie = /an(?:ä|ae)sthes|spritze|bet(?:ä|ae)ub/.test(klein)
  const provisorium = /provisor/.test(klein)
  const stift = /stift/.test(klein)
  const mehrschicht = /mehrschicht/.test(klein)
  const zaehne: Record<string, ZahnLeistung & { flaechenText: string }> = {}
  const ohneFlaechen: string[] = []
  zf.forEach((z, i) => {
    const th = therapieVon[i]
    const therapie = th?.therapie ?? 'komposit'
    const fl = flaechenVon[i]
    if (!fl) {
      if (!zaehne[z.zahn] && !ohneFlaechen.includes(z.zahn)) ohneFlaechen.push(z.zahn)
      return
    }
    const max = THERAPIE[therapie].maxFlaechen ?? 5
    zaehne[z.zahn] = {
      therapie, flaechen: Math.min(max, fl.flaechen), flaechenText: fl.text,
      ...(th?.labor ? { labor: th.labor } : {}),
      ...(kofferdam ? { kofferdam } : {}), ...(bmf ? { bmf } : {}),
      ...(therapie === 'inlay' || therapie === 'goldhaemmer' ? { ...(anaesthesie ? { anaesthesie } : {}), ...(provisorium ? { provisorium } : {}) } : {}),
      ...(therapie === 'aufbau' ? { ...(stift ? { stift } : {}), ...(mehrschicht ? { mehrschicht } : {}) } : {}),
    }
    const weg = ohneFlaechen.indexOf(z.zahn)
    if (weg >= 0) ohneFlaechen.splice(weg, 1)
  })
  const abformung = /scan|intraoral|digital/.test(klein) ? 'scan' as const : /abdruck|abform/.test(klein) ? 'abdruck' as const : undefined
  const privat: Plan['privat'] = {
    ...(/fluorid/.test(klein) ? { fluorid: true } : {}),
    ...(/oberfl(?:ä|ae)chenan(?:ä|ae)sthes/.test(klein) ? { oberflaeche: true } : {}),
  }
  return { zaehne, ohneFlaechen, abformung, privat }
}

const liste = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} und ${xs.at(-1)}`)
const sortiert = (zs: string[]) => [...zs].sort((a, b) => ALLE_ZAEHNE.indexOf(a) - ALLE_ZAEHNE.indexOf(b))

/** Gesprochener Auftrag + 01 → gerechnete Füllungs-MKV (ohne Nummer) oder Rückfrage */
export function mkvEntwurf(auftragText: string, befund: Record<string, string> = {}, optionen: MkvOptionen = {}): MkvEntwurf | Rueckfrage {
  const a = mkvAuftragVerstehen(auftragText)
  const geplant = sortiert(Object.keys(a.zaehne))
  if (!geplant.length && !a.ohneFlaechen.length) {
    return { status: 'rueckfrage', grund: 'zaehne', frage: 'An welchen Zähnen soll ich die Füllungen planen, und mit wie vielen Flächen?' }
  }
  for (const zahn of sortiert([...geplant, ...a.ohneFlaechen])) {
    const code = (befund[zahn] ?? '').trim().toLowerCase()
    const art = a.zaehne[zahn]?.therapie === 'aufbau' ? 'aufbau' : 'fuellung'
    const h = konsHinweis(code, art)
    if (!h.geht) {
      return {
        status: 'rueckfrage', grund: 'befund_konflikt', zahn,
        frage: `Laut Befund ist ${zahn} ${BEFUND_KUERZEL[code] ? `ein${/zahn$/i.test(BEFUND_KUERZEL[code]) ? '' : 'e'} ${BEFUND_KUERZEL[code]}` : code}, dort geht keine ${art === 'aufbau' ? 'Aufbaufüllung' : 'Füllung'}. Welchen Zahn meinen Sie?`,
      }
    }
  }
  if (a.ohneFlaechen.length) {
    const z = sortiert(a.ohneFlaechen)
    return { status: 'rueckfrage', grund: 'flaechen', frage: `Wie viele Flächen ${z.length > 1 ? `jeweils an ${liste(z)}` : `an ${z[0]}`}?` }
  }

  const einst: Einstellungen = {
    ...STANDARD_EINSTELLUNGEN, ...optionen.einstellungen,
    praxis: { ...STANDARD_EINSTELLUNGEN.praxis, ...optionen.einstellungen?.praxis, ...optionen.praxis },
  }
  const basis = neuerPlan('', einst)
  const zaehne = Object.fromEntries(geplant.map((z) => {
    const { flaechenText: _, ...rest } = a.zaehne[z]
    return [z, rest]
  }))
  const plan: Plan = {
    ...basis,
    patient: { ...basis.patient, ...optionen.patient },
    zaehne,
    ...(Object.keys(a.privat ?? {}).length ? { privat: a.privat } : {}),
    ...(a.abformung && geplant.some((z) => zaehne[z].therapie === 'inlay') ? { abformung: a.abformung } : {}),
  }
  const rechnung = rechnen(plan, einst)
  const hinweise: string[] = []
  for (const zahn of geplant) {
    const h = konsHinweis((befund[zahn] ?? '').trim().toLowerCase(), zaehne[zahn].therapie === 'aufbau' ? 'aufbau' : 'fuellung')
    if (h.text) hinweise.push(`Zahn ${zahn}: ${h.text}.`)
  }
  for (const z of rechnung.zaehne) hinweise.push(...z.warnungen.map((w) => `Zahn ${z.zahn}: ${w}`))
  if (geplant.some((z) => zaehne[z].therapie === 'inlay') && !a.abformung) hinweise.push('Für die Inlays habe ich Abdruck angenommen.')
  const { regler: _, ...ablagePlan } = plan
  return {
    status: 'ok', plan, ablagePlan, rechnung, hinweise: [...new Set(hinweise)],
    zusammenfassung: {
      zaehne: rechnung.zaehne.map((z) => ({ zahn: z.zahn, titel: z.titel, mehrkosten: z.mehrkosten })),
      privat: rechnung.privat, kassenanteil: rechnung.kassenanteil, mehrkosten: rechnung.mehrkosten, privat7: rechnung.privat7Summe,
    },
  }
}

/** "Kompositfüllung in Adhäsivtechnik, zweiflächig an 36 und 37; Einlagefüllung (Inlay), dreiflächig an 46" */
export function mkvVersorgungSatz(z: MkvZusammenfassung): string {
  const gruppen = new Map<string, string[]>()
  for (const x of z.zaehne) gruppen.set(x.titel, [...(gruppen.get(x.titel) ?? []), x.zahn])
  return [...gruppen].map(([titel, zs]) => `${titel} an ${liste(zs)}`).join('; ')
}

export { euro }
