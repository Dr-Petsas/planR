// Leistungen je Termin: Zaehne, Mengen, Euro-Werte und die Schieberegler
// (je Termin und gesamt). Logik nach dem UPT-Planer-Prototyp (schotter.js,
// billing.js, export.js), Nummern korrigiert.

import { bemaPos, istBemaTeil1 } from '../data/bema-par'
import { ANALOG, GOAE, GOAE_PUNKTWERT, GOZ_PUNKTWERT, gozPunkte, gozText } from '../data/gebuehren'
import { KATALOG, type Kachel, type KachelPos, type MengenRegel, type Stufe } from '../data/kacheln'
import type { AbrechnungsModus, Befund, Einstellungen, ParFall, Termin } from '../types'
import {
  aitZaehne, behandelbare, betroffeneZaehne, cptZaehne, initialBefund, letzterBefund,
  subgingivalZaehne, zaehneAus,
} from './strecke'
import { ALLE_ZAEHNE, OBERKIEFER, istMehrwurzelig, kieferVon, quadrant } from './zahnschema'

// ---------------------------------------------------------------------------
// Zaehne je Termin
// ---------------------------------------------------------------------------

export interface TerminKontext {
  alle: string[] // vorhandene natuerliche Zaehne
  behandelt: string[] // in diesem Termin behandelte Zaehne
  roentgen: string[] // Zaehne, nach denen sich das Roentgen richtet
}

/** Zaehne einer Teilsitzung: 1 = alle, 2 = OK/UK, 4 = Quadranten. */
export function teilZaehne(zaehne: string[], teile: number, index: number): string[] {
  if (teile === 2) return zaehne.filter((z) => (index === 0 ? kieferVon(z) === 'OK' : kieferVon(z) === 'UK'))
  if (teile === 4) return zaehne.filter((z) => quadrant(z) === index + 1)
  return zaehne
}

const teilIndex = (t: Termin) => Math.max(0, Number(t.schluessel.split('-')[1] ?? 1) - 1)

/** Befund, aus dem ein Termin seine Zaehne nimmt. */
function befundFuerTermin(fall: ParFall, t: Termin): Befund {
  const vorTermin = fall.befunde.filter((b) => !t.datum || !b.datum || b.datum <= t.datum)
  const juengster = vorTermin.length
    ? [...vorTermin].sort((a, b) => (a.datum || '').localeCompare(b.datum || '')).at(-1)!
    : letzterBefund(fall)
  if (t.art === 'ait') return initialBefund(fall)
  if (t.art === 'cpt' || t.art === 'nachbehandlung') {
    return fall.befunde.filter((b) => b.phase === 'beva').at(-1) ?? initialBefund(fall)
  }
  return juengster
}

export function terminKontext(fall: ParFall, t: Termin): TerminKontext {
  const b = befundFuerTermin(fall, t)
  const alle = behandelbare(b).map(([z]) => z)
  const roentgen = betroffeneZaehne(b)
  let auto: string[]
  switch (t.art) {
    case 'ait': auto = teilZaehne(zaehneAus(aitZaehne(b)), fall.planung.aitSitzungen, teilIndex(t)); break
    case 'cpt': case 'nachbehandlung': auto = teilZaehne(zaehneAus(cptZaehne(b)), fall.planung.cptSitzungen, teilIndex(t)); break
    case 'upt': auto = zaehneAus(subgingivalZaehne(b)); break
    case 'befund': case 'atg': case 'pzr': auto = alle; break
    default: auto = []
  }
  return { alle, behandelt: t.zaehne ?? auto, roentgen }
}

// ---------------------------------------------------------------------------
// Mengen
// ---------------------------------------------------------------------------

/** Roentgen-Wahl nach Zahl der betroffenen Zaehne (Prototyp-Schwellen). */
export function roentgenWahl(zaehne: string[]): string | null {
  const n = zaehne.length
  if (n === 0) return null
  const beideKiefer = zaehne.some((z) => kieferVon(z) === 'OK') && zaehne.some((z) => kieferVon(z) === 'UK')
  if (n >= 16 && beideKiefer) return 'Ä935d'
  if (n >= 10) return 'Ä925d'
  if (n >= 6) return 'Ä925c'
  if (n >= 3) return 'Ä925b'
  return 'Ä925a'
}

