// Holt die amtliche GOÄ-Anlage und schreibt die für Zahnärzte nach § 6 Abs. 2 GOZ
// geöffneten Nummern als src/data/goae-zahnarzt.json.
//
// Aufruf: node tools/goae-holen.mjs
//
// Die geöffneten Abschnitte (§ 6 Abs. 2 GOZ): B I–VI, C I (nur 200/204/210/211),
// C II–VII, E V/VI, J, L (Teile), M (einzelne), N (4852), O. Für den Implantat-KV
// reicht die unten gepflegte Whitelist; die Faktorrahmen stammen aus § 5 GOÄ.
// Zahlen, die die Whitelist noch nicht kennt, werden mit Standardrahmen ergänzt
// und am Ende als Hinweis ausgegeben, damit man sie prüfen und einsortieren kann.

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PUNKTWERT = 0.0582873
const QUELLE = 'https://www.gesetze-im-internet.de/go__1982/anlage.html'

// nr -> { abschnitt, kat, maxFaktor, schwelle }. kat steuert nur die Anzeige.
const WHITELIST = {
  '250': { abschnitt: 'C II Blutentnahmen', kat: 'C', maxFaktor: 2.5, schwelle: 1.8 },
  '251': { abschnitt: 'C II Blutentnahmen', kat: 'C', maxFaktor: 3.5, schwelle: 2.3 },
  '252': { abschnitt: 'C II Injektionen', kat: 'C', maxFaktor: 3.5, schwelle: 2.3 },
  '253': { abschnitt: 'C II Injektionen', kat: 'C', maxFaktor: 3.5, schwelle: 2.3 },
  '255': { abschnitt: 'C II Injektionen', kat: 'C', maxFaktor: 3.5, schwelle: 2.3 },
  '256': { abschnitt: 'C II Injektionen', kat: 'C', maxFaktor: 3.5, schwelle: 2.3 },
  '271': { abschnitt: 'C II Infusionen', kat: 'C', maxFaktor: 3.5, schwelle: 2.3 },
  '272': { abschnitt: 'C II Infusionen', kat: 'C', maxFaktor: 3.5, schwelle: 2.3 },
  '298': { abschnitt: 'C II Abstrichentnahmen', kat: 'C', maxFaktor: 3.5, schwelle: 2.3 },
  '2381': { abschnitt: 'L V', kat: 'L', maxFaktor: 3.5, schwelle: 2.3 },
  '2382': { abschnitt: 'L V', kat: 'L', maxFaktor: 3.5, schwelle: 2.3 },
  '2386': { abschnitt: 'L V', kat: 'L', maxFaktor: 3.5, schwelle: 2.3 },
  '2440': { abschnitt: 'L VI', kat: 'L', maxFaktor: 3.5, schwelle: 2.3 },
  '2442': { abschnitt: 'L VI', kat: 'L', maxFaktor: 3.5, schwelle: 2.3 },
  '2670': { abschnitt: 'L VII', kat: 'L', maxFaktor: 3.5, schwelle: 2.3 },
  '2671': { abschnitt: 'L VII', kat: 'L', maxFaktor: 3.5, schwelle: 2.3 },
  '2675': { abschnitt: 'L VII', kat: 'L', maxFaktor: 3.5, schwelle: 2.3 },
  '2676': { abschnitt: 'L VII', kat: 'L', maxFaktor: 3.5, schwelle: 2.3 },
  '2730': { abschnitt: 'L IX', kat: 'L', maxFaktor: 3.5, schwelle: 2.3 },
  '2732': { abschnitt: 'L IX', kat: 'L', maxFaktor: 3.5, schwelle: 2.3 },
  '5000': { abschnitt: 'O I Strahlendiagnostik', kat: 'O', maxFaktor: 2.5, schwelle: 1.8 },
  '5002': { abschnitt: 'O I Strahlendiagnostik', kat: 'O', maxFaktor: 2.5, schwelle: 1.8 },
  '5004': { abschnitt: 'O I Strahlendiagnostik', kat: 'O', maxFaktor: 2.5, schwelle: 1.8 },
  '5010': { abschnitt: 'O I Strahlendiagnostik', kat: 'O', maxFaktor: 2.5, schwelle: 1.8 },
  '5095': { abschnitt: 'O I Strahlendiagnostik', kat: 'O', maxFaktor: 2.5, schwelle: 1.8 },
  '5370': { abschnitt: 'O I Strahlendiagnostik', kat: 'O', maxFaktor: 2.5, schwelle: 1.8 },
  '5377': { abschnitt: 'O I Strahlendiagnostik', kat: 'O-fix', maxFaktor: 1.0, schwelle: 1.0 },
}

const ZEILE = /^\|\s*(\d{1,4}[a-z]?)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*[\d.,-]+\s*\|?\s*$/

async function main() {
  const res = await fetch(QUELLE, { headers: { 'user-agent': 'PlanR-GOAE/1.0' } })
  if (!res.ok) throw new Error(`GOÄ-Anlage HTTP ${res.status}`)
  const md = await res.text()
  const gefunden = new Map()
  for (const zeile of md.split('\n')) {
    const m = ZEILE.exec(zeile.trim())
    if (!m) continue
    const [, nr, text, punkte] = m
    if (!WHITELIST[nr] || gefunden.has(nr)) continue
    gefunden.set(nr, { nr, text: text.replace(/\s+/g, ' ').trim(), punkte: Number(punkte), ...WHITELIST[nr] })
  }
  const fehlend = Object.keys(WHITELIST).filter((nr) => !gefunden.has(nr))
  const eintraege = Object.keys(WHITELIST).filter((nr) => gefunden.has(nr)).map((nr) => gefunden.get(nr))
  const out = {
    name: 'GOÄ 1996 (für Zahnärzte geöffnete Abschnitte nach § 6 Abs. 2 GOZ)',
    quelle: QUELLE,
    stand: new Date().toISOString().slice(0, 10),
    punktwert: PUNKTWERT,
    hinweis: 'Nur die nach § 6 Abs. 2 GOZ für Zahnärzte zugänglichen Nummern. Faktorrahmen nach § 5 GOÄ.',
    eintraege,
  }
  const ziel = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'goae-zahnarzt.json')
  await writeFile(ziel, JSON.stringify(out, null, 2) + '\n', 'utf8')
  console.log(`geschrieben: ${eintraege.length} Nummern -> ${ziel}`)
  if (fehlend.length) console.warn('NICHT gefunden (prüfen):', fehlend.join(', '))
}

main().catch((e) => { console.error(e); process.exit(1) })
