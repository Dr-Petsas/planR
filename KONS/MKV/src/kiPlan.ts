/** Die Mehrkostenvereinbarung für die KI-Zeile und das Prüfmodul: lesen und Füllungen je Zahn ändern. */
import type { Einstellungen, Plan, Rechnung, Therapie, ZahnLeistung } from './types'
import { THERAPIE, THERAPIEN } from './data/katalog'
import { rechnen } from './engine/mkv'
import { feldSetzen, felderSchalter, zielSchalter, zielSetzen, type KiFeld, type KiZiel } from './planKi'
import { kiDienst, listenZeilen, zahnText, zahnWerte, type KiPosition, type KiSchritt, type KiZahnFeld, type KiZahnWerte, type PlanBlick, type PlanKiDienst } from './planKi'

const ebene = (e: string) => (e === 'ANALOG' ? 'GOZ' : e)
export const kiZeilen = (r: Rechnung): KiPosition[] =>
  listenZeilen([...r.zaehne.flatMap((z) => z.zeilen), ...r.begleit, ...r.privat7], { ebene: (z) => ebene(z.ebene ?? 'GOZ') })

export const ZAHNFELDER: KiZahnFeld[] = [
  { name: 'therapie', text: 'Füllung an diesem Zahn', werte: { '': 'Zahn aus dem Plan nehmen', ...Object.fromEntries(THERAPIEN.map((t) => [t.id, t.titel])) } },
  { name: 'flaechen', text: 'Flächen (plastische Füllung bis 5, Aufbau bis 4, Inlay und Goldhämmer bis 3)', von: 1, bis: 5 },
  { name: 'kofferdam', text: 'Kofferdam', ja: true },
  { name: 'bmf', text: 'besondere Maßnahmen beim Präparieren/Füllen (GOZ 2030)', ja: true },
  { name: 'anaesthesie', text: 'Anästhesie privat (nur Inlay, Goldhämmer)', ja: true },
  { name: 'provisorium', text: 'Provisorium GOZ 2260 (nur Inlay, Goldhämmer)', ja: true },
  { name: 'stift', text: 'Glasfaserstift (nur Aufbau)', ja: true },
  { name: 'mehrschicht', text: 'mehrschichtiger dentinadhäsiver Aufbau (nur Aufbau)', ja: true },
  { name: 'austausch', text: 'Austausch einer intakten Füllung (dann keine Mehrkostenregelung)', ja: true },
]
const regler = <K extends keyof Plan['regler']>(k: K) => ({
  lesen: (p: Plan) => p.regler[k] as number,
  setzen: (p: Plan, w: number) => ({ ...p, regler: { ...p.regler, [k]: k === 'laborKlasse' ? Math.round(w) : w } }),
})
const wunsch = (k: keyof NonNullable<Plan['privat']>) => ({
  lesen: (p: Plan) => !!p.privat?.[k],
  setzen: (p: Plan, w: boolean) => ({ ...p, privat: { ...(p.privat ?? {}), [k]: w } }),
})

