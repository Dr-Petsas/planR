/**
 * Einstieg für MAS/Clara: HKP-Engine ohne Browser. Wird mit `npm run build:engine` zu einem
 * einzelnen ESM-Bundle gebaut und nach MAS-2/backend/src/vendor/hkp-engine.mjs kopiert.
 */
import type { Ebene, HkpPlan, Preisliste } from '../types'
import { STANDARD_LISTEN, listenFuerPlan } from '../store/preislisten'
import { planNormalisieren } from '../store/plan'
import { berechnen, belNrNorm, type Ergebnis, type Listen } from '../engine/berechnung'
import type { EigenPosition } from '../engine/eigenlabor'
import { auftragVerstehen, befundAusAuftrag, befundVerstehen, planAusAuftrag, type Befund, type PlanOptionen, type Rueckfrage } from '../engine/auftrag'
import { ALLE_ZAEHNE } from '../engine/zahnschema'
import {
  ausfuehrungAnwenden, ausfuehrungIn, ausfuehrungSatz, ausfuehrungUnterschied, ausfuehrungVon, systemSprech,
  LABOR_SPRECH, WERKSTOFF_SPRECH, type Ausfuehrung, type AusfuehrungStand,
} from '../engine/ausfuehrung'

export { auftragVerstehen, befundAusAuftrag, befundVerstehen, planAusAuftrag, planNormalisieren, berechnen, STANDARD_LISTEN }
export { ausfuehrungIn, ausfuehrungSatz, ausfuehrungVon, systemSprech, LABOR_SPRECH, WERKSTOFF_SPRECH }
export { befundDatei, befundDateiName } from './befundDatei'
export type { Befund, PlanOptionen, Rueckfrage, Ergebnis, HkpPlan, Ausfuehrung, AusfuehrungStand }
export type { BefundDatei, BefundDateiAngaben } from './befundDatei'

declare const __HKP_ENGINE_STAND__: string | undefined
export const ENGINE_STAND = typeof __HKP_ENGINE_STAND__ === 'string' ? __HKP_ENGINE_STAND__ : 'dev'

export interface PraxisListen {
  /** in PlanR gepflegte bzw. geänderte Preislisten; gleiche id ersetzt die mitgelieferte */
  preislisten?: Preisliste[]
  /** Eigenlabor-Katalog */
  eigen?: EigenPosition[]
}

/** Preislisten für einen Plan wählen (KZV, Stichtag) – wie in der App */
export function listenFuer(plan: HkpPlan, praxis: PraxisListen = {}): Listen {
  const eigene = praxis.preislisten ?? []
  const ids = new Set(eigene.map((l) => l.id))
  const alle = [...STANDARD_LISTEN.filter((l) => !ids.has(l.id)), ...eigene]
  return { ...listenFuerPlan(alle, plan), eigen: praxis.eigen ?? [] }
}

export const rechnen = (plan: HkpPlan, praxis: PraxisListen = {}): Ergebnis => berechnen(plan, listenFuer(plan, praxis))

export interface Zusammenfassung {
  teleskope: string[]
  kronen: string[]
  ersetzt: string[]
  /** Brückenglieder (Teil von `ersetzt`) */
  glieder: string[]
  /** implantatgetragene Kronen (SK) */
  implantatkronen: string[]
  befunde: string[]
  festzuschuss: number
  gesamt: number
  kassenanteil: number
  eigenanteil: number
  material: number
  warnungen: string[]
}

const sortiert = (zs: string[]) => [...zs].sort((a, b) => ALLE_ZAEHNE.indexOf(a) - ALLE_ZAEHNE.indexOf(b))

