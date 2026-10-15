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
import type { Begruendung, Einstellungen, Plan, Rechnung, ZahnErgebnis, ZahnLeistung, Zeile } from '../types'
import { standardBegruendung } from './begruendung'
import { BEB, GOZ_HOECHSTSATZ, GOZ_PUNKTWERT, GOZ_SCHWELLE, eigenKatalog, gozPunkte, gozText, mwstZeile, runden } from './listen'
import { inlayLabor, type InlayAuftrag } from './inlaylabor'
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

export function zahnRechnen(zahn: string, z: ZahnLeistung, plan: Plan, einst: Einstellungen, punktwert: number, laborEinzeln?: Zeile[]): ZahnErgebnis {
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
  if (t.plastisch && t.festbetrag !== false && r.modell !== 'gozDifferenz' && !z.austausch) {
    ziel = r.modell === 'proZahn' ? r.proZahn : runden(r.proFlaeche * flaechen)
    faktor = faktorFuerZiel(nr, ziel, kassenanteil)
    if (faktor < 1) {
      const minimum = runden(gozPunkte(nr) * GOZ_PUNKTWERT - kassenanteil)
      warnungen.push(`Zielbetrag ${euro(ziel)} liegt unter dem GOZ-Einfachsatz – mindestens ${euro(Math.max(0, minimum))} Mehrkosten.`)
      faktor = 1
    }
  }

  const mehrschicht = z.therapie === 'aufbau' && !!z.mehrschicht
  const zeilen: Zeile[] = [mehrschicht
    ? gozZeile('2120', faktor, 1, 'ANALOG', 'Dentinadhäsiver mehrschichtiger Kompositaufbau, analog § 6 Abs. 1 GOZ entsprechend GOZ 2120 (BZÄK-Analogkatalog)')
    : gozZeile(nr, faktor, 1, t.analog ? 'ANALOG' : 'GOZ',
      t.analog ? `Goldhämmerfüllung, ${flaechenWort(flaechen)}, analog § 6 Abs. 1 GOZ entsprechend GOZ ${nr} (${gozText(nr)})` : undefined)]
  if (z.therapie === 'aufbau') zeilen.push(gozZeile('2197', faktor))
  if (z.therapie === 'inlay') {
    const lab = einst.laborPreise.find((l) => l.id === (z.labor ?? 'keramik'))
    if (lab && lab.id !== 'gold') zeilen.push(gozZeile('2197', r.faktor))
    if (laborEinzeln?.length) zeilen.push(...laborEinzeln)
    else if (lab) {
      const preis = runden(lab.preis * (LABOR_KLASSE_FAKTOR[r.laborKlasse] ?? 1))
      zeilen.push({ ebene: 'LABOR', nr: 'Labor', text: lab.name, anzahl: 1, einzel: preis, summe: preis })
    }
  }
  if (z.anaesthesie && !t.plastisch) zeilen.push(gozZeile('0090', r.faktor))
  if (z.provisorium && !t.plastisch) zeilen.push(gozZeile('2260', r.faktor))
  const mwst = mwstZeile(zeilen)
  if (mwst) zeilen.push(mwst)
  for (const x of zeilen) x.zahn = zahn

  const privat7: Zeile[] = []
  if (z.therapie === 'aufbau' && z.stift) {
    const stift = runden(einst.stiftPreis ?? 18)
    privat7.push(
      { ...gozZeile('2195', r.faktor), zahn },
      { ...gozZeile('2197', r.faktor, 1, 'GOZ', `${gozText('2197')} – Stift`), zahn },
      { ebene: 'LABOR', nr: 'Mat.', text: 'Glasfaserstift', anzahl: 1, einzel: stift, summe: stift, zahn },
    )
    hinweise.push('Glasfaserstift (GOZ 2195 mit adhäsiver Befestigung 2197 und Stift als Material): keine Mehrkostenleistung – Privatvereinbarung nach § 8 Abs. 7 BMV-Z. Die Ummantelung bleibt der Aufbau 2180 in der Mehrkostenvereinbarung.')
  }
  if (z.therapie === 'aufbau') hinweise.push('GOZ 2180/2195 setzen die anschließende Überkronung voraus; bleibt es bei einer Füllung, Kompositfüllung nach Flächen planen.')

  const privat = runden(zeilen.reduce((s, x) => s + x.summe, 0))
  const mehrkosten = runden(Math.max(0, privat - kassenanteil))

  if (z.austausch) warnungen.push('Austausch einer intakten Füllung: keine Mehrkostenregelung (§ 28 Abs. 2 S. 5 SGB V) – komplett privat nach § 8 Abs. 7 BMV-Z.')
  if ((z.therapie === 'komposit' || z.therapie === 'aufbau') && istFrontzahn(zahn)) {
    warnungen.push(z.therapie === 'aufbau'
      ? 'Frontzahn: die adhäsive Aufbaufüllung ist hier Kassenleistung – keine Mehrkosten.'
      : 'Frontzahn: die adhäsive Füllung ist hier Kassenleistung – Mehrkosten nur mit Mehrfarbentechnik.')
  }
  if (!t.plastisch && (z.kofferdam || z.bmf)) hinweise.push('Beim Inlay sind Kofferdam und besondere Maßnahmen privat (BEMA 12 entfällt).')
  if (privat < kassenanteil) {
    warnungen.push(z.therapie === 'aufbau' && !mehrschicht
      ? 'GOZ 2180 + 2197 liegen unter dem Kassenanteil – es entstehen keine Mehrkosten. Für einen adhäsiven Aufbau mit Mehrkosten den mehrschichtigen Kompositaufbau (analog 2120) wählen, sonst bleibt es bei der Kassenleistung.'
      : 'GOZ-Honorar liegt unter dem Kassenanteil – es entstehen keine Mehrkosten.')
  }
  if (faktor > GOZ_HOECHSTSATZ) hinweise.push(`Faktor ${faktorText(faktor)} über 3,5: Vereinbarung nach § 2 Abs. 1 und 2 GOZ nötig.`)
  else if (faktor > GOZ_SCHWELLE) hinweise.push(`Faktor ${faktorText(faktor)} über 2,3: Begründung auf der Rechnung (§ 10 Abs. 3 GOZ).`)
  if (z.therapie === 'inlay' && !z.anaesthesie) hinweise.push('Anästhesie beim Inlay ist privat (GOZ 0090), nicht über die Kasse.')

  return {
    zahn, titel: `${t.titel}, ${flaechenWort(flaechen)}`, therapie: z.therapie, flaechen,
    zeilen, kasse, privat, kassenanteil, mehrkosten, faktor, ziel, hinweise, warnungen, privat7,
  }
}

