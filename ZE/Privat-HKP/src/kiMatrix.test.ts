import { kiMatrix } from './kiMatrix'
import type { KiSchritt } from './planKi'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './planNeu'
import { zeKi } from './kiPlan'
import { probeDienst } from './kiProbe'

/** Probe-Matrix gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiMatrix.test.ts */
const bau = (lesen: () => any, schreiben: (p: any) => void) => zeKi(() => ({ plan: lesen(), gesperrt: false, einst: E }), schreiben)
const start = () => probeDienst<any>(bau).anwenden(neuerPlan(1) as any, [{ op: 'zahn', zahn: '16', felder: { befund: 'kw', planung: 'KM' } } as KiSchritt]).plan

kiMatrix<any>({
  planer: 'privater ZE-Plan',
  bau: bau,
  start: start,
  aendern: 'Schreib als Bemerkung dazu: Patient wünscht Ratenzahlung.',
  fragen: [
    { text: 'Mit welchem Faktor ist die Kronenposition angesetzt und ab wann brauche ich eine Begründung?', erwartet: /2,3/ },
    { text: 'Welche Position ist im Honorar die teuerste?' },
    { text: 'Wie viele Laborpositionen stehen im Plan und was kosten sie zusammen?' },
  ],
})
