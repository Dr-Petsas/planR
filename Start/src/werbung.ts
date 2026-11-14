/**
 * Google Ads und Analytics auf den öffentlichen Seiten, erst nach Einwilligung.
 * Ohne Kennung im Build (VITE_GOOGLE_ADS_ID / VITE_GOOGLE_GA_ID) gibt es weder Banner noch Tag.
 * An Google gehen nur Seitenaufrufe und das Ereignis „Ziel erreicht“, nie Inhalte aus hochgeladenen Plänen.
 */
import './werbung.css'

const ADS_ID = (import.meta.env.VITE_GOOGLE_ADS_ID ?? '').trim()
const GA_ID = (import.meta.env.VITE_GOOGLE_GA_ID ?? '').trim()
const ZIELE: Record<Ziel, string> = {
  probe: (import.meta.env.VITE_GOOGLE_ADS_PROBE ?? '').trim(),
  buchung: (import.meta.env.VITE_GOOGLE_ADS_BUCHUNG ?? '').trim(),
}
const SCHLUESSEL = 'planr-einwilligung'
const STAND = 1

export type Ziel = 'probe' | 'buchung'
type Entscheidung = 'ja' | 'nein'

declare global {
  interface Window { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void }
}

let geladen = false

export const werbungAktiv = () => !!(ADS_ID || GA_ID)

function entscheidung(): Entscheidung | null {
  try {
    const d = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? 'null') as { wahl?: string; stand?: number } | null
    return d && d.stand === STAND && (d.wahl === 'ja' || d.wahl === 'nein') ? d.wahl : null
  } catch {
    return null
  }
}

function merken(wahl: Entscheidung) {
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify({ wahl, stand: STAND, zeit: new Date().toISOString() })) } catch { /* privat */ }
}

function tagLaden() {
  if (geladen || !werbungAktiv()) return
  geladen = true
  window.dataLayer = window.dataLayer ?? []
  window.gtag = function gtag() { window.dataLayer!.push(arguments) }
  window.gtag('consent', 'default', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' })
  window.gtag('js', new Date())
  if (ADS_ID) window.gtag('config', ADS_ID)
  if (GA_ID) window.gtag('config', GA_ID, { anonymize_ip: true })
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ADS_ID || GA_ID)}`
  document.head.append(s)
}

/** Nach einem Nein: Google-Cookies dieser Seite entfernen. */
function cookiesWeg() {
  for (const teil of document.cookie.split(';')) {
    const name = teil.split('=')[0].trim()
    if (!name.startsWith('_ga') && !name.startsWith('_gcl')) continue
    for (const domain of ['', location.hostname, `.${location.hostname.split('.').slice(-2).join('.')}`]) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}`
    }
  }
}

function bannerZeigen() {
  if (document.querySelector('.ew-banner')) return
  const banner = document.createElement('div')
  banner.className = 'ew-banner'
  banner.setAttribute('role', 'dialog')
  banner.setAttribute('aria-label', 'Cookie-Einstellungen')
  banner.innerHTML = `
    <div class="ew-text">
      <b>Darf PlanR messen, wie Sie hierher gefunden haben?</b>
      <p>Mit Ihrer Einwilligung setzen wir Cookies von Google (Google Ads, Google Analytics), um unsere Werbung zu messen und zu verbessern. Dabei werden Daten an Google übertragen, auch in die USA. Hochgeladene Pläne gehen nie an Google. Sie können die Einwilligung jederzeit über „Cookie-Einstellungen“ unten auf der Seite widerrufen. <a href="https://pickadoc.ai/datenschutz.html" target="_blank" rel="noopener">Datenschutz</a></p>
    </div>
    <div class="ew-knoepfe">
      <button type="button" class="ew-nein" data-wahl="nein">Nur notwendige</button>
      <button type="button" class="ew-ja" data-wahl="ja">Einverstanden</button>
    </div>`
  banner.addEventListener('click', (ev) => {
    const wahl = (ev.target as HTMLElement).closest<HTMLElement>('[data-wahl]')?.dataset.wahl as Entscheidung | undefined
    if (!wahl) return
    merken(wahl)
    banner.remove()
    if (wahl === 'ja') tagLaden()
    else {
      cookiesWeg()
      // Ein schon geladenes Tag lässt sich nicht entladen; neu laden sorgt für einen sauberen Stand.
      if (geladen) location.reload()
    }
  })
  document.body.append(banner)
}

/** Auf jeder öffentlichen Seite aufrufen: fragt einmal nach, lädt bei Ja das Google-Tag. */
export function werbungStarten() {
  if (!werbungAktiv()) return
  const wahl = entscheidung()
  if (wahl === 'ja') tagLaden()
  else if (!wahl) bannerZeigen()
}

/** Link „Cookie-Einstellungen“: Banner erneut zeigen. */
export function einwilligungAendern() {
  if (!werbungAktiv()) return
  bannerZeigen()
}

/** Ein Werbeziel ist erreicht (HKP abgelegt, Abo gebucht). Ohne Einwilligung passiert nichts. */
export function zielErreicht(ziel: Ziel) {
  if (!geladen || !window.gtag) return
  const ziele = ZIELE[ziel]
  if (ziele) window.gtag('event', 'conversion', { send_to: ziele })
  if (GA_ID) window.gtag('event', ziel === 'probe' ? 'hkp_abgelegt' : 'abo_gebucht')
}
