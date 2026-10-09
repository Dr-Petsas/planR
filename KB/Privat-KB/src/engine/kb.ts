// Rechnung des Privat-KB-Planers.
//
// Honorar: GOZ-Punkte × Punktwert × Faktor (Aufbissbehelfe/Provisorien mit dem
// Schienen-Faktor, Abschnitt J mit dem Faktor Funktionsanalyse). Labor: Praxispreis,
// sonst Preis der Laborliste für die Nummer gleicher Bedeutung, verschoben um die
// Preisstufe des Reglers. Regeln aus GOZ Abschnitt H/J (KB/_quellen/privat-kb.json).

import {
  BEB, istFunktionsanalyse, LABOR_GIPSMODELLE, LABOR_KLASSE_FAKTOR, LABOR_NUR_ABDRUCK, SCAN_BEREICHE_BEIDE_KIEFER, type VorlagenPosition,
} from '../data/katalog'
import { importVon, type LaborXml } from '../laborxml'
import type { Abformung, Einstellungen, Plan, Position, Rechnung, Zeile } from '../types'
import { gozEinzel, gozText, GOZ_HOECHSTSATZ, GOZ_SCHWELLE, laborListenPreis, runden } from './listen'

export const euro = (x: number) =>
  x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const faktorText = (f: number) => f.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })

export const neueId = () => Math.random().toString(36).slice(2, 10)

/** Praxispreis, sonst Listenpreis der gleichbedeutenden Labornummer, sonst Platzhalter des Fremdlabors. */
export function laborGrundpreis(nr: string, einst: Einstellungen): number | undefined {
  if (einst.laborPreise[nr] != null) return einst.laborPreise[nr]
  const b = BEB.get(nr)
  return laborListenPreis(b?.labor) ?? (b?.fremd ? b.preis : undefined)
}

/** Fremdlabor-Leistung ohne eigenen Preis und ohne Praxispreis: gerechnet wird mit dem Platzhalter aus dem Katalog. */
const istPlatzhalter = (p: Position, einst: Einstellungen) =>
  p.preis == null && einst.laborPreise[p.nr] == null && !!BEB.get(p.nr)?.fremd

export const positionsFaktor = (p: Position, plan: Plan) =>
  p.faktor ?? (istFunktionsanalyse(p.nr) ? plan.regler.faFaktor : plan.regler.faktor)

function zeileAus(p: Position, plan: Plan, einst: Einstellungen): Zeile {
  const anzahl = Math.max(0, p.anzahl || 0)
  if (p.ebene === 'GOZ') {
    const faktor = positionsFaktor(p, plan)
    const einzel = gozEinzel(p.nr, faktor)
    if (p.analog) {
      return {
        id: p.id, ebene: 'GOZ', nr: `${p.nr}a`, bemessung: p.nr, text: `${p.text || 'Analogleistung'} – entsprechend GOZ ${p.nr}`,
        anzahl, faktor, einzel, summe: runden(einzel * anzahl),
      }
    }
    return { id: p.id, ebene: 'GOZ', nr: p.nr, text: p.text || gozText(p.nr), anzahl, faktor, einzel, summe: runden(einzel * anzahl) }
  }
  if (p.ebene === 'MATERIAL') {
    const einzel = runden(p.preis ?? 0)
    return { id: p.id, ebene: 'MATERIAL', nr: p.nr || 'Mat.', text: p.text || 'Material', anzahl, einzel, summe: runden(einzel * anzahl), ausXml: p.ausXml }
  }
  const platzhalter = istPlatzhalter(p, einst)
  const grund = p.preis ?? laborGrundpreis(p.nr, einst)
  const stufe = p.preis != null || platzhalter ? 1 : (LABOR_KLASSE_FAKTOR[plan.regler.laborKlasse] ?? 1)
  const einzel = runden((grund ?? 0) * stufe)
  return {
    id: p.id, ebene: 'LABOR', nr: p.nr, text: p.text || BEB.get(p.nr)?.text || `BEB ${p.nr}`, anzahl, einzel,
    summe: runden(einzel * anzahl), ohnePreis: grund == null, platzhalter, ausXml: p.ausXml,
  }
}

