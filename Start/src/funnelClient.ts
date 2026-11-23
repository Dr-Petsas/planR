/**
 * Cookie-freier Client-Helfer für die eigene Conversion-Statistik (/api/funnel).
 * Speichert keine Daten dauerhaft im Browser — nur tab-lokal in sessionStorage zur Deduplizierung.
 */
import type { FunnelKanal, FunnelSchritt } from '../funnel'

const QUELLE_KEY = 'planr.funnel.quelle.v1'
const SCHRITTE_KEY = 'planr.funnel.schritte.v1'
const SUCHMASCHINEN = ['google.', 'bing.', 'duckduckgo.', 'ecosia.', 'yahoo.', 'startpage.', 'qwant.']
const ADS_MEDIEN = new Set(['cpc', 'ppc', 'paid', 'paidsearch', 'paid_search', 'display', 'pmax', 'sem'])
const ADS_QUELLEN = new Set(['googleads', 'adwords', 'google_ads', 'google-ads'])

export interface FunnelQuelle {
  kanal: FunnelKanal
  kampagne: string
}

function kampagneReinigen(wert: string | null): string {
  if (!wert) return ''
  const roh = wert.trim().toLowerCase()
  let aus = ''
  for (let i = 0; i < roh.length && aus.length < 40; i++) {
    const c = roh.charCodeAt(i)
    const ok = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45 || c === 95 || c === 46
    if (ok) aus += roh[i]
    else if (c === 32 && aus.length > 0 && !aus.endsWith('-')) aus += '-'
  }
  return aus.replace(/^-+|-+$/g, '')
}

function quelleAusKontext(): FunnelQuelle {
  const params = new URLSearchParams(location.search)
  const kampagne = kampagneReinigen(params.get('utm_campaign'))
  const medium = (params.get('utm_medium') ?? '').trim().toLowerCase()
  const source = (params.get('utm_source') ?? '').trim().toLowerCase()

  if (
    params.has('gclid') || params.has('gbraid') || params.has('wbraid') || params.has('gad_source')
    || ADS_MEDIEN.has(medium) || ADS_QUELLEN.has(source)
  ) {
    return { kanal: 'ads', kampagne }
  }

  let refHost = ''
  try {
    if (document.referrer) refHost = new URL(document.referrer).hostname.toLowerCase()
  } catch { /* ungültiger Referrer */ }

  if (refHost && refHost !== location.hostname.toLowerCase()) {
    if (SUCHMASCHINEN.some((s) => refHost.includes(s))) return { kanal: 'organisch', kampagne }
    return { kanal: 'empfehlung', kampagne }
  }
  if (source) return { kanal: 'empfehlung', kampagne }
  return { kanal: 'direkt', kampagne }
}

/** Ermittelt den Kanal der aktuellen Tab-Sitzung (Ads-Parameter überschreiben eine frühere Direkt-Quelle). */
export function funnelQuelle(): FunnelQuelle {
  const frisch = quelleAusKontext()
  try {
    const gespeichert = sessionStorage.getItem(QUELLE_KEY)
    if (gespeichert) {
      const alt = JSON.parse(gespeichert) as Partial<FunnelQuelle>
      if (frisch.kanal === 'ads' || (frisch.kampagne && !alt.kampagne)) {
        sessionStorage.setItem(QUELLE_KEY, JSON.stringify(frisch))
        return frisch
      }
      if (alt.kanal) return { kanal: alt.kanal, kampagne: alt.kampagne ?? '' }
    }
    sessionStorage.setItem(QUELLE_KEY, JSON.stringify(frisch))
  } catch { /* privater Modus */ }
  return frisch
}

/** Meldet einen Funnel-Schritt höchstens einmal pro Browser-Tab. Blockiert niemals den Seitenfluss. */
export function funnelMelden(schritt: FunnelSchritt): void {
  try {
    const roh = sessionStorage.getItem(SCHRITTE_KEY)
    const erledigt = new Set<string>(roh ? JSON.parse(roh) as string[] : [])
    if (erledigt.has(schritt)) return
    erledigt.add(schritt)
    sessionStorage.setItem(SCHRITTE_KEY, JSON.stringify([...erledigt]))
  } catch { /* ohne sessionStorage trotzdem einmal senden */ }

  const quelle = funnelQuelle()
  const payload = JSON.stringify({ schritt, kanal: quelle.kanal, ...(quelle.kampagne ? { kampagne: quelle.kampagne } : {}) })
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' })
      if (navigator.sendBeacon('/api/funnel', blob)) return
    }
  } catch { /* Rückfall auf fetch */ }
  void fetch('/api/funnel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => undefined)
}
