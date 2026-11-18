import { kiMatrix } from './kiMatrix'
import type { KiSchritt } from './planKi'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './store'
import { kfoKi } from './kiPlan'
import { probeDienst } from './kiProbe'

/** Probe-Matrix gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiMatrix.test.ts */
const hinzu = (ebene: string, nr: string, anzahl = 1): KiSchritt => ({ op: 'hinzu', ebene, nr, zahn: '', anzahl } as KiSchritt)
const bau = (lesen: () => any, schreiben: (p: any) => void) => kfoKi(() => ({ plan: lesen(), gesperrt: false, einst: E }), schreiben)
const start = () => probeDienst<any>(bau).anwenden(neuerPlan('KFO-1', E) as any, [hinzu('BEMA', '119a', 12)]).plan

kiMatrix<any>({
  planer: 'KFO-Plan der Kasse',
  bau: bau,
  start: start,
  aendern: 'Dazu acht Brackets 126a.',
  fragen: [
    { text: 'Wie viel vom Honorar zahlt der Patient zunächst selbst und wann bekommt er es zurück?' },
    { text: 'Wie rechnet sich der Betrag der 119a?', erwartet: /119a/ },
    { text: 'Darf ich die 126a mehr als einmal je Zahn abrechnen?' },
  ],
})
