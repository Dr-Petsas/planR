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
}
const hubGemeldet = new Set<string>()

const modulVon = (key: string) => key.split('@')[0].replace(/\.liste\.v\d+$/, '')
const hubAdresse = () => (typeof location !== 'undefined' && location.hostname.endsWith('.pickadoc-tunnel.com')
  ? 'https://planr.pickadoc-tunnel.com/api/plaene'
  : 'http://127.0.0.1:5189/api/plaene')

/** In der PlanR-Übersicht gelöschte Pläne; ein später erneut gespeicherter Stand bleibt. */
export function ohneGeloeschte<E extends { nummer: string; geaendert: string }>(liste: E[], geloescht: { nummer: string; geaendert: string }[]): E[] {
  return liste.filter((e) => !geloescht.some((g) => g.nummer === e.nummer && (e.geaendert || '') <= g.geaendert))
}

async function geloeschtHolen(modul: string): Promise<{ nummer: string; geaendert: string }[]> {
  if (!HUB_MODUL[modul] || typeof fetch !== 'function') return []
  try {
    const r = await fetch(`${hubAdresse()}?nur=geloescht`, { cache: 'no-store' })
    const d = (await r.json()) as { geloescht?: { modul: string; nummer: string; geaendert: string }[] }
    return (d.geloescht ?? []).filter((g) => g.modul === modul)
  } catch {
    return []
  }
}

/** Kopf der Ablage an die PlanR-Übersicht melden. Ein leerer Erstaufruf löscht nichts. */
function hubMelden(key: string, liste: AblageEintrag<unknown>[]) {
  const basis = modulVon(key)
  const meta = HUB_MODUL[basis]
  if (!meta || typeof fetch !== 'function') return
  if (!liste.length && !hubGemeldet.has(key)) return
  hubGemeldet.add(key)
  const hub = hubAdresse()
  const plaene = liste.map((e) => ({
    modul: basis, kuerzel: meta.kuerzel, art: meta.art,
    nummer: e.nummer, patient: e.patient, betrag: e.betrag, status: e.status, geaendert: e.geaendert,
  }))
  fetch(hub, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modul: basis, plaene }) }).catch(() => {})
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
    void geloeschtHolen(modulVon(key)).then((g) => {
      if (vorbei || !g.length) return
      setListe((alt) => {
        const neu = ohneGeloeschte(alt, g)
        return neu.length === alt.length ? alt : neu
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
  const loeschen = useCallback((nummer: string) => setListe((alt) => alt.filter((e) => e.nummer !== nummer)), [])

  return { liste, eintrag, speichern, freigeben, zuruecknehmen, loeschen }
}

/** Unterscheidet sich der offene Plan vom abgelegten Stand? */
export function ungespeichert<P>(plan: P, eintrag: AblageEintrag<P> | undefined): boolean {
  return !eintrag || JSON.stringify(eintrag.plan) !== JSON.stringify(plan)
}

export const datumZeit = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