/** Regler und Angaben des Plans, wie sie in der Leiste links stehen. */
export const FELDER: KiFeld<Plan>[] = [
  { name: 'regler.modell', text: 'Berechnungsmodell der Mehrkosten (gozDifferenz = GOZ-Honorar abzüglich Kassenanteil, proZahn = fester Betrag je Füllung, proFlaeche = fester Betrag je Fläche)', werte: ['gozDifferenz', 'proZahn', 'proFlaeche'], lesen: (p) => p.regler.modell, setzen: (p, w: Plan['regler']['modell']) => ({ ...p, regler: { ...p.regler, modell: w } }) },
  { name: 'regler.proZahn', text: 'Mehrkosten in Euro je Füllung (Modell proZahn)', von: 10, bis: 400, ...regler('proZahn'), da: (p) => p.regler.modell === 'proZahn' },
  { name: 'regler.proFlaeche', text: 'Mehrkosten in Euro je Fläche (Modell proFlaeche)', von: 5, bis: 150, ...regler('proFlaeche'), da: (p) => p.regler.modell === 'proFlaeche' },
  { name: 'regler.faktor', text: 'GOZ-Faktor plastischer Füllungen und Begleitleistungen; wirkt auf die Mehrkosten nur im Modell gozDifferenz, in den Modellen proZahn und proFlaeche gilt stattdessen der feste Betrag', von: 1, bis: 5, ...regler('faktor') },
  { name: 'regler.inlayFaktor', text: 'GOZ-Faktor für Inlays und Goldhämmerfüllungen', von: 1, bis: 5, ...regler('inlayFaktor') },
  { name: 'regler.laborKlasse', text: 'Preisklasse des Labors: 0 günstig, 1 Standard, 2 hochwertig', von: 0, bis: 2, ...regler('laborKlasse') },
  { name: 'abformung', text: 'Abformung für Inlays (abdruck = konventionell, scan = Intraoralscan)', werte: ['abdruck', 'scan'], lesen: (p) => p.abformung ?? '', setzen: (p, w: NonNullable<Plan['abformung']>) => ({ ...p, abformung: w }), da: (p) => Object.values(p.zaehne).some((z) => z.therapie === 'inlay') },
  { name: 'privat.oberflaeche', text: 'Oberflächenanästhesie privat dazu (GOZ 0080)', ...wunsch('oberflaeche') },
  { name: 'privat.fluorid', text: 'lokale Fluoridierung privat dazu (GOZ 1020)', ...wunsch('fluorid') },
  { name: 'privat.adhaesivKomposit', text: 'adhäsive Befestigung neben Kompositfüllungen (GOZ 2197, strittig, nur ausdrücklich vereinbart)', ...wunsch('adhaesivKomposit') },
  { name: 'bemerkung', text: 'Bemerkung auf dem Plan (freier Text)', lesen: (p) => p.bemerkung ?? '', setzen: (p, w: string) => ({ ...p, bemerkung: w }) },
]

const maxFlaechen = (t: Therapie) => THERAPIE[t].maxFlaechen ?? (THERAPIE[t].plastisch ? 5 : 3)

/** Trägt die Füllung eines Zahns ein wie Zahnschema und Tabelle; die Rechnung folgt daraus. */
export function zahnSetzen(plan: Plan, zahn: string, w: KiZahnWerte): { plan: Plan; text: string } | string {
  const alt = plan.zaehne[zahn]
  const zaehne = { ...plan.zaehne }
  if (w.therapie === '') {
    if (!alt) return `Zahn ${zahn} ist nicht im Plan.`
    delete zaehne[zahn]
    return { plan: { ...plan, zaehne }, text: `Zahn ${zahn} aus dem Plan genommen` }
  }
  const therapie = (w.therapie as Therapie | undefined) ?? alt?.therapie
  if (!therapie) return `Zahn ${zahn} ist noch nicht im Plan. Dafür brauche ich die Art der Füllung.`
  const t = THERAPIE[therapie]
  let neu: ZahnLeistung = !alt ? { therapie, flaechen: 2, ...(therapie === 'inlay' ? { labor: 'keramik' } : {}) }
    : alt.therapie === therapie ? { ...alt }
      : {
        ...alt, therapie, flaechen: Math.min(maxFlaechen(therapie), alt.flaechen), labor: therapie === 'inlay' ? alt.labor ?? 'keramik' : undefined, faktor: undefined,
        stift: therapie === 'aufbau' ? alt.stift : undefined, mehrschicht: therapie === 'aufbau' ? alt.mehrschicht : undefined, provisorium: t.plastisch ? undefined : alt.provisorium,
      }
  for (const [name, wert] of Object.entries(w)) {
    if (name === 'therapie') continue
    if (name === 'flaechen' && Number(wert) > maxFlaechen(therapie)) return `Zahn ${zahn}: bei »${t.kurz}« höchstens ${maxFlaechen(therapie)} Flächen.`
    if ((name === 'anaesthesie' || name === 'provisorium') && t.plastisch) return `Zahn ${zahn}: das gibt es nur bei Inlay und Goldhämmerfüllung.`
    if ((name === 'stift' || name === 'mehrschicht') && therapie !== 'aufbau') return `Zahn ${zahn}: das gibt es nur beim Aufbau.`
    neu = { ...neu, [name]: wert }
  }
  if (alt && JSON.stringify(alt) === JSON.stringify(neu)) return `Zahn ${zahn} steht schon so im Plan.`
  zaehne[zahn] = neu
  return { plan: { ...plan, zaehne }, text: zahnText(ZAHNFELDER, zahn, w) }
}

