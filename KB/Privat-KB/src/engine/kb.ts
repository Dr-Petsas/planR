// Rechnung des Privat-KB-Planers.
//
// Honorar: GOZ-Punkte × Punktwert × Faktor (Aufbissbehelfe/Provisorien mit dem
// Schienen-Faktor, Abschnitt J mit dem Faktor Funktionsanalyse). Labor: Praxispreis,
// sonst Preis der Laborliste für die Nummer gleicher Bedeutung, verschoben um die
// Preisstufe des Reglers. Regeln aus GOZ Abschnitt H/J (KB/_quellen/privat-kb.json).

import { BEB, istFunktionsanalyse, LABOR_KLASSE_FAKTOR } from '../data/katalog'
import type { Einstellungen, Plan, Position, Rechnung, Zeile } from '../types'
import { gozEinzel, gozText, GOZ_HOECHSTSATZ, GOZ_SCHWELLE, laborListenPreis, runden } from './listen'

export const euro = (x: number) =>
  x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const faktorText = (f: number) => f.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })

export const neueId = () => Math.random().toString(36).slice(2, 10)

/** Praxispreis, sonst Listenpreis der gleichbedeutenden Labornummer. */
export function laborGrundpreis(nr: string, einst: Einstellungen): number | undefined {
  if (einst.laborPreise[nr] != null) return einst.laborPreise[nr]
  return laborListenPreis(BEB.get(nr)?.labor)
}

export const positionsFaktor = (p: Position, plan: Plan) =>
  p.faktor ?? (istFunktionsanalyse(p.nr) ? plan.regler.faFaktor : plan.regler.faktor)

function zeileAus(p: Position, plan: Plan, einst: Einstellungen): Zeile {
  const anzahl = Math.max(0, p.anzahl || 0)
  if (p.ebene === 'GOZ') {
    const faktor = positionsFaktor(p, plan)
    const einzel = gozEinzel(p.nr, faktor)
    return { id: p.id, ebene: 'GOZ', nr: p.nr, text: p.text || gozText(p.nr), anzahl, faktor, einzel, summe: runden(einzel * anzahl) }
  }
  if (p.ebene === 'MATERIAL') {
    const einzel = runden(p.preis ?? 0)
    return { id: p.id, ebene: 'MATERIAL', nr: p.nr || 'Mat.', text: p.text || 'Material', anzahl, einzel, summe: runden(einzel * anzahl) }
  }
  const grund = p.preis ?? laborGrundpreis(p.nr, einst)
  const stufe = p.preis != null ? 1 : (LABOR_KLASSE_FAKTOR[plan.regler.laborKlasse] ?? 1)
  const einzel = runden((grund ?? 0) * stufe)
  return {
    id: p.id, ebene: 'LABOR', nr: p.nr, text: p.text || BEB.get(p.nr)?.text || `BEB ${p.nr}`, anzahl, einzel,
    summe: runden(einzel * anzahl), ohnePreis: grund == null,
  }
}

const anzahlVon = (plan: Plan, nr: string) =>
  plan.positionen.filter((p) => p.ebene === 'GOZ' && p.nr === nr).reduce((s, p) => s + (p.anzahl || 0), 0)

export function rechnen(plan: Plan, einst: Einstellungen): Rechnung {
  const zeilen = plan.positionen.filter((p) => p.anzahl > 0).map((p) => zeileAus(p, plan, einst))
  const honorar = zeilen.filter((z) => z.ebene === 'GOZ')
  const labor = zeilen.filter((z) => z.ebene !== 'GOZ')
  const summeHonorar = runden(honorar.reduce((s, z) => s + z.summe, 0))
  const summeLabor = runden(labor.reduce((s, z) => s + z.summe, 0))

  const hinweise: string[] = []
  const warnungen: string[] = []
  const hat = (nr: string) => anzahlVon(plan, nr) > 0

  if (hat('0030') && hat('0040')) warnungen.push('GOZ 0030 und 0040 sind nicht nebeneinander berechnungsfähig.')
  if (anzahlVon(plan, '8010') > 2) hinweise.push('GOZ 8010 je Sitzung höchstens zweimal – bei mehr Registraten mehrere Sitzungen planen.')
  if ((hat('7080') || hat('7090')) && !hat('7100')) {
    hinweise.push('7080/7090 setzen ein Langzeitprovisorium mit mindestens drei Monaten Tragezeit voraus; sonst 2260/2270 bzw. 5120/5140.')
  }
  if (hat('7070')) hinweise.push('Entfernung der Schienung später nach GOÄ 2702 je Kiefer.')
  if (hat('0065') && hat('0060')) hinweise.push('Neben 0065 keine konventionelle Abformung derselben Kieferhälfte bzw. desselben Frontzahnbereichs.')
  if (labor.some((z) => z.ohnePreis)) warnungen.push('Für einzelne Laborpositionen ist kein Preis hinterlegt – Preis in der Zeile oder in den Einstellungen eintragen.')
  if (plan.positionen.some((p) => p.ebene === 'LABOR' && p.nr === '7602')) {
    hinweise.push('BEB 7602 (zweiphasig): GOZ-Zuordnung ist strittig (7000 oder 7010) – nach Gestaltung der Oberfläche wählen.')
  }

  const vereinbarung2 = honorar.filter((z) => (z.faktor ?? 0) > GOZ_HOECHSTSATZ)
  const begruendung = honorar.filter((z) => (z.faktor ?? 0) > GOZ_SCHWELLE && (z.faktor ?? 0) <= GOZ_HOECHSTSATZ)
  if (begruendung.length) hinweise.push('Faktoren über 2,3 brauchen eine schriftliche Begründung auf der Rechnung (§ 10 Abs. 3 GOZ).')
  if (vereinbarung2.length) hinweise.push('Faktoren über 3,5 nur mit Vereinbarung nach § 2 Abs. 1 und 2 GOZ vor Behandlungsbeginn.')

  return {
    honorar, labor, summeHonorar, summeLabor, gesamt: runden(summeHonorar + summeLabor),
    vereinbarung2, begruendung, hinweise, warnungen,
  }
}

/** Fügt die Positionen einer Vorlage an; gleiche Positionen werden zusammengezählt. */
export function vorlageAnwenden(positionen: Position[], neu: { ebene: 'GOZ' | 'LABOR'; nr: string; anzahl: number }[]): Position[] {
  const out = positionen.map((p) => ({ ...p }))
  for (const n of neu) {
    const da = out.find((p) => p.ebene === n.ebene && p.nr === n.nr && p.faktor == null && p.preis == null && !p.text)
    if (da) da.anzahl += n.anzahl
    else out.push({ id: neueId(), ebene: n.ebene, nr: n.nr, anzahl: n.anzahl })
  }
  return out
}
