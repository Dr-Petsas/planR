import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // F:\postcss.config.js gehört nicht zum Projekt und darf nicht geerbt werden
  css: { postcss: {} },
  server: { port: 5213, strictPort: true },
  // Öffentlich nur der Build aus dist/: Cloudflare-Tunnel privat-kfo.pickadoc-tunnel.com -> 127.0.0.1:5214
  preview: { host: '127.0.0.1', port: 5214, strictPort: true, allowedHosts: ['privat-kfo.pickadoc-tunnel.com', 'pkfo.pickadoc-tunnel.com'] },
})
