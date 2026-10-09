// Rechnung und Prüfung des Kassen-KB-Plans.
//
// Honorar: BEMA-Bewertungszahl × Punktwert BEMA Teil 2 (KB) der KZV der Praxis.
// Kieferbruch-Leistungen nach GOÄ laufen je nach KZV über KB oder KCH (Einstellung).
// Labor: BEL II der KZV der Praxis, Praxislabor- oder Gewerbepreis. Material:
// Abformpauschale (Ordnungsnummer 605). Die Kasse trägt den Plan voll; ein Eigenanteil
// entsteht nicht. Regeln nach BEMA Teil 2 und BMV-Z Anlage 1 Nr. 3 (KB/_quellen/kassen-kb.json).

import { ermittlePunktwert, kzvDerPraxis } from '../punktwerte'
import { BEL_MODELLE, BEL_NUR_ABDRUCK, PRIVAT_LABOR } from '../data/katalog'
import { importVon, type LaborXml } from '../laborxml'
import type { Abformung, Einstellungen, Plan, Position, Rechnung, Zeile } from '../types'
import { bemaEintrag, belListeFuer, belNr, BEL_HINWEISE, istGoae, kzvName, runden } from './listen'

export const euro = (x: number) =>
  x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const pwText = (x: number) => x.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

export const neueId = () => Math.random().toString(36).slice(2, 10)

const ABFORMUNG_TEXT = 'Abformung (Pauschale, Ordnungsnummer 605)'