export function zusammenfassen(plan: HkpPlan, e: Ergebnis): Zusammenfassung {
  // Ganz ohne TP-Zeile ist die Therapie die Regelversorgung (sonst fehlte bei Kassenbrücken das „Geplant“).
  // Nicht zahnweise: bei Implantaten statt Brücke stünden sonst die Regel-Brückenanker als Kronen da.
  const ohneTp = Object.values(plan.zaehne).every((z) => !z.TP?.trim())
  const versorgung = (z: { TP?: string; R?: string }) => ((ohneTp ? z.R : z.TP) ?? '').trim().toUpperCase()
  const mit = (re: RegExp) => sortiert(Object.entries(plan.zaehne).filter(([, z]) => re.test(versorgung(z))).map(([n]) => n))
  return {
    teleskope: mit(/^T2?V?$/),
    kronen: mit(/^(K|KV|KH|KVH|KM|PK|PKM|PKV)$/),
    ersetzt: mit(/^(E|B|BV|BM|BH|BVH)$/),
    glieder: mit(/^(B|BV|BM|BH|BVH)$/),
    implantatkronen: mit(/^SK/),
    befunde: [...new Set(e.befunde.map((b) => b.nr))],
    festzuschuss: e.summen.festzuschuss,
    gesamt: e.summen.gesamt,
    kassenanteil: e.summen.kassenanteil,
    eigenanteil: e.summen.eigenanteil,
    material: e.summen.fremdMat + e.summen.eigenMat,
    warnungen: e.hinweise.filter((h) => h.stufe !== 'info').map((h) => h.text),
  }
}

export interface Entwurf {
  status: 'ok'
  plan: HkpPlan
  ergebnis: Ergebnis
  zusammenfassung: Zusammenfassung
  hinweise: string[]
}

/** Gesprochener Auftrag + Befund → gerechneter HKP-Entwurf oder Rückfrage */
export function hkpEntwurf(auftragText: string, befund: Befund, optionen: PlanOptionen = {}, praxis: PraxisListen = {}): Entwurf | Rueckfrage {
  const r = planAusAuftrag(auftragVerstehen(auftragText), befund, optionen)
  if (r.status !== 'ok') return r
  const ergebnis = rechnen(r.plan, praxis)
  return { status: 'ok', plan: r.plan, ergebnis, zusammenfassung: zusammenfassen(r.plan, ergebnis), hinweise: r.hinweise }
}

const EINER: Record<string, number> = {
  null: 0, ein: 1, eins: 1, eine: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, sieb: 7, acht: 8, neun: 9,
  zehn: 10, elf: 11, zwoelf: 12, sechzehn: 16, siebzehn: 17,
}
const ZEHNER: Record<string, number> = { zwanzig: 20, dreissig: 30, vierzig: 40, fuenfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 }

/** Deutsches Zahlwort („einundneunzig“, „zweitausendeinhunderteins“) → Zahl */
export function zahlwort(w: string): number | undefined {
  if (!w) return undefined
  if (w in EINER) return EINER[w]
  if (w in ZEHNER) return ZEHNER[w]
  if (w.endsWith('zehn') && w.slice(0, -4) in EINER) return 10 + EINER[w.slice(0, -4)]
  for (const [wort, faktor] of [['tausend', 1000], ['hundert', 100]] as const) {
    const i = w.indexOf(wort)
    if (i < 0) continue
    const links = i === 0 ? 1 : zahlwort(w.slice(0, i))
    const rechts = w.slice(i + wort.length)
    const r = rechts ? zahlwort(rechts.replace(/^und/, '')) : 0
    return links === undefined || r === undefined ? undefined : links * faktor + r
  }
  const und = w.indexOf('und')
  if (und > 0) {
    const e = zahlwort(w.slice(0, und)), z = ZEHNER[w.slice(und + 3)]
    return e !== undefined && e < 10 && z ? z + e : undefined
  }
  return undefined
}

const EBENE_WORT: [RegExp, Ebene][] = [[/\bbema\b|\bkasse/, 'BEMA'], [/\bgoz\b/, 'GOZ'], [/\bbel\b/, 'BEL'], [/\bbeb\b/, 'BEB']]

/**
 * Gesprochene Positionsnummer normalisieren: „BEL neun sieben null null“ → BEL 9700,
 * „einundneunzig b“ → 91b, „GOZ fünfzig vierzig“ → GOZ 5040, „97 00“ → 9700.
 */
