/** Der Implantatplan für die KI-Zeile und das Prüfmodul: lesen, Schalter setzen, Positionen ändern. */
import type { Einstellungen, GlobalOptionen, ImplantatDetail, Plan, Region, RegionOptionen } from './types'
import { REGION_NAME } from './types'
import { kalkulieren, type Kalkulation } from './engine/berechnung'
import { geplanteRegionen, implantatZaehne, SITZUNG_NAME } from './engine/planung'
import { IMPLANTATKOERPER } from './data/implantatkoerper'
import { BEFUND_KUERZEL, PLANUNG_KUERZEL, istImplantat } from './engine/zahnschema'
import { STANDARD_IMPLANTAT } from './components/ImplantatDetails'
import { implantateSetzen } from './implantatSystem'
import { freiAnwenden, kiDienst, zahnText, zielSchalter, zielSetzen, type KiZiel, type KiPosition, type KiSchalter, type KiSchritt, type KiZahnFeld, type KiZahnWerte, type PlanBlick, type PlanKiDienst } from './planKi'

export function kiZeilen(kalk: Kalkulation): KiPosition[] {
  return [...kalk.honorarGoz, ...kalk.honorarGoae, ...kalk.material, ...kalk.labor].map((z) => ({
    id: z.id, ebene: z.ebene, nr: z.nr, zahn: z.zahn, anzahl: z.anzahl,
    ...(z.faktor !== undefined ? { faktor: z.faktor } : {}),
    einzel: z.einzel, betrag: z.betrag, text: z.analogText || z.text,
    ...(z.auto ? { auto: true } : {}),
    ...(z.sitzung ? { sitzung: SITZUNG_NAME[z.sitzung] ?? '' } : {}),
    ...(z.begruendung ? { begruendung: z.begruendung } : {}),
  }))
}

const REGION_JA: [keyof RegionOptionen, string][] = [
  ['augmentation', 'Augmentation / Knochenaufbau, GBR (GOZ 9100)'],
  ['sinusIntern', 'interner Sinuslift (GOZ 9110)'],
  ['sinusExtern', 'externer Sinuslift (GOZ 9120)'],
  ['boneSplitting', 'Bone Splitting / Spreading (GOZ 9130)'],
  ['blockEntnahme', 'Entnahme Knochenblock (GOZ 9140)'],
  ['ringEntnahme', 'Entnahme Knochenring'],
  ['kollektor', 'Knochenkollektor'],
  ['fixierung', 'Fixierung mit Pins/Schrauben'],
  ['eigenblut', 'Eigenblutmembran (PRF) in dieser Region'],
]
const REGION_WAHL: [keyof RegionOptionen, string, string[], string][] = [
  ['material', 'Aufbaumaterial', ['', 'autolog', 'allogen', 'xenogen', 'synthetisch'], ''],
  ['membran', 'Membran', ['keine', 'resorbierbar', 'nicht-resorbierbar', 'titan', 'vlies'], 'keine'],
  ['weichgewebe', 'Weichgewebe', ['keine', 'rolllappen', 'spaltlappen', 'fst', 'btt', 'vestibulumplastik', 'tuberplastik'], 'keine'],
]
const GLOBAL_WAHL: [keyof GlobalOptionen, string, string[]][] = [
  ['bildgebung', 'Bildgebung (OPG GOÄ 5004, DVT GOÄ 5370 + 5377)', ['keine', 'opg', 'dvt', 'opg+dvt']],
  ['sedierung', 'Sedierung', ['keine', 'lokal', 'lachgas', 'analgosedierung', 'itn']],
  ['blut', 'Eigenblutverfahren', ['keine', 'prf', 'prgf', 'prp']],
]
const GLOBAL_JA: [keyof GlobalOptionen, string][] = [
  ['navigation', 'navigierte Chirurgie mit Bohrschablone'],
  ['risiko', 'Risikopatient (Antikoagulation/ASA)'],
  ['eigenesBlutlabor', 'Eigenblut im Praxislabor'],
]

