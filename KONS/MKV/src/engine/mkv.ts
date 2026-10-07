// Rechnung der Füllungs-MKV.
//
// Mehrkosten = GOZ-Honorar (+ Labor) − Kassenanteil der vergleichbaren
// plastischen Füllung (BEMA 13a-d × KZV-Punktwert). Die Rechnung an den
// Patienten ist immer eine GOZ-Rechnung (KZBV-Muster zur MKV).
//
// Viele Praxen legen die Mehrkosten als festen Betrag fest (je Füllung oder je
// Fläche). Das geht nur über den Faktor: Der Planer rechnet aus dem Zielbetrag
// den nötigen GOZ-Faktor zurück. Über 2,3 braucht es eine Begründung (§ 10 Abs. 3
// GOZ), über 3,5 eine schriftliche Vereinbarung nach § 2 Abs. 1 und 2 GOZ; unter
// dem Einfachsatz geht es nicht.

import { bemaFuer, LABOR_KLASSE_FAKTOR, THERAPIE } from '../data/katalog'
import { ermittlePunktwert } from '../punktwerte'
import type { Einstellungen, Plan, Rechnung, ZahnErgebnis, ZahnLeistung, Zeile } from '../types'
import { GOZ_HOECHSTSATZ, GOZ_PUNKTWERT, GOZ_SCHWELLE, gozPunkte, gozText, runden } from './listen'
import { ALLE_ZAEHNE, istFrontzahn, regionVon } from './zahnschema'

export const euro = (x: number) =>
  x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const faktorText = (f: number) => f.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })

const flaechenWort = (n: number) => ['', 'einflächig', 'zweiflächig', 'dreiflächig', 'vierflächig', 'fünfflächig'][n] ?? `${n}-flächig`

function gozZeile(nr: string, faktor: number, anzahl = 1, ebene: Zeile['ebene'] = 'GOZ', text?: string): Zeile {
  const einzel = runden(gozPunkte(nr) * GOZ_PUNKTWERT * faktor)
  return {
    ebene, nr: ebene === 'ANALOG' ? `${nr}a` : nr,
    text: text ?? gozText(nr), anzahl, faktor, einzel, summe: runden(einzel * anzahl),
  }
}

/** Faktor, mit dem die Hauptleistung genau den Zielbetrag an Mehrkosten ergibt. */
export function faktorFuerZiel(nr: string, ziel: number, kassenanteil: number): number {
  const punkte = gozPunkte(nr)
  if (!punkte) return GOZ_SCHWELLE
  return Math.round(((ziel + kassenanteil) / (punkte * GOZ_PUNKTWERT)) * 100) / 100
}

