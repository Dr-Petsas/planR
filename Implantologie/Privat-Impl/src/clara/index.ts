/**
 * Einstieg für MAS/Clara: Kostenvoranschlag Implantologie per Sprache. Versteht den gesprochenen Auftrag
 * ("Implantate 36 und 46, Sinuslift extern, Knochenaufbau mit Bio-Oss, navigiert"), prüft ihn gegen den 01 und
 * rechnet mit der Engine dieses Planers. `npm run build:engine` baut daraus MAS-2/backend/src/vendor/impl-engine.mjs.
 * Die Versorgung auf den Implantaten (Krone, Brücke, Prothese) plant der Planer Zahnersatz privat.
 */
import { BEFUND_KUERZEL } from '../befund01'
import { implantatkoerper } from '../data/implantatkoerper'
import { euro, kalkulieren, type Kalkulation } from '../engine/berechnung'
import { ALLE_ZAEHNE, regionVon } from '../engine/zahnschema'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../planNeu'
import type { Einstellungen, GlobalOptionen, ImplantatDetail, Patient, Plan, Region, RegionOptionen } from '../types'
import { REGION_NAME, REGIONEN } from '../types'

export type { Plan, Kalkulation }

declare const __IMPL_ENGINE_STAND__: string | undefined
export const ENGINE_STAND = typeof __IMPL_ENGINE_STAND__ === 'string' ? __IMPL_ENGINE_STAND__ : 'dev'

export interface Rueckfrage {
  status: 'rueckfrage'
  grund: 'zaehne' | 'befund_konflikt' | 'zeitpunkt' | 'sinus' | 'material' | 'entnahme'
  frage: string
  /** bei befund_konflikt und zeitpunkt: der betroffene Zahn */
  zahn?: string
}

export interface ImplOptionen {
  patient?: Partial<Patient>
  einstellungen?: Partial<Einstellungen>
  /** Implantatsystem der Praxis, wenn der Auftrag keins nennt (ID aus data/implantatkoerper) */
  implantatSystem?: string
}

export interface ImplZusammenfassung {
  spaet: string[]
  sofort: string[]
  massnahmen: string[]
  /** Gesamtbetrag einschließlich Material, Labor und MwSt. */
  summe: number
  honorar: number
  materialLabor: number
}

export interface ImplEntwurf {
  status: 'ok'
  plan: Plan
  /** Für die Ablage: ohne Regler, damit der Planer mit Faktor und Stufen der Praxis rechnet */
  ablagePlan: Omit<Plan, 'regler'>
  rechnung: Kalkulation
  zusammenfassung: ImplZusammenfassung
  hinweise: string[]
}

const GUELTIG = new Set(ALLE_ZAEHNE)
/** 01: dort steht schon ein Implantat */
const STEHT_IMPLANTAT = new Set(['i', 'sk', 'skw', 'st', 'stw', 'so', 'sow'])
/** 01: kein eigener Zahn an der Stelle – Implantat geht */
const LUECKE = new Set(['f', 'e', 'ew', 'b', 'bw', 'ab', 'abw', 'sb', 'sbw', 'se', 'sew', 'ix'])
const SOFORT = /sofort/i
const SPAET = /sp(?:ä|ae)t|verz(?:ö|oe)gert|erst (?:ent|zieh|extrah|raus)|nach (?:der )?(?:entfernung|extraktion|heilung|abheilung)/i

export interface ImplAuftrag {
  zaehne: string[]
  sofort: boolean
  spaet: boolean
  regionen: RegionOptionen
  /** Sinuslift genannt, aber nicht ob intern oder extern */
  sinusOffen: boolean
  /** Gesetzt, wenn rechts und links verschieden genannt sind. Sonst gilt `regionen` für alle Seiten. */
  sinusJe: Partial<Record<'OK-R' | 'OK-L', RegionOptionen>> | null
  materialAngenommen: boolean
  /** Eigenknochen: genannte Entnahmestelle (Zahn oder retromolar/Kinn/Tuber), sonst leer */
  entnahme: string
  membranAngenommen: boolean
  /** Sinuslift ohne ausdrückliches „ohne Aufbau“: Kammaufbau 9100 anteilig mit ansetzen */
  kammZumSinus: boolean
  global: Partial<GlobalOptionen>
  deckung: ImplantatDetail['deckung']
  system: string
  prothetik: boolean
}

