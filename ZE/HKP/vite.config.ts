import { readFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

const TUNNEL_HOST = 'hkp.pickadoc-tunnel.com'

/** PLANR_HKP_KEY aus der Umgebung oder aus der MAS-Konfiguration (eine Quelle, kein zweiter Eintrag) */
function masSchluessel(): string {
  if (process.env.PLANR_HKP_KEY?.trim()) return process.env.PLANR_HKP_KEY.trim()
  try {
    const env = readFileSync(process.env.MAS_ENV_DATEI ?? 'F:/MAS-2/backend/.env', 'utf8')
    return env.match(/^\s*PLANR_HKP_KEY\s*=\s*["']?([^"'\r\n#]*)/m)?.[1].trim() ?? ''
  } catch {
    return ''
  }
}

const SCHLUESSEL = masSchluessel()

// Den Schlüssel bekommt nur, wer direkt am Praxis-PC arbeitet. Über den Tunnel
// (Cloudflare setzt cf-connecting-ip) bleibt es beim Link bzw. eingegebenen Schlüssel.
function amPraxisPc(req: IncomingMessage) {
  const host = String(req.headers.host ?? '').split(':')[0]
  const lokal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')
  return lokal && !req.headers['cf-connecting-ip'] && host !== TUNNEL_HOST
}

// HKP-Register in MAS (nur /planr/*, Praxis-Schlüssel prüft MAS)
const MAS_PROXY: Record<string, ProxyOptions> = {
  '/mas/planr': {
    target: 'http://127.0.0.1:4000', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/mas/, ''),
    configure: (proxy) => proxy.on('proxyReq', (proxyReq, req) => {
      // Weitere Mandanten tragen ihren eigenen Schlüssel ein – sonst landeten ihre HKPs im Register dieser Praxis
      if (SCHLUESSEL && amPraxisPc(req) && !req.headers['x-planr-mandant']) proxyReq.setHeader('X-PlanR-Key', SCHLUESSEL)
      proxyReq.removeHeader('X-PlanR-Mandant')
    }),
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // F:\postcss.config.js gehört nicht zum Projekt und darf nicht geerbt werden
  css: { postcss: {} },
  // öffentlich nur der Build aus dist/: Cloudflare-Tunnel hkp.pickadoc-tunnel.com → 127.0.0.1:5181
  preview: { host: '127.0.0.1', port: 5181, strictPort: true, allowedHosts: [TUNNEL_HOST], proxy: MAS_PROXY },
  server: { proxy: MAS_PROXY },
})
