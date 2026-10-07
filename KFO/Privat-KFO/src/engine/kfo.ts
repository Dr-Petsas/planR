// Rechnung des Privat-KFO-Planers.
//
// Behandlungsaufgabe: GOZ 6030–6050 je Kiefer (Umfang aus den Kriterien a–e),
// 6060–6080 einmal (Kriterien a–c), 6090 je Kiefer – Komplexleistungen für bis zu
// vier Jahre, als Abschläge je Quartal ausgewiesen. Honorar: GOZ-Punkte × Punktwert ×
// Faktor (Abschnitt G mit dem KFO-Faktor), Analogleistungen mit der Bewertung der
// Bezugsleistung, GOÄ mit eigenem Punktwert (Röntgen höchstens 2,5), Zuschläge 0500–0530
// und 5298 nur zum einfachen Satz. Labor nach § 9 GOZ, Material über dem Standard als
// Mehrkosten (Allg. Bestimmung Abschnitt G). Belege: KFO/_quellen/privat-kfo.json

import { istKomplex, LABOR_KLASSE_FAKTOR, MEHR, NICHT_NEBEN_KOMPLEX, regelbissNr, umformungNr, UMFANG } from '../data/katalog'
import type { Einstellungen, Plan, Position, Rechnung, Zeile } from '../types'
import {
  bezugNr, digitalZuschlag, goaeEinzel, goaeEintrag, GOZ_HOECHSTSATZ, GOZ_SCHWELLE, gozBekannt, gozEinzel, gozText, istAnalog,
  istRoentgen, laborListenPreis, laborText, mitDigitalZuschlag, ROE_HOECHSTSATZ, ROE_SCHWELLE, runden,
} from './listen'

export const euro = (x: number) =>
  x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const faktorText = (f: number) => f.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })

export const neueId = () => Math.random().toString(36).slice(2, 10)

/** GOZ-Zuschläge 0500–0530: nur mit dem einfachen Gebührensatz (Allg. Bestimmungen Abschnitt C). */
export const istZuschlag = (nr: string) => /^05[0-3]0$/.test(nr)

/** Praxispreis, sonst Preis der Laborliste. */
export function laborGrundpreis(nr: string, einst: Einstellungen): number | undefined {
  if (einst.laborPreise[nr] != null) return einst.laborPreise[nr]
  return laborListenPreis(nr)
}

/** Faktor einer Position: eigener Faktor, sonst Regler (Zuschläge immer 1,0). */
export function positionsFaktor(p: Position, plan: Plan): number {
  if (p.ebene === 'GOZ' && istZuschlag(p.nr)) return 1
  if (p.faktor != null) return p.faktor
  if (p.ebene === 'GOAE') return istRoentgen(p.nr) ? plan.regler.roeFaktor : plan.regler.faktor
  return bezugNr(p.nr).startsWith('6') ? plan.regler.kfoFaktor : plan.regler.faktor
}

export const grenzen = (p: { ebene: Position['ebene']; nr: string }) =>
  p.ebene === 'GOAE' && istRoentgen(p.nr) ? { schwelle: ROE_SCHWELLE, hoechst: ROE_HOECHSTSATZ } : { schwelle: GOZ_SCHWELLE, hoechst: GOZ_HOECHSTSATZ }

/** Material über dem Standard: Praxispreis aus den Einstellungen, sonst in der Zeile. */
export function mehrPreise(p: Position, einst: Einstellungen) {
  const vorgabe = einst.mehrPreise[p.nr]
  return { preis: p.preis ?? vorgabe?.preis ?? 0, standard: p.abzug ?? vorgabe?.standard ?? 0 }
}

