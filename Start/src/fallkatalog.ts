/**
 * Fallkatalog unter KI-Training: je Praxis eine feste Zahl vollständiger Pläne.
 * Daraus entstehen deterministische Praxisregeln (Mehrheit, mindestens zwei Fälle).
 * Gespeichert wird ohne Namen, Kasse und Beträge. Clara bekommt nur die Regeln.
 */

export interface FallPosition {
  ebene: 'BEMA' | 'GOZ' | 'BEL' | 'BEB' | 'GOÄ'
  nr: string
  zahn: string
  anzahl: number
  faktor?: number
  begruendung?: string
  material?: string
}

export interface Fall {
  id: string
  slot: string
  befund: Record<string, string>
  positionen: FallPosition[]
  hochgeladen: string
}

export interface Praxisregel {
  slot: string
  titel: string
  worte: string[]
  ebene: string
  nr: string
  bezug: 'zahn' | 'kiefer' | 'plan'
  anzahl: number
  faktor?: number
  material?: string
  belegt: number
  von: number
  zeile: string
}

export interface KatalogZeile {
  id: string
  gruppe: string
  titel: string
  soll: number
  ist: number
  fertig: boolean
  hinweis: string
}

export interface FallAnsicht {
  zeilen: KatalogZeile[]
  soll: number
  ist: number
  arten: number
  artenFertig: number
  regeln: number
}

interface Slot {
  id: string
  gruppe: string
  titel: string
  soll: number
  /** Zahnersatz braucht eine Laborzeile oder einen Werkstoff */
  labor: boolean
  /** normalisiert, für Claras Zuordnung */
  worte: string[]
  hinweis: string
}

const HINWEIS_ZE = 'Befund je Zahn, Positionen mit Ebene und Nummer, Labor (BEL/BEB) oder Werkstoff, bei GOZ der Faktor, ab 2,3 die Begründung. Ohne Namen und Beträge.'
const HINWEIS = 'Befund je Zahn, Positionen mit Ebene und Nummer, bei GOZ der Faktor, ab 2,3 die Begründung. Ohne Namen und Beträge.'

export const FALLKATALOG: readonly Slot[] = [
  { id: 'ze-krone-regel', gruppe: 'Zahnersatz Kasse', titel: 'Krone, Regelversorgung', soll: 4, labor: true, worte: ['krone', 'regelversorgung'], hinweis: HINWEIS_ZE },
  { id: 'ze-krone-gleich', gruppe: 'Zahnersatz Kasse', titel: 'Krone, gleichartig', soll: 3, labor: true, worte: ['krone', 'gleichartig'], hinweis: HINWEIS_ZE },
  { id: 'ze-krone-anders', gruppe: 'Zahnersatz Kasse', titel: 'Krone, andersartig', soll: 2, labor: true, worte: ['krone', 'andersartig'], hinweis: HINWEIS_ZE },
  { id: 'ze-bruecke-regel', gruppe: 'Zahnersatz Kasse', titel: 'Brücke, Regelversorgung', soll: 3, labor: true, worte: ['bruecke', 'regelversorgung'], hinweis: HINWEIS_ZE },
  { id: 'ze-bruecke-gleich', gruppe: 'Zahnersatz Kasse', titel: 'Brücke, gleichartig', soll: 2, labor: true, worte: ['bruecke', 'gleichartig'], hinweis: HINWEIS_ZE },
  { id: 'ze-bruecke-anders', gruppe: 'Zahnersatz Kasse', titel: 'Brücke, andersartig', soll: 2, labor: true, worte: ['bruecke', 'andersartig'], hinweis: HINWEIS_ZE },
  { id: 'ze-teleskop', gruppe: 'Zahnersatz Kasse', titel: 'Teleskop / Cover-Denture', soll: 4, labor: true, worte: ['teleskop', 'cover'], hinweis: HINWEIS_ZE },
  { id: 'ze-modellguss', gruppe: 'Zahnersatz Kasse', titel: 'Modellguss / Teilprothese', soll: 3, labor: true, worte: ['modellguss', 'teilprothese'], hinweis: HINWEIS_ZE },
  { id: 'ze-total', gruppe: 'Zahnersatz Kasse', titel: 'Totalprothese', soll: 2, labor: true, worte: ['totalprothese'], hinweis: HINWEIS_ZE },
  { id: 'ze-implantat', gruppe: 'Zahnersatz Kasse', titel: 'Implantat-Suprakonstruktion', soll: 4, labor: true, worte: ['implantat', 'suprakonstruktion'], hinweis: HINWEIS_ZE },
  { id: 'privat-krone', gruppe: 'Zahnersatz privat', titel: 'Private Krone', soll: 3, labor: true, worte: ['private krone'], hinweis: HINWEIS_ZE },
  { id: 'privat-bruecke', gruppe: 'Zahnersatz privat', titel: 'Private Brücke', soll: 2, labor: true, worte: ['private bruecke'], hinweis: HINWEIS_ZE },
  { id: 'privat-teleskop', gruppe: 'Zahnersatz privat', titel: 'Privates Teleskop', soll: 2, labor: true, worte: ['privates teleskop'], hinweis: HINWEIS_ZE },
  { id: 'kons-fuellung', gruppe: 'Konservierend', titel: 'Füllung, Kasse', soll: 3, labor: false, worte: ['fuellung'], hinweis: HINWEIS },
  { id: 'kons-mkv', gruppe: 'Konservierend', titel: 'Füllung mit Mehrkosten', soll: 2, labor: false, worte: ['mehrkosten', 'mkv'], hinweis: HINWEIS },
  { id: 'kons-privat', gruppe: 'Konservierend', titel: 'Private Konservation', soll: 2, labor: false, worte: ['inlay', 'private kons'], hinweis: HINWEIS },
  { id: 'par-kasse', gruppe: 'PAR', titel: 'PAR, Kasse', soll: 3, labor: false, worte: ['par', 'parodontal', 'upt'], hinweis: HINWEIS },
  { id: 'par-privat', gruppe: 'PAR', titel: 'PAR, privat', soll: 2, labor: false, worte: ['private par'], hinweis: HINWEIS },
  { id: 'kb', gruppe: 'Funktion', titel: 'Funktionsanalyse / Aufbissbehelf', soll: 2, labor: false, worte: ['funktionsanalyse', 'aufbissbehelf', 'schiene'], hinweis: HINWEIS },
]

