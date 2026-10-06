import type { HkpPlan, ImplantatAngaben, Labor, Position, ZahnZeilen } from '../types'
import { laborVon } from './berechnung'
import { regelOptionen, regelversorgungErmitteln, therapieAnwenden, type RegelErgebnis } from './regeln'
import { istFrontzahn, kieferVon } from './zahnschema'
import { bereich } from './zusatzleistungen'

/**
 * Übernimmt ein Ergebnis der Regelengine in den Plan. Erhalten bleiben manuelle Befunde/Positionen,
 * die Labor-Zuordnung (Eigen/Fremd) gleicher Positionen und – nach einem XML-Import – die
 * Fremdlabor-Positionen aus der Laborrechnung.
 */
export function regelUebernehmen(p: HkpPlan, regel: RegelErgebnis, zaehne: Record<string, ZahnZeilen> = p.zaehne, laborFuer: (x: Position) => Labor | undefined = () => undefined): HkpPlan {
  const schluessel = (x: Position) => `${x.ebene}|${x.nr}|${x.zahn}`
  const bisher = new Map(p.positionen.filter((x) => x.labor).map((x) => [schluessel(x), x.labor]))
  const begruendung = new Map(p.positionen.filter((x) => x.auto && x.faktorBegruendung).map((x) => [schluessel(x), x.faktorBegruendung]))
  const aus = new Set(p.ausgeschlossen ?? [])
  const neu = regel.positionen.filter((x) => !aus.has(schluessel(x))).map((x): Position => {
    const labor = bisher.get(schluessel(x)) ?? laborFuer(x)
    const b = begruendung.get(schluessel(x))
    return {
      ...x,
      ...(x.ebene === 'GOZ' ? { faktor: p.einstellungen.gozFaktor } : {}),
      ...(b ? { faktorBegruendung: b } : {}),
      ...(labor && (x.ebene === 'BEL' || x.ebene === 'BEB') ? { labor } : {}),
    }
  }).filter((x) => !(p.fremdlabor.import && (x.ebene === 'BEL' || x.ebene === 'BEB' || x.ebene === 'MAT') && laborVon(x, p) === 'fremd'))
  return {
    ...p,
    zaehne: Object.fromEntries(Object.entries(zaehne).map(([z, v]) => [z, { ...v, R: regel.R[z] ?? '' }])),
    befunde: [...regel.befunde, ...p.befunde.filter((b) => !b.auto)],
    positionen: [...neu, ...p.positionen.filter((x) => !x.auto)],
  }
}

export interface PrivatStufe {
  titel: string
  text: string
}

/** Stufen des Eigenlabor-Reglers „Kasse → Privat“ */
export const PRIVAT_STUFEN: PrivatStufe[] = [
  { titel: 'Kasse', text: 'Regelversorgung, Abrechnung nach BEL II' },
  { titel: 'Teilverblendung', text: 'Keramik-Teilverblendung auch außerhalb des Verblendbereichs (KV, BV, PKV, SKV, SBV)' },
  { titel: 'Vollkeramik', text: 'Vollkeramik, keramisch geschichtet (KM, BM, PKM, TM, SKM, SBM) + Keramikstufe' },
  { titel: 'Ästhetik', text: '+ Charakterisierung, Papillen, individuelles Abutment, Sägemodell, Fräsmodell, Aufstellung am Patienten, Farbbestimmung, Gesichtsbogen' },
  { titel: 'Premium', text: '+ Wax-up/Mock-up, Wurzelpontic, Keramik-Aufbau/-Primärteleskop, Zahnfleischmaske, Sonderkunststoff, Farbbestimmung in der Praxis, Fotodokumentation' },
]
export const PRIVAT_STUFE_MAX = PRIVAT_STUFEN.length - 1

