/**
 * Der Kassen-HKP für die KI-Zeile: lesen, das Zahnschema ändern und die Angaben zur Ausführung setzen
 * (Bonus, Härtefall, Versorgungsart, Abformung, Labor, Kronenmaterial, Verblendung, Implantatangaben).
 * Danach rechnet der Planer Regelversorgung und Positionen neu, wie der Knopf »Berechnen«.
 */
import type { HkpPlan } from './types'
import { berechnen, laborVon, type Ergebnis, type Listen } from './engine/berechnung'
import { ausfuehrungAnwenden, implantateIn, verblendungLage, zahnFuerWerkstoff, type Ausfuehrung } from './engine/ausfuehrung'
import { kronenEinheiten, werkstoffVon, WERKSTOFFE, WERKSTOFFE_FUER, type KronenEinheit, type Werkstoff } from './engine/material'
import { BEFUND_KUERZEL, THERAPIE_KUERZEL } from './engine/zahnschema'
import { regelOptionen, regelversorgungErmitteln, therapieAnwenden } from './engine/regeln'
import { privatStufeAnwenden, regelUebernehmen } from './engine/aufwertung'
import { kiDienst, zahnText, zahnWerte, type KiSchalter, type KiSchritt, type KiZahnFeld, type KiZahnWerte, type PlanBlick, type PlanKiDienst } from './planKi'

export const ZAHNFELDER: KiZahnFeld[] = [
  { name: 'befund', text: 'Befund (Zeile B, Kleinbuchstaben)', werte: { '': 'leer, kein Befund', ...BEFUND_KUERZEL } },
  { name: 'planung', text: 'Therapieplanung (Zeile TP, Großbuchstaben; leer = Regelversorgung gilt)', werte: { '': 'leer, keine abweichende Planung', ...THERAPIE_KUERZEL } },
  { name: 'brueckeAnfang', text: 'Brückenspanne beginnt an diesem Zahn', ja: true },
  { name: 'brueckeEnde', text: 'Brückenspanne endet an diesem Zahn', ja: true },
  {
    name: 'werkstoff', text: 'Kronenmaterial dieses Zahns (nur an Zähnen mit Krone, Brückenglied oder Teleskop; Keramik stellt die Planung auf vollkeramisch um)',
    werte: Object.fromEntries(Object.entries(WERKSTOFFE).map(([k, w]) => [k, w.titel])),
  },
]

const WERKSTOFF_NAMEN = Object.keys(WERKSTOFFE) as Werkstoff[]
const ABFORMUNG = ['', 'scan', 'abdruck']

const einheitenVon = (plan: HkpPlan): KronenEinheit[] =>
  kronenEinheiten(plan.positionen.map((p) => ({ zahn: p.zahn, ebene: p.ebene, nr: p.nr, labor: laborVon(p, plan) })))

/** Was die KI-Zeile außer dem Zahnschema einstellen kann; jede Angabe steht so auch auf der Seite. */
export function schalter(plan: HkpPlan): KiSchalter[] {
  const einheiten = einheitenVon(plan)
  const stoffe = [...new Set(einheiten.map((e) => werkstoffVon(e, plan.werkstoffe ?? {}).werkstoff))]
  const alle = einheiten.length > 0 && einheiten.every((e) => werkstoffVon(e, plan.werkstoffe ?? {}).gewaehlt)
  return [
    { name: 'bonus', text: 'Festzuschuss-Stufe in Prozent (60 = ohne Bonus, 70 = Bonusheft 5 Jahre, 75 = Bonusheft 10 Jahre)', wert: plan.zuschuss.bonus, werte: ['60', '70', '75'] },
    { name: 'haertefall', text: 'Härtefall (Festzuschuss 100 %)', wert: plan.zuschuss.haertefall },
    { name: 'versorgungsart', text: 'Versorgungsart (auto = der Planer bestimmt sie aus der Planung)', wert: plan.versorgungsart, werte: ['auto', 'regel', 'gleichartig', 'andersartig'] },
    { name: 'abformung', text: 'Abformung der präparierten Zähne (scan = Intraoralscan, abdruck = konventionell)', wert: plan.abformung ?? '', werte: ['scan', 'abdruck'] },
    { name: 'abformungProthese', text: 'zweite Abformung für den herausnehmbaren Teil', wert: plan.abformungProthese ?? '', werte: ABFORMUNG },
    { name: 'labor', text: 'Labor (gewerbe = Fremdlabor, praxis = Eigenlabor)', wert: plan.einstellungen.labor, werte: ['gewerbe', 'praxis'] },
    ...(einheiten.length ? [
      { name: 'kronenmaterial', text: 'Kronenmaterial für ALLE Kronen, Brückenglieder und Anker des Plans (leer = gemischt oder noch nicht gewählt; ein einzelner Zahn geht über das Zahnfeld werkstoff)', wert: alle && stoffe.length === 1 ? stoffe[0] : '', werte: WERKSTOFF_NAMEN as string[] },
      { name: 'verblendung', text: 'Verblendung der Kronen und Brücken (teil = Teilverblendung, vestibulaer = nur im Verblendbereich, voll = Vollverblendung, keine = unverblendet)', wert: verblendungLage(plan) ?? '', werte: ['teil', 'vestibulaer', 'voll', 'keine'] },
    ] : []),
    ...(implantateIn(plan) ? [
      { name: 'implantat.abformung', text: 'Abformung der Implantate (scan = Scanbody, offen/geschlossen = Löffel)', wert: plan.implantat.abformung, werte: ['scan', 'offen', 'geschlossen'] },
      { name: 'implantat.abutment', text: 'Abutment auf Implantaten', wert: plan.implantat.abutment, werte: ['standard', 'individuell', 'keramik'] },
    ] : []),
  ]
}

