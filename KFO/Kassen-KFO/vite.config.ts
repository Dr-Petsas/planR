import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // F:\postcss.config.js gehört nicht zum Projekt und darf nicht geerbt werden
  css: { postcss: {} },
  server: { port: 5211, strictPort: true },
  // Öffentlich nur der Build aus dist/: Cloudflare-Tunnel kfo.pickadoc-tunnel.com -> 127.0.0.1:5212
  preview: { host: '127.0.0.1', port: 5212, strictPort: true, allowedHosts: ['kfo.pickadoc-tunnel.com', 'kassen-kfo.pickadoc-tunnel.com'] },
})
