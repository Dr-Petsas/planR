/** Anmeldung mit dem Pickadoc-Konto; neue Praxen registrieren sich über die PlanR-Startseite. */

import { logo } from './logo'

export interface Ich {
  konto: { name: string; email: string; admin: boolean }
  mandant: string
  /** DS-Win-Praxen, die der Benutzer sieht; null = alle, [] = noch nicht freigeschaltet */
  praxen: number[] | null
  praxisNamen: Record<string, string>
  /** Sprach-KI: volle Clara (MAS), HKP-Assistentin (PlanR mit Sprach-KI) oder keine */
  clara?: 'voll' | 'planr' | 'aus'
  /** 'planr' = PlanR-Abo ohne MAS (eigene Rechnungen), 'mas' = über Pickadoc MAS */
  abo?: 'planr' | 'mas' | ''
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Grund, warum eine bestehende Sitzung nicht mehr gilt (z. B. Buchung beendet) – für die Anmeldeseite */
export let sitzungHinweis = ''
export const sitzungHinweisLoeschen = () => { sitzungHinweis = '' }

export async function ichLaden(): Promise<Ich | null> {
  const r = await fetch('/api/anmeldung', { cache: 'no-store' })
  if (r.status === 401) {
    sitzungHinweis = String((await r.json().catch(() => ({})) as { meldung?: unknown }).meldung ?? '')
    return null
  }
  const d = await r.json() as Ich & { ok: boolean }
  if (!d.ok) throw new Error('anmeldung')
  return d
}

/** Pickadoc-Oberflächen, die PlanR mit ihrer Anmeldung öffnen dürfen */
const PICKADOC = ['https://cal.pickadoc.de', 'https://docgenda.web.app', 'https://docgenda.firebaseapp.com', 'http://localhost:3000']

/**
 * Aus Pickadoc (Sophie) geöffnet (`#pickadoc`), als eigener Tab oder eingebettet unter der Pickadoc-Leiste:
 * PlanR meldet sich beim öffnenden bzw. umgebenden Fenster und bekommt dessen Firebase-Sitzung per
 * postMessage – nie über die Adresse, damit nichts im Verlauf landet.
 */
export function ausPickadoc(): Promise<boolean> {
  if (location.hash !== '#pickadoc') return Promise.resolve(false)
  history.replaceState(null, '', location.pathname + location.search)
  const opener = (window.opener as Window | null) ?? (window.parent !== window ? window.parent : null)
  if (!opener) return Promise.resolve(false)
  return new Promise((fertig) => {
    const ende = (ok: boolean) => { window.removeEventListener('message', empfang); clearTimeout(uhr); fertig(ok) }
    const uhr = window.setTimeout(() => ende(false), 10_000)
    const empfang = async (ev: MessageEvent) => {
      const d = ev.data as { art?: unknown; refreshToken?: unknown } | null
      if (ev.source !== opener || !PICKADOC.includes(ev.origin) || d?.art !== 'planr-sitzung' || typeof d.refreshToken !== 'string') return
      const r = await fetch('/api/anmeldung', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uebergabe: d.refreshToken }),
      }).catch(() => null)
      ende(!!r?.ok)
    }
    window.addEventListener('message', empfang)
    for (const ziel of PICKADOC) {
      try { opener.postMessage({ art: 'planr-bereit' }, ziel) } catch { /* anderes Fenster */ }
    }
  })
}

export async function abmelden() {
  await fetch('/api/anmeldung', { method: 'DELETE' }).catch(() => undefined)
  location.reload()
}

/** Läuft die Sitzung ab (anderes Gerät abgemeldet, Konto gesperrt), zeigt PlanR wieder die Anmeldung. */
export function sitzungBewachen() {
  const original = window.fetch.bind(window)
  window.fetch = async (eingabe, init) => {
    const r = await original(eingabe, init)
    const url = typeof eingabe === 'string' ? eingabe : eingabe instanceof URL ? eingabe.href : eingabe.url
    if (r.status === 401 && url.startsWith('/api/') && !url.startsWith('/api/anmeldung')) {
      anmeldeSeite(document.querySelector<HTMLElement>('#app')!, 'Ihre Anmeldung ist abgelaufen. Bitte erneut anmelden.')
    }
    return r
  }
}

