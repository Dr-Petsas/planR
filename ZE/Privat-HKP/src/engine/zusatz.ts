import type { Abformung, Position, Zahn } from '../types'
import { istFrontzahn } from './zahnschema'
import exotenDatei from '../data/exoten.json'

interface ExotStufe {
  stufe: number
  bisStufe?: number
  nr: string
  je: 'bereich' | 'zahn' | 'sitzung' | 'paar'
  an?: string
  goz?: string[]
  anzahl?: number
  anzahlMax?: number
  leer?: string
  grund: string
}
interface ExotEintrag {
  id: string
  titel: string
  prioritaet: number
  kuerzel: string[]
  dazuKuerzel?: string[]
  implantate?: { min: number; max: number }
  gruppen: Record<string, string[]>
  nicht: string[]
  stufen: ExotStufe[]
}
const exoten = exotenDatei as unknown as ExotEintrag[]

/**
 * Regler wie im HKP: zusätzliche GOZ-Leistungen und Qualitätsstufen im Labor.
 * Jede Stufe nimmt nur Leistungen auf, für die die Planung eine Grundlage enthält.
 */
export const GOZ_STUFEN = [
  { titel: 'keine', leistungen: '' },
  { titel: 'Präparation', leistungen: '2030, 0070, 0090 aus der Wissensbasis, je nach Krone, Brücke, Teleskop oder Suprakonstruktion' },
  { titel: 'Adhäsiv', leistungen: '2197 und 2040 nur an Keramik, nicht am Teleskop und nicht am Brückenglied' },
  { titel: 'Scan', leistungen: '0065 bleibt in der Planung und wird nicht gedoppelt' },
  { titel: 'Funktionsdiagnostik', leistungen: '8000, 8010, 8020. Teleskop und All-on: 8010 zweimal, ohne 8020' },
  { titel: 'elektronisch', leistungen: 'Brücke, Teleskop, All-on-4 und All-on-6: 8035 und 8065. Krone und einzelne Suprakonstruktion: 8050, 8080, 8090' },
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

  // Nummern stehen in der Wissensbasis (exoten.json). Der Regler liest sie.
  // Die führende Versorgung liefert die Funktionsanalyse, jede passende Versorgung die Vorbereitung.
  const geplante = Object.keys(zaehne).filter((z) => /^[1-4][1-8]$/.test(z) && TP(z) && TP(z) !== ')(')
  const treffer = exoten.filter((e) => {
    const eigene = geplante.filter((z) => e.kuerzel.includes(TP(z)))
    if (!eigene.length) return false
    if (e.implantate && (eigene.length < e.implantate.min || eigene.length > e.implantate.max)) return false
    if (e.dazuKuerzel?.length && !e.dazuKuerzel.some((k) => geplante.some((z) => TP(z) === k))) return false
    return true
  }).sort((a, b) => b.prioritaet - a.prioritaet)
  const fuehrung = treffer[0]
  if (gozStufe > 0 && !fuehrung) nichtAngesetzt.push('Regler: keine Krone, Brücke, Teleskopprothese, All-on oder Suprakonstruktion im Plan')
  if (fuehrung) nichtAngesetzt.push(`Regler folgt der Wissensbasis: ${fuehrung.titel}`)
  const gruppe = (e: ExotEintrag, name: string | undefined, goz?: string[]) => {
    const liste = (name && e.gruppen[name]) || []
    return einzelzaehne.filter((z) => liste.includes(TP(z)) && (!goz?.length || anZahn(z).some((p) => p.ebene === 'GOZ' && goz.includes(p.nr))))
  }
  for (const e of treffer) {
    for (const zeile of e.stufen) {
      if (zeile.stufe >= 4 && e !== fuehrung) continue
      if (gozStufe < zeile.stufe || (zeile.bisStufe && gozStufe > zeile.bisStufe)) continue
      if (!zeile.nr) continue
      const zahnListe = zeile.an ? gruppe(e, zeile.an, zeile.goz) : []
      if (zeile.je === 'sitzung' || !zeile.an) {
        if (zeile.an && !zahnListe.length) { if (zeile.leer) nichtAngesetzt.push(zeile.leer); continue }
        neu('GOZ', zeile.nr, '', zeile.grund, zeile.anzahl ?? 1)
        continue
      }
      if (!zahnListe.length) { if (zeile.leer) nichtAngesetzt.push(zeile.leer); continue }
      if (zeile.je === 'zahn') for (const z of zahnListe) neu('GOZ', zeile.nr, z, `${zeile.grund} ${TP(z)}`)
      else if (zeile.je === 'bereich') for (const b of bereicheVon(zahnListe)) neu('GOZ', zeile.nr, BEREICH_ZAEHNE[b], `${zeile.grund} (${b})`)
      else if (zeile.je === 'paar') neu('GOZ', zeile.nr, '', zeile.grund, Math.min(zeile.anzahlMax ?? 8, zahnListe.length))
    }
  }
  if (gozStufe >= 4 && fuehrung) for (const n of fuehrung.nicht) nichtAngesetzt.push(n)
  if (gozStufe >= 3) {
    if (!abformung) nichtAngesetzt.push('0065: Abformung noch nicht gewählt')
    else if (abformung === 'abdruck') nichtAngesetzt.push('0065: konventioneller Abdruck gewählt')
    else if (basis.some((p) => p.nr === '0065')) nichtAngesetzt.push('0065: digitale Abformung ist bereits enthalten (Intraoralscan)')
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
