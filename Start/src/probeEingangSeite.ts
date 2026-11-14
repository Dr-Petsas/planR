/**
 * Betreiber-Ansicht der Probe: welche Pläne abgelegt wurden, und die Arztadresse, falls sie auf dem Plan steht.
 * Praxen sehen diese Seite nicht. Die öffentliche Ablage bleibt #probe.
 */
import './homepage.css'
import { logo, wortmarke } from './logo'

interface Kontakt {
  name: string
  praxis: string
  telefon: string
  email: string
  anschrift: string
}

interface Plan {
  id: string
  zeit: string
  dateiname: string
  kontakt: Kontakt
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function kopf() {
  return `<header class="hp-nav">
    <a class="hp-marke" href="/"><span class="hp-logo">${logo()}</span>${wortmarke()}<small>Probe</small></a>
    <nav>
      <a href="#probe">Probe-Seite</a>
    </nav>
  </header>`
}

function zeitText(iso: string) {
  const zeit = new Date(iso)
  if (Number.isNaN(zeit.getTime())) return iso
  return zeit.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })
}

function karte(plan: Plan) {
  const k = plan.kontakt
  const adresse = k.anschrift.trim()
  const name = k.name.trim()
  const praxis = k.praxis.trim() && k.praxis.trim() !== name ? k.praxis.trim() : ''
  const zeilen = [
    name ? `<p class="pe-name">${esc(name)}</p>` : '',
    praxis ? `<p class="pe-meta">${esc(praxis)}</p>` : '',
    adresse ? `<p class="pe-adresse">${esc(adresse)}</p>` : '<p class="pe-fehl">Auf diesem Plan war keine Arztadresse lesbar.</p>',
    k.telefon.trim() ? `<p class="pe-meta">Telefon ${esc(k.telefon.trim())}</p>` : '',
    k.email.trim() ? `<p class="pe-meta">${esc(k.email.trim())}</p>` : '',
  ].filter(Boolean).join('')
  return `<article class="pe-karte">
    <div class="pe-kopf"><b class="pe-datei">${esc(plan.dateiname || 'Plan')}</b><span class="pe-zeit">${esc(zeitText(plan.zeit))}</span></div>
    ${zeilen}
    <a class="pe-oeffnen" href="/probe-eingang/${esc(plan.id)}" target="_blank" rel="noopener">Plan öffnen</a>
  </article>`
}

function huelle(inhalt: string) {
  return `<div class="hp">${kopf()}<main class="pe-haupt">${inhalt}</main></div>`
}

function listeZeichnen(plaene: Plan[]) {
  const stand = plaene.length === 1 ? '1 Plan' : `${plaene.length} Pläne`
  const karten = plaene.map(karte).join('') || '<p class="pe-fehl">Noch hat niemand einen Plan auf der Probe-Seite abgelegt.</p>'
  return huelle(`
    <p class="hp-eyebrow">Nur für den Betreiber</p>
    <h1>Eingegangene Pläne</h1>
    <p class="pe-lead">${stand} von der Probe-Seite. Steht auf dem Plan eine Praxisadresse, steht sie hier. Angaben aus dem Versichertenblock werden nicht übernommen.</p>
    <div class="pe-liste">${karten}</div>`)
}

function anmeldungZeichnen(meldung: string) {
  return `<div class="hp">${kopf()}<main class="pe-tor"><form class="pe-anmelden" data-anmelden>
      <label>E-Mail-Adresse<input type="email" name="email" autocomplete="username" required></label>
      <label>Passwort<input type="password" name="passwort" autocomplete="current-password" required></label>
      <p class="pe-hinweis" data-meldung>${esc(meldung)}</p>
      <button type="submit">Anmelden</button>
    </form></main></div>`
}

function anmeldungVerdrahten(app: HTMLElement) {
  const form = app.querySelector<HTMLFormElement>('[data-anmelden]')
  if (!form) return
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const knopf = form.querySelector('button')
    if (knopf) knopf.disabled = true
    const feld = (name: string) => form.querySelector<HTMLInputElement>(`[name=${name}]`)?.value ?? ''
    const meldung = form.querySelector('[data-meldung]')
    try {
      const r = await fetch('/api/anmeldung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: feld('email').trim(), passwort: feld('passwort') }),
      })
      const d = await r.json() as { ok?: boolean; meldung?: string }
      if (d.ok) {
        location.reload()
        return
      }
      if (meldung) meldung.textContent = d.meldung || 'Anmeldung hat nicht geklappt.'
    } catch {
      if (meldung) meldung.textContent = 'Keine Verbindung zu PlanR.'
    }
    if (knopf) knopf.disabled = false
  })
}

export function probeEingangSeite(app: HTMLElement) {
  document.body.classList.add('hp-body')
  document.documentElement.classList.add('hp-html')
  document.body.classList.remove('planr-app', 'plan-offen')
  document.title = 'PlanR – Eingegangene Pläne'
  app.innerHTML = huelle('<p class="pe-lead">Wird geladen …</p>')
  void (async () => {
    try {
      const r = await fetch('/api/probe/eingang', { cache: 'no-store' })
      if (r.status === 401) {
        app.innerHTML = anmeldungZeichnen('')
        anmeldungVerdrahten(app)
        return
      }
      if (r.status === 403) {
        app.innerHTML = huelle('<p class="pe-fehl">Dieser Bereich gehört zum Betreiber der Probe, nicht zu einem Praxis-Konto.</p>')
        return
      }
      const d = await r.json() as { ok?: boolean; plaene?: Plan[] }
      if (!r.ok || !d.ok || !Array.isArray(d.plaene)) throw new Error('liste')
      app.innerHTML = listeZeichnen(d.plaene)
    } catch {
      app.innerHTML = huelle('<p class="pe-fehl">Die Liste ist gerade nicht erreichbar.</p>')
    }
  })()
}