const STUFE_1: Record<string, string> = { K: 'KV', KH: 'KVH', B: 'BV', PK: 'PKV', SK: 'SKV', SB: 'SBV', ST: 'STV' }
const STUFE_2: Record<string, string> = {
  K: 'KM', KV: 'KM', KH: 'KMH', KVH: 'KMH', B: 'BM', BV: 'BM', PK: 'PKM', PKV: 'PKM', T: 'TM', TV: 'TM',
  SK: 'SKM', SKV: 'SKM', SB: 'SBM', SBV: 'SBM', ST: 'STM', STV: 'STM',
}
const PROTHESE = /^S?EO?$/

function zielTp(r: string, stufe: number): string | undefined {
  const tp = stufe >= 2 ? STUFE_2[r] : stufe >= 1 ? STUFE_1[r] : undefined
  return tp && tp !== r ? tp : undefined
}

const zahnListe = (zahn: string) => zahn.split(/[,\s]+/).filter(Boolean)
const freiOderEigen = (plan: HkpPlan, z: string) => !plan.zaehne[z].TP || plan.zaehne[z].TP === (plan.einstellungen.eigenPrivatTp ?? {})[z]

function eigeneLaborGebiete(plan: HkpPlan): Set<string> {
  return new Set(plan.positionen
    .filter((x) => (x.ebene === 'BEL' || x.ebene === 'BEB') && laborVon(x, plan) === 'eigen')
    .flatMap((x) => zahnListe(x.zahn)))
}

/** Zähne mit festsitzender Regelversorgung aus dem Eigenlabor, die sich privat aufwerten lassen. */
export function privatKandidaten(plan: HkpPlan): string[] {
  const eigen = eigeneLaborGebiete(plan)
  return Object.entries(plan.zaehne)
    .filter(([z, v]) => eigen.has(z) && STUFE_2[v.R] && freiOderEigen(plan, z))
    .map(([z]) => z)
    .sort()
}

/**
 * Ersetzte Zähne der Regelprothese je Kiefer, wenn sie aus dem Eigenlabor kommt. Die Prothese muss
 * noch geplant sein (BEMA 96/97): ersetzen Implantate oder Brücken einen Teil der E-Zähne,
 * gelten nur die in Zeile TP mit E markierten Zähne.
 */
export function privatProthesen(plan: HkpPlan): Record<'OK' | 'UK', string[]> {
  const out: Record<'OK' | 'UK', string[]> = { OK: [], UK: [] }
  for (const k of ['OK', 'UK'] as const) {
    const eigen = plan.positionen.some((x) => (x.ebene === 'BEL' || x.ebene === 'BEB') && x.zahn === k && laborVon(x, plan) === 'eigen')
    const regelProthese = plan.positionen.some((x) => x.ebene === 'BEMA' && x.zahn === k && /^9[67][abc]$/.test(x.nr))
    if (!eigen || !regelProthese) continue
    const zaehne = Object.entries(plan.zaehne).filter(([z, v]) => kieferVon(z) === k && PROTHESE.test(v.R))
    const tp = (v: ZahnZeilen) => v.TP.trim().toUpperCase()
    const teilweise = zaehne.some(([, v]) => tp(v) && !PROTHESE.test(tp(v)))
    out[k] = zaehne.filter(([, v]) => (teilweise ? PROTHESE.test(tp(v)) : !tp(v) || tp(v) === v.R)).map(([z]) => z).sort()
  }
  return out
}

type Art = 'krone' | 'glied' | 'teleskop' | 'prothese'

interface ZahnInfo {
  zahn: string
  kuerzel: string
  art: Art
  implantat: boolean
  keramik: boolean
  front: boolean
}

function zahnInfo(zahn: string, kuerzel: string): ZahnInfo {
  const art: Art = PROTHESE.test(kuerzel) ? 'prothese' : /^(S?B|AB)/.test(kuerzel) ? 'glied' : /^S?T/.test(kuerzel) ? 'teleskop' : 'krone'
  return { zahn, kuerzel, art, implantat: kuerzel.startsWith('S'), keramik: art !== 'prothese' && /[VM]/.test(kuerzel), front: istFrontzahn(zahn) }
}

