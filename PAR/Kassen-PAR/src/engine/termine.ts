// Terminplan der PAR-Strecke (nach dem UPT-Planer-Prototyp, Regeln korrigiert
// nach BEMA Teil 4, Abrechnungsbestimmungen zu UPT, Stand 2026).
//
// Kette: Befund (4) -> ATG/MHU -> [PZR] -> AIT (1/2/4 Sitzungen) -> BEV a
//        -> [CPT + 111 -> BEV b] -> UPT 1..n -> [Verlaengerung]
// Verschobene oder erbrachte Termine behalten ihr Datum; alles danach wird
// ab dort neu gerechnet.

import type { DiagnoseErgebnis, ParFall, Termin, TerminArt, UptModul } from '../types'
import { uptFrequenz } from './strecke'

// ---------------------------------------------------------------------------
// Datum
// ---------------------------------------------------------------------------

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const iso = (d: Date) => d.toISOString().slice(0, 10)

export function plusTage(datum: string, tage: number): string {
  const d = parse(datum)
  d.setUTCDate(d.getUTCDate() + tage)
  return iso(d)
}

/** Monate addieren; Monatsende wird gekappt (31.01. + 1 = 28./29.02.). */
export function plusMonate(datum: string, monate: number): string {
  const d = parse(datum)
  const tag = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + monate)
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(tag, letzter))
  return iso(d)
}

/** Auf den naechsten Praxistag schieben (5-Tage-Woche: Mo-Fr, 6: Mo-Sa). */
export function werktag(datum: string, werktage: 5 | 6): string {
  let d = datum
  for (let i = 0; i < 3; i++) {
    const wt = parse(d).getUTCDay()
    if (wt === 0 || (wt === 6 && werktage === 5)) d = plusTage(d, 1)
    else break
  }
  return d
}

export const tageZwischen = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000)

/** b liegt mindestens n Kalendermonate nach a. */
export const mindestensMonate = (a: string, b: string, n: number) => b >= plusMonate(a, n)

export function datumDe(isoDatum: string): string {
  if (!isoDatum) return ''
  const [y, m, d] = isoDatum.split('-')
  return `${d}.${m}.${y}`
}

const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
export const wochentag = (isoDatum: string) => (isoDatum ? WOCHENTAG[parse(isoDatum).getUTCDay()] : '')

// ---------------------------------------------------------------------------
// UPT-Schema (welche Module in welcher UPT-Sitzung)
// ---------------------------------------------------------------------------

export interface UptSchemaZeile { nr: number; monat: number; module: UptModul[]; verlaengerung: boolean }

/**
 * Fruehestes UPT-Schema bei Mindestabstaenden. Regeln BEMA Teil 4:
 *  - UPT a/b/c/e/f: Grad A 2x (>= 10 Mon.), B 4x (>= 5), C 6x (>= 3)
 *  - UPT d: Grad B 2x, C 4x; erstmals >= 5 bzw. 3 Mon. nach der ersten UPT,
 *    danach >= 5 bzw. 3 Mon. nach der letzten UPT d oder UPT g
 *  - UPT g: einmal, >= 10 Mon. nach der ersten UPT und bei Grad B >= 5,
 *    bei Grad C >= 3 Mon. nach der letzten UPT d
 *  - Verlaengerung (5d): in der Regel bis 6 Monate; Abstaende zur zuletzt
 *    erbrachten identischen Leistung
 */
export function uptSchema(grad: 'A' | 'B' | 'C', verlaengerungMonate = 0): UptSchemaZeile[] {
  const f = uptFrequenz(grad)
  const zeilen: UptSchemaZeile[] = []
  let dZahl = 0
  let gGemacht = false
  let letztesDoderG: number | null = null
  let letztesD: number | null = null
  const dMoeglich = (m: number) => dZahl < f.dMax && m - (letztesDoderG ?? 0) >= f.abstandMon
  for (let i = 0; i < f.sitzungen; i++) {
    const monat = i * f.abstandMon
    const module: UptModul[] = ['a', 'b', 'c', 'e', 'f']
    if (i > 0) {
      const gOk = !gGemacht && monat >= 10 && (f.dMax === 0 || (letztesD != null && monat - letztesD >= f.abstandMon))
      if (gOk) { module.push('g'); gGemacht = true; letztesDoderG = monat }
      else if (dMoeglich(monat)) { module.push('d'); dZahl++; letztesD = monat; letztesDoderG = monat }
    }
    zeilen.push({ nr: i + 1, monat, module: sortiere(module), verlaengerung: false })
  }
  if (verlaengerungMonate > 0) {
    const ende = 24 + Math.min(verlaengerungMonate, 24)
    let monat = Math.max(zeilen[zeilen.length - 1].monat + f.abstandMon, 24)
    let nr = zeilen.length
    let dImV = 0
    while (monat <= ende) {
      const module: UptModul[] = ['a', 'b', 'c', 'e', 'f']
      if (f.dMax > 0 && dImV < f.dMax && monat - (letztesDoderG ?? 0) >= f.abstandMon) {
        module.push('d'); dImV++; letztesDoderG = monat
      }
      zeilen.push({ nr: ++nr, monat, module: sortiere(module), verlaengerung: true })
      monat += f.abstandMon
    }
  }
  return zeilen
}

