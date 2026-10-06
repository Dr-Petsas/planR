import { useSyncExternalStore } from 'react'
import type { Einstellungen, HkpPlan, ListenTyp, Preisliste } from '../types'
import type { Hinweis, Listen } from '../engine/berechnung'
import { kzvAusPlz, kzvNachNr } from '../data/kzv'
import goz from '../data/goz-2012.json'
import beb from '../data/beb-itz-2024.json'
import { bebErgaenzen } from '../engine/beb-standard'

const SPEICHER_KEY = 'hkp.preislisten.v1'

/** Jahres- und KZV-Listen, die der Aktualisierungsdienst (tools/listen-aktualisieren.ts) in src/data ablegt */
const DATEIEN = import.meta.glob<Preisliste>(['../data/bel/*.json', '../data/fz/*.json', '../data/bema/*.json'], { eager: true, import: 'default' })

export const STANDARD_LISTEN: Preisliste[] = [
  ...Object.entries(DATEIEN).map(([pfad, l]) => ({ ...l, id: l.id ?? pfad.split('/').pop()!.replace(/\.json$/, ''), standard: true })),
  { ...(goz as Omit<Preisliste<'goz'>, 'id'>), id: 'goz-2012', typ: 'goz', standard: true },
  { ...bebErgaenzen(beb as Omit<Preisliste<'beb'>, 'id'>), id: 'beb-itz-2024', typ: 'beb', standard: true },
]

const ergaenzt = (l: Preisliste): Preisliste => (l.typ === 'beb' ? bebErgaenzen(l as Preisliste<'beb'>) : l)

export const TYP_NAMEN: Record<ListenTyp, string> = {
  bema: 'BEMA (Kassenhonorar)',
  goz: 'GOZ (Privathonorar)',
  bel2: 'BEL II (Kassen-Labor)',
  beb: 'BEB (Privat-Labor)',
  festzuschuss: 'Festzuschüsse',
}

function laden(): Preisliste[] {
  let gespeichert: Preisliste[] = []
  try {
    gespeichert = JSON.parse(localStorage.getItem(SPEICHER_KEY) ?? '[]')
  } catch {
    gespeichert = []
  }
  const ids = new Set(gespeichert.map((l) => l.id))
  const standard = STANDARD_LISTEN.filter((l) => !ids.has(l.id))
  return [...standard, ...gespeichert.map(ergaenzt)].sort((a, b) => a.typ.localeCompare(b.typ) || a.name.localeCompare(b.name) || b.gueltigAb.localeCompare(a.gueltigAb))
}

let listen = laden()
const abonnenten = new Set<() => void>()

function speichern() {
  const geaendert = listen.filter((l) => !l.standard || l.geaendertAm)
  localStorage.setItem(SPEICHER_KEY, JSON.stringify(geaendert))
  listen = laden()
  abonnenten.forEach((f) => f())
}

export function listeSpeichern(liste: Preisliste) {
  const neu = { ...liste, geaendertAm: new Date().toISOString() }
  const i = listen.findIndex((l) => l.id === liste.id)
  listen = i >= 0 ? listen.map((l) => (l.id === liste.id ? neu : l)) : [...listen, neu]
  speichern()
}

export function listeLoeschen(id: string) {
  listen = listen.filter((l) => l.id !== id)
  speichern()
}

/** Setzt eine mitgelieferte Liste auf den Originalstand zurück. */
export function listeZuruecksetzen(id: string) {
  listen = listen.filter((l) => l.id !== id)
  speichern()
}

export function getListen() {
  return listen
}

export function usePreislisten() {
  return useSyncExternalStore(
    (f) => {
      abonnenten.add(f)
      return () => abonnenten.delete(f)
    },
    () => listen,
  )
}

export function listeFinden<T extends ListenTyp>(alle: Preisliste[], typ: T, id: string): Preisliste<T> | undefined {
  return (alle.find((l) => l.id === id && l.typ === typ) ?? alle.find((l) => l.typ === typ)) as Preisliste<T> | undefined
}

/** Automatische Auswahl: neueste Liste, die am Stichtag gilt (BEL II: aus dem KZV-Bereich der Praxis) */
export const AUTO = 'auto'

const datumDe = (iso: string) => iso.split('-').reverse().join('.')

