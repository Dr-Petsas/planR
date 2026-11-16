/**
 * Ein Zahnarzt lädt oft einen ganzen Fall hoch: Implantation, ZE, PAR, KB.
 * Hier wird jede Datei einem Fach zugeordnet und je Fach ein Plan gebildet.
 * Das eigene Sprachmodell ordnet jede Datei am gelesenen Text ein. Feste Wörter im Blatt und im
 * Dateinamen sind der Rückfall, wenn das Modell nicht antwortet. Der Zahnarzt kann die Zuordnung ändern.
 */
import type { BlattPosition, BlattSummen } from './einlesenZeilen'
import type { Erkennung, Planart, PlanerWahl, ProbePosition, ZahnSchema } from './hkpPdf'

export type Fach = 'ze' | 'privat-ze' | 'impl' | 'par' | 'kb' | 'kfo' | 'kons'

/** Urteil des Modells über eine Datei. art leer heißt: nicht zu entscheiden. */
export interface Einordnung { art: string; kasse: boolean; grund?: string }

export type Zeile = ProbePosition | BlattPosition
export interface Blatt { schema: ZahnSchema; positionen: Zeile[]; summen?: BlattSummen; planart?: Planart; planer?: PlanerWahl; gozAnteil?: boolean; dateien?: string[] }
/** Eine gelesene Datei mit ihrem Fach. */
export interface Teil extends Blatt {
  name: string
  fach: Fach
  /** Die gesetzliche Kasse ist beteiligt, laut Modell. Fehlt das Urteil, entscheiden die Gebührenzeilen. */
  kasse?: boolean
  /** GOZ-Anlage oder Laborbeleg: gehört zum Kassen-HKP des Falls, wenn einer dabei ist. */
  anlage?: boolean
  /** Woran das Modell die Datei erkannt hat. */
  grund?: string
}

export const FAECHER: { fach: Fach; reiter: string; titel: string }[] = [
  { fach: 'ze', reiter: 'HKP', titel: 'HKP Zahnersatz (Kasse)' },
  { fach: 'privat-ze', reiter: 'Privat-ZE', titel: 'Privatplan Zahnersatz' },
  { fach: 'impl', reiter: 'Implantation', titel: 'Privatplan Implantation' },
  { fach: 'par', reiter: 'PAR', titel: 'PAR-Plan' },
  { fach: 'kb', reiter: 'KB', titel: 'KB-Plan (Schiene)' },
  { fach: 'kfo', reiter: 'KFO', titel: 'KFO-Plan' },
  { fach: 'kons', reiter: 'Kons', titel: 'Füllung und Endo (Kons)' },
]

const AUS_ART: Record<string, Fach> = {
  hkp: 'ze', 'goz-anlage': 'privat-ze', labor: 'privat-ze', 'privat-ze': 'privat-ze',
  implantation: 'impl', par: 'par', kb: 'kb', kfo: 'kfo', kons: 'kons',
}

/**
 * Urteil des Modells und feste Zeichen zusammenführen.
 * Ein Kassenblatt mit Festzuschuss oder BEMA bleibt ein Kassen-HKP, auch wenn das Modell es privat nennt.
 * Sonst gilt das Modell. Ohne Urteil gilt das Fach aus den festen Wörtern.
 */
export function fachEntscheiden(wort: Fach, erkennung: Erkennung, urteil: Einordnung | null): { fach: Fach; kasse?: boolean; anlage?: boolean; grund?: string } {
  const fach = urteil ? AUS_ART[urteil.art] : undefined
  if (!urteil || !fach) return { fach: wort }
  const anlage = urteil.art === 'goz-anlage' || urteil.art === 'labor'
  const privatGenannt = !anlage && (fach === 'privat-ze' || fach === 'impl')
  if (erkennung.planart === 'hkp' && privatGenannt) return { fach: 'ze', kasse: true, grund: urteil.grund }
  return { fach, kasse: urteil.kasse, anlage: anlage || undefined, grund: urteil.grund }
}

