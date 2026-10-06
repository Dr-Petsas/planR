import type { Ebene, FestzuschussBefund, Position, Reparatur } from '../types'
import { gebietAufloesen } from './kombinationen'
import { ALLE_ZAEHNE } from './zahnschema'

export interface ReparaturArt {
  id: string
  titel: string
  gruppe: 'Prothese' | 'Festsitzend' | 'Implantat'
  /** Gebiet: ein Kiefer (je Prothese) oder einzelne Zähne */
  je: 'kiefer' | 'zahn'
  /** Zahnärztliche Leistungen; „OK/UK“ = je Kiefer unterschiedliche Nummer */
  honorar: (n: number, kiefer: 'OK' | 'UK') => [Ebene, string, number][]
  labor: (n: number) => [Ebene, string, number][]
  /** Festzuschuss-Befunde; n = Anzahl Zähne im Gebiet */
  befunde: (n: number) => [string, number][]
  hinweis?: string
}

/**
 * Wiederherstellungen und Erweiterungen nach den Berechnungsbeispielen des KZBV-Kompendiums
 * (Befundklasse 6, 7.3, 7.4, 7.7). Bei Wiederherstellungen bleibt Zeile B leer.
 */
export const REPARATUR_ARTEN: ReparaturArt[] = [
  {
    id: '6.0', titel: 'Prothese: Wiederherstellung ohne Abformung und ohne Labor (z. B. Klammer aktivieren)', gruppe: 'Prothese', je: 'kiefer',
    honorar: () => [['BEMA', '100a', 1]], labor: () => [], befunde: () => [['6.0', 1]],
  },
  {
    id: '6.1', titel: 'Prothese: Reparatur ohne Abformung (z. B. Sprung)', gruppe: 'Prothese', je: 'kiefer',
    honorar: () => [['BEMA', '100a', 1]], labor: () => [['BEL', '8010', 1], ['BEL', '8021', 1]], befunde: () => [['6.1', 1]],
  },
  {
    id: '6.2', titel: 'Prothese: Reparatur mit Abformung, Kunststoffbereich (z. B. Bruch)', gruppe: 'Prothese', je: 'kiefer',
    honorar: () => [['BEMA', '100b', 1]], labor: () => [['BEL', '0010', 1], ['BEL', '8010', 1], ['BEL', '8022', 1]], befunde: () => [['6.2', 1]],
  },
  {
    id: '6.3', titel: 'Prothese: Reparatur im gegossenen Metallbereich (z. B. Klammer, Halteelement)', gruppe: 'Prothese', je: 'kiefer',
    honorar: () => [['BEMA', '100b', 1]], labor: () => [['BEL', '0010', 1], ['BEL', '8010', 1], ['BEL', '8070', 1]], befunde: () => [['6.3', 1]],
  },
  {
    id: '6.4', titel: 'Prothese erweitern, Kunststoffbereich (Zähne angeben)', gruppe: 'Prothese', je: 'zahn',
    honorar: () => [['BEMA', '100b', 1]],
    labor: (n) => [['BEL', '0010', 1], ['BEL', '8010', 1], ['BEL', '8023', n]],
    befunde: (n) => [['6.4', 1], ...(n > 1 ? [['6.4.1', n - 1] as [string, number]] : [])],
  },
  {
    id: '6.5', titel: 'Prothese erweitern, gegossener Metallbereich (Zähne angeben)', gruppe: 'Prothese', je: 'zahn',
    honorar: () => [['BEMA', '100b', 1]],
    labor: (n) => [['BEL', '0010', 1], ['BEL', '8010', 1], ['BEL', '8023', n], ['BEL', '8070', 1]],
    befunde: (n) => [['6.5', 1], ...(n > 1 ? [['6.5.1', n - 1] as [string, number]] : [])],
    hinweis: 'Neue gegossene Halte- und Stützvorrichtung ggf. mit BEMA 98h ergänzen.',
  },
  {
    id: '6.6', titel: 'Teilprothese unterfüttern (verändertes Prothesenlager)', gruppe: 'Prothese', je: 'kiefer',
    honorar: () => [['BEMA', '100d', 1]], labor: () => [['BEL', '0010', 1], ['BEL', '8090', 1]], befunde: () => [['6.6', 1]],
  },
  {
    id: '6.7', titel: 'Totalprothese/Deckprothese unterfüttern mit funktioneller Randgestaltung', gruppe: 'Prothese', je: 'kiefer',
    honorar: (_, k) => [['BEMA', k === 'OK' ? '100e' : '100f', 1]], labor: () => [['BEL', '0010', 1], ['BEL', '8090', 1]], befunde: () => [['6.7', 1]],
  },
  {
    id: '6.8-krone', titel: 'Krone wiedereinsetzen (je Zahn)', gruppe: 'Festsitzend', je: 'zahn',
    honorar: (n) => [['BEMA', '24a', n]], labor: () => [], befunde: (n) => [['6.8', n]],
  },
  {
    id: '6.8-bruecke', titel: 'Brücke wiedereinsetzen (Brückenanker angeben)', gruppe: 'Festsitzend', je: 'zahn',
    honorar: (n) => [['BEMA', n > 2 ? '95b' : '95a', 1]], labor: () => [], befunde: (n) => [['6.8', n]],
  },
  {
    id: '6.8.1', titel: 'Adhäsivbrücke wiederbefestigen (je Flügel)', gruppe: 'Festsitzend', je: 'zahn',
    honorar: () => [], labor: (n) => [['BEL', '1550', n]], befunde: (n) => [['6.8.1', n]],
    hinweis: 'Adhäsivbrücke wiederbefestigen: zahnärztliche Leistung bitte ergänzen.',
  },
  {
    id: '6.9-krone', titel: 'Facette/Verblendung an Krone oder Sekundärteleskop erneuern (Verblendbereich)', gruppe: 'Festsitzend', je: 'zahn',
    honorar: (n) => [['BEMA', '24b', n]], labor: (n) => [['BEL', '8200', n], ['BEL', '1620', n]], befunde: (n) => [['6.9', n]],
  },
  {
    id: '6.9-bruecke', titel: 'Facette/Verblendung an Brückenanker oder -glied erneuern (Verblendbereich)', gruppe: 'Festsitzend', je: 'zahn',
    honorar: (n) => [['BEMA', '95c', n]], labor: (n) => [['BEL', '8200', n], ['BEL', '1620', n]], befunde: (n) => [['6.9', n]],
  },
  {
    id: '7.3', titel: 'Implantatkrone: Facette/Verblendung wiederherstellen', gruppe: 'Implantat', je: 'zahn',
    honorar: (n) => [['GOZ', '2320', n]], labor: (n) => [['BEB', '8201', n], ['BEB', '2611', n]], befunde: (n) => [['7.3', n]],
    hinweis: 'Implantatkrone: GOZ statt BEMA; im Ausnahmefall nach Nr. 36 ZE-Richtlinie BEMA 24b (i).',
  },
  {
    id: '7.4', titel: 'Implantatkrone/-brückenanker wiedereingliedern', gruppe: 'Implantat', je: 'zahn',
    honorar: (n) => [['GOZ', '2310', n]], labor: () => [], befunde: (n) => [['7.4', n]],
    hinweis: 'Implantatkrone: GOZ statt BEMA; im Ausnahmefall nach Nr. 36 ZE-Richtlinie BEMA 24a (i).',
  },
  {
    id: '7.7', titel: 'Implantatgetragene Prothese wiederherstellen', gruppe: 'Implantat', je: 'kiefer',
    honorar: () => [['GOZ', '5260', 1]], labor: () => [['BEB', '8011', 1], ['BEB', '8022', 1]], befunde: () => [['7.7', 1]],
    hinweis: 'Implantatgetragene Prothese: GOZ statt BEMA; im Ausnahmefall nach Nr. 36 ZE-Richtlinie BEMA 100a/100b (i).',
  },
]

