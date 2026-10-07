// Verteilt die gemeinsamen Bausteine aus _gemeinsam/ in alle Planer und baut den
// Datendienst der Startseite (Start/public/daten: Punktwerte, Preislisten, index.json).
//
//   node tools/gemeinsam.mjs            sammeln + verteilen
//   node tools/gemeinsam.mjs --pruefen  nur prüfen, ob alle Kopien gleich sind (Exit 1 sonst)
//
// Die Planer bleiben eigenständig (keine Querimporte) – jede Kopie wird mitgebaut.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const QUELLE = join(WURZEL, '_gemeinsam', 'src')
const DATEN = join(WURZEL, 'Start', 'public', 'daten')

const PLANER = {
  'ZE/HKP': ['basis', 'kasse'],
  'ZE/Privat-HKP': ['basis', 'ablage'],
  'Implantologie/Privat-Impl': ['basis', 'ablage'],
  'KONS/MKV': ['basis', 'ablage', 'kasse'],
  'KONS/Privat-Kons': ['basis', 'ablage'],
  'PAR/Kassen-PAR': ['basis', 'ablage', 'kasse'],
  'PAR/Privat-PAR': ['basis', 'ablage'],
  'KB/Kassen-KB': ['basis', 'ablage', 'kasse'],
  'KB/Privat-KB': ['basis', 'ablage'],
}

const SAETZE = {
  basis: [
    'mandant.ts', 'mandant.test.ts', 'components/Mandant.tsx',
    'stammdaten.ts', 'stammdaten.test.ts', 'components/Stammdaten.tsx',
    'daten.ts', 'components/Listen.tsx', 'gemeinsam.css',
  ],
  ablage: ['ablage.ts', 'ablage.test.ts', 'components/Ablage.tsx'],
  kasse: ['data/kzv.ts', 'data/punktwerte.json', 'punktwerte.ts', 'punktwerte.test.ts', 'components/Punktwerte.tsx'],
}

/** Listen des Datendienstes: Zieldatei <- Quelle (die Planer mit Aktualisierungs-Werkzeug sind die Quelle). */
const LISTEN = [
  ['goz-2012.json', 'ZE/HKP/src/data/goz-2012.json'],
  ['beb-itz-2024.json', 'ZE/HKP/src/data/beb-itz-2024.json'],
  ['goae-zahnarzt.json', 'Implantologie/Privat-Impl/src/data/goae-zahnarzt.json'],
  ...['bema', 'fz', 'bel'].flatMap((ordner) =>
    readdirSync(join(WURZEL, 'ZE/HKP/src/data', ordner)).filter((f) => f.endsWith('.json')).map((f) => [`${ordner}/${f}`, `ZE/HKP/src/data/${ordner}/${f}`]),
  ),
]

const lesen = (p) => readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
const pruefen = process.argv.includes('--pruefen')
let fehler = 0

function sammeln() {
  const dateien = []
  for (const [ziel, quelle] of LISTEN) {
    const pfad = join(WURZEL, quelle)
    if (!existsSync(pfad)) continue
    const text = lesen(pfad)
    const json = JSON.parse(text)
    mkdirSync(dirname(join(DATEN, ziel)), { recursive: true })
    writeFileSync(join(DATEN, ziel), text)
    dateien.push({ datei: ziel, name: json.name ?? ziel, stand: json.stand || json.gueltigAb || '' })
  }
  // Punktwerte pflegt man in Start/public/daten/punktwerte.json; mitgeliefert wird derselbe Stand.
  const pwPfad = join(DATEN, 'punktwerte.json')
  if (existsSync(pwPfad)) writeFileSync(join(QUELLE, 'data', 'punktwerte.json'), lesen(pwPfad))
  else writeFileSync(pwPfad, lesen(join(QUELLE, 'data', 'punktwerte.json')))
  const pw = JSON.parse(lesen(pwPfad))
  dateien.unshift({ datei: 'punktwerte.json', name: 'BEMA-Punktwerte je KZV', stand: pw.stand })
  writeFileSync(join(DATEN, 'index.json'), JSON.stringify({ stand: new Date().toISOString().slice(0, 10), dateien }, null, 1) + '\n')
  console.log(`Datendienst: ${dateien.length} Dateien in Start/public/daten`)
}

if (!pruefen) sammeln()

for (const [planer, saetze] of Object.entries(PLANER)) {
  const src = join(WURZEL, planer, 'src')
  if (!existsSync(src)) {
    console.log(`– ${planer}: (noch) kein src/`)
    continue
  }
  for (const datei of saetze.flatMap((s) => SAETZE[s])) {
    const von = join(QUELLE, datei)
    const nach = join(src, datei)
    const soll = lesen(von)
    const gleich = existsSync(nach) && lesen(nach) === soll
    if (pruefen) {
      if (!gleich) {
        console.log(`✗ ${planer}/src/${datei} weicht ab`)
        fehler += 1
      }
    } else if (!gleich) {
      mkdirSync(dirname(nach), { recursive: true })
      writeFileSync(nach, soll)
      console.log(`→ ${planer}/src/${datei}`)
    }
  }
}

if (pruefen) {
  console.log(fehler ? `${fehler} Abweichung(en) – node tools/gemeinsam.mjs verteilt neu.` : 'Alle gemeinsamen Bausteine sind gleich.')
  process.exit(fehler ? 1 : 0)
}
