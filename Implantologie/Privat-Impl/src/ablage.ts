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
  useEffect(() => localStorage.setItem(key, JSON.stringify(liste)), [key, liste])

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
