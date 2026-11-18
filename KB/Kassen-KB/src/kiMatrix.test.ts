import { kiMatrix } from './kiMatrix'
import type { KiSchritt } from './planKi'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './store'
import { kbKi } from './kiPlan'
import { probeDienst } from './kiProbe'

/** Probe-Matrix gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiMatrix.test.ts */
const hinzu = (ebene: string, nr: string, anzahl = 1): KiSchritt => ({ op: 'hinzu', ebene, nr, zahn: '', anzahl } as KiSchritt)
const bau = (lesen: () => any, schreiben: (p: any) => void) => kbKi(() => ({ plan: lesen(), gesperrt: false, einst: E }), schreiben)
const start = () => probeDienst<any>(bau).anwenden(neuerPlan('KB-1', E) as any, [hinzu('BEMA', 'K1')]).plan

kiMatrix<any>({
  planer: 'KB-Plan der Kasse',
  bau: bau,
  start: start,
  aendern: 'Dazu zweimal die K7 für Kontrollen.',
  fragen: [
    { text: 'Wie oft darf ich die K7 neben der K1 abrechnen?' },
    { text: 'Welcher Punktwert ist hier angesetzt und wie rechnet sich daraus das Honorar der K1?', erwartet: /Punkt/i },
    { text: 'Zahlt der Patient bei dieser Schiene etwas selbst?' },
  ],
})