/** GOZ-Anlagen und Laborbelege wandern zum Kassen-HKP des Falls. Ohne Kassen-HKP bleiben sie ein Privatplan. */
export function anlagenZuordnen(teile: Teil[]) {
  const hkpDa = teile.some((t) => t.fach === 'ze' && !t.anlage)
  for (const t of teile) if (t.anlage) t.fach = hkpDa ? 'ze' : 'privat-ze'
}

const PAR_WORT = ['parodontitis', 'parodontalstatus', 'par-status', 'pa-status', 'par-plan', 'par-behandlung', 'parodontitistherapie', 'antiinfektiöse therapie', 'unterstützende parodontitis', 'sondierungstiefe']
const KB_WORT = ['kieferbruch', 'kiefergelenkserkrankung', 'aufbissbehelf', 'aufbissschiene', 'schienentherapie', 'aufbiss-schiene', 'funktionsanalytisch']
const CHIR_WORT = ['implantation', 'implantatinsertion', 'insertion', 'sinuslift', 'sinusboden', 'augmentation', 'knochenaufbau', 'freilegung']
const PAR_NAME = ['parodont', 'paro', 'par-', 'par_', 'par ', '_par', '-par', ' par', 'pa-plan']
const KB_NAME = ['kb-', 'kb_', 'kb ', '_kb', '-kb', ' kb', 'schiene', 'kieferbruch', 'aufbiss']
const IMPL_NAME = ['implantation', 'implantat-chir', 'impl-chir', 'chirurgie']
const PAR_NR = ['AIT', 'ATG', 'MHU', 'BEV', 'CPT', 'UPT', 'PAR']
const KB_NR = ['K1', 'K2', 'K3', 'K4', 'K6', 'K7', 'K8', 'K9']

const eins = (n: string, liste: string[]) => liste.some((w) => n.includes(w))

/** Welches Fach trägt diese Datei. Ohne klares Zeichen bleibt sie beim Zahnersatz. */
export function fachErkennen(name: string, text: string, erkennung: Erkennung, positionen: { ebene: string; nr: string }[] = []): Fach {
  const n = text.toLowerCase()
  const datei = name.toLowerCase()
  const bema = positionen.filter((p) => p.ebene === 'BEMA').map((p) => p.nr.toUpperCase())
  if (eins(n, PAR_WORT) || bema.some((nr) => PAR_NR.some((p) => nr.startsWith(p)))) return 'par'
  if (eins(n, KB_WORT) || bema.some((nr) => KB_NR.includes(nr))) return 'kb'
  if (erkennung.planer === 'privat') {
    // GOZ Abschnitt K (9000 bis 9170) ist Implantatchirurgie, auch wenn das Wort fehlt.
    const abschnittK = positionen.some((p) => p.ebene === 'GOZ' && p.nr.length === 4 && (p.nr.startsWith('90') || p.nr.startsWith('91')))
    const wort = erkennung.planart === 'privat-impl' && (eins(n, CHIR_WORT) || eins(datei, IMPL_NAME))
    return abschnittK || wort ? 'impl' : 'privat-ze'
  }
  // Das Blatt selbst sagt nichts: dann entscheidet der Dateiname.
  if (!erkennung.planart) {
    if (eins(datei, PAR_NAME)) return 'par'
    if (eins(datei, KB_NAME)) return 'kb'
  }
  return 'ze'
}

export function zaehlt(schema: ZahnSchema) {
  return Object.keys(schema.B).length + Object.keys(schema.R).length + Object.keys(schema.TP).length
}

export function dazu(ziel: Record<string, string>, quelle: Record<string, string> | undefined) {
  for (const [z, c] of Object.entries(quelle ?? {})) if (c && !ziel[z]) ziel[z] = c
}

export function hat(blatt: Blatt) {
  return blatt.planart === 'privat-ze' || blatt.planart === 'privat-impl' || zaehlt(blatt.schema) > 0 || blatt.positionen.length > 0
}

