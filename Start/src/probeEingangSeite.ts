/**
 * Superuser-Eingang: zwei Listen über die ganze Breite.
 * 1. Kunden: Name, Login, erstellte Pläne, Umsatz im laufenden Monat.
 * 2. MAS-Zugänge: Pickadoc-Anmeldungen ohne PlanR-Buchung.
 * 3. Proben: Name, Login (falls vorhanden) und ein Popup mit dem hochgeladenen Plan und unserem Ergebnis.
 * Praxen sehen diese Seite nicht. Die öffentliche Ablage bleibt #probe.
 */
import './superuser.css'
import { logo } from './logo'
import { esc, planVergleich, popup, zeitText, type VergleichPlan } from './planVergleich'
import type { FunnelBericht, FunnelKanal, FunnelSchritt, SchrittZaehler } from '../funnel'

interface Kunde {
  id: string
  art: 'kunde' | 'probe' | 'mas'
  plaeneAnzahl: number | null
  umsatzCent: number | null
  name: string
  login: { email: string; vorhanden: boolean } | null
  stammdaten: { label: string; wert: string }[]
  plaene: VergleichPlan[]
  /** PlanR-Konto der Buchung: für den Superuser zu öffnen, gesperrt? */
  konto?: { email: string; zugang: boolean; gesperrt: boolean } | null
}

