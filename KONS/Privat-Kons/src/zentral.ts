/**
 * Zentrale Einstellungen je Praxis: Faktoren, Preise und Eigenlabor eines Planers gelten an jedem Arbeitsplatz,
 * gleich ob PlanR allein oder aus Pickadoc geöffnet ist. Der Browser behält seine Kopie (ohne Netz arbeitet der
 * Planer damit weiter); die Übersicht führt den Stand der Praxis mit einer Fassungsnummer.
 *
 * Der Praxiskopf (`praxis`) gehört nicht dazu – er kommt je Praxis-Nummer eigens vom Server.
 */
export interface ZentralStand { mandant: string; v: number; einst: Record<string, unknown> | null; zeit?: string; von?: string }
export interface ZentralMerker { mandant: string; v: number; kern: string }
export type Schritt = 'nichts' | 'merken' | 'hoch' | 'runter' | 'fragen'

const sortiert = (x: unknown): unknown => {
  if (Array.isArray(x)) return x.map(sortiert)
  if (!x || typeof x !== 'object') return x
  return Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, sortiert((x as Record<string, unknown>)[k])]))
}
/** Vergleichbare Fassung der Einstellungen: ohne Praxiskopf, Schlüssel sortiert */
export function kern(einst: Record<string, unknown>): string {
  const { praxis: _praxis, ...rest } = einst
  return JSON.stringify(sortiert(rest))
}

/** Was ist zu tun? `merker` ist der Stand, den dieser Browser zuletzt mit der Praxis abgeglichen hat. */
export function entscheide(lokal: string, merker: ZentralMerker | null, server: ZentralStand): Schritt {
  const m = merker && merker.mandant === server.mandant ? merker : null
  if (!server.einst) return 'hoch'
  const s = kern(server.einst)
  if (s === lokal) return server.v === 0 ? 'hoch' : m && m.v === server.v && m.kern === lokal ? 'nichts' : 'merken'
  if (!m) return 'fragen'
  if (m.kern === lokal) return 'runter'
  return m.v === server.v ? 'hoch' : 'fragen'
}

/** Server-Stand in die Browser-Kopie: der Praxiskopf dieses Arbeitsplatzes bleibt. */
export function uebernommen(lokal: Record<string, unknown>, server: Record<string, unknown>): Record<string, unknown> {
  return 'praxis' in lokal ? { ...server, praxis: lokal.praxis } : server
}

const MERK = (modul: string) => `planr.zentral.${modul}`
const BREMSE = (modul: string) => `planr.zentral.laden.${modul}`

function merkerLesen(modul: string): ZentralMerker | null {
  try {
    const m = JSON.parse(localStorage.getItem(MERK(modul)) ?? 'null') as Partial<ZentralMerker> | null
    return m && typeof m.mandant === 'string' && Number.isInteger(m.v) && typeof m.kern === 'string' ? m as ZentralMerker : null
  } catch { return null }
}
const merkerSetzen = (modul: string, m: ZentralMerker) => localStorage.setItem(MERK(modul), JSON.stringify(m))

const wann = (iso?: string) => {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
}

let kasten: HTMLElement | null = null
function schliessen() { kasten?.remove(); kasten = null }
/** Kleiner Hinweis unten rechts; ohne Antwort bleibt alles, wie es ist. */
function hinweis(text: string, knoepfe: { titel: string; haupt?: boolean; tun: () => void }[]) {
  schliessen()
  const k = document.createElement('div')
  k.setAttribute('role', 'dialog')
  k.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;max-width:380px;background:#fff;color:#1f2937;border:1px solid #cbd5e1;'
    + 'border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.18);padding:14px 16px;font:14px/1.45 system-ui,sans-serif'
  const p = document.createElement('p')
  p.textContent = text
  p.style.cssText = 'margin:0 0 12px'
  const zeile = document.createElement('div')
  zeile.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px'
  for (const kn of [...knoepfe, { titel: 'Später', tun: () => undefined }]) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = kn.titel
    b.style.cssText = `padding:6px 12px;border-radius:7px;cursor:pointer;font:inherit;border:1px solid ${kn.haupt ? '#0f766e' : '#cbd5e1'};`
      + `background:${kn.haupt ? '#0f766e' : '#fff'};color:${kn.haupt ? '#fff' : '#1f2937'}`
    b.addEventListener('click', () => { schliessen(); kn.tun() })
    zeile.append(b)
  }
  k.append(p, zeile)
  document.body.append(k)
  kasten = k
}

interface Lauf { ersteRunde: boolean; laeuft: boolean; gefragt: string; zuletzt: number; lokalZuletzt: string }
const laeufe = new Map<string, Lauf>()

/** Höchstens drei selbsttätige Übernahmen in zehn Minuten – zwei Plätze dürfen sich nie gegenseitig neu laden. */
function bremse(modul: string): boolean {
  try {
    const jetzt = Date.now()
    const liste = (JSON.parse(sessionStorage.getItem(BREMSE(modul)) ?? '[]') as number[]).filter((t) => jetzt - t < 600_000)
    if (liste.length >= 3) return false
    sessionStorage.setItem(BREMSE(modul), JSON.stringify([...liste, jetzt]))
    return true
  } catch { return true }
}