const SYSTEM_WORT: [RegExp, string][] = [
  [/straumann/i, 'straumann-bl'], [/nobel/i, 'nobel-active'], [/astra|dentsply/i, 'astra-ev'], [/camlog|conelog/i, 'camlog'],
  [/\bicx\b|medentis/i, 'medentis-icx'], [/\bbego\b|semados/i, 'bego-semados'], [/bredent|copa ?sky/i, 'bredent-copasky'],
  [/\bmis\b/i, 'mis-c1'], [/osstem/i, 'osstem-tsiii'], [/megagen|any ?ridge/i, 'megagen-anyridge'],
]

function zaehneFinden(t: string): string[] {
  const out: string[] = []
  const re = /(?<!\d|\d[,.])([1-4])\s?[,.]?\s?([1-8])(?!\d|[,.]\d|\s*(?:euro|€|prozent|%|-?\s?fach|mal\b|mm\b|millimeter|r(?:ö|oe)hrchen))/gi
  for (let m = re.exec(t); m; m = re.exec(t)) {
    if (/(?:faktor|durchmesser|l(?:ä|ae)nge)\s*$/i.test(t.slice(Math.max(0, m.index - 12), m.index))) continue
    const zahn = m[1] + m[2]
    if (GUELTIG.has(zahn) && !out.includes(zahn)) out.push(zahn)
  }
  return out
}

type SinusArt = 'intern' | 'extern'
const SINUS_ADJ = /extern\w*|intern\w*|lateral\w*|geschlossen\w*|krestal\w*|crestal\w*|osteotom\w*|summers\w*|fenster\w*/gi
const sinusArtWort = (wort: string): SinusArt | null =>
  /^intern|^geschlossen|^krestal|^crestal|^osteotom|^summers/.test(wort) ? 'intern'
    : /^extern|^lateral|^fenster/.test(wort) ? 'extern' : null

/** "externer Sinuslift rechts, interner links": je Kieferhälfte, nicht für beide Seiten dieselbe Art. */
function sinusJeSeite(k: string): Partial<Record<'OK-R' | 'OK-L', RegionOptionen>> | null {
  if (!/rechts|links/.test(k) || !/sinus|kieferh(?:ö|oe)hle|extern|intern|lateral|fenster/.test(k)) return null
  const bei = (seite: 'rechts' | 'links'): SinusArt | null => {
    const i = k.indexOf(seite)
    if (i < 0) return null
    const davor = [...k.slice(Math.max(0, i - 80), i).matchAll(SINUS_ADJ)].at(-1)?.[0] ?? ''
    const danach = k.slice(i, i + 48).match(SINUS_ADJ)?.[0] ?? ''
    return sinusArtWort(davor) ?? sinusArtWort(danach)
  }
  const rechts = bei('rechts')
  const links = bei('links')
  if (!rechts && !links) return null
  const block = (art: SinusArt | null): RegionOptionen =>
    art === 'extern' ? { sinusExtern: true } : art === 'intern' ? { sinusIntern: true } : {}
  return { 'OK-R': block(rechts), 'OK-L': block(links) }
}

