import type { HkpPlan, Position } from '../types'
import { FEHLEND } from './zahnschema'

/**
 * Zusätzliche GOZ-Leistungen neben dem Zahnersatz (Mehrleistungen, machen die Versorgung gleichartig).
 * Jede Stufe nimmt nur Leistungen auf, für die der Plan eine Grundlage enthält, und hält die
 * Abrechnungsbestimmungen der GOZ ein (Bereiche, Höchstzahlen je Sitzung).
 */
export const ZUSATZ_STUFEN = [
  { titel: 'keine', leistungen: '' },
  { titel: 'Präparation', leistungen: 'GOZ 2030 je Kieferhälfte/Frontzahnbereich' },
  { titel: 'Adhäsive Befestigung', leistungen: '+ GOZ 2197 je Keramikkrone, 2040 Kofferdam' },
  { titel: 'Digitale Abformung', leistungen: '+ GOZ 0065 je Kieferhälfte/Frontzahnbereich (nicht bei Abdruck)' },
  { titel: 'Funktionsdiagnostik', leistungen: '+ GOZ 8000, 8010, 8020' },
  { titel: 'Instrumentelle Planung', leistungen: '+ GOZ 8050, 8080, 8090' },
] as const

export interface Zusatz extends Position {
  begruendung: string
}

export interface ZusatzErgebnis {
  positionen: Zusatz[]
  /** Leistungen der gewählten Stufen, die mangels Indikation nicht angesetzt wurden */
  nichtAngesetzt: string[]
}

/** Kieferhälfte bzw. Frontzahnbereich im Sinne der GOZ (13–23 und 33–43 = Frontzahnbereich) */
export function bereich(zahn: string): string {
  const q = zahn[0]
  const pos = Number(zahn[1])
  if (pos <= 3) return q === '1' || q === '2' ? 'OK-Front' : 'UK-Front'
  return { '1': 'OK rechts', '2': 'OK links', '3': 'UK links', '4': 'UK rechts' }[q] ?? q
}

const BEREICH_ZAEHNE: Record<string, string> = {
  'OK rechts': '18-14', 'OK-Front': '13-23', 'OK links': '24-28', 'UK links': '34-38', 'UK-Front': '33-43', 'UK rechts': '44-48',
}

export const zusatzSchluessel = (p: Pick<Position, 'nr' | 'zahn'>) => `${p.nr}|${p.zahn}`