export function positionVerstehen(text: string): { ebene?: Ebene; nr: string } | undefined {
  const t = text.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  const ebene = EBENE_WORT.find(([re]) => re.test(t))?.[1]
  const rest = t.replace(/\bbel ii\b|\b(bema|goz|bel|beb|kasse\w*|position|nummer|nr|ziffer|die|der|ist|im|in|hkp|enthalten)\b/g, ' ')
  let nr = ''
  for (const wort of rest.split(/[\s,.-]+/).filter(Boolean)) {
    if (/^\d+[a-z]?$/.test(wort)) { nr += wort; continue }
    if (/^[a-e]$/.test(wort) && nr) { nr += wort; continue }
    const z = zahlwort(wort)
    if (z !== undefined) nr += String(z)
  }
  return nr ? { ebene, nr } : undefined
}

const nrGleich = (ebene: Ebene, a: string, b: string) => {
  const n = (s: string) => belNrNorm(s).toLowerCase().replace(/^0+(?=\d)/, '')
  return ebene === 'BEL' || ebene === 'BEB' ? n(a).padStart(4, '0') === n(b).padStart(4, '0') : n(a) === n(b)
}

export interface PositionsTreffer {
  ebene: Ebene
  nr: string
  zahn: string
  anzahl: number
  betrag: number
  bezeichnung: string
}

export interface PositionsPruefung {
  ebene?: Ebene
  nr: string
  enthalten: boolean
  treffer: PositionsTreffer[]
  /** Leistungstext laut Preisliste, auch wenn die Position nicht im Plan steht */
  katalog: { ebene: Ebene; text: string }[]
}

export interface Aenderung {
  aktion: 'entfernen' | 'hinzufuegen' | 'anzahl' | 'faktor'
  ebene: Ebene
  nr: string
  /** Zahn bzw. Gebiet; leer = alle Zähne mit dieser Position (entfernen/anzahl/faktor) bzw. ohne Zahnbezug (hinzufügen) */
  zahn?: string
  anzahl?: number
  faktor?: number
}

export type AenderungsErgebnis =
  | { ok: true; plan: HkpPlan; ergebnis: Ergebnis; beschreibung: string; vorher: Zusammenfassung; nachher: Zusammenfassung; warnungen: string[] }
  | { ok: false; grund: 'nicht_gefunden' | 'unbekannt' | 'ungueltig'; meldung: string }

const schluessel = (p: { ebene: string; nr: string; zahn: string }) => `${p.ebene}|${p.nr}|${p.zahn}`
const anzeige = (ebene: Ebene, nr: string) => `${ebene} ${nr}`

