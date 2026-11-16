/** Der Kassen-PAR-Fall für die KI-Zeile: lesen und den Zahnbefund des Anfangsbefunds (Blatt 2) ändern. */
import type { Einstellungen, ParFall, ZahnBefund } from './types'
import { pruefeFall } from './engine/pruefung'
import { diagnostizieren } from './engine/diagnose'
import { initialBefund } from './engine/strecke'
import { streckeRechnen, type Preise } from './engine/leistungen'
import { leererZahnBefund } from './store'
import { kiDienst, zahnText, zahnWerte, type KiSchritt, type KiZahnFeld, type KiZahnWerte, type PlanBlick, type PlanKiDienst } from './planKi'

const GRAD = { '0': 'Grad 0', '1': 'Grad I', '2': 'Grad II', '3': 'Grad III' }
export const ZAHNFELDER: KiZahnFeld[] = [
  { name: 'zahnstatus', text: 'Zahnstatus (ZS) im Anfangsbefund', werte: { '0': 'vorhanden, erhaltungswürdig', '1': 'fehlender Zahn', '2': 'nicht erhaltungswürdiger Zahn', '3': 'Krone', '4': 'Brückenpfeiler', '5': 'Ersatz (Brückenglied)', '6': 'Implantat' } },
  { name: 'stMesial', text: 'Sondierungstiefe mesial in mm', von: 0, bis: 15 },
  { name: 'stDistal', text: 'Sondierungstiefe distal in mm', von: 0, bis: 15 },
  { name: 'bopMesial', text: 'Sondierungsbluten mesial', ja: true },
  { name: 'bopDistal', text: 'Sondierungsbluten distal', ja: true },
  { name: 'lockerung', text: 'Lockerungsgrad', werte: GRAD },
  { name: 'furkation', text: 'Furkationsbefall', werte: GRAD },
]

/** Trägt den Befund eines Zahns in den Anfangsbefund ein wie Blatt 2; Diagnose, Prüfung und Strecke rechnen daraus neu. */
export function zahnSetzen(fall: ParFall, zahn: string, w: KiZahnWerte): { plan: ParFall; text: string } | string {
  const befund = initialBefund(fall)
  const alt: ZahnBefund = befund.zaehne[zahn] ?? leererZahnBefund()
  const neu: ZahnBefund = { ...alt, st: [...alt.st], bop: [...alt.bop] }
  if (w.zahnstatus !== undefined) neu.zs = Number(w.zahnstatus) as ZahnBefund['zs']
  if (w.stMesial !== undefined) neu.st[0] = Number(w.stMesial)
  if (w.stDistal !== undefined) neu.st[1] = Number(w.stDistal)
  if (w.bopMesial !== undefined) neu.bop[0] = w.bopMesial === true
  if (w.bopDistal !== undefined) neu.bop[1] = w.bopDistal === true
  if (w.lockerung !== undefined) neu.lockerung = Number(w.lockerung) as ZahnBefund['lockerung']
  if (w.furkation !== undefined) neu.fb = Number(w.furkation) as ZahnBefund['fb']
  if (JSON.stringify(alt) === JSON.stringify(neu)) return `Zahn ${zahn} steht schon so im Anfangsbefund.`
  if (!fall.befunde.some((b) => b.id === befund.id)) return 'Dieser Fall hat noch keinen Anfangsbefund.'
  return {
    plan: { ...fall, befunde: fall.befunde.map((b) => (b.id === befund.id ? { ...b, zaehne: { ...b.zaehne, [zahn]: neu } } : b)) },
    text: zahnText(ZAHNFELDER, zahn, w),
  }
}