function schalter(plan: Plan): KiSchalter[] {
  const s: KiSchalter[] = []
  for (const r of geplanteRegionen(plan)) {
    const o = plan.regionen[r] ?? {}
    for (const [feld, text] of REGION_JA) s.push({ name: `region.${r}.${feld}`, text: `${REGION_NAME[r]}: ${text}`, wert: !!o[feld] })
    for (const [feld, text, werte, leer] of REGION_WAHL) s.push({ name: `region.${r}.${feld}`, text: `${REGION_NAME[r]}: ${text}`, wert: String(o[feld] ?? leer), werte })
  }
  for (const [feld, text, werte] of GLOBAL_WAHL) s.push({ name: `global.${feld}`, text, wert: String(plan.global[feld]), werte })
  for (const [feld, text] of GLOBAL_JA) s.push({ name: `global.${feld}`, text, wert: !!plan.global[feld] })
  s.push({ name: 'global.roehrchen', text: 'Anzahl Blutröhrchen/Kits', wert: plan.global.roehrchen })
  s.push({ name: 'bemerkung', text: 'Bemerkung auf dem Plan (freier Text)', wert: plan.bemerkung ?? '' })
  return s
}

export const ZAHNFELDER: KiZahnFeld[] = [
  { name: 'befund', text: 'Befund (Zeile B, Kleinbuchstaben)', werte: { '': 'leer, kein Befund', ...BEFUND_KUERZEL } },
  { name: 'planung', text: 'Planung (Zeile TP, Großbuchstaben; leer nimmt Implantat oder Maßnahme an diesem Zahn heraus)', werte: { '': 'leer, nichts geplant', ...PLANUNG_KUERZEL } },
  { name: 'system', text: 'Implantatsystem (nur an Zähnen mit geplantem Implantat)', werte: Object.fromEntries(IMPLANTATKOERPER.map((s) => [s.id, `${s.hersteller} ${s.system}`])) },
  { name: 'durchmesser', text: 'Implantatdurchmesser in mm', von: 2.5, bis: 8 },
  { name: 'laenge', text: 'Implantatlänge in mm', von: 4, bis: 20 },
  { name: 'zeitpunkt', text: 'Zeitpunkt der Implantation', werte: { sofort: 'Sofortimplantation', verzoegert: 'verzögert', spaet: 'Spätimplantation' } },
  { name: 'deckung', text: 'Einheilung', werte: { gedeckt: 'zweizeitig, gedeckt mit späterer Freilegung', offen: 'einzeitig, offen mit Gingivaformer' } },
]
const DETAIL = ['system', 'durchmesser', 'laenge', 'zeitpunkt', 'deckung'] as const

/**
 * Trägt Befund, Planung und Implantat-Angaben eines Zahns ein wie die Seite. Ein neues Implantat übernimmt das System
 * der schon geplanten Implantate, wenn alle dasselbe haben; fällt die Implantatplanung weg, gehen die Angaben mit.
 */
export function zahnSetzen(plan: Plan, zahn: string, w: KiZahnWerte): { plan: Plan; text: string } | string {
  const alt = plan.zaehne[zahn] ?? { B: '', TP: '' }
  const neu = { ...alt, ...(w.befund !== undefined ? { B: String(w.befund) } : {}), ...(w.planung !== undefined ? { TP: String(w.planung) } : {}) }
  const detail: Partial<ImplantatDetail> = {}
  // Fällt die Implantatplanung in diesem Schritt weg, gehen mitgeschickte Angaben zum Implantat einfach mit.
  const faelltWeg = w.planung !== undefined && !istImplantat(neu.TP)
  if (!faelltWeg) for (const k of DETAIL) if (w[k] !== undefined) (detail as Record<string, unknown>)[k] = w[k]
  const mitDetail = Object.keys(detail).length > 0
  if (mitDetail && !istImplantat(neu.TP)) return `Zahn ${zahn}: dort ist kein Implantat geplant. System, Maße, Zeitpunkt und Einheilung gibt es nur mit Implantat.`
  const vorher = plan.implantate[zahn]
  const gleich = neu.B === alt.B && neu.TP === alt.TP && (!mitDetail || (!!vorher && Object.entries(detail).every(([k, v]) => vorher[k as keyof ImplantatDetail] === v)))
  if (gleich) return `Zahn ${zahn} steht schon so im Plan.`
  const zaehne = { ...plan.zaehne }
  if (!neu.B && !neu.TP) delete zaehne[zahn]
  else zaehne[zahn] = neu
  let p: Plan = { ...plan, zaehne }
  const implantate = { ...plan.implantate }
  if (!istImplantat(neu.TP)) {
    const ohne = Object.fromEntries(Object.entries(w).filter(([k]) => !(DETAIL as readonly string[]).includes(k)))
    if (!implantate[zahn]) return { plan: p, text: zahnText(ZAHNFELDER, zahn, ohne) }
    delete implantate[zahn]
    return { plan: { ...p, implantate }, text: zahnText(ZAHNFELDER, zahn, ohne) }
  }
  const systeme = [...new Set(implantatZaehne(plan).filter((z) => z !== zahn).map((z) => plan.implantate[z]?.system).filter(Boolean))]
  const basis = vorher ?? { ...STANDARD_IMPLANTAT, ...(systeme.length === 1 ? { system: systeme[0] as string } : {}) }
  implantate[zahn] = { ...basis, ...detail }
  p = implantateSetzen(p, implantate)
  const sys = !vorher && !detail.system && systeme.length === 1 ? `, System wie die übrigen Implantate` : ''
  return { plan: p, text: zahnText(ZAHNFELDER, zahn, w) + sys }
}

