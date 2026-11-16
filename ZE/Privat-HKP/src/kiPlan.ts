/** Der private Zahnersatzplan für die KI-Zeile und das Prüfmodul: lesen, Schalter setzen, Positionen ändern. */
import type { Einstellungen, Plan } from './types'
import { kalkulieren, type Kalkulation } from './engine/berechnung'
import { BEFUND_KUERZEL, PLANUNG_KUERZEL } from './engine/zahnschema'
import { freiAnwenden, kiDienst, zahnText, type KiPosition, type KiSchalter, type KiSchritt, type KiZahnFeld, type KiZahnWerte, type PlanBlick, type PlanKiDienst } from './planKi'

export function kiZeilen(kalk: Kalkulation): KiPosition[] {
  return [...kalk.honorar, ...kalk.labor, ...kalk.material].map((z) => ({
    id: z.id, ebene: z.ebene, nr: z.nr, zahn: z.zahn, anzahl: z.anzahl,
    ...(z.faktor !== undefined ? { faktor: z.faktor } : {}),
    einzel: z.einzel, betrag: z.betrag, text: z.text,
    ...(z.auto ? { auto: true } : {}),
    ...(z.begruendung ? { begruendung: z.begruendung } : {}),
  }))
}

const ABFORMUNG = ['', 'scan', 'abdruck']

function schalter(plan: Plan): KiSchalter[] {
  return [
    { name: 'abformung', text: 'Abformung der präparierten Zähne (scan = Intraoralscan, abdruck = konventionell)', wert: plan.abformung ?? '', werte: ABFORMUNG },
    { name: 'abformungProthese', text: 'zweite Abformung für den herausnehmbaren Teil', wert: plan.abformungProthese ?? '', werte: ABFORMUNG },
    { name: 'implantat.loeffel', text: 'Löffel bei Implantatabformung', wert: plan.implantat.loeffel, werte: ['geschlossen', 'offen'] },
    { name: 'implantat.abutment', text: 'Abutment auf Implantaten', wert: plan.implantat.abutment, werte: ['standard', 'individuell', 'keramik'] },
  ]
}

export const ZAHNFELDER: KiZahnFeld[] = [
  { name: 'befund', text: 'Befund (Zeile B, Kleinbuchstaben)', werte: { '': 'leer, kein Befund', ...BEFUND_KUERZEL } },
  { name: 'planung', text: 'Planung (Zeile TP, Großbuchstaben)', werte: { '': 'leer, nichts geplant', ...PLANUNG_KUERZEL } },
  { name: 'brueckeAnfang', text: 'Brückenanfang von Hand an diesem Zahn festlegen; nur nötig, wenn die Brücke sich nicht aus Pfeilern und Gliedern ergibt', ja: true },
  { name: 'brueckeEnde', text: 'Brückenende von Hand an diesem Zahn festlegen; nur nötig, wenn die Brücke sich nicht aus Pfeilern und Gliedern ergibt', ja: true },
]

/** Trägt Befund und Planung eines Zahns ein wie das Zahnschema der Seite; die Positionen rechnet der Planer daraus neu. */
export function zahnSetzen(plan: Plan, zahn: string, w: KiZahnWerte): { plan: Plan; text: string } | string {
  const alt = plan.zaehne[zahn] ?? { B: '', TP: '' }
  const neu = {
    ...alt,
    ...(w.befund !== undefined ? { B: String(w.befund) } : {}),
    ...(w.planung !== undefined ? { TP: String(w.planung) } : {}),
    ...(w.brueckeAnfang !== undefined ? { bAnfang: !!w.brueckeAnfang } : {}),
    ...(w.brueckeEnde !== undefined ? { bEnde: !!w.brueckeEnde } : {}),
  }
  if (!neu.TP) { neu.bAnfang = false; neu.bEnde = false }
  if (neu.B === alt.B && neu.TP === alt.TP && !!neu.bAnfang === !!alt.bAnfang && !!neu.bEnde === !!alt.bEnde) return `Zahn ${zahn} steht schon so im Zahnschema.`
  const zaehne = { ...plan.zaehne }
  if (!neu.B && !neu.TP) delete zaehne[zahn]
  else zaehne[zahn] = neu
  return { plan: { ...plan, zaehne }, text: zahnText(ZAHNFELDER, zahn, w) }
}

