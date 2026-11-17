/** Der Kassen-PAR-Fall für die KI-Zeile: lesen, die Planung der Strecke stellen und den Zahnbefund des Anfangsbefunds (Blatt 2) ändern. */
import type { Einstellungen, ParFall, Planung, ZahnBefund } from './types'
import { pruefeFall } from './engine/pruefung'
import { diagnostizieren } from './engine/diagnose'
import { initialBefund } from './engine/strecke'
import { reglerGesamt, streckeRechnen, type Preise } from './engine/leistungen'
import { terminePlanen } from './engine/termine'
import { leererZahnBefund } from './store'
import { feldSetzen, felderSchalter, kiDienst, zahnText, zahnWerte, type KiFeld, type KiSchalter, type KiSchritt, type KiZahnFeld, type KiZahnWerte, type PlanBlick, type PlanKiDienst } from './planKi'

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

/** Trägt den Befund eines Zahns in den Anfangsbefund ein wie Blatt 2; Diagnose, Prüfung und Strecke rechnen daraus neu. Eine einzelne BEMA- oder GOZ-Nummer in einen Termin legen oder daraus nehmen kann ich nicht; ein Befundeintrag bewirkt das auch nicht. Messwerte trage ich nur ein, wenn die Praxis sie nennt. */
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

/** Strecke aus Planung und Diagnose neu aufbauen, wie »neu berechnen« auf der Seite. */
const neuPlanen = (f: ParFall): ParFall => ({ ...f, termine: terminePlanen(f, diagnostizieren(f.diagnose, initialBefund(f))) })
const planung = (f: ParFall, patch: Partial<Planung>) => neuPlanen({ ...f, planung: { ...f.planung, ...patch } })
const SITZ = ['1', '2', '4']

/** Die Einstellungen der Strecke, wie sie links auf der Seite stehen. */
export const FELDER: KiFeld<ParFall>[] = [
  { name: 'modus', text: 'Umsatz (bema = nur Kassenleistungen, bemaplus = BEMA und private Zusatzleistungen)', werte: ['bema', 'bemaplus'], lesen: (f) => f.modus, setzen: (f, w: ParFall['modus']) => ({ ...f, modus: w }) },
  { name: 'planung.aitSitzungen', text: 'AIT-Sitzungen (1 = alles in einer Sitzung, 2 = je Kiefer, 4 = je Quadrant)', werte: SITZ, lesen: (f) => String(f.planung.aitSitzungen), setzen: (f, w: string) => planung(f, { aitSitzungen: Number(w) as 1 | 2 | 4 }) },
  { name: 'planung.aitAbstandTage', text: 'Abstand zwischen den AIT-Sitzungen in Tagen', von: 1, bis: 60, lesen: (f) => f.planung.aitAbstandTage, setzen: (f, w: number) => planung(f, { aitAbstandTage: Math.round(w) }) },
  { name: 'planung.genehmigungTage', text: 'Tage vom Befund bis zur Genehmigung', von: 0, bis: 120, lesen: (f) => f.planung.genehmigungTage, setzen: (f, w: number) => planung(f, { genehmigungTage: Math.round(w) }) },
  { name: 'planung.mitPzr', text: 'private Vorbehandlung (PZR) vor der Strecke', lesen: (f) => f.planung.mitPzr, setzen: (f, w: boolean) => planung(f, { mitPzr: w }) },
  { name: 'mitCPT', text: 'chirurgische Therapie CPT (offenes Vorgehen) vorgesehen', lesen: (f) => f.mitCPT, setzen: (f, w: boolean) => neuPlanen({ ...f, mitCPT: w }) },
  { name: 'planung.cptSitzungen', text: 'CPT-Sitzungen (1, 2 oder 4)', werte: SITZ, lesen: (f) => String(f.planung.cptSitzungen), setzen: (f, w: string) => planung(f, { cptSitzungen: Number(w) as 1 | 2 | 4 }), da: (f) => f.mitCPT },
  { name: 'planung.par22a', text: 'Versorgung nach § 22a SGB V (Anzeige 5e)', lesen: (f) => f.planung.par22a, setzen: (f, w: boolean) => planung(f, { par22a: w }) },
  { name: 'planung.verlaengerungMonate', text: 'Verlängerung der UPT in Monaten', von: 0, bis: 24, lesen: (f) => f.planung.verlaengerungMonate, setzen: (f, w: number) => planung(f, { verlaengerungMonate: Math.round(w) }) },
  { name: 'bemerkung', text: 'Bemerkungen auf dem Antrag (freier Text)', lesen: (f) => f.bemerkung ?? '', setzen: (f, w: string) => ({ ...f, bemerkung: w }) },
]

