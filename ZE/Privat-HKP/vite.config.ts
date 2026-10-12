import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // planr.pickadoc.de: Planer unter /planer/<name>/ (PLANR_BASE beim Bauen)
  base: process.env.PLANR_BASE || '/',
  plugins: [react()],
  // F:\postcss.config.js gehört nicht zum Projekt und darf nicht geerbt werden
  css: { postcss: {} },
  server: { port: 5190, strictPort: true },
  // öffentlich nur der Build aus dist/: Cloudflare-Tunnel (p|privat-)hkp.pickadoc-tunnel.com → 127.0.0.1:5191
  preview: { host: '127.0.0.1', port: 5191, strictPort: true, allowedHosts: ['phkp.pickadoc-tunnel.com', 'privat-hkp.pickadoc-tunnel.com'] },
})