interface Extra {
  nr: string
  ab: number
  /** letzte Stufe, in der die Leistung gilt (danach durch eine höherwertige ersetzt) */
  bis?: number
  je: 'zahn' | 'kiefer' | 'haelfte' | 'fall'
  wenn: (i: ZahnInfo) => boolean
  /** BEL-Position, die dieselbe Leistung bereits als Kassenleistung enthält */
  ohneBel?: string
  /** BEB-Position, die die Leistung ersetzt (z. B. gedrucktes Modell beim Intraoralscan) */
  ohneBeb?: string
}

const festsitzend = (i: ZahnInfo) => i.art !== 'prothese'
const keramischFest = (i: ZahnInfo) => i.keramik

/**
 * Privatleistungen, die zur jeweiligen Ausführung passen. Reihenfolge = Anzeige.
 * Alle Nummern aus der BEB-Liste; je Zahn, je Kiefer, je Kieferhälfte oder einmal je Fall.
 */
export const PRIVAT_EXTRAS: Extra[] = [
  { nr: '0029', ab: 2, je: 'zahn', wenn: (i) => i.art === 'krone' && /M/.test(i.kuerzel) }, // Keramikstufe
  { nr: '2951', ab: 3, je: 'zahn', wenn: keramischFest }, // individuell charakterisieren, Keramik
  { nr: '2676', ab: 3, je: 'zahn', wenn: (i) => i.art === 'glied' && i.keramik }, // Papille aus Keramik
  { nr: '2678', ab: 4, je: 'zahn', wenn: (i) => i.art === 'glied' && i.keramik && i.front }, // Wurzelpontic
  { nr: '2033', ab: 3, bis: 3, je: 'zahn', wenn: (i) => i.implantat && i.art === 'krone' }, // individuelles Abutment
  { nr: '6906', ab: 4, je: 'zahn', wenn: (i) => i.implantat && i.art === 'krone' }, // individueller Implantataufbau Keramik
  { nr: '6905', ab: 4, je: 'zahn', wenn: (i) => i.art === 'teleskop' }, // Primärteleskop aus Keramik
  { nr: '0833', ab: 4, je: 'zahn', wenn: (i) => i.art === 'krone' || i.art === 'glied' }, // Wax-up/Mock-up
  { nr: '2909', ab: 3, je: 'zahn', wenn: (i) => i.art === 'prothese' }, // Kunststoffzahn charakterisieren
  { nr: '0021', ab: 3, je: 'kiefer', wenn: (i) => i.art === 'krone' || i.art === 'glied', ohneBel: '0051', ohneBeb: '0009' }, // Sägemodell
  { nr: '0019', ab: 3, je: 'kiefer', wenn: (i) => i.art === 'teleskop', ohneBel: '0055' }, // Fräsmodell
  { nr: '0302', ab: 3, je: 'kiefer', wenn: (i) => i.art === 'teleskop' }, // Modell vermessen
  { nr: '6121', ab: 3, je: 'kiefer', wenn: (i) => i.art === 'prothese' }, // Aufstellung am Patienten
  { nr: '6412', ab: 4, je: 'kiefer', wenn: (i) => i.art === 'prothese' }, // Sonderkunststoff
  { nr: '0731', ab: 4, je: 'kiefer', wenn: (i) => i.art === 'prothese' }, // Namenskennzeichnung
  { nr: '0223', ab: 3, je: 'haelfte', wenn: (i) => i.implantat && festsitzend(i) }, // Zahnfleischmaske
  { nr: '0223', ab: 4, je: 'haelfte', wenn: (i) => festsitzend(i) },
  { nr: '0723', ab: 3, bis: 3, je: 'fall', wenn: (i) => i.keramik || i.art === 'prothese' }, // Farbbestimmung im Labor
  { nr: '0724', ab: 4, je: 'fall', wenn: (i) => i.keramik || i.art === 'prothese' }, // Farbbestimmung in der Praxis
  { nr: '0404', ab: 3, je: 'fall', wenn: () => true }, // Montage nach Gesichtsbogen
  { nr: '0522', ab: 4, je: 'fall', wenn: (i) => i.front }, // individueller Frontzahnführungsteller
  { nr: '0706', ab: 4, je: 'fall', wenn: () => true }, // Fotodokumentation
]

