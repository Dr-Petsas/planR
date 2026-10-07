/**
 * BEMA-Punktwerte je KZV, Leistungsbereich und Kassenart – in allen Kassenplanern gleich.
 *
 * Es gibt keine bundeseinheitliche Tabelle (außer ZE): KZV und Kassen(-verbände) vereinbaren
 * die Werte regional, meist jährlich. Maßgeblich ist die KZV der Praxis.
 * Vorrang: fester Wert in den Einstellungen > praxiseigene Werte (CSV) > Tabelle > Fallback.
 * Die Tabelle kommt mitgeliefert und lässt sich per "Punktwerte aktualisieren" vom
 * Datendienst der Startseite erneuern (daten.ts).
 */
import mitgeliefert from './data/punktwerte.json'
import { aktuell, standVon } from './daten'
import { KZVEN, kzvAusPlz, kzvNachNr } from './data/kzv'
import { mk } from './mandant'
import type { Kassenart, Praxis } from './stammdaten'

/** KCH = konservierend/chirurgisch (Teil 1), KB = Kieferbruch (Teil 2), KFO (Teil 3), PAR (Teil 4), ZE (Teil 5) */
export type Leistungsbereich = 'KCH' | 'KB' | 'KFO' | 'PAR' | 'ZE'

export const BEREICH_NAME: Record<Leistungsbereich, string> = {
  KCH: 'konservierend-chirurgisch (BEMA Teil 1)',
  KB: 'Kieferbruch / Kiefergelenk (BEMA Teil 2)',
  KFO: 'Kieferorthopädie (BEMA Teil 3)',
  PAR: 'Parodontologie (BEMA Teil 4)',
  ZE: 'Zahnersatz (BEMA Teil 5)',
}

export interface PunktwertEintrag {
  primaer: number
  ersatz: number
  gueltigAb?: string
  quelle?: string
  geprueft?: boolean
}

export interface PunktwertTabelle {
  stand: string
  quelle: string
  hinweis?: string
  kzv: Record<string, Partial<Record<Leistungsbereich, PunktwertEintrag>>>
}

export const PUNKTWERTE_DATEI = 'punktwerte.json'
export const MITGELIEFERT = mitgeliefert as PunktwertTabelle

/** Die gültige Tabelle (aktualisiert, sonst mitgeliefert). */
export const punktwertTabelle = (): PunktwertTabelle => aktuell(PUNKTWERTE_DATEI, MITGELIEFERT)
export const punktwertStand = () => standVon(punktwertTabelle())

/** Praxiseigene Werte je Mandant: KZV -> Bereich -> Paar. */
const K_EIGEN = mk('planr.punktwerte-eigen.v1')
export type EigeneWerte = Record<string, Partial<Record<Leistungsbereich, { primaer: number; ersatz: number }>>>

export function eigeneWerte(): EigeneWerte {
  try {
    const roh = localStorage.getItem(K_EIGEN)
    return roh ? (JSON.parse(roh) as EigeneWerte) : {}
  } catch {
    return {}
  }
}

export function eigeneSetzen(w: EigeneWerte) {
  if (Object.keys(w).length) localStorage.setItem(K_EIGEN, JSON.stringify(w))
  else localStorage.removeItem(K_EIGEN)
}

/**
 * CSV "KZV-Nr;Primär;Ersatz" (Dezimalkomma oder -punkt, Kopfzeile wird übersprungen)
 * für einen Leistungsbereich, zusammengeführt mit den bisherigen eigenen Werten.
 */