/** Zielbetrag: GOZ- und GOÄ-Regler des Plans laufen gemeinsam (GOÄ höchstens bis zu ihrem Rahmen, das regelt die Rechnung). */
const zielVon = (einst: Einstellungen): KiZiel<Plan> => ({
  was: 'Honorarfaktor (GOZ und GOÄ gemeinsam)', gesamt: (p) => kalkulieren(p, einst).gesamt,
  lesen: (p) => (p.regler.gozFaktor > 0 ? p.regler.gozFaktor : einst.gozFaktor),
  setzen: (p, f) => ({ ...p, regler: { ...p.regler, gozFaktor: f <= einst.gozFaktor ? 0 : f, goaeFaktor: f <= einst.goaeFaktor ? 0 : f } }),
  von: einst.gozFaktor,
})

export function implBlick(plan: Plan, einst: Einstellungen, gesperrt: boolean): PlanBlick {
  const kalk = kalkulieren(plan, einst)
  const zaehne = Object.entries(plan.zaehne).filter(([, z]) => z.B || z.TP)
    .map(([nr, z]) => `${nr}: ${z.B ? `Befund ${z.B}` : ''}${z.B && z.TP ? ', ' : ''}${z.TP ? `Planung ${z.TP}` : ''}`)
  const impl = implantatZaehne(plan).map((z) => {
    const d = plan.implantate[z]
    const sys = IMPLANTATKOERPER.find((x) => x.id === d?.system)?.hersteller ?? 'Durchschnitt'
    return d ? `${z}: ${sys}, ${d.durchmesser} × ${d.laenge} mm, ${d.zeitpunkt}, ${d.deckung}, Abutment ${d.abutment}` : `${z}: ${sys}`
  })
  const regionen = geplanteRegionen(plan)
  return {
    planart: 'implantologie', name: 'Implantatplanung (Kostenvoranschlag Implantologie, privat: GOZ, GOÄ, Analog, Material, Labor)',
    nummer: plan.nummer, gesperrt,
    kann: gesperrt ? [] : ['schalter', 'zahn', 'hinzu', 'setze', 'weg', 'zurueck'],
    ebenen: ['GOZ', 'GOAE', 'MAT', 'BEB'],
    positionen: kiZeilen(kalk),
    summen: {
      goz: kalk.summeGoz, goae: kalk.summeGoae, materialNetto: kalk.summeMaterialNetto, laborNetto: kalk.summeLaborNetto,
      mwst: kalk.mwst, gesamt: kalk.gesamt,
    },
    angaben: {
      zaehne: zaehne.join('; ') || 'im Zahnschema ist noch nichts eingetragen',
      implantate: impl.join('; ') || 'keine',
      regionen: regionen.length
        ? `geplant in: ${regionen.map((r) => `${r} = ${REGION_NAME[r]}`).join(', ')}. Bei "zahn" einer Position steht die Zahnnummer oder dieses Regionskürzel.`
        : 'keine Region geplant; Maßnahmen je Region gibt es erst, wenn im Zahnschema ein Implantat oder eine Augmentation geplant ist',
      faktoren: `Standard GOZ ${einst.gozFaktor}, GOÄ ${einst.goaeFaktor}; über 3,5 ${einst.erlaubeUeber35 ? 'mit § 2-Vereinbarung zugelassen' : 'nicht zugelassen'}`,
      ...(kalk.nichtAngesetzt.length ? { nichtAngesetzt: kalk.nichtAngesetzt.join('; ') } : {}),
      ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
    },
    schalter: [...schalter(plan), ...zielSchalter(plan, zielVon(einst))],
    zahnfelder: ZAHNFELDER,
    hinweise: [],
  }
}