/** Trägt Befund und Planung eines Zahns ein wie das Zahnschema in Teil 1. */
export function zahnSetzen(plan: HkpPlan, zahn: string, w: KiZahnWerte): { plan: HkpPlan; text: string } | string {
  const alt = plan.zaehne[zahn] ?? { B: '', R: '', TP: '' }
  const neu = { ...alt }
  if (w.befund !== undefined) neu.B = String(w.befund)
  if (w.planung !== undefined) neu.TP = String(w.planung)
  // Ohne Befund hat eine Planung an diesem Zahn keine Grundlage mehr.
  else if (w.befund === '') neu.TP = ''
  if (w.brueckeAnfang !== undefined) neu.bAnfang = w.brueckeAnfang === true || undefined
  if (w.brueckeEnde !== undefined) neu.bEnde = w.brueckeEnde === true || undefined
  if (!neu.TP) { neu.bAnfang = undefined; neu.bEnde = undefined }
  if (neu.B === alt.B && neu.TP === alt.TP && !!neu.bAnfang === !!alt.bAnfang && !!neu.bEnde === !!alt.bEnde) return `Zahn ${zahn} steht schon so im Plan.`
  return { plan: { ...plan, zaehne: { ...plan.zaehne, [zahn]: neu } }, text: zahnText(ZAHNFELDER, zahn, w.planung === undefined && alt.TP && !neu.TP ? { ...w, planung: '' } : w) }
}

/** Regelversorgung und Positionen aus dem Zahnschema, wie »Berechnen« im Planer. */
export function neuRechnen(q: HkpPlan): { plan: HkpPlan; hinweise: string[] } {
  const stufe = q.einstellungen.eigenPrivatStufe ?? 0
  const privat = stufe > 0 ? privatStufeAnwenden(q, stufe) : undefined
  const zaehne = privat?.plan.zaehne ?? q.zaehne
  const regel = therapieAnwenden(regelversorgungErmitteln(zaehne, regelOptionen(q)), zaehne, q)
  return { plan: privat ? privat.plan : regelUebernehmen(q, regel), hinweise: [...regel.hinweise, ...(privat?.hinweise ?? [])] }
}

const NUR_SEITE = 'Einzelne Positionen dieses Kassen-HKP ändere ich nicht: sie folgen aus Zahnschema und Ausführung. Von Hand geht es im Reiter Positionen.'

/**
 * Schritte der KI-Zeile am Kassen-HKP. Reihenfolge wie auf der Seite: erst Zahnschema und einfache Angaben,
 * dann neu rechnen, dann die Ausführung für den ganzen Plan, zuletzt das Material einzelner Zähne
 * (dafür müssen die Einheiten aus der Rechnung schon stehen).
 */