/**
 * Ein Abgleich-Takt (alle paar Sekunden aus der Ablage): geänderte Einstellungen gehen sofort zur Praxis,
 * der Stand der Praxis wird regelmäßig und beim Zurückkehren ins Fenster geholt.
 * `lesen` liefert Speicherort und Inhalt der Einstellungen dieses Planers im Browser.
 */
export function zentralAbgleich(modul: string, adresse: string, lesen: () => { key: string; roh: string } | null, sofort = false) {
  if (typeof fetch !== 'function' || typeof localStorage === 'undefined' || typeof document === 'undefined') return
  const hier = lesen()
  if (!hier) return
  const lauf = laeufe.get(modul) ?? { ersteRunde: true, laeuft: false, gefragt: '', zuletzt: 0, lokalZuletzt: '' }
  laeufe.set(modul, lauf)
  if (lauf.laeuft) return
  let lokalEinst: Record<string, unknown>
  try { lokalEinst = JSON.parse(hier.roh) as Record<string, unknown> } catch { return }
  const lokal = kern(lokalEinst)
  const geaendert = lokal !== lauf.lokalZuletzt
  if (!sofort && !geaendert && Date.now() - lauf.zuletzt < 20_000) return
  lauf.laeuft = true
  lauf.zuletzt = Date.now()
  lauf.lokalZuletzt = lokal

  const hoch = async (basis: number, mandant: string) => {
    const r = await fetch(adresse, {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: `{"modul":${JSON.stringify(modul)},"basis":${basis},"einst":${hier.roh}}`,
    })
    if (r.ok) {
      const d = await r.json() as { v: number; mandant?: string }
      merkerSetzen(modul, { mandant: d.mandant ?? mandant, v: d.v, kern: lokal })
    } else lauf.zuletzt = 0 // Konflikt oder Netz: gleich noch einmal abgleichen
  }
  const runter = (s: ZentralStand, neuLaden: boolean) => {
    if (!s.einst) return
    // Zwischenzeitlich hier weitergeändert? Dann nichts überschreiben – der nächste Takt entscheidet neu.
    if (lesen()?.roh !== hier.roh) { lauf.zuletzt = 0; return }
    try { localStorage.setItem(`${hier.key}.vor-zentral`, hier.roh) } catch { /* Sicherung ist Zugabe */ }
    localStorage.setItem(hier.key, JSON.stringify(uebernommen(lokalEinst, s.einst)))
    merkerSetzen(modul, { mandant: s.mandant, v: s.v, kern: kern(s.einst) })
    // Der Planer liest seine Einstellungen beim Start – Pläne und Entwürfe liegen im Browser und bleiben.
    if (neuLaden) location.reload()
  }

  void (async () => {
    const r = await fetch(`${adresse}?modul=${encodeURIComponent(modul)}`, { cache: 'no-store', credentials: 'include' })
    if (!r.ok) return
    const s = await r.json() as ZentralStand
    if (typeof s.mandant !== 'string' || !Number.isInteger(s.v)) return
    const schritt = entscheide(lokal, merkerLesen(modul), s)
    const ersteRunde = lauf.ersteRunde
    lauf.ersteRunde = false
    if (schritt === 'merken') merkerSetzen(modul, { mandant: s.mandant, v: s.v, kern: lokal })
    else if (schritt === 'hoch') await hoch(s.v, s.mandant)
    else if (schritt === 'runter') {
      if ((ersteRunde || document.hidden) && bremse(modul)) runter(s, true)
      else if (lauf.gefragt !== `r${s.v}`) {
        lauf.gefragt = `r${s.v}`
        hinweis(`Die Einstellungen der Praxis wurden an einem anderen Platz geändert${s.von ? ` (${s.von}${wann(s.zeit) ? `, ${wann(s.zeit)}` : ''})` : ''}.`,
          [{ titel: 'Jetzt übernehmen', haupt: true, tun: () => runter(s, true) }])
      }
    } else if (schritt === 'fragen' && lauf.gefragt !== `f${s.v}:${lokal.length}`) {
      lauf.gefragt = `f${s.v}:${lokal.length}`
      const stand = s.v > 0 && s.von ? ` (zuletzt geändert von ${s.von}${wann(s.zeit) ? ` am ${wann(s.zeit)}` : ''})` : ''
      hinweis(`Für diese Praxis sind andere Einstellungen hinterlegt${stand} als an diesem Platz. Welche sollen für die ganze Praxis gelten?`, [
        { titel: 'Die der Praxis übernehmen', haupt: true, tun: () => runter(s, true) },
        { titel: 'Die von diesem Platz', tun: () => { void hoch(s.v, s.mandant).catch(() => undefined) } },
      ])
    }
  })().catch(() => undefined).finally(() => { lauf.laeuft = false })
}