/** Ändert eine Position und rechnet neu. Regelengine-Positionen, die entfernt werden, landen in `ausgeschlossen`. */
export function positionAendern(planRoh: HkpPlan, a: Aenderung, praxis: PraxisListen = {}): AenderungsErgebnis {
  const plan = planNormalisieren(planRoh)
  const listen = listenFuer(plan, praxis)
  const vorherErgebnis = berechnen(plan, listen)
  const vorher = zusammenfassen(plan, vorherErgebnis)
  const zahn = (a.zahn ?? '').trim()
  const passt = (p: { ebene: Ebene; nr: string; zahn: string }) => p.ebene === a.ebene && nrGleich(a.ebene, p.nr, a.nr) && (!zahn || p.zahn === zahn)
  const betroffen = plan.positionen.filter(passt)
  const katalog = positionPruefen(vorherErgebnis, listen, { ebene: a.ebene, nr: a.nr }).katalog[0]
  const warnungen: string[] = []
  let positionen = plan.positionen
  let ausgeschlossen = plan.ausgeschlossen
  let beschreibung = ''

  if (a.aktion === 'hinzufuegen') {
    if (!katalog) return { ok: false, grund: 'unbekannt', meldung: `${anzeige(a.ebene, a.nr)} steht in keiner aktiven Preisliste.` }
    const nr = (listen[({ BEMA: 'bema', GOZ: 'goz', BEL: 'bel', BEB: 'beb' } as const)[a.ebene as 'BEMA']]?.eintraege as { nr: string }[] | undefined)
      ?.find((x) => nrGleich(a.ebene, x.nr, a.nr))?.nr ?? a.nr
    const k = schluessel({ ebene: a.ebene, nr, zahn })
    if (ausgeschlossen.includes(k)) {
      ausgeschlossen = ausgeschlossen.filter((x) => x !== k)
      warnungen.push('Die Position war zuvor ausgeschlossen und wird beim nächsten „HKP berechnen“ wieder von der Regelengine gesetzt.')
    }
    if (betroffen.length) return { ok: false, grund: 'ungueltig', meldung: `${anzeige(a.ebene, nr)}${zahn ? ` an ${zahn}` : ''} ist schon enthalten.` }
    const anzahl = a.anzahl && a.anzahl > 0 ? a.anzahl : 1
    positionen = [...positionen, {
      id: `clara-${a.ebene}-${nr}-${zahn || 'fall'}-${Date.now().toString(36)}`, ebene: a.ebene, nr, zahn, anzahl,
      ...(a.ebene === 'GOZ' ? { faktor: a.faktor ?? plan.einstellungen.gozFaktor } : {}),
    }]
    beschreibung = `${anzeige(a.ebene, nr)} (${kurzText(katalog.text)})${zahn ? ` an ${zahn}` : ''}${anzahl !== 1 ? `, ${anzahl}-mal` : ''} hinzufügen`
  } else {
    if (!betroffen.length) return { ok: false, grund: 'nicht_gefunden', meldung: `${anzeige(a.ebene, a.nr)}${zahn ? ` an ${zahn}` : ''} ist in diesem HKP nicht enthalten.` }
    const ids = new Set(betroffen.map((p) => p.id))
    const zaehne = [...new Set(betroffen.map((p) => p.zahn).filter(Boolean))]
    const wo = zaehne.length ? ` an ${zaehne.join(', ')}` : ''
    const neueAus = betroffen.filter((p) => p.auto).map(schluessel)
    if (a.aktion === 'entfernen') {
      positionen = positionen.filter((p) => !ids.has(p.id))
      beschreibung = `${anzeige(a.ebene, betroffen[0].nr)}${wo} entfernen`
    } else if (a.aktion === 'anzahl') {
      if (!(a.anzahl! > 0)) return { ok: false, grund: 'ungueltig', meldung: 'Die neue Anzahl fehlt.' }
      positionen = positionen.map((p) => (ids.has(p.id) ? { ...p, anzahl: a.anzahl!, auto: false } : p))
      beschreibung = `${anzeige(a.ebene, betroffen[0].nr)}${wo} auf Anzahl ${a.anzahl} setzen`
    } else {
      if (a.ebene !== 'GOZ') return { ok: false, grund: 'ungueltig', meldung: 'Einen Steigerungsfaktor gibt es nur bei GOZ-Positionen.' }
      if (!(a.faktor! >= 1) || a.faktor! > 3.5) return { ok: false, grund: 'ungueltig', meldung: 'Der Faktor muss zwischen 1,0 und 3,5 liegen; darüber nur mit Vereinbarung nach Paragraf 2 GOZ in PlanR.' }
      positionen = positionen.map((p) => (ids.has(p.id) ? { ...p, faktor: a.faktor!, auto: false } : p))
      beschreibung = `${anzeige(a.ebene, betroffen[0].nr)}${wo} auf Faktor ${String(a.faktor).replace('.', ',')} setzen`
      if (a.faktor! > 2.3) warnungen.push('Faktor über 2,3 braucht eine schriftliche Begründung – bitte in PlanR eintragen.')
    }
    ausgeschlossen = [...new Set([...ausgeschlossen, ...neueAus])]
  }

  const neu: HkpPlan = { ...plan, positionen, ausgeschlossen }
  const ergebnis = berechnen(neu, listen)
  const nachher = zusammenfassen(neu, ergebnis)
  warnungen.push(...nachher.warnungen.filter((w) => !vorher.warnungen.includes(w)))
  return { ok: true, plan: neu, ergebnis, beschreibung, vorher, nachher, warnungen }
}