/** Adresse, unter der der Superuser dieses Konto öffnet; leer = PlanR kennt die Pickadoc-Praxis nicht */
const sudoAdresse = (k: Kunde) => k.login?.vorhanden ? k.login.email : k.konto?.zugang ? k.konto.email : ''

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
    <a class="sb-knopf" href="/#plaene">Planübersicht</a>
    <a class="sb-knopf" href="#probe">Probe-Seite</a>
    ${rechts}
  </header>`
}

function huelle(inhalt: string, angemeldet = false) {
  return `<div class="sb">${kopf(angemeldet)}<main class="sb-haupt">${inhalt}</main></div>`
}

function loginZelle(k: Kunde) {
  if (!k.login) return '<span class="sb-login fehlt">—</span>'
  const sperre = k.konto?.gesperrt ? ' · <b class="sb-gesperrt">gesperrt</b>' : ''
  if (k.login.vorhanden) return `<span class="sb-login" title="${esc(k.login.email)}">${esc(k.login.email)}${sperre}</span>`
  return k.konto?.zugang
    ? `<span class="sb-login fehlt" title="Die Praxis hat sich noch nicht selbst angemeldet">${esc(k.login.email)} · noch nie angemeldet${sperre}</span>`
    : `<span class="sb-login fehlt" title="Noch kein Login">${esc(k.login.email)} · kein Login${sperre}</span>`
}

function knoepfe(k: Kunde) {
  const email = k.login?.email ?? ''
  if (k.art === 'mas' && k.konto) {
    return `<span class="sb-tun"><button type="button" class="sb-knopf voll" data-sudo="${esc(k.konto.email)}">Betreten</button></span>`
  }
  if (k.art !== 'probe' && k.konto) {
    const adresse = k.konto.email
    return `<span class="sb-tun">
      <button type="button" class="sb-knopf voll" data-sudo="${esc(adresse)}">Betreten</button>
      <button type="button" class="sb-knopf" data-sperren="${esc(adresse)}" data-gesperrt="${k.konto.gesperrt ? '1' : '0'}">${k.konto.gesperrt ? 'Entsperren' : 'Sperren'}</button>
      <button type="button" class="sb-knopf rot" data-loeschen="${esc(adresse)}" data-name="${esc(k.name)}">Löschen</button>
    </span>`
  }
  const login = k.art === 'probe'
    ? `<button type="button" class="sb-icon" data-probe-login="${esc(k.id)}" title="Vollständiger Demo-Account ${esc(email)}, Passwort 12345678" aria-label="Demo-Login">${ICON_LOGIN}</button>`
    : sudoAdresse(k)
      ? `<button type="button" class="sb-icon" data-sudo="${esc(sudoAdresse(k))}" title="Als diese Praxis in PlanR anmelden" aria-label="Kunden-Login">${ICON_LOGIN}</button>`
      : ''
  const plan = `<button type="button" class="sb-icon" data-auf="${esc(k.id)}" title="${k.art === 'probe' ? 'Hochgeladener Plan und unser Ergebnis' : 'Stammdaten und Pläne'}" aria-label="Ansehen">${ICON_PLAN}</button>`
  const weg = k.art === 'probe'
    ? `<button type="button" class="sb-knopf rot" data-probe-loeschen="${esc(k.id)}" data-name="${esc(k.name)}">Löschen</button>`
    : ''
  return `<span class="sb-tun">${login}${plan}${weg}</span>`
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

function masListe(konten: Kunde[]) {
  if (!konten.length) return '<p class="sb-leer">Keine Pickadoc-Anmeldung ohne Buchung.</p>'
  const wert = (k: Kunde, label: string) => k.stammdaten.find((z) => z.label === label)?.wert ?? '—'
  const zeilen = konten.map((k) => `<div class="sb-zeile">
      <button type="button" class="sb-name" data-auf="${esc(k.id)}">${esc(k.name)}</button>
      ${loginZelle(k)}
      <span>${esc(wert(k, 'Rolle'))}</span>
      <span class="sb-zeit">${esc(wert(k, 'Zuletzt'))}</span>
      ${knoepfe(k)}
    </div>`).join('')
  return `<div class="sb-liste mas">
    <div class="sb-zeile sb-kopfzeile"><span>Name</span><span>Login</span><span>Rolle</span><span>Zuletzt</span><span></span></div>
    ${zeilen}
  </div>`
}

function probenListe(proben: Kunde[]) {
  if (!proben.length) return '<p class="sb-leer">Noch keine Probe-Interessenten.</p>'
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

const FUNNEL_LABELS: [FunnelSchritt, string][] = [
  ['start', 'Startseite'],
  ['kalkulator', 'Kalkulator'],
  ['probe', 'Probe geöffnet'],
  ['beispiel', 'Beispiel-HKP'],
  ['upload', 'Eigener Upload'],
  ['buchung_start', 'Buchung gestartet'],
  ['buchung_ok', 'Gebucht'],
]
const ZEITRAEUME: ['heute' | 'tage7' | 'tage30', string][] = [
  ['heute', 'Heute'],
  ['tage7', '7 Tage'],
  ['tage30', '30 Tage'],
]
const KANAELE: ['alle' | FunnelKanal, string][] = [
  ['alle', 'Alle Kanäle'],
  ['ads', 'Google Ads'],
  ['organisch', 'Organisch'],
  ['direkt', 'Direkt'],
  ['empfehlung', 'Empfehlung'],
]

function prozent(teil: number, basis: number): string {
  if (basis <= 0 || teil <= 0) return '—'
  const p = Math.min(100, (teil / basis) * 100)
  return `${p >= 10 ? Math.round(p) : p.toFixed(1).replace('.', ',')} %`
}

function funnelBlock(bericht: FunnelBericht | null, zeitraum: 'heute' | 'tage7' | 'tage30', kanal: 'alle' | FunnelKanal): string {
  if (!bericht) return ''
  const bereich = bericht[zeitraum]
  const z: SchrittZaehler = kanal === 'alle' ? bereich.gesamt : bereich.kanaele[kanal]
  const basis = Math.max(z.start, z.probe, z.buchung_start, z.buchung_ok, 0)
  const karten = FUNNEL_LABELS.map(([key, label]) => {
    const n = z[key] ?? 0
    const breite = basis > 0 ? Math.min(100, Math.round((n / basis) * 100)) : 0
    const quote = key === 'start' ? (n > 0 ? '100 %' : '—') : prozent(n, z.start || basis)
    return `<div class="sb-funnel-karte${key === 'buchung_ok' ? ' sb-funnel-ziel' : ''}">
      <small>${esc(label)}</small>
      <b>${n.toLocaleString('de-DE')}</b>
      <span>${esc(quote)}</span>
      <i style="width:${breite}%"></i>
    </div>`
  }).join('')
  const kampagnen = bericht.kampagnen30.length
    ? `<div class="sb-funnel-kampagnen">
        <h3>Kampagnen (30 Tage, utm_campaign)</h3>
        <div class="sb-liste sb-kampagnen-liste">
          <div class="sb-zeile sb-kopfzeile"><span>Kampagne</span><span class="sb-zahl">Start</span><span class="sb-zahl">Probe</span><span class="sb-zahl">Beispiel</span><span class="sb-zahl">Upload</span><span class="sb-zahl">Buchung</span></div>
          ${bericht.kampagnen30.map((k) => `<div class="sb-zeile">
            <span>${esc(k.name)}</span>
            <span class="sb-zahl">${k.zaehler.start}</span>
            <span class="sb-zahl">${k.zaehler.probe}</span>
            <span class="sb-zahl">${k.zaehler.beispiel}</span>
            <span class="sb-zahl">${k.zaehler.upload}</span>
            <span class="sb-zahl"><b>${k.zaehler.buchung_ok}</b></span>
          </div>`).join('')}
        </div>
      </div>`
    : ''
  return `<section class="sb-block sb-funnel" data-funnel-block>
    <header>
      <h2>Besucher-Funnel</h2>
      <span>Cookie-frei, aggregiert (Stand ${esc(bericht.heuteDatum)}) · Google Ads &amp; organisch</span>
    </header>
    <div class="sb-funnel-filter">
      <div class="sb-pills" role="group" aria-label="Zeitraum">${ZEITRAEUME.map(([id, label]) =>
        `<button type="button" class="sb-pill${id === zeitraum ? ' aktiv' : ''}" data-funnel-zeit="${id}">${esc(label)}</button>`).join('')}</div>
      <div class="sb-pills" role="group" aria-label="Kanal">${KANAELE.map(([id, label]) =>
        `<button type="button" class="sb-pill${id === kanal ? ' aktiv' : ''}" data-funnel-kanal="${id}">${esc(label)}</button>`).join('')}</div>
    </div>
    <div class="sb-funnel-grid">${karten}</div>
    ${kampagnen}
  </section>`
}

function listeZeichnen(alle: Kunde[], monat: string, funnel: FunnelBericht | null, zeitraum: 'heute' | 'tage7' | 'tage30' = 'tage7', kanal: 'alle' | FunnelKanal = 'alle') {
  const kunden = alle.filter((k) => k.art === 'kunde')
  const mas = alle.filter((k) => k.art === 'mas')
  const proben = alle.filter((k) => k.art === 'probe')
  return huelle(`
    <p class="sb-meldung" data-sudo-meldung></p>
    ${funnelBlock(funnel, zeitraum, kanal)}
    <section class="sb-block">
      <header><h2>Kunden</h2><span>${anzahl(kunden.length, 'Kunde', 'Kunden')} · Umsatz netto, laufender Monat</span></header>
      ${kundenListe(kunden, monat)}
    </section>
    <section class="sb-block">
      <header><h2>MAS-Zugänge</h2><span>${anzahl(mas.length, 'Zugang', 'Zugänge')} · Pickadoc-Anmeldung ohne PlanR-Buchung</span></header>
      ${masListe(mas)}
    </section>
    <section class="sb-block">
      <header><h2>Probe-Interessenten</h2><span>${anzahl(proben.length, 'Interessent', 'Interessenten')} · Login und hochgeladene Pläne</span></header>
      ${probenListe(proben)}
    </section>`, true)
}

function kundePopup(k: Kunde, sudo: (email: string, meldung: Element | null) => void) {
  const stamm = k.stammdaten.map((z) => `<div><dt>${esc(z.label)}</dt><dd>${esc(z.wert)}</dd></div>`).join('')
  const login = k.art === 'probe'
    ? `<button type="button" class="sb-knopf voll" data-probe-login="${esc(k.id)}">Demo-Login öffnen</button><span class="sb-fehl">${esc(k.login?.email ?? '')} · Passwort 12345678</span>`
    : `<span class="sb-fehl">${k.login?.email ? esc(k.login.email) : 'Kein Login hinterlegt.'}</span>`
  const plaene = k.art === 'mas'
    ? ''
    : (k.plaene.map((p) => planVergleich(p, '/probe-eingang/')).join('') || '<p class="sb-fehl">Kein Plan hochgeladen.</p>')
  // Der Fall: alle Uploads dieser Praxis im echten Planer. Derselbe Link geht an den Zahnarzt.
  const fall = k.plaene.length ? `<section class="sb-fall">
      <div class="sb-fall-kopf"><b>Ergebnis im Planer</b>
        <a class="sb-knopf voll" data-voll target="_blank" rel="noopener" hidden>Vollbild</a>
        <button type="button" class="sb-knopf" data-link hidden>Link für den Kunden kopieren</button>
        <a class="sb-knopf" data-mail hidden>Per E-Mail schicken</a>
      </div>
      <iframe title="Ergebnis im Planer" data-fall></iframe>
      <div class="sb-fall-link" data-fall-link>Der Plan wird geöffnet …</div>
    </section>` : ''
  const d = popup(k.name, `
    <div class="sb-leiste">${login}<span class="sb-meldung" data-meldung></span></div>
    ${stamm ? `<dl class="sb-stamm">${stamm}</dl>` : ''}
    ${fall}
    ${fall ? `<details class="sb-originale"><summary>Hochgeladene Dateien und Zahlen (${k.plaene.length})</summary>${plaene}</details>` : plaene}`)
  if (fall) void (async () => {
    const zeile = d.querySelector<HTMLElement>('[data-fall-link]')!
    try {
      const r = await fetch('/api/probe/eingang/fall', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: k.plaene.map((p) => p.id), name: k.name }),
      })
      const a = await r.json() as { ok?: boolean; token?: string; meldung?: string }
      if (!a.ok || !a.token) throw new Error(a.meldung || '')
      const adresse = `${location.origin}/#fall/${a.token}`
      d.querySelector<HTMLIFrameElement>('[data-fall]')!.src = `/?rahmen=1#fall/${a.token}`
      const voll = d.querySelector<HTMLAnchorElement>('[data-voll]')!
      voll.href = adresse
      voll.hidden = false
      zeile.textContent = `Link für den Kunden (gilt 60 Tage): ${adresse}`
      const kopieren = d.querySelector<HTMLButtonElement>('[data-link]')!
      kopieren.hidden = false
      kopieren.addEventListener('click', () => {
        void navigator.clipboard.writeText(adresse).then(
          () => { kopieren.textContent = 'Link kopiert' },
          () => { kopieren.textContent = 'Bitte den Link unten markieren' },
        )
      })
      const mail = d.querySelector<HTMLAnchorElement>('[data-mail]')!
      const text = `Guten Tag,\n\nIhr Plan steht bei PlanR im Planer. Unter diesem Link sehen Sie ihn mit allen Reglern:\n\n${adresse}\n\nDer Link gilt 60 Tage. Fragen? Rufen Sie uns an: 0211 3029 3035.\n\nDr. Petsas, Pickadoc`
      mail.href = `mailto:${encodeURIComponent(k.login?.email ?? '')}?subject=${encodeURIComponent('Ihr Plan in PlanR')}&body=${encodeURIComponent(text)}`
      mail.hidden = false
    } catch (e) {
      zeile.textContent = (e as Error).message || 'Der Plan ließ sich gerade nicht öffnen.'
    }
  })()
  d.querySelector<HTMLButtonElement>('[data-sudo]')?.addEventListener('click', (e) => {
    sudo((e.currentTarget as HTMLElement).dataset.sudo ?? '', d.querySelector('[data-meldung]'))
  })
  d.querySelector<HTMLButtonElement>('[data-probe-login]')?.addEventListener('click', (e) => {
    const knopf = e.currentTarget as HTMLButtonElement
    void probeAccount(k, d.querySelector('[data-meldung]'), knopf)
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

function probeAccount(k: Kunde, meldung: Element | null, knopf: HTMLButtonElement) {
  knopf.disabled = true
  if (meldung) meldung.textContent = 'Demo-Account wird angelegt …'
  void (async () => {
    try {
      const r = await fetch('/api/probe/eingang/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: k.name, ids: k.plaene.map((p) => p.id) }),
      })
      const d = await r.json() as { ok?: boolean; email?: string; meldung?: string }
      if (!d.ok || !d.email) {
        if (meldung) meldung.textContent = d.meldung || 'Der Demo-Account ließ sich nicht anlegen.'
        knopf.disabled = false
        return
      }
      const s = await fetch('/api/probe/sudo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: d.email }),
      })
      const a = await s.json() as { ok?: boolean; meldung?: string }
      if (a.ok) { location.href = '/'; return }
      if (meldung) meldung.textContent = a.meldung || 'Das Konto ließ sich nicht öffnen.'
    } catch {
      if (meldung) meldung.textContent = 'Keine Verbindung zu PlanR.'
    }
    knopf.disabled = false
  })()
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
  const meldung = () => app.querySelector('[data-sudo-meldung]')
  const kontoTun = async (pfad: string, daten: Record<string, unknown>, knopf: HTMLButtonElement) => {
    knopf.disabled = true
    const r = await fetch(pfad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(daten) }).catch(() => null)
    const a = await r?.json().catch(() => null) as { ok?: boolean; meldung?: string } | null
    if (a?.ok) { location.reload(); return }
    const ziel = meldung()
    if (ziel) ziel.textContent = a?.meldung || 'Das hat nicht geklappt.'
    knopf.disabled = false
  }
  for (const knopf of app.querySelectorAll<HTMLButtonElement>('[data-sudo]')) {
    knopf.addEventListener('click', () => { void sudo(knopf.dataset.sudo ?? '', meldung()) })
  }
  for (const knopf of app.querySelectorAll<HTMLButtonElement>('[data-sperren]')) {
    knopf.addEventListener('click', () => {
      const email = knopf.dataset.sperren ?? ''
      if (email) void kontoTun('/api/probe/eingang/sperren', { email, gesperrt: knopf.dataset.gesperrt !== '1' }, knopf)
    })
  }
  for (const knopf of app.querySelectorAll<HTMLButtonElement>('[data-probe-loeschen]')) {
    knopf.addEventListener('click', () => {
      const probeId = knopf.dataset.probeLoeschen ?? ''
      if (!probeId) return
      const name = knopf.dataset.name || 'diesen Interessenten'
      const frage = `Probe-Interessent ${name} aus PlanR entfernen?\n\nDer Eintrag und die hochgeladenen Pläne verschwinden. Ein dazu angelegtes PlanR-Konto wird gelöscht.\nDas Pickadoc-Konto bleibt bestehen.`
      if (confirm(frage)) void kontoTun('/api/probe/eingang/probe-loeschen', { id: probeId }, knopf)
    })
  }
  for (const knopf of app.querySelectorAll<HTMLButtonElement>('[data-loeschen]')) {
    knopf.addEventListener('click', () => {
      const email = knopf.dataset.loeschen ?? ''
      if (!email) return
      const frage = `PlanR-Konto von ${knopf.dataset.name || email} (${email}) löschen?\n\nBuchung, Zugang, Bridge-Schlüssel, Einstellungen und alle Pläne dieser Praxis verschwinden aus PlanR. Die Adresse kann sich danach neu anmelden.\nDas Pickadoc-Konto bleibt bestehen.`
      if (confirm(frage)) void kontoTun('/api/probe/eingang/loeschen', { email }, knopf)
    })
  }
  for (const knopf of app.querySelectorAll<HTMLButtonElement>('[data-probe-login]')) {
    knopf.addEventListener('click', () => {
      const k = kunden.find((x) => x.id === knopf.dataset.probeLogin)
      if (k) void probeAccount(k, app.querySelector('[data-sudo-meldung]'), knopf)
    })
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
      const kunden = d.kunden
      const monat = d.monat ?? ''
      const funnel = await fetch('/api/probe/funnel', { cache: 'no-store' })
        .then((fr) => fr.ok ? fr.json() as Promise<FunnelBericht & { ok?: boolean }> : null)
        .then((fd) => (fd?.ok ? fd : null))
        .catch(() => null)
      let zeitraum: 'heute' | 'tage7' | 'tage30' = 'tage7'
      let kanal: 'alle' | FunnelKanal = 'alle'
      const neuZeichnen = () => {
        app.innerHTML = listeZeichnen(kunden, monat, funnel, zeitraum, kanal)
        verdrahten(app, kunden)
        for (const knopf of app.querySelectorAll<HTMLButtonElement>('[data-funnel-zeit]')) {
          knopf.addEventListener('click', () => {
            zeitraum = knopf.dataset.funnelZeit as 'heute' | 'tage7' | 'tage30'
            neuZeichnen()
          })
        }
        for (const knopf of app.querySelectorAll<HTMLButtonElement>('[data-funnel-kanal]')) {
          knopf.addEventListener('click', () => {
            kanal = knopf.dataset.funnelKanal as 'alle' | FunnelKanal
            neuZeichnen()
          })
        }
      }
      neuZeichnen()
    } catch {
      app.innerHTML = huelle('<p class="sb-leer">Die Liste ist gerade nicht erreichbar.</p>')
    }
  })()
}
