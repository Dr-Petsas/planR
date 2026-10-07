// Rechnung und Prüfung des Kassen-KFO-Plans. Belege: KFO/_quellen/kassen-kfo.json.
//
// Behandlungsaufgabe: 119 je Kiefer und 120 aus dem BEMA-Punkteraster (a–d), gezahlt in
// quartalsweisen Abschlägen (höchstens 12, Frühbehandlung höchstens 6 Quartale).
// Honorar: Bewertungszahl × KFO-Punktwert der KZV der Praxis; 01k, 12 und Röntgen mit dem
// KCH-Punktwert und ohne Eigenanteil (§ 29 Abs. 2 Satz 2 SGB V). Labor: BEL II der KZV.
// Eigenanteil 20 % (10 % ab dem zweiten Kind), Rückzahlung nach Abschluss.
// Mehr-/Zusatzleistungen (Vordruck 4d): GOZ-Betrag abzüglich der BEMA-Vergleichsleistung.

import { ermittlePunktwert, kzvDerPraxis } from '../punktwerte'
import type { Einstellungen, EinstufungErgebnis, Plan, Position, PrivatZeile, Rechnung, Stufen, Zeile } from '../types'
import { KIG_FRUEH, KIG_FRUEHE, KIG_KOMBI, MEHR, RASTER_119, RASTER_120, kigText, stufe119, stufe120 } from '../data/katalog'
import {
  bemaEintrag, belListeFuer, belNr, gozBekannt, gozEinzel, gozText, GOZ_HOECHSTSATZ, GOZ_SCHWELLE, istRoentgen, kzvName, runden,
} from './listen'

export const euro = (x: number) =>
  x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const pwText = (x: number) => x.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
export const faktorText = (x: number) => x.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })

export const neueId = () => Math.random().toString(36).slice(2, 10)

/** Punkte eines Rasters; unvollständig, solange ein Kriterium offen ist. */
export function rasterPunkte(raster: typeof RASTER_119 | typeof RASTER_120, stufen: Stufen) {
  let punkte = 0
  let vollstaendig = true
  raster.forEach((k, i) => {
    const s = stufen[i]
    const spalte = s == null ? null : k.stufen[s]
    if (!spalte) vollstaendig = false
    else punkte += spalte[1]
  })
  return { punkte, vollstaendig }
}

export function einstufen(plan: Plan): EinstufungErgebnis[] {
  const e = plan.einstufung
  const out: EinstufungErgebnis[] = []
  const add = (bereich: EinstufungErgebnis['bereich'], stufen: Stufen) => {
    const raster = bereich === 'biss' ? RASTER_120 : RASTER_119
    const { punkte, vollstaendig } = rasterPunkte(raster, stufen)
    const stufe = vollstaendig ? (bereich === 'biss' ? stufe120(punkte) : stufe119(punkte)) : ''
    out.push({ bereich, punkte, vollstaendig, stufe, nr: stufe ? `${bereich === 'biss' ? '120' : '119'}${stufe}` : '' })
  }
  if (e.okAktiv) add('ok', e.ok)
  if (e.ukAktiv) add('uk', e.uk)
  if (e.bissAktiv) add('biss', e.biss)
  return out
}

/** Alter in vollendeten Jahren am Stichtag (null ohne Geburtsdatum). */
export function alterAm(geburtsdatum: string, stichtag: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(geburtsdatum) || !/^\d{4}-\d{2}-\d{2}$/.test(stichtag)) return null
  const [gj, gm, gt] = geburtsdatum.split('-').map(Number)
  const [sj, sm, st] = stichtag.split('-').map(Number)
  return sj - gj - (sm < gm || (sm === gm && st < gt) ? 1 : 0)
}

const BEREICH_NAME = { ok: 'Oberkiefer', uk: 'Unterkiefer', biss: 'Bisslage' } as const

