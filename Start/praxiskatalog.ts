/**
 * Leistungsverzeichnisse der Praxis aus dem PVS (Connector-Route /praxis/katalog): Eigenlabor-Preise (BEB,
 * Materialkürzel), eigene GOZ-/Analogpositionen mit Kürzel und Faktor, private Kürzel und Leistungsketten.
 * Die Rohdaten bleiben gespeichert; welche Laborliste und Preisspalte gilt, wählt die Praxis in den Einstellungen.
 */

export interface RohListe { nr: number; name: string; datei?: string; mitPreis: number[] }
export interface RohLabor {
  liste: number; code: string; text: string; preise: number[]; eigenlabor?: boolean
  nr?: string; material?: string; werkstoff?: string
}
export interface GozZeile {
  nr: string; text: string; punkte: number; eigen: boolean
  betrag?: number; kuerzel?: string; druckNr?: string; analogZu?: string; faktor?: number
}
export interface Komplex { kuerzel: string; text: string; positionen: { ebene: string; nr: string; anzahl?: number }[] }
export interface RohKatalog {
  pvs: string
  listen: RohListe[]
  vorschlag?: { liste: number; spalte: number; quelle?: string } | null
  labor: RohLabor[]
  goz: GozZeile[]
  komplexe: Komplex[]
}

export interface Wahl { liste: number; spalte: number; faktoren: boolean }
export interface EigenZeile { nr: string; text: string; preis: number; ersetzt?: string; material?: string; werkstoff?: string }
export interface PraxisKatalog {
  pvs: string
  stand: string
  wahl: Wahl
  listeName: string
  eigenlabor: EigenZeile[]
  goz: GozZeile[]
  komplexe: Komplex[]
}
export interface Aenderungen { neu: number; geaendert: number; entfallen: number }
export interface Ablage { roh: RohKatalog; wahl: Wahl; katalog: PraxisKatalog; aenderungen?: Record<'eigenlabor' | 'goz' | 'komplexe', Aenderungen> }

const zahl = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
const text = (x: unknown, n = 200) => (typeof x === 'string' ? x.trim().slice(0, n) : '')
const liste = <T>(x: unknown, f: (e: Record<string, unknown>) => T | null, hoechstens = 20_000): T[] =>
  (Array.isArray(x) ? x : []).slice(0, hoechstens).flatMap((e) => {
    const r = e && typeof e === 'object' ? f(e as Record<string, unknown>) : null
    return r ? [r] : []
  })

/** Antwort des Connectors prüfen und auf das Nötige zuschneiden. */
export function rohPruefen(x: unknown): RohKatalog | null {
  if (!x || typeof x !== 'object') return null
  const d = x as Record<string, unknown>
  const preise = (p: unknown) => [0, 1, 2, 3].map((i) => Math.max(0, zahl(Array.isArray(p) ? p[i] : 0)))
  const roh: RohKatalog = {
    pvs: text(d.pvs, 40) || 'PVS',
    listen: liste(d.listen, (l) => (Number.isInteger(l.nr) ? { nr: l.nr as number, name: text(l.name, 80) || `Liste ${l.nr}`, mitPreis: preise(l.mitPreis) } : null), 20),
    labor: liste(d.labor, (z) => {
      const code = text(z.code, 12)
      if (!Number.isInteger(z.liste) || !code) return null
      const r: RohLabor = { liste: z.liste as number, code, text: text(z.text), preise: preise(z.preise), eigenlabor: z.eigenlabor === true }
      if (typeof z.nr === 'string' && /^\d{4}$/.test(z.nr)) r.nr = z.nr
      else if (typeof z.material === 'string') r.material = text(z.material, 4)
      else return null
      if (typeof z.werkstoff === 'string') r.werkstoff = text(z.werkstoff, 40)
      return r
    }),
    goz: liste(d.goz, (g) => {
      const nr = text(g.nr, 12)
      if (!nr) return null
      const r: GozZeile = { nr, text: text(g.text, 400), punkte: Math.max(0, zahl(g.punkte)), eigen: g.eigen === true }
      if (zahl(g.betrag) > 0) r.betrag = zahl(g.betrag)
      if (text(g.kuerzel, 12)) r.kuerzel = text(g.kuerzel, 12)
      if (text(g.druckNr, 12)) r.druckNr = text(g.druckNr, 12)
      if (/^\d{4}$/.test(text(g.analogZu, 12))) r.analogZu = text(g.analogZu, 12)
      if (zahl(g.faktor) > 0 && zahl(g.faktor) <= 10) r.faktor = zahl(g.faktor)
      return r
    }, 5000),
    komplexe: liste(d.komplexe, (k) => {
      const kuerzel = text(k.kuerzel, 12)
      const positionen = liste(k.positionen, (p) => {
        const ebene = text(p.ebene, 8)
        const nr = text(p.nr, 12)
        if (!/^(GOZ|BEMA)$/.test(ebene) || !nr) return null
        return zahl(p.anzahl) > 1 ? { ebene, nr, anzahl: zahl(p.anzahl) } : { ebene, nr }
      }, 40)
      return kuerzel && positionen.length ? { kuerzel, text: text(k.text), positionen } : null
    }, 2000),
  }
  const v = d.vorschlag as Record<string, unknown> | null | undefined
  if (v && Number.isInteger(v.liste) && Number.isInteger(v.spalte)) roh.vorschlag = { liste: v.liste as number, spalte: v.spalte as number, quelle: text(v.quelle, 40) }
  return roh
}

