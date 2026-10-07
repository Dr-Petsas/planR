/**
 * Zentraler Datendienst der Startseite (F:\PlanR\Start\public\daten): Punktwerte und Preislisten.
 * "Aktualisieren" holt den neuesten Stand dort ab und legt ihn im Browser ab; ohne Dienst
 * rechnet jeder Planer mit seinen mitgelieferten Listen weiter.
 *
 * Der Speicher ist bewusst NICHT je Mandant: Punktwerte und Listen vereinbart die KZV
 * bzw. gibt der Verordnungsgeber vor, nicht die Praxis.
 */

export interface Datenstand {
  stand?: string
  gueltigAb?: string
}

export interface IndexEintrag {
  datei: string
  name: string
  stand: string
}

export interface DatenIndex {
  stand: string
  dateien: IndexEintrag[]
}

const SPEICHER = (datei: string) => `planr.daten.${datei}`

export const standVon = (d: Datenstand | null | undefined) => d?.stand || d?.gueltigAb || ''

const hoerer = new Set<() => void>()
let version = 0
export function datenAbo(cb: () => void) {
  hoerer.add(cb)
  return () => hoerer.delete(cb)
}
export const datenVersion = () => version
const melden = () => {
  version += 1
  hoerer.forEach((cb) => cb())
}

/** Adressen des Datendienstes: über den Tunnel die Startseite, lokal deren Ports. */
export function datenBasen(): string[] {
  if (typeof location === 'undefined') return []
  const { protocol, hostname } = location
  if (hostname.endsWith('.pickadoc-tunnel.com')) return ['https://planr.pickadoc-tunnel.com/daten/']
  return [`${protocol}//${hostname}:5189/daten/`, `${protocol}//${hostname}:5188/daten/`]
}

export async function datenHolen<T>(datei: string): Promise<T> {
  let fehler: unknown = new Error('Kein Datendienst konfiguriert')
  for (const basis of datenBasen()) {
    const ab = new AbortController()
    const uhr = setTimeout(() => ab.abort(), 6000)
    try {
      const r = await fetch(basis + datei, { cache: 'no-store', signal: ab.signal })
      if (!r.ok) throw new Error(`${datei}: HTTP ${r.status}`)
      return (await r.json()) as T
    } catch (e) {
      fehler = e
    } finally {
      clearTimeout(uhr)
    }
  }
  throw fehler
}

export function gespeichert<T>(datei: string): T | null {
  try {
    const roh = localStorage.getItem(SPEICHER(datei))
    return roh ? (JSON.parse(roh) as T) : null
  } catch {
    return null
  }
}

export function speichern(datei: string, daten: unknown) {
  localStorage.setItem(SPEICHER(datei), JSON.stringify(daten))
  melden()
}

export function verwerfen(datei: string) {
  localStorage.removeItem(SPEICHER(datei))
  melden()
}

/** Geladener Stand, wenn er neuer ist als der mitgelieferte – sonst der mitgelieferte. */
export function aktuell<T extends Datenstand>(datei: string, mitgeliefert: T): T {
  const g = typeof localStorage === 'undefined' ? null : gespeichert<T>(datei)
  return g && standVon(g) > standVon(mitgeliefert) ? g : mitgeliefert
}

export interface Aktualisierung {
  datei: string
  name: string
  alt: string
  neu: string
  geaendert: boolean
}

/** Geladene Dateien unter einem Ordner, die nicht mitgeliefert sind (z. B. die BEL-II-Liste des neuen Jahres). */
export function zusaetzliche<T>(ordner: string, mitgeliefert: string[]): T[] {
  if (typeof localStorage === 'undefined') return []
  const praefix = SPEICHER(ordner)
  const bekannt = new Set(mitgeliefert.map(SPEICHER))
  const out: T[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(praefix) && !bekannt.has(k)) {
      const d = gespeichert<T>(k.slice('planr.daten.'.length))
      if (d) out.push(d)
    }
  }
  return out
}

/**
 * Holt für jede genutzte Datei den Stand laut Index und lädt nur, was neuer ist.
 * `neueOrdner`: zusätzlich alle Index-Dateien dieser Ordner, die noch fehlen (neue Jahreslisten).
 */
export async function aktualisieren(genutzt: { datei: string; mitgeliefert: Datenstand }[], neueOrdner: string[] = []): Promise<Aktualisierung[]> {
  const index = await datenHolen<DatenIndex>('index.json')
  const ergebnis: Aktualisierung[] = []
  const bekannt = new Set(genutzt.map((g) => g.datei))
  for (const d of index.dateien) {
    if (bekannt.has(d.datei) || !neueOrdner.some((o) => d.datei.startsWith(o))) continue
    const vorhanden = gespeichert<Datenstand>(d.datei)
    if (standVon(vorhanden) >= d.stand) continue
    speichern(d.datei, await datenHolen(d.datei))
    ergebnis.push({ datei: d.datei, name: d.name, alt: '', neu: d.stand, geaendert: true })
  }
  for (const g of genutzt) {
    const eintrag = index.dateien.find((d) => d.datei === g.datei)
    const alt = standVon(aktuell(g.datei, g.mitgeliefert))
    if (!eintrag) {
      ergebnis.push({ datei: g.datei, name: g.datei, alt, neu: alt, geaendert: false })
      continue
    }
    if (eintrag.stand > alt) {
      speichern(g.datei, await datenHolen(g.datei))
      ergebnis.push({ datei: g.datei, name: eintrag.name, alt, neu: eintrag.stand, geaendert: true })
    } else {
      ergebnis.push({ datei: g.datei, name: eintrag.name, alt, neu: alt, geaendert: false })
    }
  }
  return ergebnis
}
