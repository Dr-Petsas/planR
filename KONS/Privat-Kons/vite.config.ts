import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // F:\postcss.config.js gehört nicht zum Projekt und darf nicht geerbt werden
  css: { postcss: {} },
  server: { port: 5197, strictPort: true },
  // öffentlich nur der Build aus dist/: Cloudflare-Tunnel mkv.pickadoc-tunnel.com → 127.0.0.1:5198
  preview: { host: '127.0.0.1', port: 5198, strictPort: true, allowedHosts: ['mkv.pickadoc-tunnel.com', 'kons.pickadoc-tunnel.com'] },
})
