import type { AnalogLeistung } from '../data/analog-katalog'
import type { Position } from '../types'
import { GOAE, GOZ, goaeEinzel, gozEinzel } from './listen'

export interface AnalogOptionen {
  /** Regler „Analogbewertung" 0 (niedrig) … 2 (Praxiskalkulation) */
  bewertung: number
  /** effektiver GOZ-Faktor */
  gozFaktor: number
  /** effektiver GOÄ-Faktor */
  goaeFaktor: number
  /** Praxis-Stundensatz €/h (für Stufe 2) */
  stundensatz: number
  /** einkalkuliertes Material in € (nur wenn die Leistung Material deckt) */
  materialBetrag: number
  /** Praxis-Einstellung: Material bei Analog einkalkulieren */
  materialEinkalkulieren: boolean
}

export interface AnalogWahl {
  basisEbene: 'GOZ' | 'GOAE'
  nr: string
  faktor: number
  euro: number
  quelle: string
}

/** Euro eines Vergleichs-/Kandidaten-Ansatzes beim gegebenen Faktor. */
const euroVon = (ebene: 'GOZ' | 'GOAE', nr: string, faktor: number) =>
  ebene === 'GOZ' ? gozEinzel(nr, faktor) : goaeEinzel(nr, faktor)

/**
 * Wählt die Vergleichsziffer für eine Analogleistung nach der Reglerstufe.
 * 0 = niedrigste Kammer-Ziffer, 1 = höchste Kammer-Ziffer,
 * 2 = Praxiskalkulation (Minuten × Stundensatz + einkalkuliertes Material),
 *     gedeckt über die günstigste GOZ-Ziffer, die den Zielbetrag erreicht;
 *     nur wenn keine GOZ-Ziffer reicht, eine geöffnete GOÄ-Ziffer.
 */
export function analogWaehlen(leistung: AnalogLeistung, opt: AnalogOptionen): AnalogWahl {
  const kammer = [...leistung.vergleich].sort((a, b) => a.euro - b.euro)
  if (opt.bewertung <= 0) {
    const v = kammer[0]
    return { basisEbene: v.ebene, nr: v.nr, faktor: v.faktor, euro: v.euro, quelle: v.quelle }
  }
  if (opt.bewertung === 1) {
    const v = kammer[kammer.length - 1]
    return { basisEbene: v.ebene, nr: v.nr, faktor: v.faktor, euro: v.euro, quelle: v.quelle }
  }
  // Stufe 2: Praxiskalkulation
  const material = leistung.materialEinkalkuliert && opt.materialEinkalkulieren ? opt.materialBetrag : 0
  const ziel = leistung.minuten / 60 * opt.stundensatz + material
  const deckend = (ebene: 'GOZ' | 'GOAE', map: Map<string, { nr: string; punkte?: number }>, faktor: number): AnalogWahl | null => {
    let beste: AnalogWahl | null = null
    for (const e of map.values()) {
      if (!e.punkte) continue
      const euro = euroVon(ebene, e.nr, faktor)
      if (euro + 0.0001 < ziel) continue
      if (!beste || euro < beste.euro) beste = { basisEbene: ebene, nr: e.nr, faktor, euro, quelle: 'Praxiskalkulation (Minuten × Stundensatz' + (material ? ' + Material' : '') + ')' }
    }
    return beste
  }
  const goz = deckend('GOZ', GOZ, opt.gozFaktor)
  if (goz) return goz
  const goae = deckend('GOAE', GOAE, opt.goaeFaktor)
  if (goae) return goae
  // nichts deckt den Zielbetrag: höchste verfügbare GOZ-Ziffer nehmen
  let hoechste: AnalogWahl | null = null
  for (const e of GOZ.values()) {
    if (!e.punkte) continue
    const euro = gozEinzel(e.nr, opt.gozFaktor)
    if (!hoechste || euro > hoechste.euro) hoechste = { basisEbene: 'GOZ', nr: e.nr, faktor: opt.gozFaktor, euro, quelle: 'Praxiskalkulation (höchste verfügbare Ziffer)' }
  }
  return hoechste ?? { basisEbene: kammer[0].ebene, nr: kammer[0].nr, faktor: kammer[0].faktor, euro: kammer[0].euro, quelle: kammer[0].quelle }
}

/** Baut die Analog-Position (Honorarzeile) aus Leistung + gewählter Vergleichsziffer. */
export function analogPosition(id: string, zahn: string, sitzung: number, leistung: AnalogLeistung, wahl: AnalogWahl, anzahl = 1): Position {
  const ebeneLabel = wahl.basisEbene === 'GOZ' ? 'GOZ' : 'GOÄ'
  return {
    id,
    ebene: wahl.basisEbene,
    nr: wahl.nr,
    zahn,
    anzahl,
    faktor: wahl.faktor,
    preis: wahl.euro,
    text: leistung.titel,
    analog: true,
    basisEbene: wahl.basisEbene,
    analogText: `${leistung.beschreibung} (Analog nach § 6 Abs. 1 GOZ, entsprechend ${ebeneLabel}-Nr. ${wahl.nr})`,
    risiko: leistung.risiko,
    begruendung: leistung.pkv,
    zusatz: 'analog',
    sitzung,
    auto: true,
    grund: leistung.titel,
  }
}
