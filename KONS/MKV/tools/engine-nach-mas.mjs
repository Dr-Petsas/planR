// Kopiert das Engine-Bundle (npm run build:engine) nach MAS-2, mit Herkunftsstempel und Prüfsumme.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const quelle = resolve(import.meta.dirname, '../dist-engine/mkv-engine.mjs')
const ziel = process.env.MKV_ENGINE_ZIEL ?? 'F:/MAS-2/backend/src/vendor/mkv-engine.mjs'

if (!existsSync(quelle)) {
  console.error(`Fehlt: ${quelle} – erst "vite build -c vite.engine.config.ts" ausführen.`)
  process.exit(1)
}
const code = readFileSync(quelle, 'utf8')
if (/from\s+["']react["']/.test(code)) {
  console.error('Das Bundle importiert React – MAS hat kein React. Alias in vite.engine.config.ts prüfen.')
  process.exit(1)
}
const sha = createHash('sha256').update(code).digest('hex').slice(0, 12)
const kopf = `// GENERIERT aus F:\\PlanR\\KONS\\MKV (src/clara/index.ts) – nicht von Hand ändern.\n// Neu bauen: cd F:\\PlanR\\KONS\\MKV && npm run build:engine   (sha256 ${sha})\n`
mkdirSync(dirname(ziel), { recursive: true })
writeFileSync(ziel, kopf + code)
const { ENGINE_STAND } = await import(`file:///${ziel.replace(/\\/g, '/')}?t=${Date.now()}`)
console.log(`MKV-Engine ${ENGINE_STAND} (sha ${sha}) → ${ziel}`)