export function parKi(lesen: () => { fall: ParFall; gesperrt: boolean; preise: Preise; einst: Einstellungen }, schreiben: (fall: ParFall) => void): PlanKiDienst {
  const anwenden = (fall: ParFall, schritte: KiSchritt[]) => {
    let p = fall
    const getan: string[] = []
    const nicht: string[] = []
    for (const s of schritte) {
      if (s.op !== 'zahn') { nicht.push('Die Leistungen je Termin wählt die Praxis über die Kacheln der Strecke. Ich kann den Zahnbefund des Anfangsbefunds ändern.'); continue }
      const werte = zahnWerte(ZAHNFELDER, s)
      const r = typeof werte === 'string' ? werte : zahnSetzen(p, s.zahn, werte)
      if (typeof r === 'string') nicht.push(r)
      else { p = r.plan; getan.push(r.text) }
    }
    return { plan: p, getan, nicht }
  }
  return kiDienst<ParFall>({
    lesen: () => { const s = lesen(); return { plan: s.fall, gesperrt: s.gesperrt } },
    schreiben, anwenden,
    gesamt: (fall) => streckeRechnen(fall, lesen().preise).summe,
    blick: (fall, gesperrt): PlanBlick => {
    const { preise, einst } = lesen()
    const strecke = streckeRechnen(fall, preise)
    const initial = initialBefund(fall)
    const diag = diagnostizieren(fall.diagnose, initial)
    const meldungen = pruefeFall(fall, einst, diag)
    const zaehne = Object.entries(initial.zaehne)
      .filter(([, z]) => z.zs || z.st.some((t) => t != null) || z.bop.some(Boolean) || z.lockerung || z.fb)
      .map(([nr, z]) => `${nr}: ZS ${z.zs}, ST ${z.st.map((t) => t ?? '-').join('/')}${z.bop.some(Boolean) ? ', BOP' : ''}${z.lockerung ? `, Lockerung ${z.lockerung}` : ''}${z.fb ? `, Furkation ${z.fb}` : ''}`)
    return {
      planart: 'kassen-par', name: 'Parodontitis-Behandlungsstrecke der gesetzlichen Kasse (BEMA Teil 4, PAR-Richtlinie)',
      nummer: fall.nummer, gesperrt, kann: gesperrt ? [] : ['zahn', 'zurueck'], ebenen: [],
      positionen: strecke.je.flatMap(({ termin, r }) => r.positionen.map((p) => ({
        id: `${termin.id}|${p.schluessel}`, ebene: p.privat ? 'GOZ' : p.sys, nr: p.nr, zahn: '', anzahl: p.menge,
        ...(p.faktor != null ? { faktor: p.faktor } : {}),
        betrag: p.euro, text: p.titel, sitzung: `${termin.titel}${termin.datum ? ` ${termin.datum}` : ''}${termin.erbracht ? ' (erbracht)' : ''}`, auto: true,
      }))),
      summen: { gesamt: strecke.summe, kasse: strecke.kasse, privat: strecke.privat, erbracht: strecke.erbracht },
      angaben: {
        termine: fall.termine.map((t) => `${t.titel}${t.datum ? ` am ${t.datum}` : ''}${t.erbracht ? ', erbracht' : ''}`).join('; ') || 'keine',
        modus: String(fall.modus),
        cpt: fall.mitCPT ? 'chirurgische Therapie vorgesehen' : 'keine chirurgische Therapie vorgesehen',
        anfangsbefund: zaehne.join('; ') || 'noch nichts eingetragen',
        diagnose: `Stadium ${diag.stadium}, Grad ${diag.grad}`,
        aufbau: 'Die Leistungen je Termin wählt die Praxis über die Kacheln der Strecke. Ich kann den Zahnbefund des Anfangsbefunds je Zahn ändern (Zahnstatus, Sondierungstiefen, Bluten, Lockerung, Furkation); Diagnose, Prüfung und Strecke rechnen daraus neu.',
      },
      schalter: [], zahnfelder: ZAHNFELDER,
      hinweise: meldungen.map((m) => ({ stufe: m.art === 'hinweis' ? 'info' as const : m.art, text: `${m.bereich}: ${m.text}` })),
    }
    },
  })
}
