// Kopiert das Sprach-Bundle der KI-Zeile (npm run build:sprache) nach MAS-2, mit Herkunftsstempel und Prüfsumme.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const quelle = resolve(import.meta.dirname, '../dist-sprache/plan-ki-engine.mjs')
const ziel = process.env.SPRACHE_ENGINE_ZIEL ?? 'F:/MAS-2/backend/src/vendor/plan-ki-engine.mjs'

if (!existsSync(quelle)) {
  console.error(`Fehlt: ${quelle} – erst "vite build -c vite.sprache.config.ts" ausführen.`)
  process.exit(1)
}
const code = readFileSync(quelle, 'utf8')
const sha = createHash('sha256').update(code).digest('hex').slice(0, 12)
const kopf = `// GENERIERT aus F:\\PlanR\\Start (sprache/index.ts) – nicht von Hand ändern.\n// Neu bauen: cd F:\\PlanR\\Start && npm run build:sprache   (sha256 ${sha})\n`
mkdirSync(dirname(ziel), { recursive: true })
writeFileSync(ziel, kopf + code)
const { ENGINE_STAND, MODULE_NAMEN } = await import(`file:///${ziel.replace(/\\/g, '/')}?t=${Date.now()}`)
console.log(`Sprach-Engine ${ENGINE_STAND} (sha ${sha}, ${Object.keys(MODULE_NAMEN).length} Planer) → ${ziel}`)
