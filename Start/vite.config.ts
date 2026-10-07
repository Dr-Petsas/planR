import { defineConfig } from 'vite'

// Die Planer holen Punktwerte und Preislisten unter /daten/ – von anderen Ports und Tunnel-Hosts
const cors = { origin: [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^https:\/\/[a-z0-9-]+\.pickadoc-tunnel\.com$/], methods: ['GET'] }

// Öffentlich nur der Build aus dist/: Cloudflare-Tunnel planr.pickadoc-tunnel.com -> 127.0.0.1:5189
export default defineConfig({
  // F:\postcss.config.js gehört nicht zum Projekt und darf nicht geerbt werden
  css: { postcss: {} },
  server: { port: 5188, strictPort: true, cors },
  preview: { host: '127.0.0.1', port: 5189, strictPort: true, allowedHosts: ['planr.pickadoc-tunnel.com'], cors },
})