function schalterSetzen(plan: Plan, name: string, wert: boolean | string | number): { plan: Plan; text: string } | string {
  const jetzt = schalter(plan).find((s) => s.name === name)
  if (!jetzt) return 'Diese Einstellung gibt es in diesem Plan nicht.'
  if (name === 'bemerkung') {
    const neu = String(wert).trim().slice(0, 600)
    if (neu === (plan.bemerkung ?? '')) return 'Die Bemerkung steht schon so im Plan.'
    return { plan: { ...plan, bemerkung: neu }, text: neu ? `Bemerkung: ${neu}` : 'Bemerkung gelöscht' }
  }
  if (typeof jetzt.wert !== typeof wert || (jetzt.werte && !jetzt.werte.includes(String(wert)))) return `${jetzt.text}: diesen Wert kenne ich nicht.`
  if (jetzt.wert === wert) return `${jetzt.text} ist schon so eingestellt.`
  const text = `${jetzt.text}: ${typeof wert === 'boolean' ? (wert ? 'eingeschaltet' : 'ausgeschaltet') : wert || 'ohne'}`
  const [art, a, b] = name.split('.')
  if (art === 'global') return { plan: { ...plan, global: { ...plan.global, [a]: wert } }, text }
  const r = a as Region
  return { plan: { ...plan, regionen: { ...plan.regionen, [r]: { ...plan.regionen[r], [b]: wert } } }, text }
}

export function implAnwenden(plan: Plan, einst: Einstellungen, schritte: KiSchritt[]): { plan: Plan; getan: string[]; nicht: string[] } {
  const vorher = kalkulieren(plan, einst)
  const r = freiAnwenden(plan, schritte, kiZeilen(vorher), {
    ebenen: ['GOZ', 'GOAE', 'MAT', 'BEB'],
    maxFaktor: einst.erlaubeUeber35 ? undefined : 3.5,
    schalter: (p, name, wert) => (name === 'zielbetrag' ? zielSetzen(p, zielVon(einst), wert) : schalterSetzen(p, name, wert)),
    zahnfelder: () => ZAHNFELDER,
    zahn: zahnSetzen,
  })
  let neu = r.plan
  let kalk = kalkulieren(neu, einst)
  // Eine Gebührennummer, die die Liste nicht kennt, bleibt nicht als Nullzeile stehen.
  const alt = new Set(plan.manuell.map((m) => m.id))
  const leer = kiZeilen(kalk).filter((z) => !alt.has(z.id) && !z.auto && (z.ebene === 'GOZ' || z.ebene === 'GOAE') && !(z.betrag > 0))
  if (leer.length) {
    const ids = new Set(leer.map((z) => z.id))
    neu = { ...neu, manuell: neu.manuell.filter((m) => !ids.has(m.id)) }
    kalk = kalkulieren(neu, einst)
    for (const z of leer) {
      const name = `${z.ebene === 'GOAE' ? 'GOÄ' : z.ebene} ${z.nr}`
      r.getan = r.getan.filter((g) => !g.startsWith(`${name} `) && !g.startsWith(`${name}(`))
      r.nicht.push(`${name} kennt die Gebührenliste dieses Planers nicht. Ich habe sie nicht eingetragen.`)
    }
  }
  const bekannt = new Set(vorher.hinweise)
  for (const h of new Set(kalk.hinweise)) if (!bekannt.has(h)) r.nicht.push(`Hinweis der Rechnung: ${h}`)
  return { plan: neu, getan: r.getan, nicht: r.nicht }
}

export function implKi(lesen: () => { plan: Plan; gesperrt: boolean; einst: Einstellungen }, schreiben: (plan: Plan) => void): PlanKiDienst {
  return kiDienst<Plan>({
    lesen,
    schreiben,
    blick: (plan, gesperrt) => implBlick(plan, lesen().einst, gesperrt),
    anwenden: (plan, schritte) => implAnwenden(plan, lesen().einst, schritte),
    gesamt: (plan) => kalkulieren(plan, lesen().einst).gesamt,
  })
}
