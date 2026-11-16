/**
 * Betreiber-Ansicht der Probe: welche Pläne abgelegt wurden, und die Arztadresse, falls sie auf dem Plan steht.
 * Praxen sehen diese Seite nicht. Die öffentliche Ablage bleibt #probe.
 */
import './homepage.css'
import { logo, wortmarke } from './logo'

interface Stand {
  planart: string
  planer: string
  regler: { privatStufe: number; titel: string; gozFaktor: number }
  vorher: { gesamt?: number; honorar?: number; material?: number }
  nachher: { gesamt?: number; eigenanteil?: number; festzuschuss?: number }
}

interface Plan {
  id: string
  zeit: string
  dateiname: string
  stand?: Stand | null
}

interface Kunde {
  id: string
  name: string
  login: { email: string; vorhanden: boolean } | null
  stammdaten: { label: string; wert: string }[]
  plaene: Plan[]
}

const euro = (n?: number) => typeof n === 'number'
  ? n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
  : '—'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function kopf(angemeldet: boolean) {
  const rechts = angemeldet
    ? `<span class="pe-wer">superuser angemeldet</span><button type="button" class="pe-abmelden" data-abmelden>Abmelden</button>`
    : ''
  return `<header class="hp-nav">
    <a class="hp-marke" href="/"><span class="hp-logo">${logo()}</span>${wortmarke()}<small>Probe</small></a>
    <nav>
      <a href="#probe">Probe-Seite</a>
      ${rechts}
    </nav>
  </header>`
}

function zeitText(iso: string) {
  const zeit = new Date(iso)
  if (Number.isNaN(zeit.getTime())) return iso
  return zeit.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })
}

function balken(vorher?: number, nachher?: number) {
  const max = Math.max(vorher ?? 0, nachher ?? 0, 1)
  const breite = (n?: number) => `${Math.max(2, Math.round(((n ?? 0) / max) * 100))}%`
  return `<div class="pe-balken">
    <p><span>Vorher</span><i style="width:${breite(vorher)}"></i><b>${euro(vorher)}</b></p>
    <p class="pe-nach"><span>Nachher</span><i style="width:${breite(nachher)}"></i><b>${euro(nachher)}</b></p>
  </div>`
}

function regler(stand: Stand) {
  const punkte = [0, 1, 2, 3, 4, 5].map((n) => `<span class="${n <= stand.regler.privatStufe ? 'an' : ''}"></span>`).join('')
  return `<div class="pe-regler"><b>Kasse → Privat · ${esc(stand.regler.titel || 'Stufe ' + stand.regler.privatStufe)}</b><div class="pe-punkte">${punkte}</div></div>`
}

function planAnsicht(plan: Plan) {
  const stand = plan.stand
  const gerechnet = stand
    ? `<h3>Gerechnet · ${esc(stand.planer || 'PlanR')}</h3>${regler(stand)}${balken(stand.vorher.gesamt, stand.nachher.gesamt)}
       <p class="pe-meta">Honorar ${euro(stand.vorher.honorar)} · Material ${euro(stand.vorher.material)} · Eigenanteil ${euro(stand.nachher.eigenanteil)} · Festzuschuss ${euro(stand.nachher.festzuschuss)}</p>`
    : '<h3>Gerechnet</h3><p class="pe-fehl">Noch keine Rechnung. Der Kunde hat den Plan nicht bis zum Ergebnis gesehen.</p>'
  return `<article class="pe-karte">
    <div class="pe-kopf"><b class="pe-datei">${esc(plan.dateiname || 'Plan')}</b><span class="pe-zeit">${esc(zeitText(plan.zeit))}</span></div>
    <div class="pe-vergleich">
      <div class="pe-blatt"><h3>Hochgeladen</h3><iframe class="pe-rahmen" title="Hochgeladener Plan" src="/probe-eingang/${esc(plan.id)}"></iframe></div>
      <div class="pe-ergebnis">${gerechnet}</div>
    </div>
  </article>`
}

