import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // F:\postcss.config.js gehört nicht zum Projekt und darf nicht geerbt werden
  css: { postcss: {} },
  server: { port: 5195, strictPort: true },
  // öffentlich nur der Build aus dist/: Cloudflare-Tunnel pimpl.pickadoc-tunnel.com → 127.0.0.1:5196
  preview: { host: '127.0.0.1', port: 5196, strictPort: true, allowedHosts: ['pimpl.pickadoc-tunnel.com', 'implantologie.pickadoc-tunnel.com'] },
})
