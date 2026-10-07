import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // F:\postcss.config.js gehört nicht zum Projekt und darf nicht geerbt werden
  css: { postcss: {} },
  server: { port: 5205, strictPort: true },
  // Öffentlich nur der Build aus dist/: Cloudflare-Tunnel kb.pickadoc-tunnel.com -> 127.0.0.1:5206
  preview: { host: '127.0.0.1', port: 5206, strictPort: true, allowedHosts: ['kb.pickadoc-tunnel.com', 'kassen-kb.pickadoc-tunnel.com'] },
})