/** Abutment-Leistungen der Implantatprothetik (konfektioniert bearbeiten, individuell, Keramik) */
const ABUTMENT_BEB = ['4421', '2033', '6906']

function beb(nr: string, zahn: string): Position {
  return { id: `aufw-${nr}-${zahn || 'fall'}`, ebene: 'BEB', nr, zahn, anzahl: 1, auto: true, labor: 'eigen' }
}

/** Zur Ausführung passende Privatleistungen des Eigenlabors */
export function privatExtras(plan: HkpPlan, infos: ZahnInfo[], stufe: number): Position[] {
  const belVorhanden = new Set(plan.positionen.filter((x) => x.ebene === 'BEL').map((x) => `${x.nr}|${x.zahn}`))
  const bebVorhanden = new Set(plan.positionen.filter((x) => x.ebene === 'BEB' && !x.id.startsWith('aufw-')).map((x) => `${x.nr}|${x.zahn}`))
  const out = new Map<string, Position>()
  for (const e of PRIVAT_EXTRAS) {
    if (stufe < e.ab || (e.bis !== undefined && stufe > e.bis)) continue
    for (const i of infos.filter(e.wenn)) {
      const gebiet = e.je === 'zahn' ? i.zahn : e.je === 'kiefer' ? kieferVon(i.zahn) : e.je === 'haelfte' ? bereich(i.zahn) : ''
      if ((e.ohneBel && belVorhanden.has(`${e.ohneBel}|${gebiet}`)) || (e.ohneBeb && bebVorhanden.has(`${e.ohneBeb}|${gebiet}`)) || bebVorhanden.has(`${e.nr}|${gebiet}`)) continue
      if (i.implantat && ABUTMENT_BEB.some((nr) => bebVorhanden.has(`${nr}|${gebiet}`)) && ABUTMENT_BEB.includes(e.nr)) continue
      const p = beb(e.nr, gebiet)
      out.set(p.id, p)
    }
  }
  return [...out.values()]
}

/**
 * Setzt die Stufe „Kasse → Privat“ des Eigenlabors. Das Zahnschema (B, R, TP) bleibt unverändert:
 * Nur Zähne, die laut Planung im Eigenlabor als Kassenleistung (BEL) gefertigt werden, erhalten die
 * höherwertige Ausführung der Stufe als Positionen – BEB statt BEL und, wie bei gleichartiger
 * Versorgung vorgeschrieben, GOZ statt BEMA für die Krone/den Anker; der Festzuschuss bleibt.
 * Dazu kommen die zur Ausführung passenden Privatleistungen, auch für Zähne mit eigener Planung.
 */
