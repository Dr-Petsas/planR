import { defineConfig, type Plugin } from 'vite'
import { plaeneMiddleware } from './plaene-server.ts'
import { homepageHtml } from './src/homepageHtml.ts'

// Die Planer holen Punktwerte und Preislisten unter /daten/ – von anderen Ports und Tunnel-Hosts.
// PUT /api/plaene nimmt die Köpfe gespeicherter Pläne entgegen.
const cors = {
  origin: [
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    /^https:\/\/[a-z0-9-]+\.pickadoc-tunnel\.com$/,
    /^https:\/\/docgenda\.(web\.app|firebaseapp\.com)$/,
    /^https:\/\/([a-z0-9-]+\.)?pickadoc\.de$/,
  ],
  methods: ['GET', 'PUT', 'OPTIONS'],
}

function plaenePlugin(): Plugin {
  const einhaengen = (server: { middlewares: { use: (fn: typeof plaeneMiddleware) => void } }) => {
    server.middlewares.use(plaeneMiddleware)
  }
  return { name: 'planr-plaene', configureServer: einhaengen, configurePreviewServer: einhaengen }
}

/**
 * Rendert die öffentliche Startseite bereits beim Build in dist/index.html vor (SEO, Google Ads Qualitätsfaktor, LCP).
 * Hängt außerdem die zugehörigen Homepage-CSS-Dateien direkt in <head>, damit der erste Paint sofort gestylt ist.
 */
function prerenderStartseite(): Plugin {
  return {
    name: 'planr-prerender',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html, ctx) {
      const cssLinks: string[] = []
      if (ctx.bundle) {
        for (const [fileName, chunk] of Object.entries(ctx.bundle)) {
          if (chunk.type === 'asset' && fileName.endsWith('.css') && fileName.includes('homepage')) {
            const href = `/${fileName}`
            if (!html.includes(href)) cssLinks.push(`    <link rel="stylesheet" crossorigin href="${href}">`)
          }
        }
      }
      let aus = html
        .replace('<html lang="de">', '<html lang="de" class="hp-html">')
        .replace('<body>', '<body class="hp-body">')
        .replace('<div id="app"></div>', `<div id="app" data-ssr="homepage">${homepageHtml()}</div>`)
      if (cssLinks.length) aus = aus.replace('</head>', `${cssLinks.join('\n')}\n  </head>`)
      return aus
    },
  }
}

// Öffentlich nur der Build aus dist/: Cloudflare-Tunnel planr.pickadoc-tunnel.com -> 127.0.0.1:5189
export default defineConfig({
  plugins: [plaenePlugin(), prerenderStartseite()],
  // F:\postcss.config.js gehört nicht zum Projekt und darf nicht geerbt werden
  css: { postcss: {} },
  server: { port: 5188, strictPort: true, cors },
  // planr.pickadoc.de: Caddy auf dem Strato-Server -> 127.0.0.1:5189, die Planer liefert Caddy unter /planer/ selbst aus
  preview: { host: '127.0.0.1', port: 5189, strictPort: true, allowedHosts: ['planr.pickadoc-tunnel.com', 'planr.pickadoc.de'], cors },
})