const formular = (hinweis: string, popup: boolean) => `
      <form class="wahl-karte anmelde-karte" data-anmelden novalidate>
        ${popup ? '<button type="button" class="anmelde-zu" aria-label="Schließen" data-zu>×</button>' : ''}
        <div class="marke"><span class="logo">${logo()}</span><div><h1 id="anmelde-titel">PlanR</h1><p>Heil- und Kostenpläne</p></div></div>
        <h2>Anmelden</h2>
        <p class="anmelde-text">Mit Ihrem Pickadoc-Konto – am Praxis-PC, zu Hause oder am Handy.</p>
        <label class="feld">E-Mail-Adresse
          <input type="email" name="email" autocomplete="username" required autofocus>
        </label>
        <label class="feld">Passwort
          <input type="password" name="passwort" autocomplete="current-password" required>
        </label>
        <p class="anmelde-meldung" role="alert" data-meldung>${esc(hinweis)}</p>
        <button type="submit" class="neu-knopf">Anmelden</button>
        <button type="button" class="link-knopf" data-vergessen>Passwort vergessen?</button>
        <p class="anmelde-neu">Noch kein Konto? <a href="#buchen">PlanR für Ihre Praxis buchen</a></p>
        ${popup ? '' : '<p class="anmelde-neu"><a href="#top">← Zur Startseite</a></p>'}
      </form>`

export function anmeldeSeite(app: HTMLElement, hinweis = '') {
  app.innerHTML = `<div class="anmelde-seite">${formular(hinweis, false)}</div>`
  formularVerdrahten(app.querySelector<HTMLFormElement>('[data-anmelden]')!)
}

let popupSchliessen: (() => void) | undefined

/** Anmeldung als Fenster über der Startseite; `zu` läuft, wenn der Besucher es schließt. */
export function anmeldePopup(hinweis: string, zu: () => void) {
  anmeldePopupEntfernen()
  const huelle = document.createElement('div')
  huelle.className = 'anmelde-popup'
  huelle.setAttribute('role', 'dialog')
  huelle.setAttribute('aria-modal', 'true')
  huelle.setAttribute('aria-labelledby', 'anmelde-titel')
  huelle.innerHTML = `<div class="anmelde-popup-hg" data-zu></div>${formular(hinweis, true)}`
  document.body.append(huelle)
  document.body.classList.add('popup-offen')
  const form = huelle.querySelector<HTMLFormElement>('[data-anmelden]')!
  formularVerdrahten(form)
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') schliessen() }
  const schliessen = () => { anmeldePopupEntfernen(); zu() }
  for (const el of huelle.querySelectorAll('[data-zu]')) el.addEventListener('click', schliessen)
  document.addEventListener('keydown', taste)
  popupSchliessen = () => {
    document.removeEventListener('keydown', taste)
    huelle.remove()
    document.body.classList.remove('popup-offen')
  }
  form.querySelector<HTMLInputElement>('[name=email]')!.focus()
}

export function anmeldePopupEntfernen() {
  popupSchliessen?.()
  popupSchliessen = undefined
}

function formularVerdrahten(form: HTMLFormElement) {
  const meldung = (text: string) => { form.querySelector('[data-meldung]')!.textContent = text }
  const feld = (n: string) => form.querySelector<HTMLInputElement>(`[name=${n}]`)!
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const knopf = form.querySelector<HTMLButtonElement>('button[type=submit]')!
    knopf.disabled = true
    meldung('')
    try {
      const r = await fetch('/api/anmeldung', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: feld('email').value.trim(), passwort: feld('passwort').value }),
      })
      const d = await r.json() as { ok: boolean; meldung?: string }
      if (d.ok) return location.reload()
      meldung(d.meldung || 'Anmeldung hat nicht geklappt.')
    } catch {
      meldung('Keine Verbindung zu PlanR.')
    }
    knopf.disabled = false
  })
  form.querySelector('[data-vergessen]')!.addEventListener('click', async () => {
    const email = feld('email').value.trim()
    if (!email.includes('@')) return meldung('Bitte zuerst die E-Mail-Adresse Ihres Pickadoc-Kontos eintragen.')
    const d = await fetch('/api/passwort-vergessen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    }).then((r) => r.json() as Promise<{ meldung?: string }>).catch(() => ({ meldung: 'Keine Verbindung zu PlanR.' }))
    meldung(d.meldung || '')
  })
}

