/**
 * Cookie-freie, aggregierte Conversion-Statistik für planr.pickadoc.de.
 * Keine IPs, keine Cookies, keine Nutzer-IDs — nur Tageszähler je Schritt, Kanal und Kampagne.
 */

export const FUNNEL_SCHRITTE = [
  'start',
  'kalkulator',
  'probe',
  'beispiel',
  'upload',
  'buchung_start',
  'buchung_ok',
] as const
export type FunnelSchritt = (typeof FUNNEL_SCHRITTE)[number]

export const FUNNEL_KANAELE = ['ads', 'organisch', 'direkt', 'empfehlung'] as const
export type FunnelKanal = (typeof FUNNEL_KANAELE)[number]

export type SchrittZaehler = Record<FunnelSchritt, number>

export interface FunnelTag {
  gesamt: Partial<Record<FunnelSchritt, number>>
  kanaele: Partial<Record<FunnelKanal, Partial<Record<FunnelSchritt, number>>>>
  kampagnen?: Record<string, Partial<Record<FunnelSchritt, number>>>
}

export interface FunnelDatei {
  tage: Record<string, FunnelTag>
}

export interface FunnelZeitraum {
  gesamt: SchrittZaehler
  kanaele: Record<FunnelKanal, SchrittZaehler>
}

export interface FunnelKampagneZeile {
  name: string
  zaehler: SchrittZaehler
}

export interface FunnelBericht {
  heuteDatum: string
  heute: FunnelZeitraum
  tage7: FunnelZeitraum
  tage30: FunnelZeitraum
  kampagnen30: FunnelKampagneZeile[]
}

const SCHRITT_MENGE = new Set<string>(FUNNEL_SCHRITTE)
const KANAL_MENGE = new Set<string>(FUNNEL_KANAELE)
const MAX_TAGE = 90
const MAX_KAMPAGNEN_JE_TAG = 40

export function istFunnelSchritt(wert: unknown): wert is FunnelSchritt {
  return typeof wert === 'string' && SCHRITT_MENGE.has(wert)
}

export function kanalNorm(wert: unknown): FunnelKanal {
  if (typeof wert === 'string') {
    const k = wert.trim().toLowerCase()
    if (KANAL_MENGE.has(k)) return k as FunnelKanal
  }
  return 'direkt'
}

/** Erlaubt nur einfache ASCII-Zeichen für utm_campaign (max. 40 Zeichen), keine Sonderzeichen oder PII. */
export function kampagneNorm(wert: unknown): string {
  if (typeof wert !== 'string') return ''
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

export function isoTag(datum: Date = new Date()): string {
  const j = datum.getFullYear()
  const m = String(datum.getMonth() + 1).padStart(2, '0')
  const t = String(datum.getDate()).padStart(2, '0')
  return `${j}-${m}-${t}`
}

function leerZaehler(): SchrittZaehler {
  return { start: 0, kalkulator: 0, probe: 0, beispiel: 0, upload: 0, buchung_start: 0, buchung_ok: 0 }
}

function leerZeitraum(): FunnelZeitraum {
  return {
    gesamt: leerZaehler(),
    kanaele: {
      ads: leerZaehler(),
      organisch: leerZaehler(),
      direkt: leerZaehler(),
      empfehlung: leerZaehler(),
    },
  }
}

function addiere(ziel: SchrittZaehler, quelle?: Partial<Record<FunnelSchritt, number>>) {
  if (!quelle) return
  for (const s of FUNNEL_SCHRITTE) {
    const v = quelle[s]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) ziel[s] += v
  }
}

function tageRueckwaerts(heute: string, anzahl: number): Set<string> {
  const teile = heute.split('-').map(Number)
  const basis = new Date(Date.UTC(teile[0], (teile[1] || 1) - 1, teile[2] || 1))
  const menge = new Set<string>()
  for (let i = 0; i < anzahl; i++) {
    const d = new Date(basis.getTime() - i * 86_400_000)
    const j = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const t = String(d.getUTCDate()).padStart(2, '0')
    menge.add(`${j}-${m}-${t}`)
  }
  return menge
}