export const reparaturArt = (id: string) => REPARATUR_ARTEN.find((a) => a.id === id)

/** Festzuschuss-Befunde und Leistungen aller eingetragenen Wiederherstellungen */
export function reparaturenAnwenden(reparaturen: Reparatur[]) {
  const befunde: FestzuschussBefund[] = []
  const positionen: Position[] = []
  const hinweise: string[] = []
  reparaturen.forEach((r, i) => {
    const art = reparaturArt(r.art)
    if (!art) return
    const { zaehne, kiefer } = gebietAufloesen(r.gebiet)
    if (!kiefer.size) {
      hinweise.push(`Wiederherstellung „${art.titel}“: bitte ${art.je === 'kiefer' ? 'Kiefer (OK/UK)' : 'Zähne'} angeben.`)
      return
    }
    if (art.je === 'zahn' && !zaehne.length) {
      hinweise.push(`Wiederherstellung „${art.titel}“: bitte die betroffenen Zähne angeben.`)
      return
    }
    const k = [...kiefer][0]
    const gebiet = art.je === 'kiefer' ? k : [...zaehne].sort((x, y) => ALLE_ZAEHNE.indexOf(x) - ALLE_ZAEHNE.indexOf(y)).join(',')
    const n = art.je === 'kiefer' ? 1 : zaehne.length
    let j = 0
    const pos = ([ebene, nr, anzahl]: [Ebene, string, number]): Position =>
      ({ id: `rep-${i}-${j++}`, ebene, nr, zahn: gebiet, anzahl, auto: true })
    for (const [nr, anzahl] of art.befunde(n)) befunde.push({ id: `rep-${i}-b${nr}`, nr, zahnGebiet: gebiet, anzahl, auto: true })
    positionen.push(...art.honorar(n, k).map(pos), ...art.labor(n).map(pos))
    if (art.hinweis) hinweise.push(art.hinweis)
  })
  return { befunde, positionen, hinweise }
}
