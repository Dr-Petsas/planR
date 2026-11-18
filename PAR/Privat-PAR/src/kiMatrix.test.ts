import { kiMatrix } from './kiMatrix'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './store'
import { parKi } from './kiPlan'

/** Probe-Matrix gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiMatrix.test.ts */
const bau = (lesen: () => any, schreiben: (p: any) => void) => parKi(() => ({ plan: lesen(), gesperrt: false }), schreiben)
const start = () => neuerPlan('PP-1', E) as any

kiMatrix<any>({
  planer: 'private PAR-Strecke',
  bau: bau,
  start: start,
  aendern: 'Bitte alles mit Faktor 3,5 rechnen.',
  fragen: [
    { text: 'Welche Position ist die teuerste in der Strecke?' },
    { text: 'Ab welchem Faktor brauche ich bei der 4005 eine Begründung?', erwartet: /2,3/ },
    { text: 'Wie viel der Gesamtsumme entfällt auf die UPT?' },
  ],
})