/**
 * Inlay-Labor des Plans einzeln nach BEB für die Inlays, deren Position die Praxis führt (DS-Win-Eigenlabor):
 * Inlay je Zahn, Modelle bzw. digitaler Ablauf je Kiefer und Auftrag. Übrige Inlays behalten die Laborpauschale.
 */
function laborDesPlans(plan: Plan, einst: Einstellungen): { jeZahn: Map<string, Zeile[]>; auftrag: Zeile[] } {
  const inlays: InlayAuftrag[] = ALLE_ZAEHNE.flatMap((zahn) => {
    const z = plan.zaehne[zahn]
    const w = z?.labor ?? 'keramik'
    return z?.therapie === 'inlay' && (w === 'keramik' || w === 'gold') ? [{ zahn, werkstoff: w, flaechen: z.flaechen || 1 }] : []
  })
  const jeZahn = new Map<string, Zeile[]>()
  const auftrag: Zeile[] = []
  if (!inlays.length || !einst.eigenlabor?.length) return { jeZahn, auftrag }
  const { zeilen } = inlayLabor(inlays, plan.abformung ?? 'abdruck', eigenKatalog(einst.eigenlabor), BEB)
  for (const l of zeilen) {
    const zeile: Zeile = {
      ebene: 'LABOR', nr: `BEB ${l.nr}`, text: l.praxis ? `${l.text} (Praxis ${l.praxis})` : l.text,
      anzahl: l.anzahl, einzel: l.preis, summe: runden(l.preis * l.anzahl), zahn: l.zahn || undefined,
    }
    if (/^\d\d$/.test(l.zahn)) jeZahn.set(l.zahn, [...(jeZahn.get(l.zahn) ?? []), zeile])
    else auftrag.push(zeile)
  }
  return { jeZahn, auftrag }
}