export function zusatzleistungen(plan: HkpPlan): ZusatzErgebnis {
  const stufe = plan.einstellungen.gozZusatzStufe ?? 0
  const aus = new Set(plan.einstellungen.gozZusatzAus ?? [])
  const positionen: Zusatz[] = []
  const nichtAngesetzt: string[] = []
  if (stufe <= 0) return { positionen, nichtAngesetzt }

  const versorgung = (z: string) => (plan.zaehne[z].TP.trim() || plan.zaehne[z].R.trim()).toUpperCase()
  const zaehne = Object.keys(plan.zaehne)
  const anZahn = (z: string) => plan.positionen.filter((p) => p.zahn === z)
  /** natürliche Zähne, die laut Planung eine Krone, Teilkrone, Teleskop- oder Ankerkrone erhalten (Zeile R allein reicht nicht – die Regelbrücke kann entfallen) */
  const fehlt = (z: string) => FEHLEND.has(plan.zaehne[z].B.trim().toLowerCase()) || /^(B|E)/.test(plan.zaehne[z].R.trim().toUpperCase())
  const implantat = (z: string) => /^S/.test(versorgung(z)) || /^[si]/.test(plan.zaehne[z].B.trim().toLowerCase())
  const praepariert = zaehne.filter((z) => !fehlt(z) && !implantat(z) && anZahn(z).some((p) =>
    (p.ebene === 'BEMA' && /^(20[abc]|91[abcd])$/.test(p.nr)) || (p.ebene === 'GOZ' && /^(22[012]0|50[0-4]0)$/.test(p.nr))))
  /** vollkeramische bzw. keramisch vollverblendete Kronen/Teilkronen – adhäsiv zu befestigen (auch vom Eigenlabor-Regler aufgewertete) */
  const adhaesiv = praepariert.filter((z) => /^(K|PK)M/.test(versorgung(z)) || anZahn(z).some((p) => p.ebene === 'BEB' && (p.nr === '2281' || p.nr === '2534')))
  const implantatKronen = zaehne.filter((z) => /^S(K|B|T)/.test(versorgung(z)) && anZahn(z).some((p) => p.ebene === 'GOZ'))
  const herausnehmbar = plan.positionen.some((p) => (p.ebene === 'BEMA' && /^9[67][abc]$/.test(p.nr)) || (p.ebene === 'GOZ' && /^52[0-5]0$/.test(p.nr)))
  const umfangreich = praepariert.length + implantatKronen.length >= 4 || herausnehmbar

  const vorhanden = new Set(plan.positionen.filter((p) => p.ebene === 'GOZ').map(zusatzSchluessel))
  const neu = (nr: string, zahn: string, begruendung: string, anzahl = 1) => {
    const p: Zusatz = { id: `zusatz-${nr}-${zahn}`, ebene: 'GOZ', nr, zahn, anzahl, auto: true, zusatz: true, begruendung }
    if (!vorhanden.has(zusatzSchluessel(p)) && !aus.has(zusatzSchluessel(p))) positionen.push(p)
  }
  const bereicheVon = (liste: string[]) => [...new Set(liste.map(bereich))]

  // Stufe 1: besondere Maßnahmen beim Präparieren – höchstens einmal je Bereich und Sitzung
  if (stufe >= 1) {
    if (!praepariert.length) nichtAngesetzt.push('2030: keine zu präparierenden Zähne')
    for (const b of bereicheVon(praepariert))
      neu('2030', BEREICH_ZAEHNE[b], `Besondere Maßnahmen beim Präparieren (${b}): Retraktion, Blutstillung, Zahnfleischkorrektur`)
  }

  // Stufe 2: adhäsive Befestigung vollkeramischer Restaurationen, Kofferdam je Bereich
  if (stufe >= 2) {
    if (!adhaesiv.length) nichtAngesetzt.push('2197/2040: keine vollkeramischen Kronen oder Teilkronen (TP …M)')
    for (const z of adhaesiv) neu('2197', z, `Adhäsive Befestigung der Keramikrestauration ${versorgung(z)}`)
    for (const b of bereicheVon(adhaesiv)) neu('2040', BEREICH_ZAEHNE[b], `Kofferdam zur adhäsiven Befestigung (${b})`)
  }

  // Stufe 3: optisch-elektronische Abformung (schließt konventionelle GOZ-Abformungen im selben Bereich aus)
  if (stufe >= 3 && plan.abformung === 'abdruck') nichtAngesetzt.push('0065: konventioneller Abdruck gewählt')
  else if (stufe >= 3) {
    if (!praepariert.length) nichtAngesetzt.push(implantatKronen.length ? '0065: Implantatabformung laut Implantatangaben (Scan oder Löffel)' : '0065: kein festsitzender Zahnersatz')
    const konventionell = new Set(plan.positionen.filter((p) => p.ebene === 'GOZ' && /^(5170|5180|5190)$/.test(p.nr)).map((p) => p.zahn))
    const gescannt = new Set(plan.positionen.filter((p) => p.ebene === 'GOZ' && p.nr === '0065').map((p) => p.zahn))
    for (const b of bereicheVon(praepariert))
      if (!konventionell.has(BEREICH_ZAEHNE[b]) && !gescannt.has(b)) neu('0065', BEREICH_ZAEHNE[b], `Digitale Abformung (${b}) statt konventioneller Abformung`)
  }

  // Stufe 4/5: Funktionsdiagnostik nur bei umfangreicher Versorgung
  if (stufe >= 4) {
    if (!umfangreich) nichtAngesetzt.push('8000 ff.: erst bei umfangreicher Versorgung (ab 4 Einheiten oder herausnehmbarem Zahnersatz)')
    else {
      neu('8000', '', 'Klinische Funktionsanalyse vor umfangreicher prothetischer Versorgung')
      neu('8010', '', 'Registrieren der Zentrallage (höchstens 2 je Sitzung)')
      neu('8020', '', 'Arbiträre Scharnierachse / Gesichtsbogen für die Artikulatormontage')
    }
  }
  if (stufe >= 5 && umfangreich) {
    neu('8050', '', 'Registrieren der Unterkieferbewegungen, Einstellung des halbindividuellen Artikulators')
    neu('8080', '', 'Diagnostische Maßnahmen an Modellen im Artikulator, Behandlungsplanung')
    neu('8090', '', 'Diagnostischer Aufbau (Wax-up) der Funktionsflächen')
  }
  return { positionen, nichtAngesetzt }
}
