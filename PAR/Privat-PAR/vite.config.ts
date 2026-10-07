import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // F:\postcss.config.js gehört nicht zum Projekt und darf nicht geerbt werden
  css: { postcss: {} },
  server: { port: 5209, strictPort: true },
  // Öffentlich nur der Build aus dist/: Cloudflare-Tunnel privat-par.pickadoc-tunnel.com -> 127.0.0.1:5210
  preview: { host: '127.0.0.1', port: 5210, strictPort: true, allowedHosts: ['privat-par.pickadoc-tunnel.com', 'ppar.pickadoc-tunnel.com'] },
})
