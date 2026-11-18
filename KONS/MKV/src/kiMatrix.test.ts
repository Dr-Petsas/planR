import { kiMatrix } from './kiMatrix'
import type { KiSchritt } from './planKi'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './planNeu'
import { mkvKi } from './kiPlan'
import { probeDienst } from './kiProbe'

/** Probe-Matrix gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiMatrix.test.ts */
const bau = (lesen: () => any, schreiben: (p: any) => void) => mkvKi(() => ({ plan: lesen(), gesperrt: false, einst: E }), schreiben)
const start = () => probeDienst<any>(bau).anwenden(neuerPlan('FMKV-1', E) as any, [{ op: 'zahn', zahn: '16', felder: { therapie: 'komposit', flaechen: 2 } } as KiSchritt]).plan

kiMatrix<any>({
  planer: 'Mehrkostenvereinbarung',
  bau: bau,
  start: start,
  aendern: 'Die Füllung an 16 wird doch dreiflächig.',
  fragen: [
    { text: 'Welche BEMA-Position zieht die Kasse hier ab und mit welchem Betrag?', erwartet: [/13\s?[abcd]/, /\d+,\d\d/], verboten: /2685|BEMA 2\d{3}/ },
    { text: 'Welche GOZ-Nummer rechnen wir für die Füllung ab und mit welchem Faktor?', erwartet: /\d{4}/ },
    { text: 'Muss der Patient die Vereinbarung vor der Behandlung unterschreiben?', erwartet: /vor/i },
  ],
})
