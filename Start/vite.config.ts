import { defineConfig } from 'vite'

// Öffentlich nur der Build aus dist/: Cloudflare-Tunnel planr.pickadoc-tunnel.com -> 127.0.0.1:5189
export default defineConfig({
  // F:\postcss.config.js gehört nicht zum Projekt und darf nicht geerbt werden
  css: { postcss: {} },
  server: { port: 5188, strictPort: true },
  preview: { host: '127.0.0.1', port: 5189, strictPort: true, allowedHosts: ['planr.pickadoc-tunnel.com'] },
})