export function rechnen(plan: Plan, einst: Einstellungen): Rechnung {
  const a = plan.angaben
  const kassenart = plan.patient.kassenart
  const kfo = ermittlePunktwert({ bereich: 'KFO', praxis: einst.praxis, kassenart, fest: einst.punktwertFest.KFO })
  const kch = ermittlePunktwert({ bereich: 'KCH', praxis: einst.praxis, kassenart, fest: einst.punktwertFest.KCH })
  const kzvNr = kzvDerPraxis(einst.praxis)
  const liste = belListeFuer(kzvNr || '11', plan.datum)
  const belPreis = new Map((liste?.eintraege ?? []).map((e) => [e.nr, e] as const))
  const hinweise: string[] = []
  const warnungen: string[] = []
  const frueh = a.behandlungsArt === 'frueh'
  const abschlaege = frueh ? 6 : 12
  const einstufung = einstufen(plan)

  const pwFuer = (nr: string, bereich: 'KFO' | 'KCH') => (bereich === 'KFO' || (istRoentgen(nr) && einst.roentgenKfo) ? kfo.wert : kch.wert)
  const ohneEA = (nr: string) => Boolean(bemaEintrag(nr)?.ohneEigenanteil) || (einst.ohneEigenanteil121 && /^12[1-4]/.test(nr))

  const aufgabe: Zeile[] = einstufung.filter((e) => e.nr).map((e) => {
    const b = bemaEintrag(e.nr)!
    const einzel = runden(b.abschlag! * kfo.wert)
    return {
      id: `auf-${e.bereich}`, ebene: 'BEMA', nr: e.nr, auto: true, anzahl: abschlaege, punkte: b.abschlag, punktwert: kfo.wert, einzel,
      summe: runden(einzel * abschlaege),
      text: `${b.text} – ${BEREICH_NAME[e.bereich]}, ${e.punkte} Punkte im Raster · ${abschlaege} Abschläge je Quartal`,
    }
  })

  const zeile = (p: Position): Zeile => {
    const anzahl = Math.max(0, p.anzahl || 0)
    if (p.ebene === 'BEMA') {
      const b = bemaEintrag(p.nr)
      const punkte = b?.punkte ?? 0
      const punktwert = pwFuer(p.nr, b?.bereich ?? 'KFO')
      const einzel = runden(punkte * punktwert)
      return {
        id: p.id, ebene: 'BEMA', nr: p.nr, text: p.text || b?.text || p.nr, anzahl, punkte, punktwert, einzel,
        summe: runden(einzel * anzahl), ohnePreis: !b, ohneEigenanteil: ohneEA(p.nr),
      }
    }
    if (p.ebene === 'MATERIAL') {
      const einzel = runden(p.preis ?? 0)
      return { id: p.id, ebene: 'MATERIAL', nr: p.nr, text: p.text || 'Praxismaterial', anzahl, einzel, summe: runden(einzel * anzahl), ohnePreis: !p.preis }
    }
    const e = belPreis.get(p.nr)
    const listenPreis = e ? e[plan.labor] : undefined
    const einzel = runden(p.preis ?? listenPreis ?? 0)
    return {
      id: p.id, ebene: 'BEL', nr: belNr(p.nr), text: p.text || e?.text || `BEL ${belNr(p.nr)}`, anzahl, einzel,
      summe: runden(einzel * anzahl), ohnePreis: p.preis == null && listenPreis == null,
    }
  }

  const kasse = plan.positionen.filter((p) => p.ebene !== 'PRIVAT' && p.anzahl > 0).map(zeile)
  const honorar = [...aufgabe, ...kasse.filter((z) => z.ebene === 'BEMA')]
  const labor = kasse.filter((z) => z.ebene === 'BEL')
  const material = kasse.filter((z) => z.ebene === 'MATERIAL')
  const summe = (zs: { summe: number }[]) => runden(zs.reduce((s, z) => s + z.summe, 0))

  // ---- Mehr-, Zusatz- und andere Leistungen (Vordruck 4d) ----
  const privat: PrivatZeile[] = plan.positionen.filter((p) => p.ebene === 'PRIVAT' && p.anzahl > 0).map((p) => {
    const anzahl = p.anzahl
    const art = p.art ?? 'Z'
    const faktor = p.faktor ?? einst.gozFaktor
    const goz = gozBekannt(p.nr)
    const einzel = goz && p.preis == null ? gozEinzel(p.nr, faktor) : runden(p.preis ?? 0)
    const betrag = runden(einzel * anzahl)
    const vb = art === 'M' && p.vergleich ? bemaEintrag(p.vergleich) : undefined
    const vergleichAnzahl = vb ? Math.max(0, p.vergleichAnzahl ?? anzahl) : 0
    const bema = vb ? runden(runden(vb.punkte * pwFuer(vb.nr, vb.bereich)) * vergleichAnzahl) : 0
    return {
      id: p.id, art, nr: goz ? p.nr : '', text: p.text || (goz ? gozText(p.nr) : 'Privatleistung'),
      faktor: goz && p.preis == null ? faktor : undefined, anzahl, betrag,
      vergleich: vb?.nr, vergleichText: vb?.text, vergleichAnzahl, bema,
      anteil: runden(Math.max(0, betrag - bema)), material: runden((p.material ?? 0) * anzahl),
      ohnePreis: !goz && !p.preis,
    }
  })

  // ---- Prüfungen ----
  const menge = (nr: string) => honorar.filter((z) => z.nr === nr).reduce((s, z) => s + z.anzahl, 0)
  const hat = (nr: string) => menge(nr) > 0
  const kig = kigText(a.kigGruppe, a.kigGrad)
  const alter = alterAm(plan.patient.geburtsdatum, plan.datum)
  const mitAufgabe = aufgabe.length > 0
  const einzelOhne = ['121', '122a', '122b', '122c', '123a', '123b', '124'].filter(hat)
  const kassenleistung = Boolean(a.kigGruppe) && a.kigGrad >= 3

  if (!a.kigGruppe) warnungen.push('KIG-Einstufung fehlt – aufgezeichnet wird die Fehlstellung mit dem höchsten Behandlungsbedarf (Gruppe und Grad).')
  else if (a.kigGrad < 3) warnungen.push(`KIG ${kig}: nur die Grade 3 bis 5 sind Kassenleistung – der Patient erhält die Mitteilung „keine Kassenleistung“ (Vordruck 4b, MIT 4).`)
  if (a.behandlungsArt === 'frueh') {
    if (kig && !KIG_FRUEH.includes(kig)) warnungen.push(`Frühbehandlung (Richtlinie B8 c) nur bei D5, K3/K4 (wenn Einschleifen nicht reicht), B4, M4/M5 oder P3 – nicht bei ${kig}.`)
    if (alter != null && alter < 4) warnungen.push('Die Frühbehandlung soll nicht vor dem 4. Lebensjahr beginnen.')
    if (a.quartale > 6) warnungen.push('Frühbehandlung: Abschluss innerhalb von 6 Kalenderquartalen; Abschläge 119/120 höchstens für 6 Quartale.')
    hinweise.push('Frühbehandlung: Abrechnung besonders kennzeichnen; individuell gefertigte Geräte sind Pflicht.')
  }
  if (a.behandlungsArt === 'fruehe' && kig && !KIG_FRUEHE.includes(kig)) {
    warnungen.push(`Frühe Behandlung (B8 d) nur bei Spalte/kraniofazialer Anomalie (A5), skelettal offenem Biss (O5), Progenie (M4/M5) oder verletzungsbedingter Kieferfehlstellung – ${kig} prüfen.`)
  }
  if (a.behandlungsArt === 'kombi') {
    if (kig && !KIG_KOMBI.includes(kig)) warnungen.push(`Kombiniert kieferchirurgisch-kieferorthopädische Behandlung nur bei mindestens A5, D4, M4, O5, B4 oder K4 – nicht bei ${kig}.`)
    hinweise.push('Kombinierte Behandlung: ein zwischen Kieferorthopädie und Kieferchirurgie abgestimmtes Behandlungskonzept muss vorliegen.')
  }
  if (alter != null && alter >= 18 && a.behandlungsArt !== 'kombi') {
    warnungen.push(`Patient ist bei Behandlungsbeginn ${alter} Jahre: Kieferorthopädie ab dem vollendeten 18. Lebensjahr ist keine Kassenleistung – außer bei schweren Kieferanomalien mit kombiniert kieferchirurgischer Behandlung (§ 28 Abs. 2 SGB V).`)
  }
  if (alter == null) hinweise.push('Geburtsdatum fehlt – Altersgrenze (18 Jahre) und Frühbehandlung (ab 4 Jahren) nicht prüfbar.')
  if (a.geschwister && alter != null && alter >= 18) warnungen.push('Eigenanteil 10 % gilt nur für Kinder unter 18 Jahren bei Behandlungsbeginn.')

  for (const e of einstufung) {
    if (!e.vollstaendig) warnungen.push(`Einstufung ${BEREICH_NAME[e.bereich]}: alle Kriterien des Rasters bewerten – erst dann ergibt sich ${e.bereich === 'biss' ? '120' : '119'} a–d.`)
  }
  if (!mitAufgabe && !einzelOhne.length && kassenleistung && a.planArt === 'plan') {
    warnungen.push('Keine Behandlungsaufgabe: Umformung (119) je Kiefer bzw. Einstellung in den Regelbiss (120) einstufen.')
  }
  if (mitAufgabe && einzelOhne.length) warnungen.push(`${einzelOhne.join(', ')} ist neben 119/120 nicht abrechenbar.`)
  if (hat('5') && a.planArt !== 'plan') warnungen.push('BEMA 5 ist bei Verlängerungsanträgen, Therapieänderungen und Ergänzungen nicht abrechenbar.')
  if (hat('5') && !mitAufgabe && (hat('121') || hat('123a'))) warnungen.push('Für 121 und 123a ist kein Behandlungsplan nach Nr. 5 abrechenbar.')
  if (a.planArt !== 'plan' && !a.bezugsantrag.trim()) warnungen.push('Therapieänderung/Verlängerung: Nummer des ursprünglichen Antrags angeben.')
  if (a.planArt === 'verlaengerung') hinweise.push('Verlängerung über 16 Quartale: schriftlich mit Begründung, voraussichtlicher Dauer und Neueinstufung a–d nach dem Befund am Ende des 4. Behandlungsjahres.')
  if (a.planArt === 'aenderung') hinweise.push('Therapieänderung: nur die Leistungen ab der Änderung planen; der bisherige Plan gilt bis zur Genehmigung.')

  const kombi = a.behandlungsArt === 'kombi'
  const grenze = (nr: string, max: number, text: string) => { if (menge(nr) > max) warnungen.push(`${nr}: ${text} (geplant ${menge(nr)}).`) }
  grenze('116', 4, 'im Verlauf der Behandlung höchstens viermal – darüber hinaus Zusatzleistung')
  if (a.behandlungsArt !== 'fruehe') {
    grenze('7a', kombi ? 4 : 3, `höchstens ${kombi ? 'viermal (kombiniert)' : 'dreimal'} – darüber hinaus Zusatzleistung`)
    grenze('117', kombi ? 4 : 3, `höchstens ${kombi ? 'viermal (kombiniert)' : 'dreimal'} – darüber hinaus Zusatzleistung`)
  }
  grenze('118', frueh ? 1 : 2, frueh ? 'bei Frühbehandlung nur bei skelettalen Dysgnathien einmal' : 'höchstens zweimal, in begründeten Ausnahmefällen dreimal')
  grenze('Ä934a', frueh ? 1 : 2, frueh ? 'bei Frühbehandlung nur bei skelettalen Dysgnathien einmal' : 'höchstens zweimal, in begründeten Ausnahmefällen dreimal')
  grenze('121', 6, 'bis zu sechsmal in sechs Monaten')
  grenze('124', 2, 'bis zu zweimal')
  grenze('5', 1, 'einmal je Behandlungsplan')
  if (hat('117') && menge('117') > menge('7a') && !plan.positionen.some((p) => p.ebene === 'PRIVAT' && p.vergleich === '7a')) {
    warnungen.push('117 wird je Nr. 7a berechnet – mehr Modellanalysen als Abformungen nach 7a geplant.')
  }
  if (hat('118') && !hat('Ä934a')) hinweise.push('118 (Kephalometrie) setzt ein Fernröntgenseitenbild voraus (Ä934a).')
  if (hat('121') && plan.positionen.some((p) => p.ebene === 'BEMA' && istRoentgen(p.nr))) warnungen.push('Zur Befundung und Behandlung nach 121 sind Röntgenaufnahmen nicht abrechenbar.')
  if (hat('123a') && plan.positionen.some((p) => p.ebene === 'BEMA' && istRoentgen(p.nr) && p.nr !== 'Ä935d')) warnungen.push('Neben 123a ist nur ein OPG abrechenbar, andere Röntgenaufnahmen nicht.')
  if (hat('130') || hat('131a') || hat('131b')) {
    const erlaubt = 2 * menge('130') + 4 * menge('131a') + 4 * menge('131b')
    hinweise.push(`Neben 130 ist 126b zweimal, neben 131a/131b bis zu viermal abrechenbar (hier bis ${erlaubt} Bänder für diese Apparaturen).`)
  }
  if (hat('131b')) hinweise.push('131b nur bei spätem Behandlungsbeginn, wenn der Wachstumshöhepunkt überschritten ist und die Bisslagekorrektur konventionell nicht erreichbar ist.')
  const ukRetainer = menge('127a') > 0 && menge('126a') >= 6 && !a.e34Uk
  if (ukRetainer) hinweise.push('UK-Frontzahnretainer (6 × 126a, 1 × 127a) ist nur bei E3/E4 in der UK-Front Kassenleistung – Feld „E3/E4 UK“ in den Angaben prüfen.')
  if (a.quartale > 16 && a.planArt !== 'verlaengerung') warnungen.push('Mit 119/120 sind bis zu 16 Behandlungsquartale abgegolten – darüber hinaus Verlängerungsantrag.')
  if (mitAufgabe) {
    hinweise.push(`119/120: höchstens ${abschlaege} Abschläge, nur in Quartalen mit kieferorthopädischer Leistung. ${frueh
      ? 'Bei vorzeitigem Abschluss der Frühbehandlung werden die restlichen Abschläge am Ende abgerechnet.'
      : 'Bei vorzeitigem Abschluss: a/b restliche Abschläge am Ende; c/d bei Ende vor dem 10. Quartal nur die fälligen.'}`)
    hinweise.push(frueh
      ? 'Frühbehandlung: innerhalb von 6 Kalenderquartalen abschließen; ein Retentionszeitraum ist laut KZBV-Kommentar nicht vorgesehen.'
      : 'Retention ist bis zu zwei Jahre nach dem Quartal der letzten Abschlagszahlung abrechenbar, längstens bis zum Abschluss.')
  }
  if (plan.positionen.some((p) => p.ebene === 'BEMA' && istRoentgen(p.nr))) {
    hinweise.push(`Röntgen zur KFO: ohne Eigenanteil, gerechnet mit dem ${einst.roentgenKfo ? 'KFO' : 'KCH'}-Punktwert – welcher Punktwert gilt, bei der KZV klären (Einstellungen).`)
  }
  if (hat('01k')) hinweise.push('01k mit dem KCH-Punktwert und ohne Eigenanteil (Leistung aus BEMA Teil 1); frühestens nach 6 Monaten erneut.')
  if (einzelOhne.length) {
    hinweise.push(einst.ohneEigenanteil121
      ? '121–124 ohne Eigenanteil (Einstellung, Vorgabe der KZV Bayerns).'
      : '121–124 hier mit Eigenanteil – einzelne KZVen (z. B. KZV Bayerns) rechnen sie ohne Eigenanteil (Einstellungen).')
  }
  if (!kzvNr) warnungen.push('KZV der Praxis unbekannt (PLZ in den Einstellungen) – BEL-II-Preise der KZV Bayern, Punktwert Bundesmittel.')
  if (labor.some((z) => z.ohnePreis)) warnungen.push(`Einzelne BEL-Nummern stehen nicht in der Liste ${liste?.name ?? ''} – Preis in der Zeile eintragen.`)
  if (material.some((z) => z.ohnePreis)) warnungen.push('Praxismaterial ohne Preis.')
  if (honorar.some((z) => z.ohnePreis)) warnungen.push('Unbekannte BEMA-Nummer im Plan.')
  if (plan.labor === 'gewerbe' && labor.length && !plan.positionen.some((p) => p.ebene === 'BEL' && p.nr === '9330')) {
    hinweise.push('Gewerbliches Labor: Versandkosten (BEL 933 0) je Versandgang ergänzen.')
  }
  if (plan.labor === 'praxis' && labor.length) hinweise.push('Praxislabor: die Preise liegen mindestens 5 % unter dem Landespreis (§ 88 Abs. 3 SGB V) – die Liste der KZV enthält sie bereits.')
  if (!kfo.geprueft) hinweise.push(`KFO-Punktwert ${pwText(kfo.wert)} € ist nicht bestätigt – ${kfo.hinweis}`)

  // Mehr-/Zusatzleistungen
  if (privat.length) {
    hinweise.push('Mehr- und Zusatzleistungen: vor Behandlungsbeginn mündlich aufklären und Vordruck 4d (Anlage 14a BMV-Z) schriftlich vereinbaren.')
    for (const z of privat.filter((x) => x.art === 'M' && x.vergleich)) {
      if (menge(z.vergleich!) < z.vergleichAnzahl) warnungen.push(`Mehrleistung „${z.text.slice(0, 40)}“: die Vergleichsleistung ${z.vergleich} (${z.vergleichAnzahl} ×) gehört in den Kassenplan – dort sind nur ${menge(z.vergleich!)} geplant.`)
    }
    if (privat.some((z) => z.art === 'M' && !z.vergleich)) warnungen.push('Mehrleistung ohne BEMA-Vergleichsleistung – Art auf Zusatzleistung ändern oder Vergleichsleistung wählen.')
    if (privat.some((z) => z.ohnePreis)) warnungen.push('Privatleistung ohne Preis – Betrag eintragen (Berechnung nach GOZ, ggf. analog nach § 6 Abs. 1 GOZ).')
    const f = privat.map((z) => z.faktor ?? 0)
    if (f.some((x) => x > GOZ_HOECHSTSATZ)) warnungen.push('Faktor über 3,5 nur mit Vereinbarung nach § 2 GOZ vor der Behandlung.')
    else if (f.some((x) => x > GOZ_SCHWELLE)) hinweise.push('Faktor über 2,3 bei Privatleistungen: schriftliche Begründung in der Rechnung (§ 10 Abs. 3 GOZ).')
    if (privat.some((z) => z.art === 'M')) hinweise.push('Die BEMA-Vergleichsleistung trägt im Kassenplan selbst den Eigenanteil (§ 29 Abs. 5 Satz 3 SGB V); im Vordruck 4d wird sie voll abgezogen.')
  }
  const summeHonorar = summe(honorar)
  const summeLabor = summe(labor)
  const summeMaterial = summe(material)
  const gesamt = runden(summeHonorar + summeLabor + summeMaterial)
  const eigenanteilSatz = a.geschwister && !(alter != null && alter >= 18) ? 10 : 20
  const eigenanteilBasis = runden(summe(honorar.filter((z) => !z.ohneEigenanteil)) + summeLabor + summeMaterial)
  const eigenanteil = kassenleistung ? runden(eigenanteilBasis * eigenanteilSatz / 100) : 0
  if (kassenleistung && eigenanteil > 0) {
    hinweise.push(`Eigenanteil ${eigenanteilSatz} % zahlt die Familie quartalsweise an die Praxis; die Kasse erstattet ihn, wenn die Behandlung im geplanten Umfang abgeschlossen ist (§ 29 Abs. 3 SGB V).`)
  }

  const summePrivat = summe(privat.map((z) => ({ summe: z.betrag })))
  const summePrivatBema = summe(privat.map((z) => ({ summe: z.bema })))
  const summePrivatAnteil = summe(privat.map((z) => ({ summe: z.anteil })))
  const summePrivatMaterial = summe(privat.map((z) => ({ summe: z.material })))

  return {
    einstufung, abschlaege, honorar, labor, material, privat,
    summeHonorar, summeLabor, summeMaterial, gesamt,
    eigenanteilSatz, eigenanteilBasis, eigenanteil, kassenanteil: runden(gesamt - eigenanteil),
    summePrivat, summePrivatBema, summePrivatAnteil, summePrivatMaterial,
    privatGesamt: runden(summePrivatAnteil + summePrivatMaterial),
    punktwertKfo: kfo.wert, punktwertKch: kch.wert, punktwertHinweis: kfo.hinweis,
    belListe: liste ? `${liste.name}${kzvNr ? '' : ' – vorläufig, KZV der Praxis fehlt'}` : '—',
    alter, kassenleistung, hinweise, warnungen,
  }
}