/** TT.MM.JJJJ, TT.MM.JJ oder JJJJ-MM-TT → JJJJ-MM-TT */
function isoDatum(s: string): string {
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(t)
  if (!m) return ''
  const j = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${j}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/**
 * Stichtag für die Preise: Festzuschüsse, ZE-Punktwert und BEL-Praxislaborpreise richten sich nach der Eingliederung.
 * Vor der Eingliederung gilt das Ausstellungsdatum des HKP.
 */
export function stichtag(plan: Pick<HkpPlan, 'verwaltung'>): string {
  return isoDatum(plan.verwaltung.eingliederungsdatum) || isoDatum(plan.verwaltung.ausstellungsdatum) || new Date().toISOString().slice(0, 10)
}

export interface KzvBereich {
  nr: string
  quelle: 'einstellung' | 'plz' | 'standard'
}

export function kzvBereich(e: Pick<Einstellungen, 'kzv' | 'praxisPlz'>): KzvBereich {
  if (e.kzv && kzvNachNr(e.kzv)) return { nr: e.kzv, quelle: 'einstellung' }
  const ausPlz = kzvAusPlz(e.praxisPlz ?? '')
  if (ausPlz) return { nr: ausPlz, quelle: 'plz' }
  return { nr: '11', quelle: 'standard' }
}

const JAHRESLISTEN: ListenTyp[] = ['bema', 'bel2', 'festzuschuss']

export function listeWaehlen<T extends ListenTyp>(
  alle: Preisliste[], typ: T, id: string, ort: { kzv: KzvBereich; stichtag: string },
): { liste?: Preisliste<T>; hinweise: Hinweis[] } {
  const hinweise: Hinweis[] = []
  const vomTyp = alle.filter((l) => l.typ === typ) as Preisliste<T>[]
  const tag = ort.stichtag

  if (id !== AUTO) {
    const gewaehlt = listeFinden(alle, typ, id)
    const neuer = gewaehlt && vomTyp.find((l) => l.gueltigAb <= tag && l.gueltigAb > gewaehlt.gueltigAb && (typ !== 'bel2' || l.kzv === gewaehlt.kzv))
    if (gewaehlt && neuer && JAHRESLISTEN.includes(typ))
      hinweise.push({ stufe: 'warnung', text: `${TYP_NAMEN[typ]}: Fest gewählt ist „${gewaehlt.name}“ (ab ${datumDe(gewaehlt.gueltigAb)}), am Stichtag ${datumDe(tag)} gilt bereits „${neuer.name}“ (ab ${datumDe(neuer.gueltigAb)}) – in den Einstellungen „automatisch“ wählen.` })
    return { liste: gewaehlt, hinweise }
  }

  let kandidaten = vomTyp
  if (typ === 'bel2') {
    const kzv = kzvNachNr(ort.kzv.nr)
    const passend = vomTyp.filter((l) => l.kzv === ort.kzv.nr)
    if (ort.kzv.quelle === 'standard')
      hinweise.push({ stufe: 'info', text: 'BEL II: KZV-Bereich nicht festgelegt – es gelten die bayerischen Höchstpreise. Praxis-PLZ oder KZV in den Einstellungen eintragen.' })
    if (passend.length) kandidaten = passend
    else {
      kandidaten = vomTyp.filter((l) => l.kzv === '11')
      if (!kandidaten.length) kandidaten = vomTyp
      hinweise.push({ stufe: 'warnung', text: `BEL II: Für die KZV ${kzv?.name ?? ort.kzv.nr} ist keine Höchstpreisliste vorhanden${kzv?.login ? ' (nur im Mitgliederbereich der KZV erhältlich)' : ''} – die CSV-Datei der KZV unter „Preislisten“ importieren. Vorläufig gelten die Preise von „${kandidaten[0]?.name ?? '–'}“.` })
    }
  }
  const sortiert = [...kandidaten].sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb) || Number(!!a.standard) - Number(!!b.standard))
  let liste = sortiert.find((l) => l.gueltigAb <= tag)
  if (!liste) {
    liste = sortiert[sortiert.length - 1]
    if (liste) hinweise.push({ stufe: 'warnung', text: `${TYP_NAMEN[typ]}: Für den Stichtag ${datumDe(tag)} gibt es keine gültige Liste – verwendet wird „${liste.name}“ (ab ${datumDe(liste.gueltigAb)}).` })
  } else if (JAHRESLISTEN.includes(typ) && tag.slice(0, 4) > liste.gueltigAb.slice(0, 4)) {
    hinweise.push({ stufe: 'warnung', text: `${TYP_NAMEN[typ]}: Für ${tag.slice(0, 4)} liegt noch keine Liste vor – verwendet wird „${liste.name}“ (ab ${datumDe(liste.gueltigAb)}). Die Beträge ändern sich in der Regel zum 01.01.` })
  }
  return { liste, hinweise }
}

/** Alle Listen eines Plans: fest gewählt oder automatisch nach KZV-Bereich und Stichtag */
export function listenFuerPlan(alle: Preisliste[], plan: Pick<HkpPlan, 'verwaltung' | 'einstellungen'>): Listen {
  const e = plan.einstellungen
  const ort = { kzv: kzvBereich(e), stichtag: stichtag(plan) }
  const bema = listeWaehlen(alle, 'bema', e.bemaListe, ort)
  const goz = listeWaehlen(alle, 'goz', e.gozListe, ort)
  const bel = listeWaehlen(alle, 'bel2', e.belListe, ort)
  const beb = listeWaehlen(alle, 'beb', e.bebListe, ort)
  const fz = listeWaehlen(alle, 'festzuschuss', e.fzListe, ort)
  return {
    bema: bema.liste, goz: goz.liste, bel: bel.liste, beb: beb.liste && bebErgaenzen(beb.liste), fz: fz.liste,
    hinweise: [...bema.hinweise, ...bel.hinweise, ...fz.hinweise, ...goz.hinweise, ...beb.hinweise],
  }
}