export function rechnen(plan: Plan, einst: Einstellungen): Rechnung {
  const kassenart = plan.patient.kassenart
  const kb = ermittlePunktwert({ bereich: 'KB', praxis: einst.praxis, kassenart, fest: einst.punktwertFest.KB })
  const kch = ermittlePunktwert({ bereich: 'KCH', praxis: einst.praxis, kassenart, fest: einst.punktwertFest.KCH })
  const kzvNr = kzvDerPraxis(einst.praxis)
  const liste = belListeFuer(kzvNr || '11', plan.datum)
  const belPreis = new Map((liste?.eintraege ?? []).map((e) => [e.nr, e] as const))

  const ueberHoechstpreis: string[] = []
  const zeile = (p: Position): Zeile => {
    const anzahl = Math.max(0, p.anzahl || 0)
    if (p.ebene === 'PRIVAT') {
      const vorgabe = PRIVAT_LABOR[p.nr]
      const einzel = runden(p.preis ?? vorgabe?.preis ?? 0)
      return {
        id: p.id, ebene: 'PRIVAT', nr: p.nr || 'Lab.', text: p.text || vorgabe?.text || 'Laborleistung ohne BEL-Nummer', anzahl, einzel,
        summe: runden(einzel * anzahl), ohnePreis: p.preis == null && !vorgabe,
      }
    }
    if (p.ebene === 'BEMA') {
      const b = bemaEintrag(p.nr)
      const punkte = b?.punkte ?? 0
      const punktwert = istGoae(p.nr) && einst.kieferbruchKch ? kch.wert : kb.wert
      const einzel = runden(punkte * punktwert)
      return { id: p.id, ebene: 'BEMA', nr: p.nr, text: p.text || b?.text || p.nr, anzahl, punkte, punktwert, einzel, summe: runden(einzel * anzahl), ohnePreis: !b }
    }
    if (p.ebene === 'MATERIAL') {
      const pauschale = p.nr === '605'
      const einzel = runden(p.preis ?? (pauschale ? einst.abformPauschale : 0))
      return { id: p.id, ebene: 'MATERIAL', nr: p.nr, text: p.text || (pauschale ? ABFORMUNG_TEXT : 'Material'), anzahl, einzel, summe: runden(einzel * anzahl) }
    }
    const e = belPreis.get(p.nr)
    const listenPreis = e ? e[plan.labor] : undefined
    const einzel = runden(p.preis ?? listenPreis ?? 0)
    if (p.preis != null && e && p.preis > e[plan.labor] + 0.005) ueberHoechstpreis.push(belNr(p.nr))
    return {
      id: p.id, ebene: 'BEL', nr: belNr(p.nr), text: p.text || e?.text || `BEL ${belNr(p.nr)}`, anzahl, einzel,
      summe: runden(einzel * anzahl), ohnePreis: p.preis == null && listenPreis == null,
    }
  }

  const zeilen = plan.positionen.filter((p) => p.anzahl > 0).map(zeile)
  const honorar = zeilen.filter((z) => z.ebene === 'BEMA')
  const labor = zeilen.filter((z) => z.ebene === 'BEL')
  const material = zeilen.filter((z) => z.ebene === 'MATERIAL')
  const privat = zeilen.filter((z) => z.ebene === 'PRIVAT')
  const summe = (zs: Zeile[]) => runden(zs.reduce((s, z) => s + z.summe, 0))

  const menge = (nr: string) => plan.positionen.filter((p) => p.ebene === 'BEMA' && p.nr === nr).reduce((s, p) => s + (p.anzahl || 0), 0)
  const hat = (nr: string) => menge(nr) > 0
  const a = plan.angaben
  const hinweise: string[] = []
  const warnungen: string[] = []

  const k13 = ['K1', 'K2', 'K3'].reduce((s, nr) => s + menge(nr), 0)
  if (k13 > 1) warnungen.push('Im zeitlichen Zusammenhang ist nur eine der Leistungen K1, K2 oder K3 abrechenbar.')
  const genehmigungspflichtig = a.art === 'kiefergelenk' && ['K1', 'K2', 'K3', 'K4'].some(hat)
  if (genehmigungspflichtig) {
    hinweise.push(a.genehmigungsverzicht
      ? 'K1–K4: Genehmigungsverzicht laut Landesvertrag – Plan bleibt in der Akte, keine Übermittlung.'
      : 'K1–K4 sind genehmigungspflichtig: Plan vor Behandlungsbeginn elektronisch an die Kasse, erst nach Genehmigung behandeln (K2 bei Schmerzen nachträglich).')
  }
  if (a.art === 'kieferbruch') hinweise.push('Kieferbruch: Plan vor Beginn erstellen und der Kasse unverzüglich anzeigen – eine Genehmigung ist nicht nötig.')
  if (a.art === 'kieferbruch' && !a.verletzung.trim()) warnungen.push('Kieferbruch: Angaben über Ort, Zeit und Ursache sowie Art der Verletzung fehlen.')
  if (a.art === 'kiefergelenk' && !a.befund.trim()) warnungen.push('Kiefergelenkserkrankung: Anamnese, Befunde und Diagnose fehlen.')
  if (hat('K8') && hat('K2') && !hat('K1') && !hat('K3')) warnungen.push('K8 (Einschleifen) ist für einen K2-Behelf ohne adjustierte Oberfläche nicht abrechenbar.')
  if (['K6', 'K7', 'K8', 'K9'].filter(hat).length > 1) hinweise.push('Je Sitzung nur eine der Leistungen K6–K9; K7 nicht in der Eingliederungssitzung von K1–K3.')
  if (hat('K4')) hinweise.push(`K4: ${menge('K4')} Interdentalräume im Behandlungsplan angeben; Entfernung später nach Ä2702 je Kiefer.`)
  if (hat('7a')) warnungen.push('BEMA 7a gilt nur im Rahmen einer kieferorthopädischen Behandlung – für Schienen nicht einschlägig.')
  const ukps = istUkps(plan.positionen)
  if (ukps && !a.schlafmedizin) warnungen.push('UKPS nur auf Veranlassung eines Vertragsarztes mit Zusatzbezeichnung Schlafmedizin (Angaben: Veranlassung bestätigen).')
  if (ukps && hat('2')) hinweise.push('BEMA 2 ist für die UKPS (UP1–UP6) nicht abrechenbar.')
  if (ukps && plan.positionen.some((p) => p.ebene === 'MATERIAL' && p.nr === '605' && p.anzahl > 0)) {
    warnungen.push('UKPS: keine Abformpauschale (605). Abformmaterial in der tatsächlich entstandenen Höhe als Material eintragen.')
  }
  if (ukps && a.art === 'kiefergelenk') hinweise.push('UKPS-Leistungen im Plan einer Kiefergelenkserkrankung – Planart „UKPS bei OSAS“ wählen.')
  if (a.art === 'ukps' && ['K1', 'K2', 'K3', 'K4'].some(hat)) warnungen.push('K1–K4 im UKPS-Plan: Aufbissbehelfe gehören in einen eigenen Plan „Kiefergelenkserkrankung“.')
  if (a.art === 'ukps' && !a.befund.trim()) warnungen.push('UKPS: Diagnose OSAS und Befund der schlafmedizinischen Veranlassung fehlen.')
  if (plan.abformung === 'scan') {
    hinweise.push(ukps
      ? 'Intraoralscan: in UP2 enthalten – kein Zusatzhonorar und keine Abformpauschale. Das Labor arbeitet auf gedruckten Modellen; die stehen nicht in der BEL II.'
      : 'Intraoralscan: keine Abformpauschale; das Labor arbeitet auf gedruckten Modellen, die nicht in der BEL II stehen.')
    if (plan.positionen.some((p) => p.ebene === 'BEL' && BEL_MODELLE.includes(p.nr) && p.anzahl > 0)) {
      warnungen.push('Intraoralscan gewählt, aber Gipsmodelle (BEL 001 0/001 5) im Plan – Abformung umschalten oder Modelle prüfen.')
    }
  }
  if (privat.length) {
    hinweise.push('Laborleistungen ohne BEL-II-Nummer sind keine Kassenleistung: Privatanteil vor Behandlungsbeginn schriftlich mit dem Patienten vereinbaren (§ 8 Abs. 7 BMV-Z).')
  }
  if (ueberHoechstpreis.length) warnungen.push(`Laborpreis über dem BEL-II-Höchstpreis der KZV (${ueberHoechstpreis.join(', ')}) – die Kasse erstattet höchstens den Listenpreis.`)
  if (plan.fremdlabor.import) {
    hinweise.push(`Laborpreise aus dem Labor-XML ${plan.fremdlabor.import.datei} (Rechnung ${plan.fremdlabor.import.rechnungsnummer || '—'}, ${euro(plan.fremdlabor.import.netto)} netto).`)
  } else if (plan.labor === 'gewerbe' && labor.length) {
    hinweise.push('Fremdlabor: gerechnet mit dem BEL-II-Höchstpreis – Kostenvoranschlag des Labors als XML einlesen, dann stehen die echten Preise im Plan.')
  }
  const goae = honorar.some((z) => istGoae(z.nr))
  if (goae) hinweise.push(`Kieferbruch-Leistungen nach GOÄ mit dem ${einst.kieferbruchKch ? 'KCH' : 'KB'}-Punktwert – regionale Vorgabe der KZV beachten (Einstellungen).`)
  if (a.art === 'kiefergelenk' && goae) warnungen.push('GOÄ-Kieferbruchleistungen im Plan einer Kiefergelenkserkrankung – Planart prüfen.')
  if (!kzvNr) warnungen.push('KZV der Praxis unbekannt (PLZ in den Einstellungen) – BEL-II-Preise der KZV Bayern, Punktwert Bundesmittel.')
  if (labor.some((z) => z.ohnePreis)) warnungen.push(`Einzelne BEL-Nummern stehen nicht in der Liste ${liste?.name ?? ''} – Preis in der Zeile eintragen.`)
  if (honorar.some((z) => z.ohnePreis)) warnungen.push('Unbekannte BEMA-Nummer im Plan.')
  if (plan.labor === 'gewerbe' && labor.length && !plan.positionen.some((p) => p.ebene === 'BEL' && p.nr.startsWith('933'))) {
    hinweise.push('Gewerbliches Labor: Versandkosten (BEL 933 0 bzw. 933 5 bei UKPS) je Versandgang ergänzen.')
  }
  for (const p of plan.positionen) {
    const h = p.ebene === 'BEL' ? BEL_HINWEISE[p.nr]?.abrechnung : undefined
    if (h && p.anzahl > 0 && ['4010', '4020', '4030', '4040'].includes(p.nr)) hinweise.push(`BEL ${belNr(p.nr)}: ${h}`)
  }
  if (!kb.geprueft) hinweise.push(`KB-Punktwert ${pwText(kb.wert)} € ist nicht bestätigt – mit dem KZV-Rundschreiben abgleichen.`)

  const summeHonorar = summe(honorar)
  const summeLabor = summe(labor)
  const summeMaterial = summe(material)
  return {
    honorar, labor, material, privat, summeHonorar, summeLabor, summeMaterial, summePrivat: summe(privat),
    gesamt: runden(summeHonorar + summeLabor + summeMaterial),
    punktwertKb: kb.wert, punktwertKch: kch.wert, punktwertHinweis: kb.hinweis,
    belListe: liste ? `${liste.name}${kzvNr ? '' : ' (Ersatz)'}` : '—',
    genehmigungspflichtig, hinweise, warnungen,
  }
}

