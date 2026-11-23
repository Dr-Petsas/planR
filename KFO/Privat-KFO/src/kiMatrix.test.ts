import { kiMatrix } from './kiMatrix'
import type { KiSchritt } from './planKi'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './store'
import { kfoKi } from './kiPlan'
import { probeDienst } from './kiProbe'

/** Probe-Matrix gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiMatrix.test.ts */
const bau = (lesen: () => any, schreiben: (p: any) => void) => kfoKi(() => ({ plan: lesen(), gesperrt: false, einst: E }), schreiben)
const start = () => probeDienst<any>(bau).anwenden(neuerPlan('PKFO-1', E) as any, [{ op: 'schalter', name: 'aufgabe.umformungOk', wert: true } as KiSchritt, { op: 'schalter', name: 'aufgabe.regelbiss', wert: true } as KiSchritt]).plan

kiMatrix<any>({
  planer: 'privater KFO-Plan',
  bau: bau,
  start: start,
  aendern: 'Die kieferorthopädischen Leistungen bitte mit Faktor 3,0.',
  fragen: [
    { text: 'Wie viele Abschläge ergeben sich und wie hoch ist ein Abschlag?' },
    { text: 'Welche GOZ-Nummern stehen für die Umformung und die Einstellung in den Regelbiss im Plan?', erwartet: /60[3-9]0/ },
    { text: 'Ab welchem Faktor brauche ich eine Begründung?', erwartet: /2,3/ },
  ],
})
