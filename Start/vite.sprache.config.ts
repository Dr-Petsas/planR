import { defineConfig } from 'vite'

// KI-Zeile aller Planer als ein Bundle für MAS/Clara (Node, ohne Browser): npm run build:sprache
const stand = new Date().toLocaleString('sv-SE').slice(0, 16)

export default defineConfig({
  css: { postcss: {} },
  define: {
    __SPRACHE_STAND__: JSON.stringify(stand),
    __HKP_ENGINE_STAND__: JSON.stringify(stand),
    __MKV_ENGINE_STAND__: JSON.stringify(stand),
    'import.meta.env.VITE_KI_LIVE': '""',
    'import.meta.env.VITE_KI_LIVE_URL': '""',
  },
  build: {
    outDir: 'dist-sprache',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    sourcemap: false,
    lib: { entry: 'sprache/index.ts', formats: ['es'], fileName: () => 'plan-ki-engine.mjs' },
  },
})