const sortiere = (m: UptModul[]) => [...m].sort() as UptModul[]

// ---------------------------------------------------------------------------
// Terminplan erzeugen
// ---------------------------------------------------------------------------

export const ART_LABEL: Record<TerminArt, string> = {
  befund: 'Befundaufnahme / Parodontalstatus',
  atg: 'Aufklärung (ATG) + Mundhygiene (MHU)',
  pzr: 'Vorbehandlung (PZR, privat)',
  ait: 'Antiinfektiöse Therapie (AIT)',
  bev: 'Befundevaluation (BEV a)',
  cpt: 'Chirurgische Therapie (CPT)',
  nachbehandlung: 'Nachbehandlung (111)',
  bevb: 'Befundevaluation (BEV b)',
  upt: 'Unterstützende Parodontitistherapie (UPT)',
  kontrolle: 'Kontrolle',
}

function leererTermin(schluessel: string, art: TerminArt, titel: string, datum: string): Termin {
  return {
    id: schluessel + '-' + Math.random().toString(36).slice(2, 8), schluessel, art, titel, datum,
    datumManuell: false, erbracht: false, zaehne: null, module: [], verlaengerung: false,
    auswahl: [], abgewaehlt: [], auto: [], mengen: {}, faktoren: {}, bemerkung: '',
  }
}

const TEIL_TITEL: Record<number, string[]> = {
  1: [''],
  2: [' – Oberkiefer', ' – Unterkiefer'],
  4: [' – 1. Quadrant', ' – 2. Quadrant', ' – 3. Quadrant', ' – 4. Quadrant'],
}

/**
 * Termine aus Planung + Diagnose (neu) aufbauen. Bestehende Termine mit
 * gleichem Schluessel behalten Auswahl, Mengen, Faktoren, Zaehne und – wenn
 * verschoben oder erbracht – ihr Datum. Von Hand angelegte Termine (Schluessel
 * "extra-...") bleiben erhalten.
 */
export function terminePlanen(fall: ParFall, diag: DiagnoseErgebnis): Termin[] {
  const p = fall.planung
  const alt = new Map(fall.termine.map((t) => [t.schluessel, t]))
  const out: Termin[] = []
  const wt = (d: string) => werktag(d, p.werktage)

  const setze = (schluessel: string, art: TerminArt, titel: string, vorschlag: string, extra?: Partial<Termin>) => {
    const vorher = alt.get(schluessel)
    const t: Termin = vorher
      ? { ...vorher, art, titel, ...extra }
      : { ...leererTermin(schluessel, art, titel, wt(vorschlag)), ...extra }
    if (!vorher || !(vorher.datumManuell || vorher.erbracht)) t.datum = wt(vorschlag)
    out.push(t)
    return t.datum
  }

  const start = p.start || fall.datum
  const einstieg = fall.uebernahmefall ? p.einstieg : 'komplett'
  let d = start

  const mitVorphase = einstieg === 'komplett'
  const mitAit = einstieg === 'komplett' || einstieg === 'ait'
  const mitBev = !p.par22a && (mitAit || einstieg === 'bev')

  if (mitVorphase) {
    d = setze('befund', 'befund', ART_LABEL.befund, d)
    if (!p.par22a) d = setze('atg', 'atg', ART_LABEL.atg, plusTage(d, p.genehmigungTage))
    if (p.mitPzr) d = setze('pzr', 'pzr', ART_LABEL.pzr, plusTage(d, 7))
  }

  let letzteAit = d
  if (mitAit) {
    const n = p.aitSitzungen
    for (let i = 0; i < n; i++) {
      const vorschlag = i === 0 ? (mitVorphase ? plusTage(d, p.par22a ? p.genehmigungTage : 7) : d) : plusTage(letzteAit, p.aitAbstandTage)
      letzteAit = setze(`ait-${i + 1}`, 'ait', `AIT${TEIL_TITEL[n][i]}`, vorschlag)
    }
    d = letzteAit
  }

  let uptStartVorschlag = d
  if (mitBev) {
    const bev = setze('bev', 'bev', ART_LABEL.bev, mitAit ? plusMonate(letzteAit, 3) : d)
    uptStartVorschlag = bev
    if (fall.mitCPT) {
      let letzteCpt = bev
      const n = p.cptSitzungen
      for (let i = 0; i < n; i++) {
        letzteCpt = setze(`cpt-${i + 1}`, 'cpt', `CPT${TEIL_TITEL[n][i]}`, i === 0 ? plusMonate(bev, 1) : plusTage(letzteCpt, 7))
        setze(`nb-${i + 1}`, 'nachbehandlung', `Nachbehandlung${TEIL_TITEL[n][i]}`, plusTage(letzteCpt, 7))
      }
      uptStartVorschlag = setze('bevb', 'bevb', ART_LABEL.bevb, plusMonate(letzteCpt, 3))
    }
  } else if (p.par22a && mitAit) {
    uptStartVorschlag = plusMonate(letzteAit, 3)
  }

  // UPT
  const schema = p.par22a
    ? par22aSchema()
    : uptSchema(diag.grad, p.verlaengerungMonate)
  const abNr = einstieg === 'upt' ? Math.max(1, p.uptAb) : 1
  const f = uptFrequenz(diag.grad)
  let vorige: string | null = null
  let ersteUpt: string | null = null
  const ersteMonat = schema.find((z) => z.nr >= abNr)?.monat ?? 0
  for (const z of schema) {
    if (z.nr < abNr) continue
    const abstand = p.par22a ? 5 : f.abstandMon
    let vorschlag: string = vorige == null ? (einstieg === 'upt' ? start : uptStartVorschlag) : plusMonate(vorige, abstand)
    if (ersteUpt && z.verlaengerung) {
      const nachSchema = plusMonate(ersteUpt, z.monat - ersteMonat)
      if (nachSchema > vorschlag) vorschlag = nachSchema
    }
    vorige = setze(`upt-${z.nr}`, 'upt', `${z.nr}. UPT${z.verlaengerung ? ' (Verlängerung)' : ''}`, vorschlag, {
      module: z.module, verlaengerung: z.verlaengerung,
    })
    ersteUpt ??= vorige
  }

  for (const t of fall.termine) if (t.schluessel.startsWith('extra-')) out.push(t)
  return out.sort((a, b) => (a.datum || '').localeCompare(b.datum || '') || reihenfolge(a) - reihenfolge(b))
}