export function hkpAnwenden(plan: HkpPlan, schritte: KiSchritt[]): { plan: HkpPlan; getan: string[]; nicht: string[] } {
  let p = plan
  const getan: string[] = []
  const nicht: string[] = []
  const hinweise: string[] = []
  const ausf: Ausfuehrung = {}
  const ausfText: string[] = []
  const stoffe: [string, Werkstoff][] = []
  let rechnen = false

  for (const s of schritte) {
    if (s.op === 'zahn') {
      const werte = zahnWerte(ZAHNFELDER, s)
      if (typeof werte === 'string') { nicht.push(werte); continue }
      const { werkstoff, ...rest } = werte
      if (werkstoff !== undefined) stoffe.push([s.zahn, werkstoff as Werkstoff])
      if (!Object.keys(rest).length) continue
      const r = zahnSetzen(p, s.zahn, rest)
      if (typeof r === 'string') { if (werkstoff === undefined) nicht.push(r) }
      else { p = r.plan; getan.push(r.text); rechnen = true }
      continue
    }
    if (s.op !== 'schalter') { nicht.push(NUR_SEITE); continue }
    const jetzt = schalter(p).find((x) => x.name === s.name)
    if (!jetzt) { nicht.push('Diese Einstellung gibt es in diesem Plan gerade nicht.'); continue }
    const kopf = jetzt.text.split(' (')[0]
    if (s.name === 'haertefall') {
      if (typeof s.wert !== 'boolean') { nicht.push(`${kopf}: das geht nur mit ja oder nein.`); continue }
      if (s.wert === p.zuschuss.haertefall) { nicht.push(`${kopf} ist schon so eingestellt.`); continue }
      p = { ...p, zuschuss: { ...p.zuschuss, haertefall: s.wert } }
      getan.push(`${kopf}: ${s.wert ? 'ja' : 'nein'}`)
      continue
    }
    const w = String(s.wert)
    if (!jetzt.werte?.includes(w)) { nicht.push(`${kopf}: diesen Wert kenne ich nicht.`); continue }
    if (jetzt.wert === w) { nicht.push(`${kopf} ist schon so eingestellt.`); continue }
    const text = `${kopf}: ${w || 'ohne'}`
    if (s.name === 'bonus') { p = { ...p, zuschuss: { ...p.zuschuss, bonus: w as HkpPlan['zuschuss']['bonus'] } }; getan.push(text) }
    else if (s.name === 'versorgungsart') { p = { ...p, versorgungsart: w as HkpPlan['versorgungsart'] }; getan.push(text) }
    else if (s.name === 'abformungProthese') { p = { ...p, abformungProthese: w as HkpPlan['abformungProthese'] }; getan.push(text); rechnen = true }
    else if (s.name === 'implantat.abformung' || s.name === 'implantat.abutment') { p = { ...p, implantat: { ...p.implantat, [s.name.slice(10)]: w } }; getan.push(text); rechnen = true }
    else if (s.name === 'abformung') { ausf.abformung = w as Ausfuehrung['abformung']; ausfText.push(text) }
    else if (s.name === 'labor') { ausf.labor = w as Ausfuehrung['labor']; ausfText.push(text) }
    else if (s.name === 'kronenmaterial') { ausf.werkstoff = w as Werkstoff; ausfText.push(`${kopf}: ${WERKSTOFFE[w as Werkstoff].titel}`) }
    else if (s.name === 'verblendung') { ausf.verblendung = w as Ausfuehrung['verblendung']; ausfText.push(text) }
  }

  if (rechnen) { const r = neuRechnen(p); p = r.plan; hinweise.push(...r.hinweise) }
  if (ausfText.length) {
    const r = ausfuehrungAnwenden(p, ausf)
    p = r.plan
    getan.push(...ausfText)
    hinweise.push(...r.hinweise)
    rechnen = true
  }
  for (const [zahn, w] of stoffe) {
    const info = WERKSTOFFE[w]
    if (!einheitenVon(p).some((e) => e.zahn === zahn)) { nicht.push(`Zahn ${zahn} trägt in diesem Plan keine Krone, kein Brückenglied und kein Teleskop. Ein Kronenmaterial lässt sich dort nicht wählen.`); continue }
    let q: HkpPlan = { ...p, zaehne: zahnFuerWerkstoff(p, zahn, w) }
    if (q.zaehne[zahn] !== p.zaehne[zahn]) q = neuRechnen(q).plan
    const e = einheitenVon(q).find((x) => x.zahn === zahn)
    if (!e || !WERKSTOFFE_FUER[e.art].includes(w)) {
      nicht.push(`Zahn ${zahn}: ${info.titel} passt nicht zu der dort geplanten Einheit${e ? ` (${e.art === 'metall' ? 'Metall' : 'Keramik'}); möglich sind ${WERKSTOFFE_FUER[e.art].map((x) => WERKSTOFFE[x].kurz).join(', ')}` : ''}.`)
      continue
    }
    if (q === p && p.werkstoffe?.[zahn] === w) { nicht.push(`Zahn ${zahn} hat schon ${info.titel}.`); continue }
    p = { ...q, werkstoffe: { ...(q.werkstoffe ?? {}), [zahn]: w } }
    getan.push(`Zahn ${zahn}: Kronenmaterial ${info.titel}`)
    rechnen = true
  }
  if (rechnen && p !== plan) getan.push('Regelversorgung, Festzuschüsse und Positionen neu gerechnet')
  for (const h of [...new Set(hinweise)].slice(0, 4)) getan.push(`Hinweis des Planers: ${h}`)
  return { plan: p, getan, nicht }
}