const anzahlVon = (plan: Plan, nr: string) =>
  plan.positionen.filter((p) => p.ebene === 'GOZ' && !p.analog && p.nr === nr).reduce((s, p) => s + (p.anzahl || 0), 0)

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

  const ukps = istUkps(plan.positionen)
  if (ukps) {
    hinweise.push('Gesetzlich Versicherte: die UKPS bei OSAS ist Kassenleistung (BEMA UP1–UP6) – mit Veranlassung Schlafmedizin den Kassen-KB-Planer verwenden.')
  }
  if (honorar.some((z) => z.bemessung)) {
    hinweise.push('Analogleistung (§ 6 Abs. 1 GOZ): auf der Rechnung die erbrachte Leistung verständlich beschreiben, mit dem Hinweis „entsprechend“ und Nummer und Bezeichnung der Bemessungsleistung (§ 10 Abs. 4 GOZ).')
  }
  const platzhalter = labor.filter((z) => z.platzhalter)
  if (platzhalter.length) {
    warnungen.push(`Fremdlabor-Platzhalter (${platzhalter.map((z) => z.nr).join(', ')}): Kostenvoranschlag des Labors als XML einlesen oder Preis eintragen.`)
  }
  if (plan.fremdlabor.import) {
    hinweise.push(`Laborpreise aus dem Labor-XML ${plan.fremdlabor.import.datei} (Rechnung ${plan.fremdlabor.import.rechnungsnummer || '—'}, ${euro(plan.fremdlabor.import.netto)} netto).`)
  }
  if (plan.abformung === 'scan') {
    hinweise.push('Intraoralscan: GOZ 0065 je Kieferhälfte bzw. Frontzahnbereich statt 0060; das Labor druckt die Modelle (BEB 0009) und bekommt die Daten digital (Versand 0036).')
    if (plan.positionen.some((p) => p.ebene === 'LABOR' && LABOR_GIPSMODELLE.includes(p.nr) && p.anzahl > 0)) {
      warnungen.push('Intraoralscan gewählt, aber Gipsmodelle im Plan – Abformung umschalten oder Modelle prüfen.')
    }
  }

  return {
    honorar, labor, summeHonorar, summeLabor, gesamt: runden(summeHonorar + summeLabor),
    vereinbarung2, begruendung, hinweise, warnungen,
  }
}

/** Fügt die Positionen einer Vorlage an; gleiche Positionen werden zusammengezählt. `UKPS` = Bemessung aus den Einstellungen. */
export function vorlageAnwenden(positionen: Position[], neu: VorlagenPosition[], einst?: Einstellungen): Position[] {
  const out = positionen.map((p) => ({ ...p }))
  for (const v of neu) {
    const n = v.nr === 'UKPS' ? { ...v, nr: einst?.ukpsAnalog || '5220' } : v
    const da = out.find((p) => p.ebene === n.ebene && p.nr === n.nr && p.faktor == null && p.preis == null
      && !p.analog === !n.analog && (p.text ?? '') === (n.text ?? ''))
    if (da) da.anzahl += n.anzahl
    else out.push({ id: neueId(), ebene: n.ebene, nr: n.nr, anzahl: n.anzahl, ...(n.analog ? { analog: true, text: n.text } : {}) })
  }
  return out
}

export const istUkps = (positionen: Position[]) =>
  positionen.some((p) => p.anzahl > 0 && (p.nr.startsWith('F-UKPS') || (p.analog && /protrusion/i.test(p.text ?? ''))))

const menge = (positionen: Position[], ebene: Position['ebene'], nrs: string[]) =>
  positionen.filter((p) => p.ebene === ebene && !p.analog && nrs.includes(p.nr) && p.anzahl > 0).reduce((s, p) => s + p.anzahl, 0)

