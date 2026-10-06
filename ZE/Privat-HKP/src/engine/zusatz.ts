import type { Abformung, Position, Zahn } from '../types'
import { istFrontzahn } from './zahnschema'

/**
 * Regler wie im HKP: zusätzliche GOZ-Leistungen und Qualitätsstufen im Labor.
 * Jede Stufe nimmt nur Leistungen auf, für die die Planung eine Grundlage enthält.
 */
export const GOZ_STUFEN = [
  { titel: 'keine', leistungen: '' },
  { titel: 'Präparation', leistungen: 'GOZ 2030 je Kieferhälfte/Frontzahnbereich' },
  { titel: 'Adhäsive Befestigung', leistungen: '+ GOZ 2197 je Keramikrestauration, 2040 Kofferdam' },
  { titel: 'Digitale Abformung', leistungen: '+ GOZ 0065 je Kieferhälfte/Frontzahnbereich (nicht bei Abdruck)' },
  { titel: 'Funktionsdiagnostik', leistungen: '+ GOZ 8000, 8010, 8020' },
  { titel: 'Instrumentelle Planung', leistungen: '+ GOZ 8050, 8080, 8090' },
] as const

export const LABOR_STUFEN = [
  { titel: 'Standard', text: 'Laborleistungen wie geplant' },
  { titel: 'Ästhetik', text: '+ individuelle Charakterisierung je Keramikeinheit, Farbbestimmung im Labor' },
  { titel: 'Funktion', text: '+ Wax-up je Einheit, individueller Artikulator, Frontzahnführungsteller' },
  { titel: 'Premium', text: '+ Wurzelpontic je Keramik-Brückenglied, Stumpfvorbereitung unter dem Mikroskop' },
] as const

export const GOZ_STUFE_MAX = GOZ_STUFEN.length - 1
export const LABOR_STUFE_MAX = LABOR_STUFEN.length - 1
export const LABOR_AUFSCHLAG_MIN = -30
export const LABOR_AUFSCHLAG_MAX = 100

export interface ZusatzErgebnis {
  positionen: Position[]
  /** Leistungen der gewählten Stufe, die mangels Grundlage nicht angesetzt wurden */
  nichtAngesetzt: string[]
}

export const zusatzSchluessel = (p: Pick<Position, 'ebene' | 'nr' | 'zahn'>) => `${p.ebene}|${p.nr}|${p.zahn}`

/** Kieferhälfte bzw. Frontzahnbereich im Sinne der GOZ (13–23 und 33–43 = Frontzahnbereich) */
function bereich(zahn: string) {
  if (Number(zahn[1]) <= 3) return zahn[0] === '1' || zahn[0] === '2' ? 'OK-Front' : 'UK-Front'
  return { '1': 'OK rechts', '2': 'OK links', '3': 'UK links', '4': 'UK rechts' }[zahn[0]] ?? zahn[0]
}
const BEREICH_ZAEHNE: Record<string, string> = {
  'OK rechts': '18-14', 'OK-Front': '13-23', 'OK links': '24-28', 'UK links': '34-38', 'UK-Front': '33-43', 'UK rechts': '44-48',
}

const KERAMIK = new Set(['2281', '2612', '2351', '2534', '2653', '2251', '2252'])
const EINHEIT = /^(2101|2104|2121|2126|2155|2281|2351|2361|2534|2653|2663|3001|2251|2252)$/

interface Eingabe {
  zaehne: Record<string, Zahn>
  abformung: Abformung
  /** bereits aus der Planung erzeugte Positionen */
  basis: Position[]
  gozStufe: number
  laborStufe: number
  aus: string[]
}