export function hkpKi(lesen: () => { plan: HkpPlan; ergebnis: Ergebnis; listen: Listen; gesperrt: boolean }, schreiben: (plan: HkpPlan) => void): PlanKiDienst {
  const anwenden = (plan: HkpPlan, schritte: KiSchritt[]) => hkpAnwenden(plan, schritte)
  return kiDienst<HkpPlan>({
    lesen: () => { const s = lesen(); return { plan: s.plan, gesperrt: s.gesperrt } },
    schreiben, anwenden,
    gesamt: (plan) => berechnen(plan, lesen().listen).summen.gesamt,
    blick: (plan, gesperrt): PlanBlick => {
    const e = berechnen(plan, lesen().listen)
    const zaehne = Object.entries(plan.zaehne as unknown as Record<string, Record<string, unknown>>)
      .map(([nr, z]) => {
        const teile = ['B', 'R', 'TP'].filter((k) => typeof z[k] === 'string' && z[k]).map((k) => `${k} ${z[k]}`)
        return teile.length ? `${nr}: ${teile.join(', ')}` : ''
      }).filter(Boolean)
    const s = e.summen
    return {
      planart: 'kassen-hkp', name: 'Heil- und Kostenplan Zahnersatz der gesetzlichen Kasse (BEMA, GOZ, BEL II/BEB, Festzuschüsse)',
      nummer: '', gesperrt, kann: gesperrt ? [] : ['schalter', 'zahn', 'zurueck'], ebenen: [],
      positionen: e.positionen.map((p) => ({
        id: p.id, ebene: p.ebene, nr: p.nr, zahn: p.zahn, anzahl: p.anzahl,
        ...(p.faktor !== undefined ? { faktor: p.faktor } : {}),
        einzel: p.einzelpreis, betrag: p.betrag, text: p.bezeichnung,
        ...(p.auto ? { auto: true } : {}), ...(p.begruendung ? { begruendung: p.begruendung } : {}),
      })),
      summen: {
        bemaHonorar: s.bemaHonorar, gozHonorar: s.gozHonorar, materialUndLabor: s.materialUndLabor, gesamt: s.gesamt,
        festzuschuss: s.festzuschuss, kassenanteil: s.kassenanteil, eigenanteil: s.eigenanteil,
      },
      angaben: {
        versorgungsart: String(e.versorgungsart),
        zahnschema: zaehne.join('; ') || 'noch nichts eingetragen',
        festzuschussBefunde: e.befunde.map((b) => `${b.nr} (${b.zahnGebiet || '-'}) ${b.anzahl}× = ${b.betrag.toFixed(2)} €`).join('; ') || 'keine',
        bonus: `${plan.zuschuss.bonus} %${plan.zuschuss.haertefall ? ', Härtefall' : ''}`,
        abformung: plan.abformung || 'noch nicht festgelegt',
        kronenmaterial: einheitenVon(plan).map((x) => { const w = werkstoffVon(x, plan.werkstoffe ?? {}); return `${x.zahn}: ${WERKSTOFFE[w.werkstoff].kurz}${w.gewaehlt ? '' : ' (Vorgabe, noch nicht gewählt)'}` }).join('; ') || 'keine Einheit mit Kronenmaterial',
        ...(e.zusatzNichtAngesetzt.length ? { nichtAngesetzt: e.zusatzNichtAngesetzt.join('; ') } : {}),
        aufbau: 'Ich kann Befund und Therapieplanung je Zahn im Zahnschema ändern und die Angaben aus SCHALTER setzen (Bonus, Härtefall, Versorgungsart, Abformung, Labor, Kronenmaterial, Verblendung, Implantatangaben); der Planer rechnet daraus Regelversorgung, Festzuschüsse und Positionen neu. Einzelne Positionen ändert die Praxis im Reiter Positionen.',
      },
      schalter: schalter(plan), zahnfelder: ZAHNFELDER,
      hinweise: e.hinweise.map((h) => ({ stufe: h.stufe, text: h.text })),
    }
    },
  })
}
