import { useCallback, useEffect, useState } from 'react'

/**
 * Ablage gespeicherter Pläne mit Freigabe-Status (im Browser, localStorage).
 * Die Form der Einträge entspricht dem späteren MAS-Register, damit die Ablage
 * für die Clara-Anbindung umziehen kann, ohne dass sich die Oberfläche ändert.
 */
export type AblageStatus = 'entwurf' | 'freigegeben'

export interface AblageEintrag<P> {
  nummer: string
  patient: string
  betrag: number
  geaendert: string
  status: AblageStatus
  freigegebenAm?: string
  plan: P
}

export interface AblageDaten<P> {
  nummer: string
  patient: string
  betrag: number
  plan: P
}

export interface Ablage<P> {
  liste: AblageEintrag<P>[]
  eintrag: (nummer: string) => AblageEintrag<P> | undefined
  speichern: (daten: AblageDaten<P>) => void
  freigeben: (daten: AblageDaten<P>) => void
  zuruecknehmen: (nummer: string) => void
  loeschen: (nummer: string) => void
}

const HOECHSTENS = 200

const HUB_MODUL: Record<string, { kuerzel: string; art: 'Kasse' | 'Privat' }> = {
  'kassen-par': { kuerzel: 'PAR', art: 'Kasse' },
  'privat-par': { kuerzel: 'PA', art: 'Privat' },
  'kassen-kb': { kuerzel: 'KB', art: 'Kasse' },
  'privat-kb': { kuerzel: 'KB', art: 'Privat' },
  'kons-mkv': { kuerzel: 'MKV', art: 'Kasse' },
  'privat-kons': { kuerzel: 'KONS', art: 'Privat' },
  'privat-kv': { kuerzel: 'ZE', art: 'Privat' },
  'privat-impl': { kuerzel: 'IMPL', art: 'Privat' },
  'kassen-kfo': { kuerzel: 'KFO', art: 'Kasse' },
  'privat-kfo': { kuerzel: 'KFO', art: 'Privat' },
}
/** In dieser Sitzung in der Ablage gelöschte Pläne – die Übersicht entfernt nur, was ausdrücklich gemeldet wird */
const entfernt = new Map<string, { nummer: string; geaendert: string }[]>()
function entfernenMerken(key: string, e: { nummer: string; geaendert: string }) {
  const bisher = (entfernt.get(key) ?? []).filter((x) => x.nummer !== e.nummer)
  entfernt.set(key, [...bisher, { nummer: e.nummer, geaendert: e.geaendert }])
}

/** Modul für die PlanR-Übersicht; andere Mandanten als der Standard bleiben ihr fern (sonst überschreiben sie sich). */
const modulVon = (key: string) => (key.includes('@') ? '' : key.replace(/\.liste\.v\d+$/, ''))
const hubAdresse = () => (typeof location !== 'undefined' && location.hostname.endsWith('.pickadoc-tunnel.com')
  ? 'https://planr.pickadoc-tunnel.com/api/plaene'
  : 'http://127.0.0.1:5189/api/plaene')

/** In der PlanR-Übersicht gelöschte Pläne; ein später erneut gespeicherter Stand bleibt. */
export function ohneGeloeschte<E extends { nummer: string; geaendert: string }>(liste: E[], geloescht: { nummer: string; geaendert: string }[]): E[] {
  return liste.filter((e) => !geloescht.some((g) => g.nummer === e.nummer && (e.geaendert || '') <= g.geaendert))
}

/** In der PlanR-Übersicht importierter Plan, den die Ablage übernehmen soll */
export interface Import<P> {
  nummer: string
  patient: string
  betrag: number
  geaendert: string
  plan: P
}

/** Gelöschte entfernen, Importe übernehmen (als Entwurf, mit dem Stand des Imports). */
export function abgleichen<P>(liste: AblageEintrag<P>[], geloescht: { nummer: string; geaendert: string }[], eingang: Import<P>[]): AblageEintrag<P>[] {
  let neu = ohneGeloeschte(liste, geloescht)
  for (const e of eingang) {
    const da = neu.find((x) => x.nummer === e.nummer)
    if (da && (da.geaendert || '') >= e.geaendert) continue
    const eintrag: AblageEintrag<P> = { nummer: e.nummer, patient: e.patient, betrag: e.betrag, geaendert: e.geaendert, status: 'entwurf', plan: e.plan }
    neu = [eintrag, ...neu.filter((x) => x.nummer !== e.nummer)].slice(0, HOECHSTENS)
  }
  return neu
}

async function abgleichHolen<P>(modul: string): Promise<{ geloescht: { nummer: string; geaendert: string }[]; eingang: Import<P>[] }> {
  const leer = { geloescht: [], eingang: [] }
  if (!HUB_MODUL[modul] || typeof fetch !== 'function') return leer
  try {
    const r = await fetch(`${hubAdresse()}?nur=abgleich&modul=${encodeURIComponent(modul)}`, { cache: 'no-store' })
    const d = (await r.json()) as { geloescht?: { modul: string; nummer: string; geaendert: string }[]; eingang?: (Import<P> & { modul: string })[] }
    return {
      geloescht: (d.geloescht ?? []).filter((g) => g.modul === modul),
      eingang: (d.eingang ?? []).filter((e) => e.modul === modul && e.nummer && e.plan && typeof e.geaendert === 'string'),
    }
  } catch {
    return leer
  }
}