export function zahnRechnen(zahn: string, z: ZahnLeistung, plan: Plan, einst: Einstellungen, punktwert: number): ZahnErgebnis {
  const t = THERAPIE[z.therapie]
  const r = plan.regler
  const flaechen = Math.min(5, Math.max(1, z.flaechen || 1))
  const nr = t.goz(flaechen)
  const hinweise: string[] = []
  const warnungen: string[] = []

  const bema = bemaFuer(flaechen)
  const kassenanteil = z.austausch ? 0 : runden(bema.punkte * punktwert)
  const kasse: Zeile | null = z.austausch ? null : {
    ebene: 'BEMA', nr: bema.nr, text: `${bema.text} (vergleichbare plastische Füllung)`, anzahl: 1,
    einzel: kassenanteil, summe: kassenanteil,
  }

  let faktor = z.faktor ?? (t.plastisch ? r.faktor : r.inlayFaktor)
  let ziel: number | undefined
  if (t.plastisch && r.modell !== 'gozDifferenz' && !z.austausch) {
    ziel = r.modell === 'proZahn' ? r.proZahn : runden(r.proFlaeche * flaechen)
    faktor = faktorFuerZiel(nr, ziel, kassenanteil)
    if (faktor < 1) {
      const minimum = runden(gozPunkte(nr) * GOZ_PUNKTWERT - kassenanteil)
      warnungen.push(`Zielbetrag ${euro(ziel)} liegt unter dem GOZ-Einfachsatz – mindestens ${euro(Math.max(0, minimum))} Mehrkosten.`)
      faktor = 1
    }
  }

  const zeilen: Zeile[] = [gozZeile(nr, faktor, 1, t.analog ? 'ANALOG' : 'GOZ',
    t.analog ? `Goldhämmerfüllung, ${flaechenWort(flaechen)}, analog § 6 Abs. 1 GOZ entsprechend GOZ ${nr} (${gozText(nr)})` : undefined)]
  if (z.therapie === 'inlay') {
    const lab = einst.laborPreise.find((l) => l.id === (z.labor ?? 'keramik'))
    if (lab && lab.id !== 'gold') zeilen.push(gozZeile('2197', r.faktor))
    if (lab) {
      const preis = runden(lab.preis * (LABOR_KLASSE_FAKTOR[r.laborKlasse] ?? 1))
      zeilen.push({ ebene: 'LABOR', nr: 'Labor', text: lab.name, anzahl: 1, einzel: preis, summe: preis })
    }
  }
  if (z.anaesthesie && !t.plastisch) zeilen.push(gozZeile('0090', r.faktor))
  for (const x of zeilen) x.zahn = zahn

  const privat = runden(zeilen.reduce((s, x) => s + x.summe, 0))
  const mehrkosten = runden(Math.max(0, privat - kassenanteil))

  if (z.austausch) warnungen.push('Austausch einer intakten Füllung: keine Mehrkostenregelung (§ 28 Abs. 2 S. 5 SGB V) – komplett privat nach § 8 Abs. 7 BMV-Z.')
  if (z.therapie === 'komposit' && istFrontzahn(zahn)) {
    warnungen.push('Frontzahn: die adhäsive Füllung ist hier Kassenleistung – Mehrkosten nur mit Mehrfarbentechnik.')
  }
  if (privat < kassenanteil) warnungen.push('GOZ-Honorar liegt unter dem Kassenanteil – es entstehen keine Mehrkosten.')
  if (faktor > GOZ_HOECHSTSATZ) hinweise.push(`Faktor ${faktorText(faktor)} über 3,5: Vereinbarung nach § 2 Abs. 1 und 2 GOZ nötig.`)
  else if (faktor > GOZ_SCHWELLE) hinweise.push(`Faktor ${faktorText(faktor)} über 2,3: Begründung auf der Rechnung (§ 10 Abs. 3 GOZ).`)
  if (z.therapie === 'inlay' && !z.anaesthesie) hinweise.push('Anästhesie beim Inlay ist privat (GOZ 0090), nicht über die Kasse.')

  return {
    zahn, titel: `${t.titel}, ${flaechenWort(flaechen)}`, therapie: z.therapie, flaechen,
    zeilen, kasse, privat, kassenanteil, mehrkosten, faktor, ziel, hinweise, warnungen,
  }
}

export function rechnen(plan: Plan, einst: Einstellungen): Rechnung {
  const pw = ermittlePunktwert({ bereich: 'KCH', praxis: einst.praxis, kassenart: plan.patient.kassenart, fest: einst.punktwertFest.KCH })
  const zaehne = ALLE_ZAEHNE.filter((z) => plan.zaehne[z]).map((z) => zahnRechnen(z, plan.zaehne[z], plan, einst, pw.wert))

  const regionen = new Set(ALLE_ZAEHNE.filter((z) => plan.zaehne[z]?.kofferdam).map(regionVon))
  const begleit: Zeile[] = regionen.size
    ? [gozZeile('2040', plan.regler.faktor, regionen.size, 'GOZ', `${gozText('2040')} (${regionen.size}×)`)]
    : []

  const begleitSumme = runden(begleit.reduce((s, x) => s + x.summe, 0))
  const privat = runden(zaehne.reduce((s, x) => s + x.privat, 0) + begleitSumme)
  const kassenanteil = runden(zaehne.reduce((s, x) => s + x.kassenanteil, 0))
  const mehrkosten = runden(zaehne.reduce((s, x) => s + x.mehrkosten, 0) + begleitSumme)

  const vereinbarung2 = [...zaehne.flatMap((z) => z.zeilen), ...begleit].filter((x) => (x.faktor ?? 0) > GOZ_HOECHSTSATZ)
  const hinweise: string[] = []
  if (plan.regler.modell !== 'gozDifferenz' && zaehne.some((z) => z.ziel !== undefined)) {
    hinweise.push(plan.regler.modell === 'proZahn'
      ? `Mehrkosten je plastischer Füllung ${euro(plan.regler.proZahn)} – der GOZ-Faktor ergibt sich daraus.`
      : `Mehrkosten je Fläche ${euro(plan.regler.proFlaeche)} – der GOZ-Faktor ergibt sich daraus.`)
  }
  if (begleit.length) hinweise.push('Kofferdam (GOZ 2040) je Kieferhälfte oder Frontzahnbereich, zusätzlich zu den Füllungs-Mehrkosten.')

  return { zaehne, begleit, privat, kassenanteil, mehrkosten, punktwert: pw.wert, punktwertHinweis: pw.hinweis, vereinbarung2, hinweise }
}