/** Fügt die Positionen einer Vorlage an; BEMA 2 nur einmal, sonst gleiche Positionen zusammenzählen. */
export function vorlageAnwenden(positionen: Position[], neu: { ebene: Position['ebene']; nr: string; anzahl: number }[]): Position[] {
  const out = positionen.map((p) => ({ ...p }))
  for (const n of neu) {
    const da = out.find((p) => p.ebene === n.ebene && p.nr === n.nr && p.preis == null && !p.text)
    if (da && n.ebene === 'BEMA' && n.nr === '2') continue
    if (da) da.anzahl += n.anzahl
    else out.push({ id: neueId(), ebene: n.ebene, nr: n.nr, anzahl: n.anzahl })
  }
  return out
}

export const istUkps = (positionen: Position[]) => positionen.some((p) => p.ebene === 'BEMA' && p.nr.startsWith('UP') && p.anzahl > 0)

const mengeVon = (positionen: Position[], ebene: Position['ebene'], nrs: string[]) =>
  positionen.filter((p) => p.ebene === ebene && nrs.includes(p.nr) && p.anzahl > 0).reduce((s, p) => s + p.anzahl, 0)

/**
 * Stellt den Laborweg auf die Abformung um. Intraoralscan: Gipsmodelle der BEL II werden zu gedruckten
 * Modellen (Privatanteil), Doublieren, individueller Löffel und Abformpauschale entfallen. Abdruck: zurück.
 * Artikulator, Bissgabel, Schiene und Versand bleiben – das Labor fertigt auf den Modellen wie gewohnt.
 */