// ---------- Benutzer und Praxen (Praxis-Admin) ----------

export interface BenutzerZeile { uid: string; email: string; name: string; role: string; praxen: number[] | null; zuletzt: string; ich: boolean }
export interface PraxisZeile { nummer: number; name?: string; kzvNr?: string; patienten?: number }

export async function benutzerLaden(): Promise<{ praxen: PraxisZeile[]; benutzer: BenutzerZeile[] } | null> {
  try {
    const d = await (await fetch('/api/benutzer', { cache: 'no-store' })).json() as { ok: boolean; praxen?: PraxisZeile[]; benutzer?: BenutzerZeile[] }
    return d.ok ? { praxen: d.praxen ?? [], benutzer: d.benutzer ?? [] } : null
  } catch {
    return null
  }
}

export async function benutzerZuordnen(uid: string, praxen: number[] | null): Promise<string> {
  try {
    const d = await (await fetch('/api/benutzer', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, praxen }),
    })).json() as { ok: boolean; meldung?: string }
    return d.ok ? '' : d.meldung || 'Zuordnung hat nicht geklappt.'
  } catch {
    return 'Keine Verbindung.'
  }
}

/** Abschnitt in den Einstellungen: nur bei mehreren Praxen auf dem PVS-Server nötig. */
export function benutzerBlock(daten: { praxen: PraxisZeile[]; benutzer: BenutzerZeile[] } | null): string {
  if (!daten) return ''
  const { praxen, benutzer } = daten
  if (praxen.length < 2) {
    return `<fieldset class="katalog"><legend>Benutzer</legend>
      <p class="pvs-info">Jeder mit einem Konto Ihrer Praxis kann sich anmelden${benutzer.length ? ` – bisher: ${benutzer.map((b) => esc(b.name || b.email)).join(', ')}` : ''}.
      Liegen auf dem PVS-Server mehrere Praxen (Praxisgemeinschaft), ordnen Sie hier zu, wer welche sieht.</p></fieldset>`
  }
  return `<fieldset class="katalog benutzer"><legend>Benutzer &amp; Praxen</legend>
    <p class="pvs-info">Auf dem PVS-Server liegen ${praxen.length} Praxen. Jeder sieht nur Patienten, HKPs und Pläne der angehakten Praxen; wer sich neu anmeldet, sieht nichts, bis er hier freigeschaltet ist.</p>
    <div class="benutzer-tabelle">
      <div class="benutzer-zeile kopfzeile"><span>Benutzer</span>${praxen.map((p) => `<span title="${esc(`${p.name ?? ''} · KZV ${p.kzvNr ?? '–'} · ${p.patienten ?? 0} Patienten`)}">${esc(p.name || `Praxis ${p.nummer}`)}</span>`).join('')}</div>
      ${benutzer.map((b) => `<div class="benutzer-zeile">
        <span><b>${esc(b.name || b.email)}</b>${b.ich ? ' <small>(Sie)</small>' : ''}<small>${esc(b.email)}${b.praxen === null ? ' · noch nicht freigeschaltet' : ''}</small></span>
        ${praxen.map((p) => `<label><input type="checkbox" data-zuordnung="${esc(b.uid)}" value="${p.nummer}"${b.praxen?.includes(p.nummer) ? ' checked' : ''}></label>`).join('')}
      </div>`).join('')}
    </div></fieldset>`
}
