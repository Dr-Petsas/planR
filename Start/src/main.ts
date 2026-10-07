import './style.css'
import { BEREICHE, adresse, type Bereich, type Planer } from './planer'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function kachel(p: Planer, b: Bereich): string {
  const url = adresse(p, location)
  const inhalt = `
    <div class="kachel-kopf">
      <span class="kuerzel">${esc(p.kuerzel)}</span>
      <span class="art art-${p.art.toLowerCase()}">${p.art}</span>
    </div>
    <span class="bereich-name">${esc(b.name)}</span>
    <h3>${esc(p.titel)}</h3>
    <p class="zweck">${esc(p.zweck)}</p>
    <p class="text">${esc(p.text)}</p>
    <div class="kachel-fuss">${url ? '<span class="status" data-status>wird geprüft …</span><span class="pfeil">Öffnen →</span>' : '<span class="status vorbereitung">in Vorbereitung</span>'}</div>`
  return url
    ? `<a class="kachel art-rand-${p.art.toLowerCase()}" href="${esc(url)}" data-url="${esc(url)}">${inhalt}</a>`
    : `<div class="kachel kachel-aus">${inhalt}</div>`
}

const mandant = new URLSearchParams(location.search).get('mandant')
const anzahl = BEREICHE.flatMap((b) => b.planer).filter((p) => adresse(p, location)).length

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="kopf">
    <div class="marke">
      <span class="logo">PR</span>
      <div>
        <h1>PlanR</h1>
        <p>Alle Planer der Praxis auf einen Blick</p>
      </div>
    </div>
    <div class="kopf-info">${anzahl} Planer${mandant ? ` · Mandant <b>${esc(mandant)}</b>` : ''}</div>
  </header>
  <main>
    <div class="kacheln">${BEREICHE.flatMap((b) => b.planer.map((p) => kachel(p, b))).join('')}</div>
  </main>
  <footer>Kasse = gesetzliche Versorgung mit Kassenanteil · Privat = Kostenvoranschlag nach GOZ</footer>`

// Erreichbarkeit: ein nicht laufender Planer wird markiert, nicht versteckt.
document.querySelectorAll<HTMLAnchorElement>('a.kachel').forEach((a) => {
  const status = a.querySelector<HTMLElement>('[data-status]')!
  const abbruch = new AbortController()
  const uhr = setTimeout(() => abbruch.abort(), 3000)
  fetch(a.dataset.url!, { mode: 'no-cors', cache: 'no-store', signal: abbruch.signal })
    .then(() => { status.textContent = 'erreichbar'; status.classList.add('an') })
    .catch(() => { status.textContent = 'nicht erreichbar'; status.classList.add('aus') })
    .finally(() => clearTimeout(uhr))
})