export function funnelBuchen(
  daten: FunnelDatei | null | undefined,
  eingang: { schritt: FunnelSchritt; kanal?: unknown; kampagne?: unknown },
  tag: string = isoTag(),
): FunnelDatei {
  const tage: Record<string, FunnelTag> = { ...(daten?.tage ?? {}) }
  const alt = tage[tag]
  const neu: FunnelTag = {
    gesamt: { ...(alt?.gesamt ?? {}) },
    kanaele: { ...(alt?.kanaele ?? {}) },
    ...(alt?.kampagnen ? { kampagnen: { ...alt.kampagnen } } : {}),
  }
  const s = eingang.schritt
  const kanal = kanalNorm(eingang.kanal)
  const kampagne = kampagneNorm(eingang.kampagne)

  neu.gesamt[s] = (neu.gesamt[s] ?? 0) + 1
  const kObj = { ...(neu.kanaele[kanal] ?? {}) }
  kObj[s] = (kObj[s] ?? 0) + 1
  neu.kanaele[kanal] = kObj

  if (kampagne) {
    const kampagnen = { ...(neu.kampagnen ?? {}) }
    if (kampagnen[kampagne] || Object.keys(kampagnen).length < MAX_KAMPAGNEN_JE_TAG) {
      const cObj = { ...(kampagnen[kampagne] ?? {}) }
      cObj[s] = (cObj[s] ?? 0) + 1
      kampagnen[kampagne] = cObj
      neu.kampagnen = kampagnen
    }
  }

  tage[tag] = neu

  // Alte Tage oberhalb der 90-Tage-Grenze wegräumen
  const schluessel = Object.keys(tage).sort()
  if (schluessel.length > MAX_TAGE) {
    for (const k of schluessel.slice(0, schluessel.length - MAX_TAGE)) delete tage[k]
  }
  return { tage }
}

export function funnelAuswerten(daten: FunnelDatei | null | undefined, heute: string = isoTag()): FunnelBericht {
  const tage = daten?.tage ?? {}
  const m1 = new Set([heute])
  const m7 = tageRueckwaerts(heute, 7)
  const m30 = tageRueckwaerts(heute, 30)

  const zHeute = leerZeitraum()
  const z7 = leerZeitraum()
  const z30 = leerZeitraum()
  const kamp30 = new Map<string, SchrittZaehler>()

  const einrechnen = (ziel: FunnelZeitraum, eintrag: FunnelTag) => {
    addiere(ziel.gesamt, eintrag.gesamt)
    for (const k of FUNNEL_KANAELE) addiere(ziel.kanaele[k], eintrag.kanaele?.[k])
  }

  for (const [tag, eintrag] of Object.entries(tage)) {
    if (!eintrag) continue
    if (m1.has(tag)) einrechnen(zHeute, eintrag)
    if (m7.has(tag)) einrechnen(z7, eintrag)
    if (m30.has(tag)) {
      einrechnen(z30, eintrag)
      for (const [name, werte] of Object.entries(eintrag.kampagnen ?? {})) {
        const ziel = kamp30.get(name) ?? leerZaehler()
        addiere(ziel, werte)
        kamp30.set(name, ziel)
      }
    }
  }

  const kampagnen30: FunnelKampagneZeile[] = [...kamp30.entries()]
    .map(([name, zaehler]) => ({ name, zaehler }))
    .sort((a, b) => (b.zaehler.buchung_ok - a.zaehler.buchung_ok) || (b.zaehler.start - a.zaehler.start) || a.name.localeCompare(b.name))
    .slice(0, 12)

  return { heuteDatum: heute, heute: zHeute, tage7: z7, tage30: z30, kampagnen30 }
}