/** Fügt die Positionen einer Vorlage an; gleiche Positionen werden zusammengezählt. */
export function vorlageAnwenden(positionen: Position[], neu: { ebene: Position['ebene']; nr: string; anzahl: number; mehr?: string }[], einst: Einstellungen): Position[] {
  const out = positionen.map((p) => ({ ...p }))
  for (const n of neu) {
    if (n.ebene === 'PRIVAT' && n.mehr) {
      const m = MEHR.get(n.mehr)
      if (!m) continue
      const da = out.find((p) => p.ebene === 'PRIVAT' && p.text === m.titel)
      if (da) { da.anzahl += n.anzahl; continue }
      out.push(privatAusKatalog(n.mehr, n.anzahl, einst))
      continue
    }
    const da = out.find((p) => p.ebene === n.ebene && p.nr === n.nr && p.preis == null && !p.text)
    if (da && n.nr === '5') continue
    if (da) da.anzahl += n.anzahl
    else out.push({ id: neueId(), ebene: n.ebene, nr: n.nr, anzahl: n.anzahl })
  }
  return out
}

/** Neue Privatposition aus dem Katalog der Mehr-/Zusatzleistungen. */
export function privatAusKatalog(id: string, anzahl: number, einst: Einstellungen): Position {
  const m = MEHR.get(id)!
  const vergleichAnzahl = m.vergleich ? (m.vergleichJe ? Math.ceil(anzahl / m.vergleichJe) : anzahl) : undefined
  return {
    id: neueId(), ebene: 'PRIVAT', art: m.art, nr: m.goz, anzahl, text: m.titel,
    ...(m.goz ? { faktor: einst.gozFaktor } : { preis: 0 }),
    ...(m.vergleich ? { vergleich: m.vergleich, vergleichAnzahl } : {}),
    ...(m.material ? { material: einst.materialPreise[id] ?? 0 } : {}),
  }
}

export { kzvName }
