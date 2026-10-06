// Kopiert das Engine-Bundle (npm run build:engine) nach MAS-2, mit Herkunftsstempel und Prüfsumme.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const quelle = resolve(import.meta.dirname, '../dist-engine/hkp-engine.mjs')
const ziel = process.env.HKP_ENGINE_ZIEL ?? 'F:/MAS-2/backend/src/vendor/hkp-engine.mjs'

if (!existsSync(quelle)) {
  console.error(`Fehlt: ${quelle} – erst "vite build -c vite.engine.config.ts" ausführen.`)
  process.exit(1)
}
const code = readFileSync(quelle, 'utf8')
const sha = createHash('sha256').update(code).digest('hex').slice(0, 12)
const kopf = `// GENERIERT aus F:\\PlanR\\ZE\\HKP (src/clara/index.ts) – nicht von Hand ändern.\n// Neu bauen: cd F:\\PlanR\\ZE\\HKP && npm run build:engine   (sha256 ${sha})\n`
mkdirSync(dirname(ziel), { recursive: true })
writeFileSync(ziel, kopf + code)
const { ENGINE_STAND } = await import(`file:///${ziel.replace(/\\/g, '/')}?t=${Date.now()}`)
console.log(`HKP-Engine ${ENGINE_STAND} (sha ${sha}) → ${ziel}`)