export function csvLesen(text: string, bereich: Leistungsbereich, bisher: EigeneWerte = {}): { werte: EigeneWerte; zeilen: number } {
  const werte: EigeneWerte = JSON.parse(JSON.stringify(bisher))
  let zeilen = 0
  for (const zeile of text.split(/\r?\n/)) {
    const s = zeile.trim()
    if (!s) continue
    const teile = s.split(/[;\t]/.test(s) ? /[;\t]/ : ',').map((t) => t.trim())
    if (teile.length < 2) continue
    const nr = teile[0].replace(/\D/g, '').padStart(2, '0')
    if (!kzvNachNr(nr)) continue
    const num = (x: string) => Number(x.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
    const primaer = num(teile[1])
    const ersatz = teile[2] ? num(teile[2]) : primaer
    if (!(primaer > 0)) continue
    werte[nr] = { ...werte[nr], [bereich]: { primaer, ersatz: ersatz > 0 ? ersatz : primaer } }
    zeilen += 1
  }
  return { werte, zeilen }
}

/** KZV der Praxis: fest gewählt, sonst aus der PLZ. */
export const kzvDerPraxis = (p: Pick<Praxis, 'plz' | 'kzvNr'>) => p.kzvNr || kzvAusPlz(p.plz)

export interface PunktwertErgebnis {
  wert: number
  bereich: Leistungsbereich
  kzvNr: string
  kassenart: Kassenart
  quelle: 'fest' | 'eigen' | 'tabelle' | 'fallback'
  stand: string
  geprueft: boolean
  hinweis: string
}

/** Mittelwert aller KZVen – nur, wenn gar keine KZV bestimmbar ist. */
function fallback(tab: PunktwertTabelle, bereich: Leistungsbereich, kassenart: Kassenart): number {
  const werte = Object.values(tab.kzv).map((k) => k[bereich]?.[kassenart]).filter((x): x is number => !!x)
  return werte.length ? Math.round((werte.reduce((a, b) => a + b, 0) / werte.length) * 10000) / 10000 : 1.2
}

export function ermittlePunktwert(a: {
  bereich: Leistungsbereich
  praxis: Pick<Praxis, 'plz' | 'kzvNr'>
  kassenart: Kassenart
  fest?: number | null
}): PunktwertErgebnis {
  const tab = punktwertTabelle()
  const kzvNr = kzvDerPraxis(a.praxis)
  const basis = { bereich: a.bereich, kzvNr, kassenart: a.kassenart, stand: standVon(tab) }
  const kasse = a.kassenart === 'ersatz' ? 'Ersatzkassen' : 'Primärkassen'
  if (a.fest != null && a.fest > 0) {
    return { ...basis, wert: a.fest, quelle: 'fest', geprueft: true, hinweis: 'Punktwert fest eingetragen (Einstellungen).' }
  }
  const eigen = kzvNr ? eigeneWerte()[kzvNr]?.[a.bereich] : undefined
  if (eigen) {
    return { ...basis, wert: eigen[a.kassenart], quelle: 'eigen', geprueft: true, hinweis: `Praxiseigener Punktwert (${kasse}).` }
  }
  const t = kzvNr ? tab.kzv[kzvNr]?.[a.bereich] : undefined
  if (t) {
    const geprueft = t.geprueft !== false
    return {
      ...basis, wert: t[a.kassenart], quelle: 'tabelle', geprueft,
      hinweis: `${kzvNachNr(kzvNr)?.name ?? kzvNr}, ${kasse}${t.gueltigAb ? `, gültig ab ${t.gueltigAb.split('-').reverse().join('.')}` : ''}${geprueft ? '' : ' – nicht bestätigt, bitte mit dem KZV-Rundschreiben abgleichen'}.`,
    }
  }
  return {
    ...basis, kzvNr: '', wert: fallback(tab, a.bereich, a.kassenart), quelle: 'fallback', geprueft: false,
    hinweis: kzvNr ? `Für ${kzvNachNr(kzvNr)?.name ?? kzvNr} ist kein Wert hinterlegt – Bundesmittel.` : 'Keine KZV bestimmbar (Praxis-PLZ fehlt) – Bundesmittel.',
  }
}

/** Zeilen für die Übersicht aller KZVen eines Bereichs. */
export function tabellenZeilen(bereich: Leistungsbereich) {
  const tab = punktwertTabelle()
  const eigen = eigeneWerte()
  return KZVEN.map((k) => ({ kzv: k, tabelle: tab.kzv[k.nr]?.[bereich], eigen: eigen[k.nr]?.[bereich] }))
}