function zeileAus(p: Position, plan: Plan, einst: Einstellungen): Zeile {
  const anzahl = Math.max(0, p.anzahl || 0)
  if (p.ebene === 'GOZ' || p.ebene === 'GOAE') {
    const faktor = positionsFaktor(p, plan)
    const g = grenzen(p)
    if (p.ebene === 'GOAE') {
      const e = goaeEintrag(p.nr)
      const einzel = goaeEinzel(p.nr, faktor)
      return { id: p.id, ebene: 'GOAE', nr: p.nr, text: p.text || e?.text || `GOÄ ${p.nr}`, anzahl, faktor, einzel, summe: runden(einzel * anzahl), ohnePreis: !e, ...g }
    }
    const analog = istAnalog(p.nr)
    const einzel = gozEinzel(p.nr, faktor)
    return {
      id: p.id, ebene: 'GOZ', nr: p.nr, text: (analog ? p.text : p.text || gozText(p.nr)) || 'Analogleistung', anzahl, faktor, einzel,
      summe: runden(einzel * anzahl), ohnePreis: !gozBekannt(p.nr),
      ...(analog ? { analog: gozBekannt(p.nr) ? `entsprechend GOZ ${bezugNr(p.nr)} ${gozText(p.nr)}` : 'Bezugsleistung noch nicht gewählt' } : {}), ...g,
    }
  }
  if (p.ebene === 'MEHR') {
    const { preis, standard } = mehrPreise(p, einst)
    const einzel = runden(preis - standard)
    return {
      id: p.id, ebene: 'MEHR', nr: 'Mat.', text: p.text || MEHR.get(p.nr)?.text || 'Material', anzahl, einzel, summe: runden(einzel * anzahl),
      preisMehr: preis, preisStandard: standard, ohnePreis: preis <= 0,
    }
  }
  if (p.ebene === 'MATERIAL') {
    const einzel = runden(p.preis ?? 0)
    return { id: p.id, ebene: 'MATERIAL', nr: 'Mat.', text: p.text || 'Material', anzahl, einzel, summe: runden(einzel * anzahl), ohnePreis: !p.preis }
  }
  const grund = p.preis ?? laborGrundpreis(p.nr, einst)
  const stufe = p.preis != null ? 1 : (LABOR_KLASSE_FAKTOR[plan.regler.laborKlasse] ?? 1)
  const einzel = runden((grund ?? 0) * stufe)
  return {
    id: p.id, ebene: 'LABOR', nr: p.nr, text: p.text || laborText(p.nr) || `Labor ${p.nr}`, anzahl, einzel,
    summe: runden(einzel * anzahl), ohnePreis: grund == null,
  }
}

/** Komplexleistungen aus der Behandlungsaufgabe. */
export function aufgabeZeilen(plan: Plan): Zeile[] {
  const a = plan.aufgabe
  const out: Zeile[] = []
  const add = (id: string, nr: string, zusatz: string) => {
    const faktor = plan.regler.kfoFaktor
    const einzel = gozEinzel(nr, faktor)
    out.push({ id, ebene: 'GOZ', nr, text: `${gozText(nr)} – ${zusatz}`, anzahl: 1, faktor, einzel, summe: einzel, auto: true, schwelle: GOZ_SCHWELLE, hoechst: GOZ_HOECHSTSATZ })
  }
  const krit = (k: string[]) => (k.length ? `Kriterien ${[...k].sort().join(', ')}` : 'ohne Zusatzkriterium')
  if (a.umformungOk) add('auf-ok', umformungNr(a.kriterienOk), `Oberkiefer, ${krit(a.kriterienOk)}`)
  if (a.umformungUk) add('auf-uk', umformungNr(a.kriterienUk), `Unterkiefer, ${krit(a.kriterienUk)}`)
  if (a.regelbiss) add('auf-rb', regelbissNr(a.kriterienRegelbiss), krit(a.kriterienRegelbiss))
  if (a.alveolaerOk) add('auf-alv-ok', '6090', 'Oberkiefer')
  if (a.alveolaerUk) add('auf-alv-uk', '6090', 'Unterkiefer')
  return out
}

export const umfangText = (nr: string) => UMFANG[nr] ?? ''

const anzahlVon = (plan: Plan, nr: string) =>
  plan.positionen.filter((p) => (p.ebene === 'GOZ' || p.ebene === 'GOAE') && p.nr === nr).reduce((s, p) => s + (p.anzahl || 0), 0)