const RANG: Record<TerminArt, number> = {
  befund: 0, atg: 1, pzr: 2, ait: 3, bev: 4, cpt: 5, nachbehandlung: 6, bevb: 7, upt: 8, kontrolle: 9,
}
const reihenfolge = (t: Termin) => RANG[t.art]

/**
 * § 22a-Strecke (Prototyp): AIT, nach 3 Monaten 1. UPT, dann drei weitere
 * UPT im Abstand von 5 Monaten. Vor Abrechnung gegen die Behandlungsrichtlinie
 * B V pruefen; angezeigt werden auf 5e nur 4, AIT und CPT.
 */
function par22aSchema(): UptSchemaZeile[] {
  return [1, 2, 3, 4].map((nr) => ({ nr, monat: (nr - 1) * 5, module: ['a', 'b', 'c', 'e', 'f'] as UptModul[], verlaengerung: false }))
}

// ---------------------------------------------------------------------------
// Fristen pruefen
// ---------------------------------------------------------------------------

export interface Fristmeldung { terminId: string; art: 'fehler' | 'warnung'; text: string; fruehestens?: string }

/** Prueft die Termine gegen BEMA-Mindestabstaende und Richtwerte. */
export function fristenPruefen(fall: ParFall, diag: DiagnoseErgebnis): Fristmeldung[] {
  const m: Fristmeldung[] = []
  const t = [...fall.termine].filter((x) => x.datum).sort((a, b) => a.datum.localeCompare(b.datum))
  const von = (art: TerminArt) => t.filter((x) => x.art === art)
  const atg = von('atg')[0]
  const ait = von('ait')
  const bev = von('bev')[0]
  const cpt = von('cpt')
  const bevb = von('bevb')[0]
  const upt = von('upt')

  if (atg && ait[0]) {
    const tage = tageZwischen(atg.datum, ait[0].datum)
    if (tage < 0) m.push({ terminId: ait[0].id, art: 'fehler', text: 'AIT liegt vor dem Aufklärungsgespräch (ATG).' })
    else if (tage > 28) m.push({ terminId: ait[0].id, art: 'warnung', text: `AIT beginnt ${tage} Tage nach dem ATG (Richtwert bis 4 Wochen).` })
  }
  const aitEnde = ait.at(-1)
  if (bev && aitEnde) {
    const fr = plusMonate(aitEnde.datum, 3)
    if (bev.datum < fr) m.push({ terminId: bev.id, art: 'fehler', text: 'BEV a frühestens 3 Monate nach Abschluss der AIT.', fruehestens: fr })
    else if (bev.datum > plusMonate(aitEnde.datum, 6)) m.push({ terminId: bev.id, art: 'warnung', text: 'BEV a später als 6 Monate nach Abschluss der AIT.' })
  }
  const cptEnde = cpt.at(-1)
  if (bevb && cptEnde) {
    const fr = plusMonate(cptEnde.datum, 3)
    if (bevb.datum < fr) m.push({ terminId: bevb.id, art: 'fehler', text: 'BEV b frühestens 3 Monate nach Abschluss der CPT.', fruehestens: fr })
    else if (bevb.datum > plusMonate(cptEnde.datum, 6)) m.push({ terminId: bevb.id, art: 'warnung', text: 'BEV b später als 6 Monate nach Abschluss der CPT.' })
  }
  if (bev && cpt[0] && cpt[0].datum < bev.datum) m.push({ terminId: cpt[0].id, art: 'fehler', text: 'CPT erst nach der Befundevaluation (BEV a).' })
  const uptVorher = bevb ?? bev
  if (uptVorher && upt[0] && upt[0].datum < uptVorher.datum) {
    m.push({ terminId: upt[0].id, art: 'fehler', text: 'Die UPT beginnt erst mit bzw. nach der Befundevaluation.', fruehestens: uptVorher.datum })
  }
  if (!upt.length || fall.planung.par22a) return m

  // UPT-Mindestabstaende
  const f = uptFrequenz(diag.grad)
  const erste = upt[0].datum
  const verlEnde = plusMonate(erste, 24 + Math.min(fall.planung.verlaengerungMonate, 24))
  let dZahl = 0
  let gZahl = 0
  let letzteUpt: string | null = null
  let letztesD: string | null = null
  let letztesDoderG: string | null = null
  let regulaer = 0
  for (const u of upt) {
    if (!u.verlaengerung) regulaer++
    if (letzteUpt && !mindestensMonate(letzteUpt, u.datum, f.abstandMon)) {
      m.push({ terminId: u.id, art: 'fehler', text: `UPT a/b/c/e/f: Mindestabstand ${f.abstandMon} Monate (Grad ${diag.grad}) zur vorigen UPT.`, fruehestens: plusMonate(letzteUpt, f.abstandMon) })
    }
    if (!u.verlaengerung && u.datum >= plusMonate(erste, 24)) {
      m.push({ terminId: u.id, art: 'warnung', text: 'Liegt nach dem zweijährigen UPT-Zeitraum – Verlängerung (5d) nötig.' })
    }
    if (u.verlaengerung && u.datum > verlEnde) {
      m.push({ terminId: u.id, art: 'fehler', text: 'Liegt nach dem beantragten Verlängerungszeitraum.' })
    }
    if (u.module.includes('d')) {
      dZahl++
      const bezug = letztesDoderG ?? erste
      if (!mindestensMonate(bezug, u.datum, f.abstandMon)) {
        m.push({ terminId: u.id, art: 'fehler', text: `UPT d: Mindestabstand ${f.abstandMon} Monate zur ${letztesDoderG ? 'letzten UPT d/g' : 'ersten UPT'}.`, fruehestens: plusMonate(bezug, f.abstandMon) })
      }
      if (!u.verlaengerung && dZahl > f.dMax) {
        m.push({ terminId: u.id, art: 'fehler', text: f.dMax === 0 ? 'UPT d ist bei Grad A nicht vorgesehen.' : `UPT d höchstens ${f.dMax}× bei Grad ${diag.grad}.` })
      }
      letztesD = u.datum
      letztesDoderG = u.datum
    }
    if (u.module.includes('g')) {
      gZahl++
      if (gZahl > 1) m.push({ terminId: u.id, art: 'fehler', text: 'UPT g nur einmal im UPT-Zeitraum.' })
      const fr10 = plusMonate(erste, 10)
      if (u.datum < fr10) m.push({ terminId: u.id, art: 'fehler', text: 'UPT g frühestens 10 Monate nach der ersten UPT.', fruehestens: fr10 })
      if (letztesD && f.dMax > 0 && !mindestensMonate(letztesD, u.datum, f.abstandMon)) {
        m.push({ terminId: u.id, art: 'fehler', text: `UPT g: Mindestabstand ${f.abstandMon} Monate zur letzten UPT d.`, fruehestens: plusMonate(letztesD, f.abstandMon) })
      }
      letztesDoderG = u.datum
    }
    letzteUpt = u.datum
  }
  if (regulaer > f.sitzungen) {
    m.push({ terminId: upt[f.sitzungen].id, art: 'fehler', text: `Grad ${diag.grad}: höchstens ${f.sitzungen} UPT-Sitzungen in zwei Jahren.` })
  }
  return m
}
