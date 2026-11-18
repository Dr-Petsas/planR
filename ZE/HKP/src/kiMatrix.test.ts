import { kiMatrix } from './kiMatrix'
import type { KiSchritt } from './planKi'
import { leererPlan } from './store/plan'
import { hkpAnwenden, hkpKi } from './kiPlan'
import { listenFuer, rechnen } from './clara'

/** Probe-Matrix gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiMatrix.test.ts */
const bau = (lesen: () => any, schreiben: (p: any) => void) =>
  hkpKi(() => { const plan = lesen(); return { plan, ergebnis: rechnen(plan), listen: listenFuer(plan), gesperrt: false } }, schreiben)
const start = () => hkpAnwenden(leererPlan(), [{ op: 'zahn', zahn: '16', felder: { befund: 'ww' } } as KiSchritt]).plan as any

kiMatrix<any>({
  planer: 'Kassen-HKP',
  bau: bau,
  start: start,
  aendern: 'Die Krone an 16 soll vollkeramisch werden.',
  fragen: [
    { text: 'Welche BEMA-Positionen rechnen wir für die Krone an 16 ab?' },
    { text: 'Welcher Bonus ist gerade angesetzt und wie viel Festzuschuss ergibt das?' },
    { text: 'Ist das eine Regelversorgung, eine gleichartige oder eine andersartige Versorgung?', erwartet: /Regelversorgung/ },
  ],
})
