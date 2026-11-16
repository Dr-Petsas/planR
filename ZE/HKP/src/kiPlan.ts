/**
 * Der Kassen-HKP für die KI-Zeile: lesen und das Zahnschema ändern. Nach einer Änderung an Befund oder Planung
 * rechnet der Planer Regelversorgung und Positionen neu, wie der Knopf »Berechnen«.
 */
import type { HkpPlan } from './types'
import { berechnen, type Ergebnis, type Listen } from './engine/berechnung'
import { BEFUND_KUERZEL, THERAPIE_KUERZEL } from './engine/zahnschema'
import { regelOptionen, regelversorgungErmitteln, therapieAnwenden } from './engine/regeln'
import { privatStufeAnwenden, regelUebernehmen } from './engine/aufwertung'
import { kiDienst, zahnText, zahnWerte, type KiSchritt, type KiZahnFeld, type KiZahnWerte, type PlanBlick, type PlanKiDienst } from './planKi'

export const ZAHNFELDER: KiZahnFeld[] = [
  { name: 'befund', text: 'Befund (Zeile B, Kleinbuchstaben)', werte: { '': 'leer, kein Befund', ...BEFUND_KUERZEL } },
  { name: 'planung', text: 'Therapieplanung (Zeile TP, Großbuchstaben; leer = Regelversorgung gilt)', werte: { '': 'leer, keine abweichende Planung', ...THERAPIE_KUERZEL } },
  { name: 'brueckeAnfang', text: 'Brückenspanne beginnt an diesem Zahn', ja: true },
  { name: 'brueckeEnde', text: 'Brückenspanne endet an diesem Zahn', ja: true },
]

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

export function hkpKi(lesen: () => { plan: HkpPlan; ergebnis: Ergebnis; listen: Listen; gesperrt: boolean }, schreiben: (plan: HkpPlan) => void): PlanKiDienst {
  const anwenden = (plan: HkpPlan, schritte: KiSchritt[]) => {
    let p = plan
    const getan: string[] = []
    const nicht: string[] = []
    for (const s of schritte) {
      if (s.op !== 'zahn') { nicht.push('Positionen dieses Kassen-HKP ändere ich über das Zahnschema: Befund und Planung je Zahn, der Planer rechnet daraus neu. Einzelne Positionen ändert die Praxis im Reiter Positionen.'); continue }
      const werte = zahnWerte(ZAHNFELDER, s)
      const r = typeof werte === 'string' ? werte : zahnSetzen(p, s.zahn, werte)
      if (typeof r === 'string') nicht.push(r)
      else { p = r.plan; getan.push(r.text) }
    }
    if (p !== plan) {
      const r = neuRechnen(p)
      p = r.plan
      getan.push('Regelversorgung, Festzuschüsse und Positionen neu gerechnet')
      for (const h of r.hinweise.slice(0, 4)) getan.push(`Hinweis des Planers: ${h}`)
    }
    return { plan: p, getan, nicht }
  }
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
      nummer: '', gesperrt, kann: gesperrt ? [] : ['zahn', 'zurueck'], ebenen: [],
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
        ...(e.zusatzNichtAngesetzt.length ? { nichtAngesetzt: e.zusatzNichtAngesetzt.join('; ') } : {}),
        aufbau: 'Ich kann Befund und Therapieplanung je Zahn im Zahnschema ändern; der Planer rechnet daraus Regelversorgung, Festzuschüsse und Positionen neu. Einzelne Positionen ändert die Praxis im Reiter Positionen.',
      },
      schalter: [], zahnfelder: ZAHNFELDER,
      hinweise: e.hinweise.map((h) => ({ stufe: h.stufe, text: h.text })),
    }
    },
  })
}