export function zusatzleistungen({ zaehne, abformung, basis, gozStufe, laborStufe, aus }: Eingabe): ZusatzErgebnis {
  const positionen: Position[] = []
  const nichtAngesetzt: string[] = []
  const vorhanden = new Set(basis.map(zusatzSchluessel))
  const abgewaehlt = new Set(aus)
  const neu = (ebene: 'GOZ' | 'BEB', nr: string, zahn: string, grund: string, anzahl = 1) => {
    const p: Position = { id: `zusatz:${ebene}:${nr}:${zahn}`, ebene, nr, zahn, anzahl, auto: true, zusatz: ebene === 'GOZ' ? 'goz' : 'labor', grund }
    const k = zusatzSchluessel(p)
    if (!vorhanden.has(k) && !abgewaehlt.has(k)) {
      positionen.push(p)
      vorhanden.add(k)
    }
  }
  const TP = (z: string) => (zaehne[z]?.TP ?? '').trim().toUpperCase()
  const anZahn = (z: string) => basis.filter((p) => p.zahn === z)
  const bereicheVon = (liste: string[]) => [...new Set(liste.map(bereich))]
  const einzelzaehne = [...new Set(basis.map((p) => p.zahn).filter((z) => /^[1-4][1-8]$/.test(z)))]

  // ---- Zahnärztliches Honorar ----
  const praepariert = einzelzaehne.filter((z) => !/^S/.test(TP(z)) && anZahn(z).some((p) => p.ebene === 'GOZ' && /^(2210|2220|5010|5040)$/.test(p.nr)))
  const adhaesiv = praepariert.filter((z) => /^((K|PK)M|VE)/.test(TP(z)))
  const implantatKronen = einzelzaehne.filter((z) => /^S(K|T)/.test(TP(z)))
  const herausnehmbar = basis.some((p) => p.ebene === 'GOZ' && /^52[0-3]0$/.test(p.nr))
  const umfangreich = praepariert.length + implantatKronen.length >= 4 || herausnehmbar

  if (gozStufe >= 1) {
    if (!praepariert.length) nichtAngesetzt.push('2030: keine zu präparierenden Zähne')
    for (const b of bereicheVon(praepariert)) neu('GOZ', '2030', BEREICH_ZAEHNE[b], `Besondere Maßnahmen beim Präparieren (${b}): Retraktion, Blutstillung`)
  }
  if (gozStufe >= 2) {
    if (!adhaesiv.length) nichtAngesetzt.push('2197/2040: keine vollkeramischen Kronen, Teilkronen oder Veneers')
    for (const z of adhaesiv) neu('GOZ', '2197', z, `Adhäsive Befestigung der Keramikrestauration ${TP(z)}`)
    for (const b of bereicheVon(adhaesiv)) neu('GOZ', '2040', BEREICH_ZAEHNE[b], `Kofferdam zur adhäsiven Befestigung (${b})`)
  }
  if (gozStufe >= 3) {
    if (!abformung) nichtAngesetzt.push('0065: Abformung noch nicht gewählt')
    else if (abformung === 'abdruck') nichtAngesetzt.push('0065: konventioneller Abdruck gewählt')
    else if (basis.some((p) => p.nr === '0065')) nichtAngesetzt.push('0065: digitale Abformung ist bereits enthalten (Intraoralscan)')
    else if (!praepariert.length) nichtAngesetzt.push('0065: kein festsitzender Zahnersatz an natürlichen Zähnen')
  }
  if (gozStufe >= 4) {
    if (!umfangreich) nichtAngesetzt.push('8000 ff.: erst bei umfangreicher Versorgung (ab 4 Einheiten oder herausnehmbarem Zahnersatz)')
    else {
      neu('GOZ', '8000', '', 'Klinische Funktionsanalyse vor umfangreicher prothetischer Versorgung')
      neu('GOZ', '8010', '', 'Registrieren der Zentrallage')
      neu('GOZ', '8020', '', 'Arbiträre Scharnierachse / Gesichtsbogen für die Artikulatormontage')
    }
  }
  if (gozStufe >= 5 && umfangreich) {
    neu('GOZ', '8050', '', 'Registrieren der Unterkieferbewegungen, Einstellung des halbindividuellen Artikulators')
    neu('GOZ', '8080', '', 'Diagnostische Maßnahmen an Modellen im Artikulator, Behandlungsplanung')
    neu('GOZ', '8090', '', 'Diagnostischer Aufbau (Wax-up) der Funktionsflächen')
  }

  // ---- Labor ----
  const einheiten = einzelzaehne.filter((z) => anZahn(z).some((p) => p.ebene === 'BEB' && EINHEIT.test(p.nr)))
  const keramik = einzelzaehne.filter((z) => anZahn(z).some((p) => p.ebene === 'BEB' && KERAMIK.has(p.nr)))
  if (laborStufe >= 1) {
    if (!keramik.length) nichtAngesetzt.push('BEB 2951: keine Keramikeinheiten')
    for (const z of keramik) neu('BEB', '2951', z, `Individuelle Charakterisierung der Keramik ${TP(z)}`)
    if (einheiten.length && !basis.some((p) => p.nr === '0723' && p.ebene === 'BEB')) neu('BEB', '0723', '', 'Zahnfarbenbestimmung im Labor')
  }
  if (laborStufe >= 2) {
    for (const z of einheiten) neu('BEB', '0833', z, `Wax-up/Mock-up ${TP(z)}`)
    if (einheiten.length) neu('BEB', '0405', '', 'Modellmontage im individuellen Artikulator')
    if (einheiten.some(istFrontzahn)) neu('BEB', '0522', '', 'Individueller Frontzahnführungsteller')
  }
  if (laborStufe >= 3) {
    const glieder = keramik.filter((z) => /^S?BM$/.test(TP(z)))
    for (const z of glieder) neu('BEB', '2678', z, 'Wurzelpontic aus Keramik')
    for (const z of einheiten.filter((x) => !/^S/.test(TP(x)) && !/^(S?B|AB)/.test(TP(x)))) neu('BEB', '0217', z, 'Stumpf unter Mikroskop vorbereiten')
  }
  if (laborStufe > 0 && !einheiten.length) nichtAngesetzt.push('Laborstufe: keine festsitzenden Laborarbeiten geplant')
  return { positionen, nichtAngesetzt }
}