/** Zahnärztin/Zahnarzt aus dem Plan oder aus den Praxis-Einstellungen desselben Mandanten. */
function behandlerVon(key: string, plan: unknown): string {
  const aus = (x: unknown) => (typeof x === 'string' ? x.trim().slice(0, 80) : '')
  if (plan && typeof plan === 'object') {
    const p = plan as { praxis?: { zahnarzt?: unknown }; einstellungen?: { praxis?: { zahnarzt?: unknown } }; behandler?: unknown }
    const name = aus(p.praxis?.zahnarzt) || aus(p.einstellungen?.praxis?.zahnarzt) || aus(p.behandler)
    if (name) return name
  }
  if (typeof localStorage === 'undefined') return ''
  try {
    const roh = JSON.parse(localStorage.getItem(key.replace(/\.liste\.v\d+/, '.einstellungen.v1')) ?? 'null') as { praxis?: { zahnarzt?: unknown } } | null
    return aus(roh?.praxis?.zahnarzt)
  } catch {
    return ''
  }
}

/**
 * Ablage an die PlanR-Übersicht melden (Kopf für die Liste, Inhalt für den Export). Die Übersicht führt
 * die Meldungen aller Browser zusammen; was hier fehlt, bleibt dort stehen, bis es gelöscht gemeldet wird.
 */
function hubMelden(key: string, liste: AblageEintrag<unknown>[]) {
  const basis = modulVon(key)
  const meta = HUB_MODUL[basis]
  if (!meta || typeof fetch !== 'function') return
  const weg = entfernt.get(key) ?? []
  if (!liste.length && !weg.length) return
  const hub = hubAdresse()
  const plaene = liste.map((e) => ({
    modul: basis, kuerzel: meta.kuerzel, art: meta.art,
    nummer: e.nummer, patient: e.patient, betrag: e.betrag, status: e.status, geaendert: e.geaendert,
    behandler: behandlerVon(key, e.plan), plan: e.plan,
  }))
  fetch(hub, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modul: basis, plaene, entfernt: weg }) }).catch(() => {})
}

function lesen<P>(key: string): AblageEintrag<P>[] {
  try {
    const roh = localStorage.getItem(key)
    const liste = roh ? JSON.parse(roh) : []
    return Array.isArray(liste) ? liste.map((e) => ({ status: 'entwurf', geaendert: e.datum ?? '', ...e })) : []
  } catch {
    return []
  }
}

export function useAblage<P>(key: string): Ablage<P> {
  const [liste, setListe] = useState<AblageEintrag<P>[]>(() => lesen<P>(key))
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(liste))
    hubMelden(key, liste)
  }, [key, liste])
  useEffect(() => {
    let vorbei = false
    void abgleichHolen<P>(modulVon(key)).then(({ geloescht, eingang }) => {
      if (vorbei || (!geloescht.length && !eingang.length)) return
      setListe((alt) => {
        const neu = abgleichen(alt, geloescht, eingang)
        return neu.length === alt.length && neu.every((e, i) => e === alt[i]) ? alt : neu
      })
    })
    return () => { vorbei = true }
  }, [key])

  const ablegen = useCallback((d: AblageDaten<P>, status?: AblageStatus) => {
    setListe((alt) => {
      const vorher = alt.find((e) => e.nummer === d.nummer)
      const neuStatus = status ?? vorher?.status ?? 'entwurf'
      const eintrag: AblageEintrag<P> = {
        ...d,
        geaendert: new Date().toISOString(),
        status: neuStatus,
        freigegebenAm: neuStatus === 'freigegeben' ? (status ? new Date().toISOString() : vorher?.freigegebenAm) : undefined,
      }
      return [eintrag, ...alt.filter((e) => e.nummer !== d.nummer)].slice(0, HOECHSTENS)
    })
  }, [])

  const eintrag = useCallback((nummer: string) => liste.find((e) => e.nummer === nummer), [liste])
  const speichern = useCallback((d: AblageDaten<P>) => ablegen(d), [ablegen])
  const freigeben = useCallback((d: AblageDaten<P>) => ablegen(d, 'freigegeben'), [ablegen])
  const zuruecknehmen = useCallback((nummer: string) => {
    setListe((alt) => alt.map((e) => (e.nummer === nummer ? { ...e, status: 'entwurf', freigegebenAm: undefined, geaendert: new Date().toISOString() } : e)))
  }, [])
  const loeschen = useCallback((nummer: string) => setListe((alt) => {
    const weg = alt.find((e) => e.nummer === nummer)
    if (weg) entfernenMerken(key, weg)
    return alt.filter((e) => e.nummer !== nummer)
  }), [key])

  return { liste, eintrag, speichern, freigeben, zuruecknehmen, loeschen }
}

/** Unterscheidet sich der offene Plan vom abgelegten Stand? */
export function ungespeichert<P>(plan: P, eintrag: AblageEintrag<P> | undefined): boolean {
  return !eintrag || JSON.stringify(eintrag.plan) !== JSON.stringify(plan)
}

export const datumZeit = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
