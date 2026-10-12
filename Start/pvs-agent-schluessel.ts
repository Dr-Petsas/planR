/**
 * PVS-Agent einer Praxis in PlanR anlegen: Agenten-Schlüssel (für die Installation auf dem Praxisserver) und
 * Praxis-Code (gibt jeden Praxis-PC einmal frei).
 *
 *   node pvs-agent-schluessel.ts <mandant> [email|@domain ...]   Schlüssel und Code neu (alter Schlüssel ungültig)
 *   node pvs-agent-schluessel.ts <mandant> --nur-code            nur neuen Praxis-Code (Agent bleibt verbunden)
 *   node pvs-agent-schluessel.ts <mandant> --geraete-loeschen    alle freigegebenen PCs abmelden
 *
 * Adressen: optional, für Anmeldung über Cloudflare Access statt Praxis-Code.
 * PlanR speichert nur Hashes in data/pvs-agenten.json; Schlüssel und Code werden nur jetzt angezeigt.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { MANDANT_RE } from './src/einstellungen.ts'
import { codeHash, neuerPraxisCode, neuerSchluessel, schluesselHash, type AgentListe } from './pvs-agent-server.ts'

const DATEI = 'F:/PlanR/Start/data/pvs-agenten.json'
const [mandant, ...rest] = process.argv.slice(2)
const nurCode = rest.includes('--nur-code')
const geraeteLoeschen = rest.includes('--geraete-loeschen')
const emails = rest.filter((x) => !x.startsWith('--'))

if (!mandant || !MANDANT_RE.test(mandant) || emails.some((e) => !/^[^\s@]*@[^\s@]+\.[^\s@]+$/.test(e))) {
  console.error('Aufruf: node pvs-agent-schluessel.ts <mandant> [email|@domain ...] [--nur-code] [--geraete-loeschen]')
  process.exit(2)
}

let liste: AgentListe = {}
try {
  liste = JSON.parse(await readFile(DATEI, 'utf8')) as AgentListe
} catch { /* erste Praxis */ }

const alt = liste[mandant]
if ((nurCode || geraeteLoeschen) && !alt) {
  console.error(`Für ${mandant} ist noch kein Agent angelegt – zuerst ohne Option aufrufen.`)
  process.exit(2)
}

let schluessel = ''
let code = ''
if (geraeteLoeschen) {
  liste[mandant] = { ...alt, geraete: [] }
} else if (nurCode) {
  code = neuerPraxisCode()
  liste[mandant] = { ...alt, codeHash: codeHash(code) }
} else {
  schluessel = neuerSchluessel()
  code = neuerPraxisCode()
  liste[mandant] = {
    hash: schluesselHash(schluessel),
    codeHash: codeHash(code),
    emails: emails.length ? emails.map((e) => e.toLowerCase()) : alt?.emails ?? [],
    geraete: alt?.geraete ?? [],
    angelegt: new Date().toISOString(),
  }
}
await mkdir(dirname(DATEI), { recursive: true })
await writeFile(DATEI, JSON.stringify(liste, null, 2), 'utf8')

console.log(`Mandant:          ${mandant}`)
if (schluessel) console.log(`Agenten-Schlüssel: ${schluessel}   (bei Installieren.cmd auf dem Praxisserver eingeben)`)
if (code) console.log(`Praxis-Code:       ${code}   (fragt PlanR einmal an jedem Praxis-PC ab)`)
if (geraeteLoeschen) console.log('Alle freigegebenen PCs sind abgemeldet.')
if (schluessel) console.log('Ein älterer Schlüssel dieses Mandanten gilt ab sofort nicht mehr. Schlüssel und Code werden nur jetzt angezeigt.')
