import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // F:\postcss.config.js gehört nicht zum Projekt und darf nicht geerbt werden
  css: { postcss: {} },
  server: { port: 5207, strictPort: true },
  // Öffentlich nur der Build aus dist/: Cloudflare-Tunnel privat-kb.pickadoc-tunnel.com -> 127.0.0.1:5208
  preview: { host: '127.0.0.1', port: 5208, strictPort: true, allowedHosts: ['privat-kb.pickadoc-tunnel.com', 'pkb.pickadoc-tunnel.com'] },
})