export function mkvKi(lesen: () => { plan: Plan; gesperrt: boolean; einst: Einstellungen }, schreiben: (plan: Plan) => void): PlanKiDienst {
  const rechnung = (plan: Plan) => rechnen(plan, lesen().einst)
  const summe = (plan: Plan) => { const r = rechnung(plan); return r.mehrkosten + r.privat7Summe }
  // Beide GOZ-Regler (plastische Füllungen und Inlays) laufen gemeinsam; in den Festbetrags-Modellen ändert der Faktor nichts, dann fehlt der Schalter.
  const ziel: KiZiel<Plan> = { was: 'GOZ-Faktor (Füllungen und Inlays gemeinsam)', gesamt: summe, lesen: (p) => p.regler.faktor, setzen: (p, f) => ({ ...p, regler: { ...p.regler, faktor: f, inlayFaktor: f } }) }
  const anwenden = (plan: Plan, schritte: KiSchritt[]) => {
    let p = plan
    const getan: string[] = []
    const nicht: string[] = []
    for (const s of schritte) {
      if (s.op === 'schalter') {
        const r = s.name === 'zielbetrag' ? zielSetzen(p, ziel, s.wert) : feldSetzen(FELDER, p, s.name, s.wert) ?? 'Diese Einstellung gibt es in diesem Plan gerade nicht.'
        if (typeof r === 'string') nicht.push(r)
        else { p = r.plan; getan.push(r.text) }
        continue
      }
      if (s.op !== 'zahn') { nicht.push('Freie Positionen nimmt dieser Plan nicht auf; alle Zeilen folgen aus den Füllungen je Zahn und den Reglern.'); continue }
      const werte = zahnWerte(ZAHNFELDER, s)
      const r = typeof werte === 'string' ? werte : zahnSetzen(p, s.zahn, werte)
      if (typeof r === 'string') nicht.push(r)
      else { p = r.plan; getan.push(r.text) }
    }
    return { plan: p, getan, nicht }
  }
  return kiDienst<Plan>({
    lesen, schreiben, anwenden,
    gesamt: summe,
    blick: (plan, gesperrt): PlanBlick => {
    const r = rechnung(plan)
    return {
      planart: 'mkv', name: 'Mehrkostenvereinbarung Füllungen (§ 28 Abs. 2 SGB V): private Leistung abzüglich Kassenanteil',
      nummer: plan.nummer, gesperrt, kann: gesperrt ? [] : ['schalter', 'zahn', 'zurueck'], ebenen: [],
      positionen: kiZeilen(r),
      summen: { privat: r.privat, kassenanteil: r.kassenanteil, mehrkosten: r.mehrkosten, privatOhneKasse: r.privat7Summe },
      angaben: {
        zaehne: Object.entries(plan.zaehne).map(([nr, z]) => `${nr}: ${z.therapie}, ${z.flaechen} Flächen${z.austausch ? ', Austausch intakter Füllung' : ''}`).join('; ') || 'noch kein Zahn geplant',
        regler: `Modell ${plan.regler.modell}, Faktor ${plan.regler.faktor}, Inlay-Faktor ${plan.regler.inlayFaktor}, Laborklasse ${plan.regler.laborKlasse}`,
        punktwert: `${r.punktwert}; ${r.punktwertHinweis}`,
        aufbau: 'Alle Zeilen errechnet der Planer aus Therapie und Flächen je Zahn und den Reglern. Freie Positionen nimmt dieser Plan nicht auf. Ich kann Füllungen je Zahn eintragen, ändern und herausnehmen und die Regler und Angaben aus SCHALTER setzen.',
        ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
      },
      schalter: [...felderSchalter(FELDER, plan), ...zielSchalter(plan, ziel)], zahnfelder: ZAHNFELDER, hinweise: [],
    }
    },
  })
}