/** BEMA 40 im Oberkiefer: je zusammenhaengender Gruppe jeder zweite Zahn. */
export function infiltrationen(zaehne: string[]): number {
  const set = new Set(zaehne)
  let n = 0
  let lauf = 0
  for (const z of OBERKIEFER) {
    if (set.has(z)) lauf++
    else { n += Math.ceil(lauf / 2); lauf = 0 }
  }
  return n + Math.ceil(lauf / 2)
}

/** 41a: eine Leitungsanaesthesie je Unterkieferseite mit behandelten Zaehnen. */
export function leitungen(zaehne: string[]): number {
  return [3, 4].filter((q) => zaehne.some((z) => quadrant(z) === q)).length
}

export function menge(regel: MengenRegel, ctx: TerminKontext): number {
  const b = ctx.behandelt
  if (typeof regel === 'object') return b.length ? Math.max(1, Math.ceil(b.length * regel.anteil)) : 0
  switch (regel) {
    case 'sitzung': return 1
    case 'eins': return b.length ? 1 : 0
    case 'alle': return ctx.alle.length
    case 'behandelt': return b.length
    case 'ein': return b.filter((z) => !istMehrwurzelig(z)).length
    case 'mehr': return b.filter((z) => istMehrwurzelig(z)).length
    case 'ohneErsten': return Math.max(0, b.length - 1)
    case 'infiltration': return infiltrationen(b)
    case 'leitung': return leitungen(b)
    case 'haelften': return new Set(b.map(quadrant)).size
    case 'kiefer': return new Set(b.map(kieferVon)).size
    case 'roentgen': return roentgenWahl(ctx.roentgen) ? 1 : 0
  }
}

// ---------------------------------------------------------------------------
// Preise
// ---------------------------------------------------------------------------

export interface Preise {
  parPw: number // BEMA Teil 4
  kchPw: number // BEMA Teil 1
  gozFaktor: number
  roentgenFaktor: number
  analog: Record<string, number>
}

export function preiseAus(einst: Einstellungen, parPw: number): Preise {
  return {
    parPw,
    kchPw: einst.kchPunktwertOverride && einst.kchPunktwertOverride > 0 ? einst.kchPunktwertOverride : parPw,
    gozFaktor: einst.gozFaktor || 2.3,
    roentgenFaktor: einst.roentgenFaktor || 1.8,
    analog: einst.analogPunkte,
  }
}

export interface Position {
  schluessel: string // "SYS|Nr"
  kachelId: string
  sys: KachelPos['sys']
  nr: string
  titel: string
  menge: number
  punkte: number // je Einheit
  faktor: number | null // nur privat
  euro: number
  privat: boolean
}

function positionBauen(p: KachelPos, kachelId: string, ctx: TerminKontext, t: Termin, preise: Preise): Position | null {
  let nr = p.nr
  if (p.sys === 'BEMA' && nr === 'ROE') {
    const w = roentgenWahl(ctx.roentgen)
    if (!w) return null
    nr = w
  }
  const schluessel = `${p.sys}|${nr}`
  const m = t.mengen[schluessel] ?? menge(p.menge, ctx)
  let punkte = 0
  let titel = nr
  let faktor: number | null = null
  let euroJe = 0
  if (p.sys === 'BEMA') {
    const b = bemaPos(nr)
    punkte = b?.punkte ?? 0
    titel = b?.titel ?? nr
    euroJe = punkte * (istBemaTeil1(nr) ? preise.kchPw : preise.parPw)
  } else if (p.sys === 'GOZ') {
    punkte = gozPunkte(nr) ?? 0
    titel = gozText(nr) || nr
    faktor = t.faktoren[schluessel] ?? preise.gozFaktor
    euroJe = punkte * GOZ_PUNKTWERT * faktor
  } else if (p.sys === 'GOÄ') {
    const g = GOAE[nr]
    punkte = g?.punkte ?? 0
    titel = g?.titel ?? nr
    faktor = t.faktoren[schluessel] ?? (g?.roentgen ? preise.roentgenFaktor : preise.gozFaktor)
    euroJe = punkte * GOAE_PUNKTWERT * faktor
  } else {
    const a = ANALOG[nr]
    punkte = preise.analog[nr] ?? a?.punkte ?? 0
    titel = a ? `${a.titel}, Bezug ${a.bezug}` : nr
    faktor = t.faktoren[schluessel] ?? preise.gozFaktor
    euroJe = punkte * GOZ_PUNKTWERT * faktor
  }
  return {
    schluessel, kachelId, sys: p.sys, nr, titel, menge: m, punkte, faktor,
    euro: Math.round(m * euroJe * 100) / 100, privat: p.sys !== 'BEMA',
  }
}