const geld = (x: number) => `${x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

/** Umsatzregler der Seite: verteilt den Zielumsatz auf die offenen Termine. */
function zielSchalter(fall: ParFall, preise: Preise): KiSchalter[] {
  const s = streckeRechnen(fall, preise)
  if (!fall.termine.length || !(s.potential - s.basis > 0.005)) return []
  return [{ name: 'zielbetrag', text: `Zielumsatz der ganzen Strecke in Euro (Umsatzregler: wählt Begleit- und Zusatzleistungen auf offenen Terminen; möglich ${geld(s.basis)} bis ${geld(s.potential)}${fall.modus === 'bema' ? '; private Zusatzleistungen erst mit modus bemaplus' : ''}; 0 setzt den Regler zurück)`, wert: fall.zielGesamt || 0 }]
}
function zielSetzen(fall: ParFall, preise: Preise, wert: boolean | string | number): { plan: ParFall; text: string } | string {
  if (typeof wert !== 'number' || wert < 0) return 'Zielumsatz: ich brauche den gewünschten Betrag in Euro.'
  if (wert === 0) return { plan: { ...fall, zielGesamt: 0, termine: fall.termine.map((t) => (t.erbracht ? t : { ...t, auto: [] })) }, text: 'Umsatzregler zurückgesetzt' }
  const s = streckeRechnen(fall, preise)
  if (wert < s.basis - 0.005 || wert > s.potential + 0.005) return `Zielumsatz ${geld(wert)}: mit dem Regler sind in dieser Strecke ${geld(s.basis)} bis ${geld(s.potential)} möglich${fall.modus === 'bema' ? ' (nur BEMA; mit BEMA + privat ist mehr möglich)' : ''}. Ich habe nichts verstellt.`
  const neu = { ...fall, zielGesamt: wert, termine: reglerGesamt(fall, preise, wert) }
  return { plan: neu, text: `Zielumsatz ${geld(wert)}: die Strecke steht jetzt bei ${geld(streckeRechnen(neu, preise).summe)}` }
}

export function parKi(lesen: () => { fall: ParFall; gesperrt: boolean; preise: Preise; einst: Einstellungen }, schreiben: (fall: ParFall) => void): PlanKiDienst {
  const anwenden = (fall: ParFall, schritte: KiSchritt[]) => {
    let p = fall
    const getan: string[] = []
    const nicht: string[] = []
    for (const s of schritte) {
      if (s.op === 'schalter') {
        const r = s.name === 'zielbetrag' ? zielSetzen(p, lesen().preise, s.wert) : feldSetzen(FELDER, p, s.name, s.wert) ?? 'Diese Einstellung gibt es in diesem Fall gerade nicht.'
        if (typeof r === 'string') nicht.push(r)
        else { p = r.plan; getan.push(r.text) }
        continue
      }
      if (s.op !== 'zahn') { nicht.push('Einzelne Leistungen je Termin wählt die Praxis über die Kacheln der Strecke. Ich kann die Planung der Strecke stellen, den Zielumsatz setzen und den Zahnbefund des Anfangsbefunds ändern.'); continue }
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
      nummer: fall.nummer, gesperrt, kann: gesperrt ? [] : ['schalter', 'zahn', 'zurueck'], ebenen: [],
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
        aufbau: 'Einzelne Leistungen je Termin wählt die Praxis über die Kacheln der Strecke. Ich kann die Planung der Strecke stellen (Sitzungen, CPT, PZR, Umsatz, Zielumsatz, Bemerkung) und den Zahnbefund des Anfangsbefunds je Zahn ändern (Zahnstatus, Sondierungstiefen, Bluten, Lockerung, Furkation); Diagnose, Prüfung und Strecke rechnen daraus neu. Eine einzelne BEMA- oder GOZ-Nummer in einen Termin legen oder daraus nehmen kann ich nicht; ein Befundeintrag bewirkt das auch nicht. Messwerte trage ich nur ein, wenn die Praxis sie nennt.',
      },
      schalter: [...felderSchalter(FELDER, fall), ...zielSchalter(fall, preise)], zahnfelder: ZAHNFELDER,
      hinweise: meldungen.map((m) => ({ stufe: m.art === 'hinweis' ? 'info' as const : m.art, text: `${m.bereich}: ${m.text}` })),
    }
    },
  })
}