export function wahlPruefen(x: unknown, roh: RohKatalog, bisher?: Wahl): Wahl {
  const w = (x && typeof x === 'object' ? x : {}) as Partial<Wahl>
  const basis = bisher ?? { liste: roh.vorschlag?.liste ?? roh.listen[0]?.nr ?? 3, spalte: roh.vorschlag?.spalte ?? 1, faktoren: true }
  const listeOk = (n: unknown) => roh.listen.some((l) => l.nr === n)
  return {
    liste: listeOk(w.liste) ? w.liste! : listeOk(basis.liste) ? basis.liste : roh.listen[0]?.nr ?? basis.liste,
    spalte: [1, 2, 3, 4].includes(w.spalte as number) ? w.spalte! : basis.spalte,
    faktoren: typeof w.faktoren === 'boolean' ? w.faktoren : basis.faktoren,
  }
}

/** Aus den Rohdaten den Katalog für die Planer bilden: nur die gewählte Liste/Spalte, nur Zeilen mit Preis. */
export function katalogBilden(roh: RohKatalog, wahl: Wahl, stand = new Date().toISOString()): PraxisKatalog {
  const eigenlabor: EigenZeile[] = []
  const gesehen = new Set<string>()
  for (const z of roh.labor) {
    const preis = z.preise[wahl.spalte - 1] ?? 0
    if (z.liste !== wahl.liste || preis <= 0) continue
    const nr = z.nr ?? z.code.toUpperCase()
    if (gesehen.has(nr)) continue
    gesehen.add(nr)
    const e: EigenZeile = { nr, text: z.text || `${roh.pvs} ${nr}`, preis }
    if (z.nr) e.ersetzt = z.nr
    if (z.material) e.material = z.material
    if (z.werkstoff) e.werkstoff = z.werkstoff
    eigenlabor.push(e)
  }
  return {
    pvs: roh.pvs,
    stand,
    wahl,
    listeName: roh.listen.find((l) => l.nr === wahl.liste)?.name ?? `Liste ${wahl.liste}`,
    eigenlabor,
    goz: roh.goz.map((g) => {
      if (wahl.faktoren || g.faktor === undefined) return g
      const { faktor: _, ...ohne } = g
      return ohne
    }),
    komplexe: roh.komplexe,
  }
}

function vergleichen<T>(alt: T[], neu: T[], schluessel: (x: T) => string): Aenderungen {
  const a = new Map(alt.map((x) => [schluessel(x), JSON.stringify(x)]))
  const n = new Map(neu.map((x) => [schluessel(x), JSON.stringify(x)]))
  let neue = 0
  let geaendert = 0
  for (const [k, v] of n) {
    if (!a.has(k)) neue++
    else if (a.get(k) !== v) geaendert++
  }
  return { neu: neue, geaendert, entfallen: [...a.keys()].filter((k) => !n.has(k)).length }
}

export function aenderungen(alt: PraxisKatalog | null | undefined, neu: PraxisKatalog): Ablage['aenderungen'] {
  return {
    eigenlabor: vergleichen(alt?.eigenlabor ?? [], neu.eigenlabor, (x) => x.nr),
    goz: vergleichen(alt?.goz ?? [], neu.goz, (x) => x.nr),
    komplexe: vergleichen(alt?.komplexe ?? [], neu.komplexe, (x) => x.kuerzel),
  }
}

export interface Bekannt { goz: Set<string>; beb: Set<string> }

/** Positionen eines übernommenen Plans, die weder in den mitgelieferten Listen noch im Praxiskatalog stehen. */
export function unbekannte(plan: unknown, bekannt: Bekannt, katalog?: PraxisKatalog | null): string[] {
  const goz = new Set([...bekannt.goz, ...(katalog?.goz ?? []).map((g) => g.nr)])
  const beb = new Set([...bekannt.beb, ...(katalog?.eigenlabor ?? []).flatMap((e) => [e.nr, e.ersetzt ?? ''])])
  const positionen = (plan as { positionen?: unknown })?.positionen
  const out = new Set<string>()
  for (const p of Array.isArray(positionen) ? positionen : []) {
    const { ebene, nr } = (p ?? {}) as { ebene?: unknown; nr?: unknown }
    if (typeof nr !== 'string' || !nr) continue
    if (ebene === 'GOZ' && !goz.has(nr)) out.add(`GOZ ${nr}`)
    if (ebene === 'BEB' && !beb.has(nr)) out.add(`BEB ${nr}`)
  }
  return [...out]
}