// ---------------------------------------------------------------------------
// Kacheln je Termin
// ---------------------------------------------------------------------------

/** Kacheln, die dieser Termin im gewaehlten Modus anbietet. */
export function kachelnFuer(t: Termin, modus: AbrechnungsModus): Kachel[] {
  return (KATALOG[t.art] ?? []).filter((k) => {
    if (k.modul && !t.module.includes(k.modul)) return false
    if (k.nurMitModul && !t.module.includes(k.nurMitModul)) return false
    if (modus === 'bema' && k.stufe === 'zusatz') return false
    return true
  })
}

export function kachelPositionen(k: Kachel, ctx: TerminKontext, t: Termin, preise: Preise): Position[] {
  return k.pos.map((p) => positionBauen(p, k.id, ctx, t, preise)).filter((p): p is Position => !!p && p.menge > 0)
}

export const kachelWert = (k: Kachel, ctx: TerminKontext, t: Termin, preise: Preise) =>
  kachelPositionen(k, ctx, t, preise).reduce((s, p) => s + p.euro, 0)

/** Grundauswahl: Standard-Kacheln ohne Abgewaehlte, plus von Hand Zugeschaltete. */
export function grundIds(t: Termin, kacheln: Kachel[]): Set<string> {
  const ids = new Set<string>()
  for (const k of kacheln) {
    if ((k.standard && !t.abgewaehlt.includes(k.id)) || t.auswahl.includes(k.id)) ids.add(k.id)
  }
  return ids
}

export function aktiveIds(t: Termin, kacheln: Kachel[]): Set<string> {
  const ids = grundIds(t, kacheln)
  for (const id of t.auto) if (kacheln.some((k) => k.id === id) && !t.abgewaehlt.includes(id)) ids.add(id)
  return ids
}

export interface KachelStand {
  kachel: Kachel
  wert: number
  aktiv: boolean
  auto: boolean
  positionen: Position[]
}

export interface TerminRechnung {
  ctx: TerminKontext
  kacheln: KachelStand[]
  positionen: Position[] // aktive, je Schluessel einmal
  summe: number
  kasse: number
  privat: number
  basis: number // Wert der Grundauswahl
  potential: number // Wert aller Kacheln
  punkteKasse: number
}

export function terminRechnen(fall: ParFall, t: Termin, preise: Preise): TerminRechnung {
  const ctx = terminKontext(fall, t)
  const kacheln = kachelnFuer(t, fall.modus)
  const grund = grundIds(t, kacheln)
  const aktiv = aktiveIds(t, kacheln)
  const stand: KachelStand[] = kacheln.map((k) => {
    const positionen = kachelPositionen(k, ctx, t, preise)
    return {
      kachel: k, positionen, wert: positionen.reduce((s, p) => s + p.euro, 0),
      aktiv: aktiv.has(k.id), auto: aktiv.has(k.id) && !grund.has(k.id),
    }
  })
  const gesehen = new Set<string>()
  const positionen: Position[] = []
  for (const s of stand) {
    if (!s.aktiv) continue
    for (const p of s.positionen) {
      if (gesehen.has(p.schluessel)) continue
      gesehen.add(p.schluessel)
      positionen.push(p)
    }
  }
  const summe = positionen.reduce((s, p) => s + p.euro, 0)
  const privat = positionen.filter((p) => p.privat).reduce((s, p) => s + p.euro, 0)
  return {
    ctx, kacheln: stand, positionen, summe, privat, kasse: summe - privat,
    basis: stand.filter((s) => grund.has(s.kachel.id)).reduce((x, s) => x + s.wert, 0),
    potential: stand.reduce((x, s) => x + s.wert, 0),
    punkteKasse: positionen.filter((p) => !p.privat).reduce((s, p) => s + p.punkte * p.menge, 0),
  }
}