export function privatStufeAnwenden(plan: HkpPlan, stufe: number): { plan: HkpPlan; hinweise: string[] } {
  // frühere Versionen haben die Ausführung als TP-Kürzel ins Zahnschema geschrieben – zurücknehmen
  const alt = plan.einstellungen.eigenPrivatTp ?? {}
  const zaehne: Record<string, ZahnZeilen> = Object.fromEntries(Object.entries(plan.zaehne).map(([z, v]) => [
    z, alt[z] && v.TP === alt[z] ? { ...v, TP: '' } : v,
  ]))
  const p0: HkpPlan = { ...plan, zaehne, einstellungen: { ...plan.einstellungen, eigenPrivatTp: {} } }
  const rang: ImplantatAngaben['abutment'][] = ['standard', 'individuell', 'keramik']
  const abutment = rang[Math.max(rang.indexOf(plan.implantat.abutment), stufe >= 4 ? 2 : stufe >= 3 ? 1 : 0)]
  const rechnen = { ...plan, implantat: { ...plan.implantat, abutment } }
  const regel = regelversorgungErmitteln(zaehne, regelOptionen(plan))
  const kasse = regelUebernehmen(p0, therapieAnwenden(regel, zaehne, rechnen), zaehne)

  const kandidaten = privatKandidaten(kasse)
  const ziel: Record<string, string> = {}
  for (const z of kandidaten) {
    const t = zielTp(kasse.zaehne[z].R, stufe)
    if (t) ziel[z] = t
  }
  const virtuell = Object.fromEntries(Object.entries(zaehne).map(([z, v]) => [z, ziel[z] ? { ...v, TP: ziel[z] } : v]))
  const eigen = new Set(Object.keys(ziel))
  const basis = eigen.size
    ? regelUebernehmen(p0, therapieAnwenden(regel, virtuell, rechnen), zaehne, (x) => (zahnListe(x.zahn).some((z) => eigen.has(z)) ? 'eigen' : undefined))
    : kasse

  const eigeneZaehne = eigeneLaborGebiete(basis)
  const geplant = Object.entries(basis.zaehne)
    .filter(([z, v]) => v.TP.trim() && v.TP.trim().toUpperCase() !== v.R && eigeneZaehne.has(z) && !/^(S?EO?|SO|H)$/.test(v.TP.trim().toUpperCase()))
    .map(([z, v]) => zahnInfo(z, v.TP.trim().toUpperCase()))
  const prothesen = privatProthesen(basis)
  const infos = [
    ...kandidaten.map((z) => zahnInfo(z, ziel[z] ?? basis.zaehne[z].R)),
    ...geplant,
    ...[...prothesen.OK, ...prothesen.UK].map((z) => zahnInfo(z, basis.zaehne[z].R)),
  ]
  const aus = new Set(plan.einstellungen.eigenPrivatAus ?? [])
  const extras = privatExtras(basis, infos, stufe).filter((x) => !aus.has(x.id))

  const hinweise: string[] = []
  const prothesenKiefer = (['OK', 'UK'] as const).filter((k) => prothesen[k].length)
  if (eigen.size || extras.length) {
    const teile = [
      ...(eigen.size ? [`Zahn ${[...eigen].sort().join(', ')} als ${[...new Set(Object.values(ziel))].join('/')} (BEB statt BEL, GOZ statt BEMA)`] : []),
      ...(extras.length ? [`${extras.length} passende Privatleistungen (BEB ${[...new Set(extras.map((x) => x.nr))].join(', ')})`] : []),
    ]
    hinweise.push(`Eigenlabor privat (${PRIVAT_STUFEN[stufe].titel}): ${teile.join('; ')} – Zahnschema unverändert, gleichartige Versorgung, Festzuschuss unverändert; Patient vorher aufklären (Mehrkostenvereinbarung). Leistungen nur berechnen, wenn sie tatsächlich erbracht werden.`)
  } else if (stufe > 0 && !kandidaten.length && !geplant.length && !prothesenKiefer.length) {
    hinweise.push('Eigenlabor privat: keine Eigenlabor-Versorgung, die sich aufwerten lässt (Krone, Brückenglied, Teilkrone, Teleskop, Implantatkrone, Prothese).')
  }
  return {
    plan: {
      ...basis,
      positionen: [...basis.positionen.filter((x) => !x.id.startsWith('aufw-')), ...extras],
      einstellungen: { ...basis.einstellungen, eigenPrivatStufe: stufe, eigenPrivatTp: {} },
    },
    hinweise,
  }
}