/** Erkennt Implantat-Positionen, Zeitpunkt, chirurgische Zusatzmaßnahmen und globale Angaben. */
export function implAuftragVerstehen(roh: string): ImplAuftrag {
  const t = roh.replace(/\s+/g, ' ').replace(/\b(\d\d),(?=\d\d\b)/g, '$1, ')
  const k = t.toLowerCase()
  const o: RegionOptionen = {}
  const sinus = /sinus|kieferh(?:ö|oe)hle/.test(k)
  const sinusJe = sinusJeSeite(k)
  let sinusOffen = false
  if (!sinusJe && sinus) {
    if (/intern|geschlossen|osteotom|krestal|crestal|summers/.test(k)) o.sinusIntern = true
    else if (/extern|lateral|fenster/.test(k)) o.sinusExtern = true
    else sinusOffen = true
  }
  if (/augment|knochenaufbau|aufbau des kiefer|kieferkamm\w*aufbau|\bgbr\b|knochenregeneration/.test(k)) o.augmentation = true
  if (/bone ?split|bone ?spread|splitting|spreading|kammspreiz/.test(k)) o.boneSplitting = true
  if (/knochenblock|blockentnahme|block ?transplant/.test(k)) o.blockEntnahme = true
  if (/knochenring/.test(k)) o.ringEntnahme = true
  if (/kollektor|safe ?scraper|knochenfilter|knochenschaber/.test(k)) o.kollektor = true
  if (/pins?\b|osteosynthese|fixier/.test(k) && (o.augmentation || o.blockEntnahme || o.ringEntnahme)) o.fixierung = true
  if (/eigenknochen|eigen(?:e[mnrs]?)? knochen|autolog/.test(k)) o.material = 'autolog'
  else if (/allogen|spender|maxgraft/.test(k)) o.material = 'allogen'
  else if (/xenogen|bio-? ?oss|rind|bovin|cerabone/.test(k)) o.material = 'xenogen'
  else if (/synthetisch|alloplast|\btcp\b|hydroxyl/.test(k)) o.material = 'synthetisch'
  const jeExtern = !!sinusJe && Object.values(sinusJe).some((x) => x?.sinusExtern)
  // Nicht still xenogen annehmen: Clara fragt Knochenersatz oder Eigenknochen.
  const materialAngenommen = false
  if (/ohne membran|keine membran/.test(k)) o.membran = 'keine'
  else if (/titan/.test(k)) o.membran = 'titan'
  else if (/nicht[\s-]?resorb|ptfe/.test(k)) o.membran = 'nicht-resorbierbar'
  else if (/vlies|kollagenvlies/.test(k)) o.membran = 'vlies'
  else if (/membran/.test(k)) o.membran = 'resorbierbar'
  const membranAngenommen = !o.membran && !!(o.augmentation || o.sinusExtern || jeExtern || sinusOffen)
  if (membranAngenommen && !sinusJe) o.membran = 'resorbierbar'
  const kammZumSinus = !/ohne (?:knochen)?aufbau|nur (?:der |den )?sinus/.test(k)
  if (/spaltlappen|rehrmann|schwierige[rn]? lappen/.test(k)) o.weichgewebe = 'spaltlappen'
  else if (/bindegewebe|\bbgt\b|\bctg\b/.test(k)) o.weichgewebe = 'btt'
  else if (/schleimhauttransplant|\bfst\b|freies schleimhaut/.test(k)) o.weichgewebe = 'fst'
  else if (/vestibulumplastik/.test(k)) o.weichgewebe = 'vestibulumplastik'
    else if (/roll-?lappen|plastische deckung/.test(k)) o.weichgewebe = 'rolllappen'

  const g: Partial<GlobalOptionen> = {}
  if (/\bprgf\b|endoret/.test(k)) g.blut = 'prgf'
  else if (/\bprp\b/.test(k)) g.blut = 'prp'
  else if (/\bprf\b|eigenblut|\bprf-|a-prf|i-prf/.test(k)) g.blut = 'prf'
  if (g.blut) o.eigenblut = true
  if (/navig|bohrschablone|schablone|gef(?:ü|ue)hrt/.test(k)) g.navigation = true
  const dvt = /\bdvt\b|\bdvts\b|3d-?r(?:ö|oe)ntgen|digitale volumen/.test(k)
  const opg = /\bopg\b|panorama|orthopantomo/.test(k)
  if (/ohne (?:neues )?dvt|dvt (?:liegt|ist|haben wir) (?:schon |bereits )?(?:vor|da)|dvt vorhanden|kein (?:neues )?dvt/.test(k)) g.bildgebung = opg ? 'opg' : 'keine'
  else if (dvt && opg) g.bildgebung = 'opg+dvt'
  else if (opg) g.bildgebung = 'opg'
  if (/lachgas/.test(k)) g.sedierung = 'lachgas'
  else if (/vollnarkose|\bnarkose|\bitn\b|intubation/.test(k)) g.sedierung = 'itn'
  else if (/sedierung|sediert|d(?:ä|ae)mmerschlaf|analgosed/.test(k)) g.sedierung = 'analgosedierung'
  if (/marcumar|antikoag|blutverd(?:ü|ue)nn|risikopatient|\basa ?(?:3|iii|drei)\b/.test(k)) g.risiko = true

  const deckung: ImplantatDetail['deckung'] = /einzeitig|offen einheil|transgingival|gingivaformer gleich/.test(k) ? 'offen' : 'gedeckt'
  const system = SYSTEM_WORT.find(([re]) => re.test(t))?.[1] ?? 'durchschnitt'
  return {
    zaehne: zaehneFinden(t), sofort: SOFORT.test(t), spaet: SPAET.test(t), regionen: o, sinusOffen, sinusJe,
    materialAngenommen, membranAngenommen, kammZumSinus, global: g, deckung, system,
    prothetik: /krone|br(?:ü|ue)cke|prothese|teleskop|\bsteg\b|suprakonstruktion/.test(k),
    entnahme: entnahmeVon(k),
  }
}

