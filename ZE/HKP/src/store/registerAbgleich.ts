import { useCallback, useEffect, useState } from 'react'
import type { HkpPlan } from '../types'
import type { Ergebnis } from '../engine/berechnung'
import { planNormalisieren } from './plan'
import {
  RegisterFehler, aktivSetzen, planStand, registerLesen, registerListe, registerSpeichern, useAktiv, useVerbindung, verbunden, type RegisterKopf,
} from './register'

export type Abgleich =
  | { art: 'aus' }
  | { art: 'gespeichert' | 'speichert' }
  | { art: 'fehler'; text: string }
  | { art: 'konflikt'; aktuell: RegisterKopf }
  | { art: 'neu_geladen'; text: string }

/** HÃ¤lt den geÃ¶ffneten Register-HKP und den Plan in PlanR synchron. */
export function useRegisterAbgleich(plan: HkpPlan, ergebnis: Ergebnis, setPlan: (f: (p: HkpPlan) => HkpPlan) => void) {
  const aktiv = useAktiv()
  const istVerbunden = verbunden(useVerbindung())
  const [abgleich, setAbgleich] = useState<Abgleich>({ art: 'aus' })
  const stand = planStand(plan)
  const geaendert = !!aktiv && stand !== aktiv.stand

  const laden = useCallback(async (id: string, hinweis?: string) => {
    const h = await registerLesen(id)
    const p = planNormalisieren(JSON.parse(h.planJson || '{}'))
    setPlan(() => p)
    aktivSetzen({ id: h.id, version: h.version, status: h.status, label: h.patient.label, stand: planStand(p) })
    setAbgleich(hinweis ? { art: 'neu_geladen', text: hinweis } : { art: 'gespeichert' })
    return h
  }, [setPlan])

  const speichern = useCallback(async (version: number) => {
    if (!aktiv) return
    setAbgleich({ art: 'speichert' })
    try {
      const h = await registerSpeichern(aktiv.id, version, plan, ergebnis)
      aktivSetzen({ ...aktiv, version: h.version, status: h.status, label: h.patient.label, stand })
      setAbgleich({ art: 'gespeichert' })
    } catch (e) {
      if (e instanceof RegisterFehler && e.status === 409) setAbgleich({ art: 'konflikt', aktuell: e.daten.aktuell as RegisterKopf })
      else if (e instanceof RegisterFehler && e.status === 404) { aktivSetzen(null); setAbgleich({ art: 'fehler', text: 'Der HKP ist im Register nicht mehr vorhanden â€“ VerknÃ¼pfung gelÃ¶st.' }) }
      else setAbgleich({ art: 'fehler', text: e instanceof Error ? e.message : String(e) })
    }
  }, [aktiv, plan, ergebnis, stand])

  useEffect(() => {
    if (!aktiv || !istVerbunden || !geaendert || abgleich.art === 'konflikt') return
    const t = setTimeout(() => speichern(aktiv.version), 1500)
    return () => clearTimeout(t)
  }, [aktiv, istVerbunden, geaendert, abgleich.art, speichern])

  useEffect(() => {
    if (!aktiv || !istVerbunden) return
    const t = setInterval(async () => {
      try {
        const liste = await registerListe()
        const h = liste.find((x) => x.id === aktiv.id)
        if (!h || h.version <= aktiv.version) return
        const letzte = h.verlauf?.[h.verlauf.length - 1]
        if (!geaendert) await laden(h.id, `Im Register geÃ¤ndert (${letzte?.wer ?? '?'}: ${letzte?.was ?? ''}) â€“ neuer Stand geladen.`)
        else setAbgleich({ art: 'konflikt', aktuell: h })
      } catch { /* nÃ¤chster Versuch */ }
    }, 30000)
    return () => clearInterval(t)
  }, [aktiv, istVerbunden, geaendert, laden])

  return {
    aktiv, abgleich, geaendert, laden,
    ueberschreiben: () => abgleich.art === 'konflikt' && speichern(abgleich.aktuell.version),
    registerStandLaden: () => aktiv && laden(aktiv.id),
    loesen: () => { aktivSetzen(null); setAbgleich({ art: 'aus' }) },
  }
}

export type RegisterAbgleich = ReturnType<typeof useRegisterAbgleich>
