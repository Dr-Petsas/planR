/** Probe: kein Weg zurück in die Planübersicht, nur die Grundeinrichtung der Blätter. */
import { useEffect, useRef } from 'react'
import { arbeitStandard, planrLeiste, type PlanPunkt } from './arbeitFenster'
import { blaetterEinpassen } from './components/Handy'

/** Meldet die Planpunkte an die PlanR-Kopfzeile, solange der Plan eingebettet ist. */
export function PlanrLeiste({ punkte, aktiv, onWahl, versand = false }: {
  punkte: PlanPunkt[]
  aktiv: string
  onWahl: (id: string) => void
  versand?: boolean
}) {
  const wahl = useRef(onWahl)
  wahl.current = onWahl
  const stand = `${aktiv}\n${versand ? '1' : '0'}\n${punkte.map((p) => `${p.id}\t${p.text}`).join('\n')}`
  useEffect(() => planrLeiste(punkte, aktiv, (id) => wahl.current(id), versand), [stand])
  return null
}

export function PlanrZurueck() {
  useEffect(() => arbeitStandard(), [])
  useEffect(() => blaetterEinpassen(), [])
  // In der Probe gibt es keinen Weg zurück in die PlanR-Übersicht.
  return null
}