export function vereinenGleich(teile: Blatt[]): Blatt {
  const schema: ZahnSchema = { B: {}, R: {}, TP: {} }
  const positionen: Zeile[] = []
  const da = new Map<string, Zeile & { text?: string }>()
  for (const teil of teile) {
    dazu(schema.B, teil.schema.B)
    dazu(schema.R, teil.schema.R)
    dazu(schema.TP, teil.schema.TP)
    for (const p of teil.positionen) {
      // Material hat keine Nummer: dort unterscheidet die Bezeichnung.
      // Der private Kostenvoranschlag führt dieselbe Ziffer in mehreren Sitzungen: jede Sitzung ist eine eigene Zeile.
      const key = `${p.ebene}|${p.nr || (p as { text?: string }).text || ''}|${p.zahn}|${(p as { sitzung?: number }).sitzung ?? ''}`
      const schon = da.get(key)
      if (schon) {
        // Dieselbe Zeile aus einer zweiten Datei: die Bezeichnung nachtragen, wenn sie der ersten fehlte.
        const text = (p as { text?: string }).text
        if (!schon.text && text) schon.text = text
        continue
      }
      const eigen = { ...p }
      da.set(key, eigen)
      positionen.push(eigen)
    }
  }
  const summen: BlattSummen = {}
  for (const teil of [...teile].reverse()) Object.assign(summen, teil.summen)
  return { schema, positionen, summen, dateien: teile.flatMap((t) => t.dateien ?? []) }
}

export interface Gruppe {
  fach: Fach
  reiter: string
  titel: string
  blatt: Blatt
  namen: string[]
  /** Planer, in dem dieser Plan liegt. */
  adresse: string
  /** Der Planer übernimmt die gelesenen Daten. Sonst öffnet er leer. */
  fuellt: boolean
}

/** Je Fach ein Plan, in fester Reihenfolge. Fächer ohne Datei fehlen. */
export function gruppenBauen(teile: Teil[]): Gruppe[] {
  const aus: Gruppe[] = []
  for (const f of FAECHER) {
    const eigene = teile.filter((t) => t.fach === f.fach)
    if (!eigene.length) continue
    const blatt = vereinenGleich(eigene)
    const gesagt = eigene.filter((t) => typeof t.kasse === 'boolean')
    const kasse = blatt.positionen.some((p) => p.ebene === 'BEMA')
      || (gesagt.length ? gesagt.some((t) => t.kasse) : !blatt.positionen.some((p) => p.ebene === 'GOZ' || p.ebene === 'GOÄ'))
    let adresse = '/planer/probe-hkp/'
    let fuellt = true
    if (f.fach === 'ze') {
      blatt.planart = 'hkp'
      blatt.planer = 'hkp'
      // GOZ neben dem Kassen-HKP ist der Privatanteil, auch wenn es als eigene Datei kam.
      blatt.gozAnteil = eigene.some((t) => t.gozAnteil) || blatt.positionen.some((p) => p.ebene === 'GOZ' || p.ebene === 'GOÄ')
    } else if (f.fach === 'privat-ze' || f.fach === 'impl') {
      blatt.planart = f.fach === 'impl' || eigene.every((t) => t.planart === 'privat-impl') ? 'privat-impl' : 'privat-ze'
      blatt.planer = 'privat'
      // Implantologie hat GOÄ, Analogleistungen und Sitzungen. Der Zahnersatz-Planer kennt sie nicht.
      adresse = f.fach === 'impl' ? '/planer/implantologie/' : '/planer/privat-hkp/'
    } else {
      const wege: Record<string, [string, string]> = {
        par: ['/planer/par/', '/planer/privat-par/'],
        kb: ['/planer/kb/', '/planer/privat-kb/'],
        kfo: ['/planer/kfo/', '/planer/privat-kfo/'],
        kons: ['/planer/mkv/', '/planer/kons/'],
      }
      adresse = wege[f.fach][kasse ? 0 : 1]
      fuellt = false
    }
    aus.push({ fach: f.fach, reiter: f.reiter, titel: f.titel, blatt, namen: eigene.map((t) => t.name), adresse, fuellt })
  }
  return aus
}
