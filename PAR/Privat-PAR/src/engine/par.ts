// Rechnung des Privat-PAR-Planers.
//
// Die Behandlungsstrecke folgt der S3-Leitlinie wie im Kassen-PAR-Planer (Diagnostik,
// ATG/MHU, AIT, BEV, CPT, UPT), berechnet wird nach GOZ: Punkte × Punktwert × Faktor,
// Analogleistungen mit der Bewertung ihrer Referenzleistung, Zuschläge (0110, 0500 ff.)
// nur mit dem einfachen Satz. Regeln aus PAR/_quellen/privat-par.json.

import {
  ALLE_ZAEHNE, ANALOG, analogNr, FRONTZAEHNE, istAnalog, MEHRWURZELIG, PHASE_NAME, referenzNr, UPT_FREQUENZ, type Analog,
} from '../data/katalog'
import type { Phase, Plan, Rechnung, Zeile } from '../types'
import { gozBekannt, gozEinzel, gozText, GOZ_HOECHSTSATZ, GOZ_SCHWELLE, runden } from './listen'

export const euro = (x: number) =>
  x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const faktorText = (f: number) => f.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })

export const neueId = () => Math.random().toString(36).slice(2, 10)

/** Zuschläge der GOZ: nur einfacher Gebührensatz */
const ZUSCHLAEGE = new Set(['0110', '0500', '0510', '0520', '0530'])

const quadrant = (z: string) => z[0]

export function zaehne(plan: Pick<Plan, 'fehlend'>) {
  const vorhanden = ALLE_ZAEHNE.filter((z) => !plan.fehlend.includes(z))
  const mehr = vorhanden.filter((z) => MEHRWURZELIG.has(z)).length
  return { vorhanden, ein: vorhanden.length - mehr, mehr }
}