export function rechnen(plan: Plan, einst: Einstellungen): Rechnung {
  const pw = ermittlePunktwert({ bereich: 'KCH', praxis: einst.praxis, kassenart: plan.patient.kassenart, fest: einst.punktwertFest.KCH })
  const labor = laborDesPlans(plan, einst)
  const zaehne = ALLE_ZAEHNE.filter((z) => plan.zaehne[z]).map((z) => zahnRechnen(z, plan.zaehne[z], plan, einst, pw.wert, labor.jeZahn.get(z)))

  const f = plan.regler.faktor
  const jeRegion = (nr: string, wahl: (z: ZahnLeistung) => boolean | undefined): Zeile[] => {
    const n = new Set(ALLE_ZAEHNE.filter((z) => plan.zaehne[z] && wahl(plan.zaehne[z])).map(regionVon)).size
    return n ? [gozZeile(nr, f, n, 'GOZ', `${gozText(nr)} (${n}×)`)] : []
  }
  const massnahmen = [...jeRegion('2030', (z) => z.bmf), ...jeRegion('2040', (z) => z.kofferdam)]
  const inlayZaehne = ALLE_ZAEHNE.filter((z) => plan.zaehne[z]?.therapie === 'inlay')
  const scan: Zeile[] = []
  if (plan.abformung === 'scan' && inlayZaehne.length) {
    const bereiche = new Set(inlayZaehne.map(regionVon)).size
    const gegenkiefer = 2 - new Set(inlayZaehne.map((z) => (z[0] === '1' || z[0] === '2' ? 'OK' : 'UK'))).size
    scan.push(gozZeile('0065', plan.regler.inlayFaktor, bereiche + gegenkiefer, 'GOZ', `${gozText('0065')} (${bereiche + gegenkiefer}×)`))
  }
  const auftragMwst = mwstZeile(labor.auftrag)
  const begleit: Zeile[] = [...massnahmen, ...scan, ...labor.auftrag, ...(auftragMwst ? [auftragMwst] : [])]

  const wunsch = plan.privat ?? {}
  const fuellRegionen = new Set(zaehne.map((z) => regionVon(z.zahn))).size
  const privat7: Zeile[] = [
    ...zaehne.flatMap((z) => z.privat7),
    ...(wunsch.oberflaeche && fuellRegionen ? [gozZeile('0080', f, fuellRegionen, 'GOZ', `${gozText('0080')} (${fuellRegionen}×)`)] : []),
    ...(wunsch.fluorid ? [gozZeile('1020', f)] : []),
    ...(wunsch.adhaesivKomposit
      ? zaehne.filter((z) => z.kasse && (z.therapie === 'komposit' || z.therapie === 'mehrfarben')).map((z) => ({ ...gozZeile('2197', f), zahn: z.zahn }))
      : []),
  ]
  const privat7Summe = runden(privat7.reduce((s, x) => s + x.summe, 0))

  const begleitSumme = runden(begleit.reduce((s, x) => s + x.summe, 0))
  const privat = runden(zaehne.reduce((s, x) => s + x.privat, 0) + begleitSumme)
  const kassenanteil = runden(zaehne.reduce((s, x) => s + x.kassenanteil, 0))
  const mehrkosten = runden(zaehne.reduce((s, x) => s + x.mehrkosten, 0) + begleitSumme)

  const vereinbarung2 = [...zaehne.flatMap((z) => z.zeilen), ...begleit].filter((x) => (x.faktor ?? 0) > GOZ_HOECHSTSATZ)
  const begruendungen = new Map<string, Begruendung>()
  for (const x of [...zaehne.flatMap((z) => z.zeilen), ...begleit, ...privat7]) {
    if ((x.ebene !== 'GOZ' && x.ebene !== 'ANALOG') || (x.faktor ?? 0) <= GOZ_SCHWELLE) continue
    const eigen = plan.begruendungen?.[x.nr]?.trim()
    x.begruendung = eigen || standardBegruendung(x.nr)
    const b = begruendungen.get(x.nr)
    begruendungen.set(x.nr, { nr: x.nr, faktor: Math.max(b?.faktor ?? 0, x.faktor!), text: x.begruendung, eigen: !!eigen })
  }
  const hinweise: string[] = []
  if (plan.regler.modell !== 'gozDifferenz' && zaehne.some((z) => z.ziel !== undefined)) {
    hinweise.push(plan.regler.modell === 'proZahn'
      ? `Mehrkosten je plastischer Füllung ${euro(plan.regler.proZahn)} – der GOZ-Faktor ergibt sich daraus.`
      : `Mehrkosten je Fläche ${euro(plan.regler.proFlaeche)} – der GOZ-Faktor ergibt sich daraus.`)
  }
  if (massnahmen.length) hinweise.push('Besondere Maßnahmen (GOZ 2030) und Kofferdam (GOZ 2040) je Kieferhälfte oder Frontzahnbereich gehören nur in die Mehrkosten, wenn erst die Mehrkostenfüllung sie erfordert; wären sie auch bei der Kassenfüllung nötig, BEMA 12 über die KZV.')
  if (labor.jeZahn.size) {
    hinweise.push(plan.abformung === 'scan'
      ? 'Inlay-Labor nach den BEB-Positionen der Praxis: digitaler Ablauf nach Intraoralscan (Oralscan aufbereiten, CAD-Daten, Registrierung, Segmentierung, CAD-Kaufläche, CAM-Nacharbeit) und gedruckte Modelle.'
      : 'Inlay-Labor nach den BEB-Positionen der Praxis: Sägemodell je Kiefer mit Inlay, Gegenkiefermodell und Mittelwertartikulator einmal je Auftrag.')
  }
  if (inlayZaehne.length && !plan.abformung) hinweise.push('Abformung für die Inlays: Abdruck angenommen – bei Intraoralscan umstellen (GOZ 0065 und digitaler Laborablauf).')
  if (wunsch.adhaesivKomposit) hinweise.push('GOZ 2197 neben Kompositfüllungen (2060 ff.) ist strittig – nur mit ausdrücklicher Privatvereinbarung ansetzen.')
  if (privat7.length) hinweise.push('Leistungen außerhalb der Mehrkostenregelung stehen auf einer eigenen Privatvereinbarung nach § 8 Abs. 7 BMV-Z.')

  return {
    zaehne, begleit, privat, kassenanteil, mehrkosten, punktwert: pw.wert, punktwertHinweis: pw.hinweis, vereinbarung2, begruendungen: [...begruendungen.values()], hinweise,
    privat7, privat7Summe,
  }
}