export function abformungAnwenden(positionen: Position[], ziel: Abformung): Position[] {
  if (ziel === 'scan') {
    const modelle = mengeVon(positionen, 'BEL', BEL_MODELLE)
    const rest = positionen.filter((p) => !(
      (p.ebene === 'BEL' && (BEL_MODELLE.includes(p.nr) || BEL_NUR_ABDRUCK.includes(p.nr))) || (p.ebene === 'MATERIAL' && p.nr === '605')
    ))
    const da = rest.find((p) => p.ebene === 'PRIVAT' && p.nr === '0009' && p.preis == null)
    if (!modelle) return rest
    if (da) return rest.map((p) => (p === da ? { ...p, anzahl: p.anzahl + modelle } : p))
    return [...rest, { id: neueId(), ebene: 'PRIVAT', nr: '0009', anzahl: modelle }]
  }
  const gedruckt = mengeVon(positionen, 'PRIVAT', ['0009'])
  if (!gedruckt) return positionen
  const rest = positionen.filter((p) => !(p.ebene === 'PRIVAT' && p.nr === '0009'))
  const neu: Position[] = [{ id: neueId(), ebene: 'BEL', nr: istUkps(positionen) ? '0015' : '0010', anzahl: gedruckt }]
  // UKPS: keine Pauschale 605, Abformmaterial nur in der tatsächlich entstandenen Höhe.
  if (!istUkps(positionen) && !rest.some((p) => p.ebene === 'MATERIAL' && p.nr === '605')) {
    neu.push({ id: neueId(), ebene: 'MATERIAL', nr: '605', anzahl: gedruckt })
  }
  return [...rest, ...neu]
}

/**
 * Übernimmt Kostenvoranschlag oder Rechnung des Fremdlabors: alle Laborpositionen (BEL, Privat, Labor-
 * material aus einem früheren Import) werden durch die XML-Positionen ersetzt; Honorar und Abformpauschale bleiben.
 * BEL → BEL mit Laborpreis, NBL (ohne BEL-Nummer) → Privatanteil, Edelmetall/Material/Rabatt → Material.
 */
export function laborXmlUebernehmen(plan: Plan, x: LaborXml, datei: string): { plan: Plan; meldungen: string[] } {
  const meldungen = [...x.warnungen]
  const neu: Position[] = x.positionen.map((p) => {
    const basis = { id: neueId(), anzahl: p.menge, preis: p.einzelpreis, ausXml: true }
    if (p.art === 'BEL') return { ...basis, ebene: 'BEL', nr: p.nummer ?? '', text: p.beschreibung }
    if (p.art === 'NBL') return { ...basis, ebene: 'PRIVAT', nr: /^\s*(\d{4})\b/.exec(p.beschreibung)?.[1] ?? '', text: p.beschreibung }
    const rabatt = p.art === 'RBT'
    return { ...basis, ebene: 'MATERIAL', nr: 'Lab.', preis: rabatt ? -p.einzelpreis : p.einzelpreis, text: `${rabatt ? 'Rabatt' : p.art === 'EDM' ? 'Edelmetall' : 'Labormaterial'}: ${p.beschreibung}` }
  })
  const bleibt = plan.positionen.filter((p) => !(p.ebene === 'BEL' || p.ebene === 'PRIVAT' || (p.ebene === 'MATERIAL' && p.ausXml)))
  const nbl = neu.filter((p) => p.ebene === 'PRIVAT').length
  if (nbl) meldungen.push(`${nbl} Position${nbl === 1 ? '' : 'en'} ohne BEL-Nummer – als Privatanteil geplant.`)
  meldungen.unshift(`${x.positionen.length} Laborpositionen aus ${datei} übernommen (${x.laborname || 'Labor'}, ${euro(x.netto)} netto).`)
  return {
    plan: {
      ...plan, labor: 'gewerbe', positionen: [...bleibt, ...neu],
      fremdlabor: { name: x.laborname || plan.fremdlabor.name, import: importVon(x, datei) },
    },
    meldungen,
  }
}

export { kzvName }
