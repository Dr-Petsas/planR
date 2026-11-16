/**
 * Superuser-Eingang: zwei Listen über die ganze Breite.
 * 1. Kunden: Name, Login, erstellte Pläne, Umsatz im laufenden Monat.
 * 2. Proben: Name, Login (falls vorhanden) und ein Popup mit dem hochgeladenen Plan und unserem Ergebnis.
 * Praxen sehen diese Seite nicht. Die öffentliche Ablage bleibt #probe.
 */
import './superuser.css'
import { logo } from './logo'
import { esc, planVergleich, popup, zeitText, type VergleichPlan } from './planVergleich'

interface Kunde {
  id: string
  art: 'kunde' | 'probe'
  plaeneAnzahl: number | null
  umsatzCent: number | null
  name: string
  login: { email: string; vorhanden: boolean } | null
  stammdaten: { label: string; wert: string }[]
  plaene: VergleichPlan[]
}

const ICON_PLAN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>'
const ICON_LOGIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>'

const cent = (n: number | null) => n === null ? '—' : (n / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
const zahl = (n: number | null) => n === null ? '—' : String(n)

function kopf(angemeldet: boolean) {
  const rechts = angemeldet
    ? `<span class="sb-wer">superuser angemeldet</span><button type="button" class="sb-knopf" data-abmelden>Abmelden</button>`
    : ''
  return `<header class="sb-kopf">
    <a class="sb-marke" href="/"><span class="sb-logo">${logo()}</span><span><b>PlanR</b><br><small>Superuser</small></span></a>
    <a class="sb-knopf" href="#probe">Probe-Seite</a>
    ${rechts}
  </header>`
}

function huelle(inhalt: string, angemeldet = false) {
  return `<div class="sb">${kopf(angemeldet)}<main class="sb-haupt">${inhalt}</main></div>`
}

function loginZelle(k: Kunde) {
  if (!k.login) return '<span class="sb-login fehlt">—</span>'
  return k.login.vorhanden
    ? `<span class="sb-login" title="${esc(k.login.email)}">${esc(k.login.email)}</span>`
    : `<span class="sb-login fehlt" title="Noch kein Login">${esc(k.login.email)} · kein Login</span>`
}

function knoepfe(k: Kunde) {
  const login = k.login?.vorhanden
    ? `<button type="button" class="sb-icon" data-sudo="${esc(k.login.email)}" title="Als diese Praxis in PlanR anmelden" aria-label="Kunden-Login">${ICON_LOGIN}</button>`
    : ''
  const plan = `<button type="button" class="sb-icon" data-auf="${esc(k.id)}" title="${k.art === 'probe' ? 'Hochgeladener Plan und unser Ergebnis' : 'Stammdaten und Pläne'}" aria-label="Ansehen">${ICON_PLAN}</button>`
  return `<span class="sb-tun">${login}${plan}</span>`
}

function kundenListe(kunden: Kunde[], monat: string) {
  if (!kunden.length) return '<p class="sb-leer">Noch keine Kunden.</p>'
  const zeilen = kunden.map((k) => `<div class="sb-zeile">
      <button type="button" class="sb-name" data-auf="${esc(k.id)}">${esc(k.name)}</button>
      ${loginZelle(k)}
      <span class="sb-zahl">${zahl(k.plaeneAnzahl)}</span>
      <span class="sb-zahl">${cent(k.umsatzCent)}</span>
      ${knoepfe(k)}
    </div>`).join('')
  return `<div class="sb-liste kunden">
    <div class="sb-zeile sb-kopfzeile"><span>Name</span><span>Login</span><span class="sb-zahl">Pläne erstellt</span><span class="sb-zahl">Umsatz ${esc(monat)}</span><span></span></div>
    ${zeilen}
  </div>`
}

function probenListe(proben: Kunde[]) {
  if (!proben.length) return '<p class="sb-leer">Noch keine Proben.</p>'
  const zeilen = proben.map((k) => `<div class="sb-zeile">
      <button type="button" class="sb-name" data-auf="${esc(k.id)}">${esc(k.name)}</button>
      ${loginZelle(k)}
      <span class="sb-zeit">${esc(k.plaene[0] ? zeitText(k.plaene[0].zeit) : '—')}</span>
      <span class="sb-zahl">${k.plaene.length}</span>
      ${knoepfe(k)}
    </div>`).join('')
  return `<div class="sb-liste proben">
    <div class="sb-zeile sb-kopfzeile"><span>Name</span><span>Login</span><span>Hochgeladen</span><span class="sb-zahl">Pläne</span><span></span></div>
    ${zeilen}
  </div>`
}

function anzahl(n: number, eins: string, viele: string) {
  return n === 1 ? `1 ${eins}` : `${n} ${viele}`
}

function listeZeichnen(alle: Kunde[], monat: string) {
  const kunden = alle.filter((k) => k.art !== 'probe')
  const proben = alle.filter((k) => k.art === 'probe')
  return huelle(`
    <p class="sb-meldung" data-sudo-meldung></p>
    <section class="sb-block">
      <header><h2>Kunden</h2><span>${anzahl(kunden.length, 'Kunde', 'Kunden')} · Umsatz netto, laufender Monat</span></header>
      ${kundenListe(kunden, monat)}
    </section>
    <section class="sb-block">
      <header><h2>Proben</h2><span>${anzahl(proben.length, 'Probe', 'Proben')} · hochgeladener Plan und unser Ergebnis im Popup</span></header>
      ${probenListe(proben)}
    </section>`, true)
}

function kundePopup(k: Kunde, sudo: (email: string, meldung: Element | null) => void) {
  const stamm = k.stammdaten.map((z) => `<div><dt>${esc(z.label)}</dt><dd>${esc(z.wert)}</dd></div>`).join('')
  const login = k.login?.vorhanden
    ? `<button type="button" class="sb-knopf voll" data-sudo="${esc(k.login.email)}">Kunden-Login öffnen</button><span class="sb-fehl">${esc(k.login.email)}</span>`
    : `<span class="sb-fehl">${k.login ? `Noch kein Login für ${esc(k.login.email)}.` : 'Kein Login hinterlegt.'}</span>`
  const plaene = k.plaene.map((p) => planVergleich(p, '/probe-eingang/')).join('')
    || '<p class="sb-fehl">Kein Plan hochgeladen.</p>'
  const d = popup(k.name, `
    <div class="sb-leiste">${login}<span class="sb-meldung" data-meldung></span></div>
    ${stamm ? `<dl class="sb-stamm">${stamm}</dl>` : ''}
    ${plaene}`)
  d.querySelector<HTMLButtonElement>('[data-sudo]')?.addEventListener('click', (e) => {
    sudo((e.currentTarget as HTMLElement).dataset.sudo ?? '', d.querySelector('[data-meldung]'))
  })
}

function anmeldungZeichnen(meldung: string) {
  return `<div class="sb">${kopf(false)}<main class="sb-tor"><form class="sb-anmelden" data-anmelden>
      <label>E-Mail-Adresse<input type="email" name="email" autocomplete="username" required></label>
      <label>Passwort<input type="password" name="passwort" autocomplete="current-password" required></label>
      <p class="sb-meldung" style="margin:0" data-meldung>${esc(meldung)}</p>
      <button type="submit" class="sb-knopf voll">Anmelden</button>
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

function verdrahten(app: HTMLElement, kunden: Kunde[]) {
  app.querySelector('[data-abmelden]')?.addEventListener('click', () => {
    void fetch('/api/probe/anmeldung', { method: 'DELETE' }).then(() => location.reload())
  })
  const sudo = async (email: string, meldung: Element | null) => {
    const r = await fetch('/api/probe/sudo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    }).catch(() => null)
    const d = await r?.json().catch(() => null) as { ok?: boolean; meldung?: string } | null
    if (d?.ok) { location.href = '/'; return }
    if (meldung) meldung.textContent = d?.meldung || 'Das Konto ließ sich nicht öffnen.'
  }
  for (const knopf of app.querySelectorAll<HTMLButtonElement>('[data-sudo]')) {
    knopf.addEventListener('click', () => { void sudo(knopf.dataset.sudo ?? '', app.querySelector('[data-sudo-meldung]')) })
  }
  for (const knopf of app.querySelectorAll<HTMLButtonElement>('[data-auf]')) {
    knopf.addEventListener('click', () => {
      const k = kunden.find((x) => x.id === knopf.dataset.auf)
      if (k) kundePopup(k, (email, meldung) => { void sudo(email, meldung) })
    })
  }
}

export function probeEingangSeite(app: HTMLElement) {
  document.body.classList.remove('planr-app', 'plan-offen', 'hp-body')
  document.documentElement.classList.remove('hp-html')
  document.body.classList.add('sb-body')
  document.title = 'PlanR – Superuser'
  app.innerHTML = huelle('<p class="sb-leer">Wird geladen …</p>')
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
      const d = await r.json() as { ok?: boolean; kunden?: Kunde[]; monat?: string }
      if (!r.ok || !d.ok || !Array.isArray(d.kunden)) throw new Error('liste')
      app.innerHTML = listeZeichnen(d.kunden, d.monat ?? '')
      verdrahten(app, d.kunden)
    } catch {
      app.innerHTML = huelle('<p class="sb-leer">Die Liste ist gerade nicht erreichbar.</p>')
    }
  })()
}