export function rechnen(plan: Plan): Rechnung {
  const v = plan.variante
  const zeilen: Zeile[] = []
  const faktorFuer = (nr: string) => (ZUSCHLAEGE.has(nr) ? 1 : plan.faktoren[nr] ?? plan.faktor)

  const gozZeile = (phase: Phase, nr: string, anzahl: number, id = `${phase}-${nr}`) => {
    if (anzahl <= 0) return
    const faktor = faktorFuer(nr)
    const einzel = gozEinzel(nr, faktor)
    zeilen.push({ id, phase, nr, text: gozText(nr), anzahl, faktor, einzel, summe: runden(einzel * anzahl), fest: ZUSCHLAEGE.has(nr) })
  }
  const analogZeile = (phase: Phase, a: Analog, anzahl: number) => {
    if (anzahl <= 0) return
    const nr = analogNr(a, v)
    const ref = referenzNr(nr)
    const faktor = faktorFuer(nr)
    const einzel = gozEinzel(ref, faktor)
    zeilen.push({
      id: `${phase}-${nr}`, phase, nr, text: ANALOG[a].text, analog: `entsprechend GOZ ${ref} ${gozText(ref)}`,
      anzahl, faktor, einzel, summe: runden(einzel * anzahl),
    })
  }

  const { vorhanden, ein, mehr } = zaehne(plan)
  const n = vorhanden.length
  const cpt = plan.cpt.filter((z) => vorhanden.includes(z))
  const o = plan.optionen

  // Diagnostik und Planung
  gozZeile('diagnostik', '4005', 1)
  analogZeile('diagnostik', 'diagnostik', 1)
  analogZeile('diagnostik', 'formblatt', 1)
  if (o.hkp) gozZeile('diagnostik', '0030', 1)

  // Aufklärung und Mundhygiene
  analogZeile('atg', 'atg', 1)
  gozZeile('atg', '1000', 1)

  // AIT
  analogZeile('ait', 'aitEin', ein)
  analogZeile('ait', 'aitMehr', mehr)
  if (o.pzrAit) gozZeile('ait', '1040', n)

  // Befundevaluation nach AIT
  analogZeile('bev', 'bev', 1)

  // CPT: GOZ trennt Front- und Seitenzahn, Zuschlag 0500 je Behandlungstag (ein Quadrant je Sitzung)
  const front = cpt.filter((z) => FRONTZAEHNE.has(z)).length
  gozZeile('cpt', '4090', front)
  gozZeile('cpt', '4100', cpt.length - front)
  const cptSitzungen = new Set(cpt.map(quadrant)).size
  gozZeile('cpt', '0500', cptSitzungen)
  gozZeile('cpt', '4150', cpt.length)
  if (cpt.length && o.bevCpt) {
    const bev = zeilen.find((z) => z.phase === 'bev')
    if (bev) { bev.anzahl += 1; bev.summe = runden(bev.einzel * bev.anzahl) }
  }

  // UPT
  const proJahr = UPT_FREQUENZ[plan.grad]
  const jahre = Math.max(0, Math.round(plan.uptJahre))
  const uptSitzungen = proJahr * jahre
  if (uptSitzungen > 0) {
    const anteil = Math.min(100, Math.max(0, plan.resttaschen)) / 100
    gozZeile('upt', '1010', uptSitzungen)
    gozZeile('upt', '1040', n * uptSitzungen)
    // PSI: zweimal im Jahr original, darüber analog
    gozZeile('upt', '4005', Math.min(2, proJahr) * jahre)
    analogZeile('upt', 'psiMehr', Math.max(0, proJahr - 2) * jahre)
    analogZeile('upt', 'uptEin', Math.round(ein * anteil) * uptSitzungen)
    analogZeile('upt', 'uptMehr', Math.round(mehr * anteil) * uptSitzungen)
    analogZeile('upt', 'bev', jahre)
  }

  // Weitere Leistungen und Material
  for (const z of plan.zusatz) {
    if (z.anzahl <= 0) continue
    if (z.nr === 'Mat.') {
      const einzel = runden(z.preis ?? 0)
      zeilen.push({ id: z.id, phase: 'zusatz', nr: 'Mat.', text: z.text || 'Material', anzahl: z.anzahl, faktor: 1, einzel, summe: runden(einzel * z.anzahl), fest: true })
      continue
    }
    const faktor = ZUSCHLAEGE.has(z.nr) ? 1 : z.faktor ?? faktorFuer(z.nr)
    const einzel = gozEinzel(z.nr, faktor)
    zeilen.push({ id: z.id, phase: 'zusatz', nr: z.nr, text: z.text || gozText(z.nr), anzahl: z.anzahl, faktor, einzel, summe: runden(einzel * z.anzahl), fest: ZUSCHLAEGE.has(z.nr) })
  }

  const summen = Object.fromEntries(Object.keys(PHASE_NAME).map((p) => [p, 0])) as Record<Phase, number>
  for (const z of zeilen) summen[z.phase] = runden(summen[z.phase] + z.summe)
  const material = runden(zeilen.filter((z) => z.nr === 'Mat.').reduce((s, z) => s + z.summe, 0))
  const gesamt = runden(zeilen.reduce((s, z) => s + z.summe, 0))

  const hinweise: string[] = []
  const warnungen: string[] = []
  const zusatzNr = (nr: string) => plan.zusatz.some((z) => z.nr === nr && z.anzahl > 0)
  if (n === 0) warnungen.push('Im Zahnschema sind alle Zähne als fehlend markiert.')
  if (plan.cpt.some((z) => !vorhanden.includes(z))) warnungen.push('CPT an einem als fehlend markierten Zahn wird nicht gerechnet.')
  if (zusatzNr('4000')) warnungen.push('GOZ 4000 ist nicht neben der analogen PAR-Diagnostik und der Befundevaluation berechnungsfähig (Beratungsforum).')
  if (zusatzNr('4070') || zusatzNr('4075')) hinweise.push('4070/4075 nicht zahn- und sitzungsgleich neben der analogen subgingivalen Instrumentierung.')
  if (zusatzNr('4050') || zusatzNr('4055')) hinweise.push('4050/4055 nicht neben 1040 am selben Zahn und nicht neben 4090/4100 in derselben Sitzung.')
  if (zusatzNr('0110') || zusatzNr('0500')) hinweise.push('Zuschläge 0110 und 0500 ff. je Behandlungstag nur einmal und nur mit dem einfachen Satz.')
  if (proJahr > 2 && jahre) hinweise.push(`Grad C: ab der dritten Index-Erhebung im Jahr analog ${analogNr('psiMehr', v)}.`)
  if (v === 'aktuell') hinweise.push('BZÄK-Neubewertung 2026: PKV und Beihilfe kennen vertraglich nur die Beratungsforum-Werte – Erstattungsrisiko beim Patienten (Aufklärung).')
  hinweise.push('Analogleistungen: auf der Rechnung die Leistung, "entsprechend GOZ …" und den Text der Referenzleistung angeben (§ 10 Abs. 4 GOZ).')
  if (plan.gkv) hinweise.push('Gesetzlich versichert: Privatbehandlung nur mit schriftlicher Vereinbarung vor Behandlungsbeginn (§ 8 Abs. 7 BMV-Z).')
  if (plan.stadium === 'IV') hinweise.push('Stadium IV: interdisziplinäre Planung (Prothetik, ggf. Kieferorthopädie) gesondert.')
  if (cpt.length) hinweise.push('CPT: Material (Membran, Knochenersatz, Naht) und 4110/4136/4138 gesondert unter "Weitere Leistungen".')
  if (zeilen.some((z) => !z.fest && !gozBekannt(istAnalog(z.nr) ? referenzNr(z.nr) : z.nr))) warnungen.push('Eine GOZ-Nummer steht nicht in der Gebührenliste.')

  const begruendung = zeilen.filter((z) => !z.fest && z.faktor > GOZ_SCHWELLE && z.faktor <= GOZ_HOECHSTSATZ)
  const vereinbarung2 = zeilen.filter((z) => !z.fest && z.faktor > GOZ_HOECHSTSATZ)
  if (begruendung.length) hinweise.push('Faktoren über 2,3 brauchen eine schriftliche Begründung auf der Rechnung (§ 10 Abs. 3 GOZ).')
  if (vereinbarung2.length) hinweise.push('Faktoren über 3,5 nur mit Vereinbarung nach § 2 Abs. 1 und 2 GOZ vor Behandlungsbeginn.')

  return {
    zeilen, summen, honorar: runden(gesamt - material), material, gesamt, ein, mehr, uptSitzungen,
    begruendung, vereinbarung2, hinweise, warnungen,
  }
}
