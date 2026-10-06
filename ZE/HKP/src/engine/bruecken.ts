const GLIED = /^(S?B|AB)[VM]?$/
const PFEILER = /^(S?K|PK|S?T|A$)/

export interface BrueckenMarke {
  bAnfang?: boolean
  bEnde?: boolean
}

export interface BrueckenBereich {
  zaehne: string[]
  /** vom Behandler mit „-K … K-“ festgelegt, sonst aus den Kürzeln erkannt */
  explizit: boolean
}

/** Eingabe „-KM“, „KM-“ oder „-KM-“ → Kürzel und Brückenmarken */
export function markeLesen(eingabe: string): { kuerzel: string } & Required<BrueckenMarke> {
  const t = eingabe.trim()
  const bAnfang = t.startsWith('-')
  const bEnde = t.length > 1 && t.endsWith('-')
  return { kuerzel: t.replace(/^-+|-+$/g, ''), bAnfang, bEnde }
}

export const markeAnzeigen = (kuerzel: string, m: BrueckenMarke | undefined) =>
  `${m?.bAnfang ? '-' : ''}${kuerzel}${m?.bEnde ? '-' : ''}`

/**
 * Brücken eines Kiefers in Zahnreihenfolge (18…28 bzw. 48…38): zuerst die mit „-“ markierten Bereiche,
 * dann je Lauf von Brückengliedern außerhalb davon die angrenzenden Pfeiler.
 * Je zwei Markierungen begrenzen eine Brücke, gleich auf welcher Seite des Kürzels der Strich steht;
 * „-K-“ ist der gemeinsame Pfeiler zweier Brücken.
 */
export function brueckenBereiche(reihe: string[], kuerzel: (z: string) => string, marke: (z: string) => BrueckenMarke | undefined): BrueckenBereich[] {
  const out: BrueckenBereich[] = []
  let start = -1
  reihe.forEach((z, i) => {
    const m = marke(z)
    if (!m?.bAnfang && !m?.bEnde) return
    if (start < 0) { start = i; return }
    out.push({ zaehne: reihe.slice(start, i + 1), explizit: true })
    start = m.bAnfang && m.bEnde ? i : -1
  })
  const markiert = new Set(out.flatMap((b) => b.zaehne))
  let akt: number[] = []
  const abschliessen = () => {
    if (!akt.length) return
    const links = reihe[akt[0] - 1]
    const rechts = reihe[akt[akt.length - 1] + 1]
    const zaehne = akt.map((i) => reihe[i])
    out.push({
      zaehne: [...(links && PFEILER.test(kuerzel(links)) ? [links] : []), ...zaehne, ...(rechts && PFEILER.test(kuerzel(rechts)) ? [rechts] : [])],
      explizit: false,
    })
    akt = []
  }
  reihe.forEach((z, i) => {
    if (GLIED.test(kuerzel(z)) && !markiert.has(z)) akt.push(i)
    else abschliessen()
  })
  abschliessen()
  return out
}

/** Pfeiler einer explizit markierten Brücke: alle Kronen im Bereich (auch Doppelanker ohne angrenzendes Glied) */
export const pfeilerIm = (b: BrueckenBereich, kuerzel: (z: string) => string) => b.zaehne.filter((z) => PFEILER.test(kuerzel(z)))