function kundeAnsicht(kunde: Kunde, offen: boolean) {
  const stamm = kunde.stammdaten.map((z) => `<div><dt>${esc(z.label)}</dt><dd>${esc(z.wert)}</dd></div>`).join('')
    || '<p class="pe-fehl">Keine Stammdaten hinterlegt.</p>'
  const login = kunde.login?.vorhanden
    ? `<button type="button" class="pe-konto" data-sudo="${esc(kunde.login.email)}">Kunden-Login</button>`
    : `<p class="pe-fehl">${kunde.login ? `Noch kein Login für ${esc(kunde.login.email)}.` : 'Kein Login hinterlegt.'}</p>`
  const plaene = kunde.plaene.map(planAnsicht).join('') || '<p class="pe-fehl">Noch kein Plan hochgeladen.</p>'
  return `<section class="pe-kunde" data-kunde="${esc(kunde.id)}"${offen ? '' : ' hidden'}>
    <h2>${esc(kunde.name)}</h2>
    <dl class="pe-stamm">${stamm}</dl>
    ${login}
    ${plaene}
  </section>`
}

function huelle(inhalt: string, angemeldet = false) {
  return `<div class="hp">${kopf(angemeldet)}<main class="pe-haupt">${inhalt}</main></div>`
}

function listeZeichnen(kunden: Kunde[]) {
  const namen = kunden.map((k, i) => `<button type="button" data-name="${esc(k.id)}" class="${i === 0 ? 'aktiv' : ''}">${esc(k.name)}</button>`).join('')
    || '<p class="pe-fehl">Noch keine Kunden.</p>'
  const details = kunden.map((k, i) => kundeAnsicht(k, i === 0)).join('')
  return huelle(`
    <p class="hp-eyebrow">Nur für den Betreiber</p>
    <h1>Kunden</h1>
    <p class="pe-lead">${kunden.length === 1 ? '1 Kunde' : `${kunden.length} Kunden`}. Ein Klick öffnet Stammdaten, den hochgeladenen Plan, die Rechnung und den Login, falls es einen gibt.</p>
    <p class="pe-hinweis" data-sudo-meldung></p>
    <div class="pe-kunden">
      <nav class="pe-namen">${namen}</nav>
      <div class="pe-detail">${details}</div>
    </div>`, true)
}

function anmeldungZeichnen(meldung: string) {
  return `<div class="hp">${kopf(false)}<main class="pe-tor"><form class="pe-anmelden" data-anmelden>
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
      const r = await fetch('/api/probe/anmeldung', {
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

function abmeldenVerdrahten(app: HTMLElement) {
  app.querySelector('[data-abmelden]')?.addEventListener('click', () => {
    void fetch('/api/probe/anmeldung', { method: 'DELETE' }).then(() => location.reload())
  })
}

function sudoVerdrahten(app: HTMLElement) {
  const senden = async (email: string, meldung: Element | null) => {
    const r = await fetch('/api/probe/sudo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    }).catch(() => null)
    const d = await r?.json().catch(() => null) as { ok?: boolean; meldung?: string } | null
    if (d?.ok) { location.href = '/'; return }
    if (meldung) meldung.textContent = d?.meldung || 'Das Konto ließ sich nicht öffnen.'
  }
  for (const name of app.querySelectorAll<HTMLButtonElement>('[data-name]')) {
    name.addEventListener('click', () => {
      for (const anderer of app.querySelectorAll<HTMLButtonElement>('[data-name]')) anderer.classList.toggle('aktiv', anderer === name)
      for (const feld of app.querySelectorAll<HTMLElement>('[data-kunde]')) feld.hidden = feld.dataset.kunde !== name.dataset.name
    })
  }
  for (const knopf of app.querySelectorAll<HTMLButtonElement>('[data-sudo]')) {
    knopf.addEventListener('click', () => { void senden(knopf.dataset.sudo ?? '', app.querySelector('[data-sudo-meldung]')) })
  }
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
        app.innerHTML = anmeldungZeichnen('Praxis-Konten können diesen Eingang nicht öffnen. Hier meldet sich nur der Superuser an.')
        anmeldungVerdrahten(app)
        return
      }
      const d = await r.json() as { ok?: boolean; kunden?: Kunde[] }
      if (!r.ok || !d.ok || !Array.isArray(d.kunden)) throw new Error('liste')
      app.innerHTML = listeZeichnen(d.kunden)
      abmeldenVerdrahten(app)
      sudoVerdrahten(app)
    } catch {
      app.innerHTML = huelle('<p class="pe-fehl">Die Liste ist gerade nicht erreichbar.</p>')
    }
  })()
}
