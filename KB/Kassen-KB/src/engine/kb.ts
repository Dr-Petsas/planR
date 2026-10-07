// Rechnung und Prüfung des Kassen-KB-Plans.
//
// Honorar: BEMA-Bewertungszahl × Punktwert BEMA Teil 2 (KB) der KZV der Praxis.
// Kieferbruch-Leistungen nach GOÄ laufen je nach KZV über KB oder KCH (Einstellung).
// Labor: BEL II der KZV der Praxis, Praxislabor- oder Gewerbepreis. Material:
// Abformpauschale (Ordnungsnummer 605). Die Kasse trägt den Plan voll; ein Eigenanteil
// entsteht nicht. Regeln nach BEMA Teil 2 und BMV-Z Anlage 1 Nr. 3 (KB/_quellen/kassen-kb.json).

import { ermittlePunktwert, kzvDerPraxis } from '../punktwerte'
import type { Einstellungen, Plan, Position, Rechnung, Zeile } from '../types'
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

  const zeile = (p: Position): Zeile => {
    const anzahl = Math.max(0, p.anzahl || 0)
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
    return {
      id: p.id, ebene: 'BEL', nr: belNr(p.nr), text: p.text || e?.text || `BEL ${belNr(p.nr)}`, anzahl, einzel,
      summe: runden(einzel * anzahl), ohnePreis: p.preis == null && listenPreis == null,
    }
  }

  const zeilen = plan.positionen.filter((p) => p.anzahl > 0).map(zeile)
  const honorar = zeilen.filter((z) => z.ebene === 'BEMA')
  const labor = zeilen.filter((z) => z.ebene === 'BEL')
  const material = zeilen.filter((z) => z.ebene === 'MATERIAL')
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
  const ukps = plan.positionen.some((p) => p.ebene === 'BEMA' && p.nr.startsWith('UP') && p.anzahl > 0)
  if (ukps && !a.schlafmedizin) warnungen.push('UKPS nur auf Veranlassung eines Vertragsarztes mit Zusatzbezeichnung Schlafmedizin (Angaben: Veranlassung bestätigen).')
  if (ukps && hat('2')) hinweise.push('BEMA 2 ist für die UKPS (UP1–UP6) nicht abrechenbar.')
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
    honorar, labor, material, summeHonorar, summeLabor, summeMaterial,
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

export { kzvName }