const slotVon = (id: string) => FALLKATALOG.find((s) => s.id === id)
const istObjekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const ZAHN = /^(?:[1-4][1-8])$/
const NR = /^[0-9A-Za-zÄÖÜäöü./]{1,12}$/
const EBENEN = new Set(['BEMA', 'GOZ', 'BEL', 'BEB', 'GOÄ'])

const ebeneVon = (s: string) => {
  const e = s.trim().toUpperCase().replace('GOAE', 'GOÄ')
  if (e === 'GOA') return 'GOÄ'
  return EBENEN.has(e) ? e as FallPosition['ebene'] : ''
}

const komma = (n: number) => String(n).replace('.', ',')

function zahnMap(roh: Record<string, unknown>): Record<string, string> {
  const aus: Record<string, string> = {}
  for (const [z, v] of Object.entries(roh)) {
    if (!ZAHN.test(z) || aus[z]) continue
    const code = (typeof v === 'string' ? v : istObjekt(v) ? String(v.B ?? v.b ?? v.befund ?? '') : '').trim()
    if (code) aus[z] = code.slice(0, 40)
    if (Object.keys(aus).length >= 32) break
  }
  return aus
}

function befundAus(roh: Record<string, unknown>): Record<string, string> {
  if (istObjekt(roh.befund)) return zahnMap(roh.befund)
  const plan = istObjekt(roh.plan) ? roh.plan : roh
  if (istObjekt(plan.befund)) return zahnMap(plan.befund)
  const zaehne = istObjekt(plan.zaehne) ? plan.zaehne : istObjekt(roh.zaehne) ? roh.zaehne : null
  return zaehne ? zahnMap(zaehne) : {}
}

function alsListe(x: unknown): unknown[] {
  if (Array.isArray(x)) return x
  if (istObjekt(x) && Array.isArray(x.positionen)) return x.positionen
  return []
}

function positionenAus(roh: Record<string, unknown>): unknown[] {
  const plan = istObjekt(roh.plan) ? roh.plan : {}
  const ergebnis = istObjekt(roh.ergebnis) ? roh.ergebnis : istObjekt(plan.ergebnis) ? plan.ergebnis : {}
  const rechnung = alsListe(roh.rechnung ?? plan.rechnung)
  if (rechnung.length) return rechnung
  const direkt = alsListe(roh.positionen)
  if (direkt.length) return direkt
  const ausPlan = alsListe(plan.positionen)
  if (ausPlan.length) return ausPlan
  return alsListe(ergebnis.positionen)
}

