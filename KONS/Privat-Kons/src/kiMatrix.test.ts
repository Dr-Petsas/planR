import { kiMatrix } from './kiMatrix'
import type { KiSchritt } from './planKi'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './planNeu'
import { konsKi } from './kiPlan'
import { probeDienst } from './kiProbe'

/** Probe-Matrix gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiMatrix.test.ts */
const bau = (lesen: () => any, schreiben: (p: any) => void) => konsKi(() => ({ plan: lesen(), gesperrt: false, einst: E }), schreiben)
const start = () => probeDienst<any>(bau).anwenden(neuerPlan('PK-1', E) as any, [{ op: 'zahn', zahn: '36', felder: { therapie: 'endo', kanaele: 3 } } as KiSchritt]).plan

kiMatrix<any>({
  planer: 'privater Kons-/Endo-Plan',
  bau: bau,
  start: start,
  aendern: 'Zahn 36 hat vier Kanäle, nicht drei.',
  fragen: [
    { text: 'Wie oft steht die 2410 im Plan und warum?', erwartet: /2410/ },
    { text: 'Welche Positionen liegen über dem 2,3-fachen Satz und brauchen eine Begründung?' },
    { text: 'Welche Position ist die teuerste im Plan?' },
  ],
})