export function rechnen(plan: Plan, einst: Einstellungen): Rechnung {
  const aufgabe = aufgabeZeilen(plan)
  const zeilen: Zeile[] = []
  for (const p of plan.positionen.filter((x) => x.anzahl > 0)) {
    const z = zeileAus(p, plan, einst)
    zeilen.push(z)
    if (plan.digitalRoentgen && p.ebene === 'GOAE' && mitDigitalZuschlag(p.nr)) {
      const einzel = digitalZuschlag(p.nr)
      zeilen.push({ id: `${p.id}-5298`, ebene: 'GOAE', nr: '5298', text: `Zuschlag digitale Radiographie zu ${p.nr} (25 % des einfachen Satzes)`, anzahl: z.anzahl, faktor: 1, einzel, summe: runden(einzel * z.anzahl), auto: true })
    }
  }
  const honorar = zeilen.filter((z) => z.ebene === 'GOZ' || z.ebene === 'GOAE')
  const labor = zeilen.filter((z) => z.ebene === 'LABOR' || z.ebene === 'MATERIAL')
  const mehr = zeilen.filter((z) => z.ebene === 'MEHR')
  const summe = (zs: Zeile[]) => runden(zs.reduce((s, z) => s + z.summe, 0))
  const summeAufgabe = summe(aufgabe)
  const summeHonorar = runden(summeAufgabe + summe(honorar))
  const summeLabor = summe(labor)
  const summeMehr = summe(mehr)
  const quartale = Math.max(1, Math.round(plan.quartale || 1))

  const hinweise: string[] = []
  const warnungen: string[] = []
  const hat = (nr: string) => anzahlVon(plan, nr) > 0
  const a = plan.aufgabe
  const komplex = aufgabe.some((z) => istKomplex(z.nr))

  // Behandlungsaufgabe
  if (!aufgabe.length) hinweise.push('Keine Behandlungsaufgabe gewählt (6030–6090) – bei aktiver Behandlung Umformung bzw. Einstellung in den Regelbiss festlegen.')
  if (a.regelbiss && (a.alveolaerOk || a.alveolaerUk)) {
    warnungen.push('6090 gilt nur bei abgeschlossener Wachstumsphase, 6060–6080 nur während der Wachstumsphase – nicht beides in einem Fall.')
  }
  if (a.regelbiss && (a.umformungOk || a.umformungUk)) {
    hinweise.push('Umformung (6030–6050) und Einstellung in den Regelbiss (6060–6080) im selben Fall: die Nebeneinanderberechnung ist nicht abschließend geklärt – Einstufung und Begründung prüfen.')
  }
  const neben = NICHT_NEBEN_KOMPLEX.filter(hat)
  if (komplex && neben.length) warnungen.push(`Neben 6030–6080 sind ${neben.join(', ')} nicht berechnungsfähig (Abrechnungsbestimmung zu 6030–6080).`)
  if (komplex) {
    hinweise.push('6030–6080 umfassen alle Maßnahmen des Behandlungsplans bis zu vier Jahren, auch Abformung und Eingliederung herausnehmbarer Geräte, Kontrollen und Retention.')
    hinweise.push('Festsitzender Retainer: nach BVerwG (26.02.2021, 5 C 7.19) neben 6030–6080 nicht gesondert berechnungsfähig – Aufwand über den Faktor bzw. eine Vereinbarung nach § 2 GOZ.')
  }
  if (aufgabe.length && quartale > 16) warnungen.push('Die Komplexleistungen gelten für bis zu vier Jahre (16 Quartale) – danach beginnt ein neuer Behandlungsfall mit neuer Einstufung.')
  if (aufgabe.length) hinweise.push('Abschlagszahlungen regelt die GOZ nicht: schriftlich mit konkreter Dauer vereinbaren; der endgültige Faktor wird erst in der Schlussrechnung festgelegt.')

  // Diagnostik
  if (hat('0030') && hat('0040')) warnungen.push('GOZ 0030 und 0040 sind nicht nebeneinander berechnungsfähig.')
  if (anzahlVon(plan, '6000') > 4) hinweise.push('6000 mehr als viermal im Behandlungsverlauf: in der Rechnung begründen.')
  if (anzahlVon(plan, '6010') > anzahlVon(plan, '0060')) {
    hinweise.push(hat('0065') ? 'Analyse digitaler Modelle (0065): analog 6010 statt 6010 (Beratungsforum Nr. 53).' : '6010 ist je Leistung nach 0060 berechnungsfähig – 0060 fehlt bzw. ist seltener geplant.')
  }
  if (hat('6190') && hat('0010')) hinweise.push('6190 und 0010 nicht in derselben Sitzung.')
  if (hat('5090')) hinweise.push('FRS nach GOÄ 5090 (ZÄK MV, LZK BW); einzelne Erstatter erkennen nur 5095 an.')
  if (hat('5037') && hat('5020')) warnungen.push('GOÄ 5037 schließt die Röntgendiagnostik der Hand ein – 5020 nicht zusätzlich.')

  // Apparatur
  if (hat('6100') || hat('6120') || hat('6140') || hat('6150')) {
    hinweise.push('6100, 6120, 6140, 6150 enthalten Standardmaterial (unprogrammierte Edelstahlbrackets, Attachments, Edelstahlbänder); höherwertiges Material nur als vereinbarte Mehrkosten.')
  }
  if (hat('2197') && hat('6100')) hinweise.push('2197 neben 6100: BZÄK ja, BVerwG (05.03.2021, 5 C 11.19) und PKV nein – Erstattung unsicher.')
  if (hat('9020') && !hat('0510')) hinweise.push('Minischraube (9020, 515 Punkte): OP-Zuschlag 0510 zum einfachen Satz ergänzen.')
  if (hat('6160') || hat('6170')) hinweise.push('Die Hilfsmittel zu 6160/6170 (Headgear, Kinnkappe) sind gesondert berechnungsfähig – als Material eintragen.')

  // Analog, Material, Labor
  const analoge = honorar.filter((z) => z.analog)
  if (analoge.length) hinweise.push('Analogleistungen: auf der Rechnung die Leistung, "entsprechend GOZ …" und den Text der Bezugsleistung angeben (§ 10 Abs. 4 GOZ).')
  if (honorar.some((z) => z.ohnePreis && z.analog)) warnungen.push('Analogleistung ohne gültige Bezugsleistung – nach Art, Kosten- und Zeitaufwand gleichwertige GOZ-Leistung wählen (§ 6 Abs. 1 GOZ).')
  if (honorar.some((z) => z.ohnePreis && !z.analog)) warnungen.push('Eine Nummer steht nicht in der Gebührenliste.')
  if (plan.positionen.some((p) => p.ebene === 'GOZ' && istAnalog(p.nr) && !p.text?.trim())) warnungen.push('Analogleistung ohne Beschreibung – die Leistung muss verständlich beschrieben sein.')
  if (labor.some((z) => z.ohnePreis)) warnungen.push('Für einzelne Labor- oder Materialpositionen fehlt der Preis.')
  if (mehr.some((z) => z.ohnePreis)) warnungen.push('Material über dem Standard: Preis des höherwertigen Materials eintragen.')
  if (mehr.some((z) => !z.ohnePreis && z.einzel <= 0)) warnungen.push('Material über dem Standard: Mehrkosten nicht positiv – Preise prüfen.')
  if (mehr.length) hinweise.push('Mehrkosten für Material nur mit schriftlicher Vereinbarung vor der Verwendung (Blatt "Vereinbarung über Materialmehrkosten").')
  if (summeLabor > 1000) {
    hinweise.push('Material- und Laborkosten über 1.000 €: Kostenvoranschlag anbieten (§ 9 Abs. 2 GOZ; bei mehr als 12 Monaten nur, wenn 1.000 € innerhalb von 6 Monaten überschritten werden).')
  }

  // Faktoren
  const alle = [...aufgabe, ...honorar].filter((z) => z.faktor != null && z.schwelle != null)
  const vereinbarung2 = alle.filter((z) => z.ebene === 'GOZ' && (z.faktor ?? 0) > GOZ_HOECHSTSATZ)
  const begruendung = alle.filter((z) => (z.faktor ?? 0) > (z.schwelle ?? GOZ_SCHWELLE) && (z.faktor ?? 0) <= (z.hoechst ?? GOZ_HOECHSTSATZ))
  if (begruendung.length) hinweise.push('Faktoren über der Schwelle (GOZ 2,3; GOÄ-Röntgen 1,8) brauchen eine schriftliche Begründung auf der Rechnung.')
  if (vereinbarung2.length) hinweise.push('GOZ-Faktoren über 3,5 nur mit Vereinbarung nach § 2 Abs. 1 und 2 GOZ vor Behandlungsbeginn.')
  if (alle.some((z) => z.ebene === 'GOAE' && (z.faktor ?? 0) > (z.hoechst ?? 0))) {
    warnungen.push('GOÄ über dem Höchstsatz (Röntgen 2,5; übrige 3,5) – für Röntgenleistungen ist keine abweichende Vereinbarung zulässig.')
  }

  return {
    aufgabe, honorar, labor, mehr, summeAufgabe, summeHonorar, summeLabor, summeMehr,
    gesamt: runden(summeHonorar + summeLabor + summeMehr),
    abschlag: runden(summeAufgabe / quartale),
    vereinbarung2, begruendung, hinweise, warnungen,
  }
}

/** Fügt die Positionen einer Vorlage an; gleiche Positionen werden zusammengezählt. */
export function vorlageAnwenden(positionen: Position[], neu: { ebene: Position['ebene']; nr: string; anzahl: number; text?: string }[]): Position[] {
  const out = positionen.map((p) => ({ ...p }))
  for (const n of neu) {
    const da = out.find((p) => p.ebene === n.ebene && p.nr === n.nr && p.faktor == null && (n.ebene === 'MATERIAL' ? p.text === n.text : p.preis == null && !p.text))
    if (da) da.anzahl += n.anzahl
    else out.push({ id: neueId(), ebene: n.ebene, nr: n.nr, anzahl: n.anzahl, ...(n.text ? { text: n.text } : {}) })
  }
  return out
}