function positionLesen(roh: unknown): FallPosition | null {
  if (!istObjekt(roh)) return null
  const ebene = ebeneVon(String(roh.ebene ?? ''))
  const nr = String(roh.nr ?? roh.nummer ?? '').trim()
  if (!ebene || !NR.test(nr)) return null
  const zahnRoh = String(roh.zahn ?? roh.kiefer ?? '').trim().toUpperCase()
  const zahn = ZAHN.test(zahnRoh) || zahnRoh === 'OK' || zahnRoh === 'UK' ? zahnRoh : ''
  const anzahl = Math.min(99, Math.max(1, Math.round(Number(roh.anzahl) || 1)))
  const faktorN = Number(roh.faktor)
  const faktor = Number.isFinite(faktorN) && faktorN >= 1 && faktorN <= 3.5 ? Math.round(faktorN * 10) / 10 : undefined
  const begr = String(roh.begruendung ?? roh.faktorBegruendung ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  const material = String(roh.material ?? roh.werkstoff ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  const p: FallPosition = { ebene, nr, zahn, anzahl }
  if (faktor !== undefined) p.faktor = faktor
  if (begr) p.begruendung = begr
  if (material && !/€|\beuro\b/i.test(material)) p.material = material
  return p
}

export function finger(slot: string, befund: Record<string, string>, positionen: FallPosition[]): string {
  const b = Object.entries(befund).sort().map(([z, v]) => `${z}=${v}`).join(',')
  const p = positionen.map((x) => `${x.ebene}|${x.nr}|${x.zahn}|${x.anzahl}|${x.faktor ?? ''}`).sort().join(';')
  return `${slot}#${b}#${p}`
}

/** Liest einen vollständigen Plan. Die Planart kommt von der Zeile, nicht aus der Datei. */
export function fallPruefen(slotId: string, roh: unknown): { befund: Record<string, string>; positionen: FallPosition[] } | { fehler: string } {
  const slot = slotVon(slotId)
  if (!slot) return { fehler: 'Diese Planart steht nicht im Katalog.' }
  if (!istObjekt(roh) || Array.isArray(roh)) return { fehler: 'Die Datei muss ein Plan sein, ein JSON-Objekt.' }
  const befund = befundAus(roh)
  if (!Object.keys(befund).length) return { fehler: 'Der Befund je Zahn fehlt.' }
  const positionen = positionenAus(roh).map(positionLesen).filter((p): p is FallPosition => !!p).slice(0, 80)
  if (!positionen.length) return { fehler: 'Es sind keine Positionen mit Ebene und Nummer enthalten.' }
  for (const p of positionen) {
    if (p.ebene === 'GOZ' && p.faktor === undefined) return { fehler: `GOZ ${p.nr} ohne Faktor.` }
    if (p.ebene === 'GOZ' && p.faktor! > 2.3 && !p.begruendung) return { fehler: `GOZ ${p.nr} mit Faktor ${komma(p.faktor!)} ohne Begründung.` }
  }
  if (slot.labor && !positionen.some((p) => p.ebene === 'BEL' || p.ebene === 'BEB' || p.material)) {
    return { fehler: 'Laborposition (BEL oder BEB) oder Werkstoff fehlt.' }
  }
  return { befund, positionen }
}

const DECKEL = 4

export function fallAufnehmen(faelle: Fall[], slotId: string, roh: unknown, jetzt = new Date(), id = ''): { faelle: Fall[]; fehler?: string; fall?: Fall } {
  const geprueft = fallPruefen(slotId, roh)
  if ('fehler' in geprueft) return { faelle, fehler: geprueft.fehler }
  const slot = slotVon(slotId)!
  const bisher = faelle.filter((f) => f.slot === slotId)
  if (bisher.length >= slot.soll + DECKEL) return { faelle, fehler: `Für ${slot.titel} liegen schon ${bisher.length} Pläne vor.` }
  const kennung = finger(slotId, geprueft.befund, geprueft.positionen)
  if (bisher.some((f) => finger(f.slot, f.befund, f.positionen) === kennung)) {
    return { faelle, fehler: `Dieser Plan liegt für ${slot.titel} schon vor.` }
  }
  const fall: Fall = {
    id: id || `f${jetzt.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    slot: slotId,
    befund: geprueft.befund,
    positionen: geprueft.positionen,
    hochgeladen: jetzt.toISOString(),
  }
  return { faelle: [...faelle, fall], fall }
}

export function fallEntfernen(faelle: Fall[], slotId: string): { faelle: Fall[]; entfernt: boolean } {
  const i = faelle.map((f) => f.slot).lastIndexOf(slotId)
  if (i < 0) return { faelle, entfernt: false }
  return { faelle: faelle.filter((_, n) => n !== i), entfernt: true }
}

function modus<T>(werte: T[]): { wert: T; n: number } | null {
  const z = new Map<T, number>()
  for (const v of werte) z.set(v, (z.get(v) ?? 0) + 1)
  let best: { wert: T; n: number } | null = null
  for (const [wert, n] of z) if (!best || n > best.n) best = { wert, n }
  return best
}

const bezugVon = (zahn: string): Praxisregel['bezug'] => ZAHN.test(zahn) ? 'zahn' : zahn === 'OK' || zahn === 'UK' ? 'kiefer' : 'plan'

/** Dieselbe Position in der Mehrheit der Pläne dieser Art, mindestens in zweien. Ein Einzelfall wird keine Regel. */
export function regelnAus(faelle: Fall[]): Praxisregel[] {
  const regeln: Praxisregel[] = []
  for (const slot of FALLKATALOG) {
    const gruppe = faelle.filter((f) => f.slot === slot.id)
    const von = gruppe.length
    if (von < 2) continue
    const schluessel = new Map<string, { ebene: string; nr: string; treffer: FallPosition[] }>()
    for (const fall of gruppe) {
      const gesehen = new Set<string>()
      for (const p of fall.positionen) {
        const key = `${p.ebene}|${p.nr}`
        if (gesehen.has(key)) continue
        gesehen.add(key)
        const alt = schluessel.get(key) ?? { ebene: p.ebene, nr: p.nr, treffer: [] }
        alt.treffer.push(p)
        schluessel.set(key, alt)
      }
    }
    for (const { ebene, nr, treffer } of schluessel.values()) {
      if (treffer.length < 2 || treffer.length * 2 <= von) continue
      const bezug = modus(treffer.map((p) => bezugVon(p.zahn)))!
      const anzahl = modus(treffer.map((p) => p.anzahl))!
      const faktoren = treffer.map((p) => p.faktor).filter((n): n is number => n !== undefined)
      const faktorM = modus(faktoren)
      const faktor = faktorM && faktorM.n * 2 > treffer.length ? faktorM.wert : undefined
      const materialM = modus(treffer.map((p) => p.material).filter((m): m is string => !!m))
      const material = materialM && materialM.n * 2 > treffer.length ? materialM.wert : undefined
      const teile = [`Bei ${slot.titel}: ${ebene} ${nr}`]
      if (bezug.wert === 'zahn') teile[0] += ' je Zahn'
      else if (bezug.wert === 'kiefer') teile[0] += ' je Kiefer'
      if (anzahl.wert > 1) teile.push(`${anzahl.wert} mal`)
      if (faktor !== undefined) teile.push(`Faktor ${komma(faktor)}`)
      if (material) teile.push(material)
      teile.push(`belegt in ${treffer.length} von ${von} Plänen`)
      const zeile = teile.join(', ').replace(', belegt', '. Belegt')
      regeln.push({
        slot: slot.id, titel: slot.titel, worte: [...slot.worte], ebene, nr,
        bezug: bezug.wert, anzahl: anzahl.wert, belegt: treffer.length, von, zeile,
        ...(faktor !== undefined ? { faktor } : {}),
        ...(material ? { material } : {}),
      })
    }
  }
  return regeln
}

export function fallAnsicht(faelle: Fall[]): FallAnsicht {
  const regeln = regelnAus(faelle)
  const zeilen = FALLKATALOG.map((s) => {
    const ist = faelle.filter((f) => f.slot === s.id).length
    return { id: s.id, gruppe: s.gruppe, titel: s.titel, soll: s.soll, ist, fertig: ist >= s.soll, hinweis: s.hinweis }
  })
  return {
    zeilen,
    soll: zeilen.reduce((n, z) => n + z.soll, 0),
    ist: zeilen.reduce((n, z) => n + Math.min(z.ist, z.soll), 0),
    arten: zeilen.length,
    artenFertig: zeilen.filter((z) => z.fertig).length,
    regeln: regeln.length,
  }
}