export function zeBlick(plan: Plan, einst: Einstellungen, gesperrt: boolean): PlanBlick {
  const kalk = kalkulieren(plan, einst)
  const zaehne = Object.entries(plan.zaehne).filter(([, z]) => z.B || z.TP)
    .map(([nr, z]) => `${nr}: ${z.B ? `Befund ${z.B}` : ''}${z.B && z.TP ? ', ' : ''}${z.TP ? `Planung ${z.bAnfang ? '-' : ''}${z.TP}${z.bEnde ? '-' : ''}` : ''}`)
  return {
    planart: 'privat-hkp', name: 'privater Zahnersatz (Kostenvoranschlag: GOZ, BEB-Labor, Material)',
    nummer: plan.nummer, gesperrt,
    kann: gesperrt ? [] : ['schalter', 'zahn', 'hinzu', 'setze', 'weg', 'zurueck'],
    ebenen: ['GOZ', 'BEB', 'MAT'],
    positionen: kiZeilen(kalk),
    summen: { honorar: kalk.summeHonorar, laborNetto: kalk.summeLaborNetto, mwst: kalk.mwst, material: kalk.summeMaterial, gesamt: kalk.gesamt },
    angaben: {
      zaehne: zaehne.join('; ') || 'im Zahnschema ist noch nichts eingetragen',
      werkstoffe: Object.entries(plan.werkstoffe ?? {}).map(([z, w]) => `${z}: ${w}`).join('; ') || 'Standard',
      faktor: `Standard GOZ ${einst.gozFaktor}`,
      ...(kalk.nichtAngesetzt.length ? { nichtAngesetzt: kalk.nichtAngesetzt.join('; ') } : {}),
      ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
    },
    schalter: schalter(plan),
    zahnfelder: ZAHNFELDER,
    hinweise: [],
  }
}

function schalterSetzen(plan: Plan, name: string, wert: boolean | string | number): { plan: Plan; text: string } | string {
  const jetzt = schalter(plan).find((s) => s.name === name)
  if (!jetzt) return 'Diese Einstellung gibt es in diesem Plan nicht.'
  if (typeof wert !== 'string' || !jetzt.werte?.includes(wert)) return `${jetzt.text}: diesen Wert kenne ich nicht.`
  if (jetzt.wert === wert) return `${jetzt.text} ist schon so eingestellt.`
  const text = `${jetzt.text}: ${wert || 'ohne'}`
  if (name.startsWith('implantat.')) return { plan: { ...plan, implantat: { ...plan.implantat, [name.slice(10)]: wert } }, text }
  return { plan: { ...plan, [name]: wert }, text }
}

export function zeAnwenden(plan: Plan, einst: Einstellungen, schritte: KiSchritt[]): { plan: Plan; getan: string[]; nicht: string[] } {
  const vorher = kalkulieren(plan, einst)
  const r = freiAnwenden(plan, schritte, kiZeilen(vorher), { ebenen: ['GOZ', 'BEB', 'MAT'], maxFaktor: 3.5, schalter: schalterSetzen, zahnfelder: () => ZAHNFELDER, zahn: zahnSetzen })
  let neu = r.plan
  let kalk = kalkulieren(neu, einst)
  const alt = new Set(plan.manuell.map((m) => m.id))
  const leer = kiZeilen(kalk).filter((z) => !alt.has(z.id) && !z.auto && z.ebene === 'GOZ' && !(z.betrag > 0))
  if (leer.length) {
    const ids = new Set(leer.map((z) => z.id))
    neu = { ...neu, manuell: neu.manuell.filter((m) => !ids.has(m.id)) }
    kalk = kalkulieren(neu, einst)
    for (const z of leer) {
      r.getan = r.getan.filter((g) => !g.startsWith(`GOZ ${z.nr} `) && !g.startsWith(`GOZ ${z.nr}(`))
      r.nicht.push(`GOZ ${z.nr} kennt die Gebührenliste dieses Planers nicht. Ich habe sie nicht eingetragen.`)
    }
  }
  const bekannt = new Set(vorher.hinweise)
  for (const h of new Set(kalk.hinweise)) if (!bekannt.has(h)) r.nicht.push(`Hinweis der Rechnung: ${h}`)
  return { plan: neu, getan: r.getan, nicht: r.nicht }
}

export function zeKi(lesen: () => { plan: Plan; gesperrt: boolean; einst: Einstellungen }, schreiben: (plan: Plan) => void): PlanKiDienst {
  return kiDienst<Plan>({
    lesen,
    schreiben,
    blick: (plan, gesperrt) => zeBlick(plan, lesen().einst, gesperrt),
    anwenden: (plan, schritte) => zeAnwenden(plan, lesen().einst, schritte),
    gesamt: (plan) => kalkulieren(plan, lesen().einst).gesamt,
  })
}
