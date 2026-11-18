import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Engine-Bundle für MAS/Clara (Node, ohne Browser): npm run build:engine
const stand = new Date().toLocaleString('sv-SE').slice(0, 16)

export default defineConfig({
  css: { postcss: {} },
  define: { __PKB_ENGINE_STAND__: JSON.stringify(stand) },
  // store.ts und ablage.ts hängen für den Browser an React; die Engine braucht davon nur Vorgaben und leeren Plan
  resolve: { alias: { react: fileURLToPath(new URL('./src/clara/ohne-react.ts', import.meta.url)) } },
  build: {
    outDir: 'dist-engine',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    sourcemap: false,
    lib: { entry: 'src/clara/index.ts', formats: ['es'], fileName: () => 'privat-kb-engine.mjs' },
  },
})
