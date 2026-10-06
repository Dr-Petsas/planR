import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // F:\postcss.config.js gehört nicht zum Projekt und darf nicht geerbt werden
  css: { postcss: {} },
  server: { port: 5201, strictPort: true },
  // öffentlich nur der Build aus dist/: Cloudflare-Tunnel par.pickadoc-tunnel.com → 127.0.0.1:5202
  preview: { host: '127.0.0.1', port: 5202, strictPort: true, allowedHosts: ['par.pickadoc-tunnel.com', 'paro.pickadoc-tunnel.com'] },
})