function ersetzen(positionen: Position[], ebene: Position['ebene'], alt: string[], nr: string, anzahl: number): Position[] {
  const rest = positionen.filter((p) => !(p.ebene === ebene && !p.analog && alt.includes(p.nr)))
  if (!anzahl) return rest
  const da = rest.find((p) => p.ebene === ebene && p.nr === nr && !p.analog && p.preis == null && p.faktor == null)
  if (da) return rest.map((p) => (p === da ? { ...p, anzahl: p.anzahl + anzahl } : p))
  return [...rest, { id: neueId(), ebene, nr, anzahl }]
}

/**
 * Stellt Honorar und Labor auf den Abformweg um. Intraoralscan: 0060 → 0065 für beide Kiefer, Gipsmodelle →
 * gedruckte Modelle (BEB 0009), Doublieren entfällt, Versand → Versand bei Datenlieferung. Abdruck: zurück.
 */
export function abformungAnwenden(positionen: Position[], ziel: Abformung): Position[] {
  let pos = positionen
  if (ziel === 'scan') {
    const abdruck = menge(pos, 'GOZ', ['0060'])
    if (abdruck) pos = ersetzen(pos, 'GOZ', ['0060'], '0065', SCAN_BEREICHE_BEIDE_KIEFER * abdruck)
    pos = ersetzen(pos, 'LABOR', LABOR_GIPSMODELLE, '0009', menge(pos, 'LABOR', LABOR_GIPSMODELLE))
    pos = pos.filter((p) => !(p.ebene === 'LABOR' && !p.analog && LABOR_NUR_ABDRUCK.includes(p.nr)))
    return ersetzen(pos, 'LABOR', ['0701'], '0036', menge(pos, 'LABOR', ['0701']))
  }
  const scan = menge(pos, 'GOZ', ['0065'])
  if (scan) pos = ersetzen(pos, 'GOZ', ['0065'], '0060', Math.max(1, Math.round(scan / SCAN_BEREICHE_BEIDE_KIEFER)))
  pos = ersetzen(pos, 'LABOR', ['0009'], '0002', menge(pos, 'LABOR', ['0009']))
  return ersetzen(pos, 'LABOR', ['0036'], '0701', menge(pos, 'LABOR', ['0036']))
}

/**
 * Übernimmt Kostenvoranschlag oder Rechnung des Fremdlabors: alle Labor- und importierten Materialpositionen
 * werden durch die XML-Positionen ersetzt, das Honorar bleibt. Leistungen → Labor, Edelmetall/Material/Rabatt → Material.
 */
export function laborXmlUebernehmen(plan: Plan, x: LaborXml, datei: string): { plan: Plan; meldungen: string[] } {
  const neu: Position[] = x.positionen.map((p) => {
    const basis = { id: neueId(), anzahl: p.menge, preis: p.einzelpreis, ausXml: true }
    if (p.art === 'BEL' || p.art === 'NBL') {
      const nr = p.nummer ?? /^\s*(\d{4})\b/.exec(p.beschreibung)?.[1] ?? 'Lab.'
      return { ...basis, ebene: 'LABOR', nr, text: p.beschreibung }
    }
    const rabatt = p.art === 'RBT'
    return { ...basis, ebene: 'MATERIAL', nr: 'Mat.', preis: rabatt ? -p.einzelpreis : p.einzelpreis, text: `${rabatt ? 'Rabatt' : p.art === 'EDM' ? 'Edelmetall' : 'Labormaterial'}: ${p.beschreibung}` }
  })
  const bleibt = plan.positionen.filter((p) => !(p.ebene === 'LABOR' || (p.ebene === 'MATERIAL' && p.ausXml)))
  return {
    plan: { ...plan, positionen: [...bleibt, ...neu], fremdlabor: { name: x.laborname || plan.fremdlabor.name, import: importVon(x, datei) } },
    meldungen: [`${x.positionen.length} Laborpositionen aus ${datei} übernommen (${x.laborname || 'Labor'}, ${euro(x.netto)} netto).`, ...x.warnungen],
  }
}