export type AusfuehrungsErgebnis =
  | { ok: true; plan: HkpPlan; ergebnis: Ergebnis; beschreibung: string; vorher: Zusammenfassung; nachher: Zusammenfassung; ausfuehrung: AusfuehrungStand; warnungen: string[] }
  | { ok: false; grund: 'nichts' | 'unveraendert'; meldung: string }

/** Ändert Kronenmaterial, Abformung, Labor, Implantatsystem bzw. Eigenlabor-Stufe eines Plans und rechnet neu. */
export function ausfuehrungAendern(planRoh: HkpPlan, a: Ausfuehrung, praxis: PraxisListen = {}): AusfuehrungsErgebnis {
  if (!Object.keys(a).length)
    return { ok: false, grund: 'nichts', meldung: 'Was soll ich an der Ausführung ändern – Material, Abformung, Labor oder Implantatsystem?' }
  const plan = planNormalisieren(planRoh)
  const vorher = zusammenfassen(plan, rechnen(plan, praxis))
  const stand = ausfuehrungVon(plan)
  const r = ausfuehrungAnwenden(plan, a)
  const ergebnis = rechnen(r.plan, praxis)
  const nachher = zusammenfassen(r.plan, ergebnis)
  const neu = ausfuehrungVon(r.plan)
  const beschreibung = ausfuehrungUnterschied(stand, neu)
  if (!beschreibung)
    return { ok: false, grund: 'unveraendert', meldung: r.hinweise.length ? r.hinweise.join(' ') : `Das ist schon so geplant: ${ausfuehrungSatz(neu)}.` }
  const warnungen = [...r.hinweise, ...nachher.warnungen.filter((w) => !vorher.warnungen.includes(w))]
  return { ok: true, plan: r.plan, ergebnis, beschreibung, vorher, nachher, ausfuehrung: neu, warnungen }
}

/** Leistungstext sprechbar kürzen: ohne Klammerzusätze, höchstens ~80 Zeichen an einer Wortgrenze. */
export function kurzText(text: string): string {
  let t = text.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  if (t.length <= 80) return t
  t = t.slice(0, 80)
  const komma = t.lastIndexOf(',')
  const ende = komma > 40 ? komma : t.lastIndexOf(' ')
  return (ende > 40 ? t.slice(0, ende) : t).replace(/[,;:\s]+$/, '')
}

/** Ist Position X im HKP enthalten? Ohne Ebene wird in BEMA, GOZ, BEL und BEB gesucht. */
export function positionPruefen(e: Ergebnis, listen: Listen, frage: { ebene?: Ebene; nr: string }): PositionsPruefung {
  const ebenen: Ebene[] = frage.ebene ? [frage.ebene] : ['BEMA', 'GOZ', 'BEL', 'BEB']
  const treffer = e.positionen
    .filter((p) => ebenen.includes(p.ebene) && nrGleich(p.ebene, p.nr, frage.nr))
    .map((p) => ({ ebene: p.ebene, nr: p.nr, zahn: p.zahn, anzahl: p.anzahl, betrag: p.betrag, bezeichnung: kurzText(p.bezeichnung) }))
  const quelle: Partial<Record<Ebene, Preisliste | undefined>> = { BEMA: listen.bema, GOZ: listen.goz, BEL: listen.bel, BEB: listen.beb }
  const katalog = ebenen.flatMap((eb) => {
    const eintrag = (quelle[eb]?.eintraege as { nr: string; text: string }[] | undefined)?.find((x) => nrGleich(eb, x.nr, frage.nr))
    return eintrag ? [{ ebene: eb, text: kurzText(eintrag.text) }] : []
  })
  return { ebene: frage.ebene, nr: frage.nr, enthalten: treffer.length > 0, treffer, katalog }
}