/** „aus der Regio 15“, „regio 1,5“, retromolar, Kinn, Tuber – nicht die Implantatstelle selbst. */
function entnahmeVon(k: string): string {
  const regio = /regio\s*([1-4])\s*[,.]?\s*([1-8])/.exec(k)
  if (regio) return regio[1] + regio[2]
  const aus = /(?:aus|von)\s+(?:der |dem |die )?(?:regio |region |zahn )?([1-4]\s*[1-8])/.exec(k)
  if (aus) return aus[1].replace(/\s/g, '')
  const ort = /(retromolar\w*|kieferwinkel|\bkinn\b|tuber\w*)/.exec(k)
  return ort?.[1] ?? ''
}

const liste = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} und ${xs.at(-1)}`)
const sortiert = (zs: string[]) => [...zs].sort((a, b) => ALLE_ZAEHNE.indexOf(a) - ALLE_ZAEHNE.indexOf(b))
const befundName = (code: string) => {
  if (!code) return 'ein eigener Zahn'
  const n = BEFUND_KUERZEL[code]
  if (!n) return `„${code}“`
  const kopf = n.match(/\p{Lu}[\p{L}-]*/u)?.[0] ?? ''
  return `ein${/(?:zahn|implantat|glied|element|teil|schluss)$/i.test(kopf) ? '' : 'e'} ${n}`
}
const IST_OK_SEITE = (r: Region) => r === 'OK-R' || r === 'OK-L'
const MASSNAHME: [keyof RegionOptionen, string][] = [
  ['sinusExtern', 'externer Sinuslift'], ['sinusIntern', 'interner Sinuslift'], ['augmentation', 'Knochenaufbau'],
  ['boneSplitting', 'Bone Splitting'], ['blockEntnahme', 'Knochenblock'], ['ringEntnahme', 'Knochenring'],
]
const WEICHGEWEBE: Record<string, string> = { btt: 'Bindegewebstransplantat', fst: 'Schleimhauttransplantat', vestibulumplastik: 'Vestibulumplastik', rolllappen: 'Rolllappen', spaltlappen: 'Spaltlappen' }
const SEDIERUNG: Record<string, string> = { lachgas: 'Lachgas', analgosedierung: 'Analgosedierung', itn: 'Vollnarkose' }

/** Gesprochener Auftrag + 01 → gerechneter Kostenvoranschlag Implantologie (ohne Nummer) oder Rückfrage */
export function implEntwurf(auftragText: string, befund: Record<string, string> = {}, optionen: ImplOptionen = {}): ImplEntwurf | Rueckfrage {
  const a = implAuftragVerstehen(auftragText)
  if (!a.zaehne.length) {
    return { status: 'rueckfrage', grund: 'zaehne', frage: 'An welchen Zähnen soll ich Implantate planen?' }
  }
  const zaehne = sortiert(a.zaehne)
  const mitBefund = Object.values(befund).some((c) => String(c ?? '').trim())
  const hinweise: string[] = []
  const sofort: string[] = []
  for (const zahn of zaehne) {
    const code = String(befund[zahn] ?? '').trim().toLowerCase()
    if (!mitBefund || LUECKE.has(code)) {
      if (code === 'ix') hinweise.push(`Zahn ${zahn}: das vorhandene Implantat muss vorher entfernt werden, die Explantation bitte im Planer ergänzen.`)
      if (mitBefund && a.sofort) hinweise.push(`Zahn ${zahn}: laut Befund steht dort kein Zahn, ich habe ein Spätimplantat geplant.`)
      else if (!mitBefund && a.sofort) sofort.push(zahn)
      continue
    }
    if (STEHT_IMPLANTAT.has(code)) {
      return { status: 'rueckfrage', grund: 'befund_konflikt', zahn, frage: `Laut Befund steht an ${zahn} schon ein Implantat. Welchen Zahn meinen Sie?` }
    }
    if (code === ')(') {
      return { status: 'rueckfrage', grund: 'befund_konflikt', zahn, frage: `Laut Befund ist an ${zahn} ein Lückenschluss, dort ist kein Platz für ein Implantat. Welchen Zahn meinen Sie?` }
    }
    // dort steht noch ein Zahn bzw. eine Wurzel
    if (a.sofort) { sofort.push(zahn); continue }
    if (a.spaet) {
      hinweise.push(`Zahn ${zahn}: die Entfernung vor dem Implantat bitte im Planer ergänzen.`)
      continue
    }
    if (code === 'x') {
      return { status: 'rueckfrage', grund: 'zeitpunkt', zahn, frage: `Laut Befund ist ${zahn} nicht erhaltungswürdig. Soll ich sofort implantieren oder später nach der Entfernung?` }
    }
    return {
      status: 'rueckfrage', grund: 'befund_konflikt', zahn,
      frage: `Laut Befund steht an ${zahn} noch ${befundName(code)}. Soll der Zahn raus und sofort implantiert werden, oder meinen Sie einen anderen Zahn?`,
    }
  }
  const regionen = REGIONEN.filter((r) => zaehne.some((z) => regionVon(z) === r))
  const sinusRegionen = regionen.filter(IST_OK_SEITE)
  if (a.sinusOffen && sinusRegionen.length) {
    return { status: 'rueckfrage', grund: 'sinus', frage: 'Interner oder externer Sinuslift?' }
  }
  const brauchtMaterial = !!(a.regionen.augmentation || a.regionen.sinusIntern || a.regionen.sinusExtern || a.regionen.boneSplitting
    || (a.sinusJe && Object.values(a.sinusJe).some((x) => x?.sinusIntern || x?.sinusExtern || x?.augmentation)))
  if (brauchtMaterial && !a.regionen.material && !a.regionen.blockEntnahme && !a.regionen.ringEntnahme) {
    return { status: 'rueckfrage', grund: 'material', frage: 'Knochenersatzmaterial oder Eigenknochen?' }
  }
  if (a.regionen.material === 'autolog' && !a.entnahme && !a.regionen.blockEntnahme && !a.regionen.ringEntnahme) {
    return { status: 'rueckfrage', grund: 'entnahme', frage: 'Aus welcher Region soll ich den Eigenknochen entnehmen?' }
  }

  const einst: Einstellungen = {
    ...STANDARD_EINSTELLUNGEN, ...optionen.einstellungen,
    praxis: { ...STANDARD_EINSTELLUNGEN.praxis, ...optionen.einstellungen?.praxis },
  }
  const basis = neuerPlan(1)
  const system = a.system !== 'durchschnitt' ? a.system : implantatkoerper(optionen.implantatSystem ?? '').id
  const { sinusIntern, sinusExtern, ...rest } = a.regionen
  const planRegionen: Plan['regionen'] = {}
  let entnahmeAn = false
  for (const r of regionen) {
    const ro: RegionOptionen = { ...rest }
    if (a.sinusJe && IST_OK_SEITE(r)) Object.assign(ro, a.sinusJe[r] ?? {})
    else if (IST_OK_SEITE(r)) Object.assign(ro, sinusIntern ? { sinusIntern } : {}, sinusExtern ? { sinusExtern } : {})
    if ((ro.sinusIntern || ro.sinusExtern) && a.kammZumSinus && !ro.boneSplitting) ro.augmentation = true
    if (!entnahmeAn && a.entnahme && a.regionen.material === 'autolog' && (ro.sinusIntern || ro.sinusExtern || ro.augmentation || ro.boneSplitting)) {
      ro.blockEntnahme = true
      entnahmeAn = true
    }
    if (a.sinusJe) {
      if ((ro.sinusIntern || ro.sinusExtern || ro.augmentation) && a.materialAngenommen && !ro.material) ro.material = 'xenogen'
      if ((ro.augmentation || ro.sinusExtern) && a.membranAngenommen && !ro.membran) ro.membran = 'resorbierbar'
    }
    planRegionen[r] = ro
  }
  const rechts = a.sinusJe?.['OK-R']
  const links = a.sinusJe?.['OK-L']
  if (rechts?.sinusExtern && links?.sinusIntern) hinweise.push('Den externen Sinuslift habe ich rechts angesetzt, den internen links.')
  if (rechts?.sinusIntern && links?.sinusExtern) hinweise.push('Den internen Sinuslift habe ich rechts angesetzt, den externen links.')
  const sinusGenannt = sinusIntern || sinusExtern || a.sinusOffen || rechts?.sinusExtern || rechts?.sinusIntern || links?.sinusExtern || links?.sinusIntern
  if (sinusGenannt && !sinusRegionen.length) {
    hinweise.push('Ein Sinuslift geht nur im Oberkiefer-Seitenzahnbereich, den habe ich nicht angesetzt.')
  }
  const plan: Plan = {
    ...basis,
    nummer: '',
    patient: { ...basis.patient, ...optionen.patient },
    zaehne: Object.fromEntries(zaehne.map((z) => [z, { B: '', TP: sofort.includes(z) ? 'IS' : 'I' }])),
    implantate: Object.fromEntries(zaehne.map((z) => [z, {
      system, durchmesser: 4.1, laenge: 10, zeitpunkt: sofort.includes(z) ? 'sofort' : 'verzoegert', deckung: a.deckung, abutment: 'standard',
    } satisfies ImplantatDetail])),
    regionen: planRegionen,
    global: { ...basis.global, ...a.global },
  }
  const rechnung = kalkulieren(plan, einst)

  const massnahmen: string[] = []
  for (const [feld, name] of MASSNAHME) if (regionen.some((r) => planRegionen[r]?.[feld])) massnahmen.push(name)
  if (a.regionen.weichgewebe) massnahmen.push(WEICHGEWEBE[a.regionen.weichgewebe])
  if (a.global.blut) massnahmen.push(a.global.blut.toUpperCase())
  if (plan.global.navigation) massnahmen.push('navigiert mit Bohrschablone')
  if (SEDIERUNG[plan.global.sedierung]) massnahmen.push(SEDIERUNG[plan.global.sedierung])

  const aufbauRegionen = regionen.filter((r) => planRegionen[r]?.augmentation)
  if (aufbauRegionen.length && regionen.length > 1) hinweise.push(`Den Knochenaufbau habe ich für ${liste(aufbauRegionen.map((r) => REGION_NAME[r]))} angesetzt.`)
  if (a.materialAngenommen && a.membranAngenommen) hinweise.push('Angenommen habe ich xenogenen Knochenersatz und eine resorbierbare Membran.')
  else if (a.materialAngenommen) hinweise.push('Als Knochenersatz habe ich xenogenes Material angenommen.')
  else if (a.membranAngenommen) hinweise.push('Eine resorbierbare Membran habe ich angenommen.')
  if (plan.global.bildgebung === 'dvt' && !a.global.bildgebung) hinweise.push('Ein DVT zur Planung ist enthalten.')
  if (plan.global.sedierung === 'itn') hinweise.push('Die Vollnarkose rechnet der Anästhesist gesondert ab.')
  if (a.prothetik) hinweise.push('Die Versorgung auf den Implantaten plant der Planer Zahnersatz privat.')
  const nummern = new Set(rechnung.honorarGoz.map((z) => z.nr))
  if (nummern.has('9140')) {
    const ort = /^\d\d$/.test(a.entnahme) ? `Region ${a.entnahme}` : a.entnahme
    hinweise.unshift(`Anästhesie und die Entnahme des Eigenknochens${ort ? ` aus ${ort}` : ''} nach GOZ 9140 sind im Plan.`)
  }

  const { regler: _, ...ablagePlan } = plan
  return {
    status: 'ok', plan, ablagePlan, rechnung, hinweise: [...new Set(hinweise)],
    zusammenfassung: {
      spaet: zaehne.filter((z) => !sofort.includes(z)), sofort, massnahmen,
      summe: rechnung.gesamt,
      honorar: Math.round((rechnung.summeGoz + rechnung.summeGoae) * 100) / 100,
      materialLabor: Math.round((rechnung.summeMaterialNetto + rechnung.summeLaborNetto + rechnung.mwst) * 100) / 100,
    },
  }
}

/** "Implantate an 36 und 46, Sofortimplantat an 11; dazu externer Sinuslift und Knochenaufbau" */
export function implVersorgungSatz(z: ImplZusammenfassung): string {
  const teile: string[] = []
  if (z.spaet.length) teile.push(`${z.spaet.length > 1 ? 'Implantate' : 'Implantat'} an ${liste(z.spaet)}`)
  if (z.sofort.length) teile.push(`${z.sofort.length > 1 ? 'Sofortimplantate' : 'Sofortimplantat'} an ${liste(z.sofort)}`)
  return `${teile.join(', ')}${z.massnahmen.length ? `; dazu ${liste(z.massnahmen)}` : ''}`
}

export { euro }
