import { kiMatrix } from './kiMatrix'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './planNeu'
import { implKi } from './kiPlan'

/** Probe-Matrix gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiMatrix.test.ts */
const bau = (lesen: () => any, schreiben: (p: any) => void) => implKi(() => ({ plan: lesen(), gesperrt: false, einst: E }), schreiben)
const start = () => ({ ...neuerPlan(1), zaehne: { '16': { B: 'f', TP: 'I' } } }) as any

kiMatrix<any>({
  planer: 'Implantatplan',
  bau: bau,
  start: start,
  aendern: 'Setz die 9010 auf Faktor 3,2 wegen sehr schmalem Kieferkamm.',
  fragen: [
    { text: 'Wie viel vom Gesamtbetrag entfällt auf Material und Labor?' },
    { text: 'Welche Positionen haben einen Faktor über 2,3?', erwartet: /keine Position|keine der Positionen|^Keine/i, verboten: /(0530|5377)[^.]{0,60}(über|höher|oberhalb)/ },
    { text: 'Wie oft steht die 9010 im Plan und was kostet sie?', erwartet: /9010/ },
  ],
})
