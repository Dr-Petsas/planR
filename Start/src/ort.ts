/**
 * Welches Praxisprogramm gehört zu diesem Browser? Läuft auf demselben PC eine PlanR-Bridge (Demo-PC, Einzelplatz),
 * arbeitet dieser Browser mit ihr; sonst mit der Bridge auf dem Praxisserver. Der Browser meldet sich außerdem
 * laufend bei PlanR – Clara nimmt das Praxisprogramm des Browsers, an dem zuletzt gearbeitet wurde.
 */
const COOKIE = 'planr_ort'
const BRIDGE_AM_PC = 'http://127.0.0.1:8764/planr-bridge'
const PULS_MS = 45_000
const AKTIV_ABSTAND_MS = 10_000

export interface OrtStand { lokal: boolean; pvs: string; name: string; verbunden: boolean }

const cookieLesen = () => document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? ''
const cookieSetzen = (wert: string) => {
  document.cookie = `${COOKIE}=${wert}; Path=/; Max-Age=${wert ? 365 * 86_400 : 0}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
}

function browserKennung(): string {
  let k = localStorage.getItem('planr-browser') ?? ''
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(k)) {
    k = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')
    localStorage.setItem('planr-browser', k)
  }
  return k
}

/** Bridge auf diesem PC suchen; true, wenn sich die Zuordnung geändert hat */
async function bridgeAmPcSuchen(): Promise<boolean> {
  try {
    const r = await fetch(BRIDGE_AM_PC, { cache: 'no-store', signal: AbortSignal.timeout(1500) })
    const d = await r.json() as { bridge?: unknown }
    const kennung = typeof d.bridge === 'string' && /^[a-z0-9-]{1,40}$/.test(d.bridge) ? d.bridge : ''
    if (kennung && kennung !== cookieLesen()) { cookieSetzen(kennung); return true }
  } catch {
    // Keine Antwort heißt nicht „keine Bridge“ (Dienst startet gerade): Die Zuordnung bleibt, damit ein Demo-PC
    // nie unbemerkt mit der echten Praxis arbeitet. Gelöst wird sie nur ausdrücklich (ortVergessen).
  }
  return false
}

export const ortGemerkt = () => !!cookieLesen()
export function ortVergessen() { cookieSetzen('') }

/** Starten: Bridge suchen, dann laufend melden. `geaendert` läuft, wenn dieser Browser ein anderes PVS bekommt. */
export async function ortStarten(geaendert: (s: OrtStand) => void) {
  await bridgeAmPcSuchen()
  const browser = browserKennung()
  let zuletzt = ''
  let aktivGemeldet = 0
  const melden = async (aktiv: boolean) => {
    try {
      const r = await fetch('/api/ort', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ browser, aktiv }) })
      const s = await r.json() as OrtStand & { ok?: boolean }
      if (!s.ok) return
      const bild = `${s.lokal}|${s.pvs}|${s.verbunden}`
      if (bild !== zuletzt) { const erst = !zuletzt; zuletzt = bild; if (!erst || s.lokal) geaendert(s) }
    } catch { /* nächster Puls */ }
  }
  const bedient = () => {
    if (Date.now() - aktivGemeldet < AKTIV_ABSTAND_MS) return
    aktivGemeldet = Date.now()
    void melden(true)
  }
  for (const art of ['pointerdown', 'keydown', 'focus'] as const) window.addEventListener(art, bedient, { capture: true, passive: true })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) bedient() })
  setInterval(() => void melden(false), PULS_MS)
  setInterval(() => void bridgeAmPcSuchen().then((neu) => { if (neu) void melden(true) }), 5 * 60_000)
  aktivGemeldet = Date.now()
  await melden(!document.hidden && document.hasFocus())
}
