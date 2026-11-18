import { kiMatrix } from './kiMatrix'
import type { KiSchritt } from './planKi'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './store'
import { kbKi } from './kiPlan'
import { probeDienst } from './kiProbe'

/** Probe-Matrix gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiMatrix.test.ts */
const hinzu = (ebene: string, nr: string, anzahl = 1): KiSchritt => ({ op: 'hinzu', ebene, nr, zahn: '', anzahl } as KiSchritt)
const bau = (lesen: () => any, schreiben: (p: any) => void) => kbKi(() => ({ plan: lesen(), gesperrt: false, einst: E }), schreiben)
const start = () => probeDienst<any>(bau).anwenden(neuerPlan('PKB-1', E) as any, [hinzu('GOZ', '7010'), hinzu('GOZ', '8000')]).plan

kiMatrix<any>({
  planer: 'privater KB-/Schienen-Plan',
  bau: bau,
  start: start,
  aendern: 'Rechne bitte alles mit Faktor 3,0.',
  fragen: [
    { text: 'Ab welchem Faktor brauche ich bei der 7010 eine Begründung?', erwartet: /2,3/ },
    { text: 'Ab wann muss ich mit dem Patienten eine abweichende Vereinbarung treffen?', erwartet: /3,5/ },
    { text: 'Wie viel vom Gesamtbetrag ist Honorar und wie viel Labor?' },
  ],
})
