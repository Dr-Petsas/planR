import { defineConfig } from 'vite'

// Engine-Bundle für MAS/Clara (Node, ohne Browser): npm run build:engine
const stand = new Date().toLocaleString('sv-SE').slice(0, 16)

export default defineConfig({
  css: { postcss: {} },
  define: { __HKP_ENGINE_STAND__: JSON.stringify(stand) },
  build: {
    outDir: 'dist-engine',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    sourcemap: false,
    lib: { entry: 'src/clara/index.ts', formats: ['es'], fileName: () => 'hkp-engine.mjs' },
  },
})