// ---------------------------------------------------------------------------
// Regler
// ---------------------------------------------------------------------------

const STUFE_RANG: Record<Stufe, number> = { kern: 0, begleit: 1, zusatz: 2 }

/** Kandidaten fuer den Regler: nicht aktiv, nicht abgewaehlt, Wert > 0. */
function kandidaten(r: TerminRechnung, t: Termin): KachelStand[] {
  const grund = new Set(r.kacheln.filter((s) => s.aktiv && !s.auto).map((s) => s.kachel.id))
  return r.kacheln
    .filter((s) => !grund.has(s.kachel.id) && !t.abgewaehlt.includes(s.kachel.id) && s.wert > 0)
    .sort((a, b) => STUFE_RANG[a.kachel.stufe] - STUFE_RANG[b.kachel.stufe] || b.wert - a.wert)
}

/**
 * Regler eines Termins: ab der Grundauswahl Kacheln zuschalten (Begleit vor
 * Zusatz, jeweils wertvollste zuerst), bis der Zielwert erreicht ist. Von
 * Hand Gewaehltes bleibt unberuehrt.
 */
export function reglerTermin(fall: ParFall, t: Termin, preise: Preise, ziel: number): Termin {
  const r = terminRechnen(fall, { ...t, auto: [] }, preise)
  let summe = r.basis
  const auto: string[] = []
  for (const s of kandidaten(r, t)) {
    if (summe >= ziel - 0.005) break
    auto.push(s.kachel.id)
    summe += s.wert
  }
  return { ...t, auto }
}

/**
 * Gesamt-Regler: Ziel ueber alle offenen Termine im Rundlauf verteilen
 * (je Runde pro Termin die naechstwertvolle Kachel; erst alle Begleit-, dann
 * alle Zusatz-Kacheln). Erbrachte Termine bleiben unveraendert.
 */
export function reglerGesamt(fall: ParFall, preise: Preise, ziel: number): Termin[] {
  const termine = fall.termine.map((t) => (t.erbracht ? t : { ...t, auto: [] as string[] }))
  const rechnungen = termine.map((t) => terminRechnen(fall, t, preise))
  let summe = rechnungen.reduce((s, r) => s + r.summe, 0)
  for (const stufe of ['begleit', 'zusatz'] as Stufe[]) {
    const queues = termine.map((t, i) => (t.erbracht ? [] : kandidaten(rechnungen[i], t).filter((s) => s.kachel.stufe === stufe)))
    let weiter = true
    while (weiter && summe < ziel - 0.005) {
      weiter = false
      for (let i = 0; i < termine.length && summe < ziel - 0.005; i++) {
        const s = queues[i].shift()
        if (!s) continue
        weiter = true
        termine[i].auto = [...termine[i].auto, s.kachel.id]
        summe += s.wert
      }
    }
  }
  return termine
}

/** Summen ueber alle Termine. */
export function streckeRechnen(fall: ParFall, preise: Preise) {
  const je = fall.termine.map((t) => ({ termin: t, r: terminRechnen(fall, t, preise) }))
  const sum = (f: (x: (typeof je)[number]) => number) => je.reduce((s, x) => s + f(x), 0)
  return {
    je,
    summe: sum((x) => x.r.summe),
    kasse: sum((x) => x.r.kasse),
    privat: sum((x) => x.r.privat),
    basis: sum((x) => x.r.basis),
    potential: sum((x) => x.r.potential),
    erbracht: sum((x) => (x.termin.erbracht ? x.r.summe : 0)),
    erbrachtKasse: sum((x) => (x.termin.erbracht ? x.r.kasse : 0)),
  }
}

/** Alle Zaehne fuer Zahn-Auswahl-Chips. */
export const ZAHN_REIHE = ALLE_ZAEHNE
