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
    { text: 'Wie oft darf ich die K7 neben der K1 abrechnen?', erwartet: [/Höchstzahl|so oft|je (Kontroll)?sitzung|unbegrenzt|keine (feste )?(Grenze|Begrenzung|Obergrenze)/i, /eingeglieder|Eingliederung/i], verboten: /Kontrollmodell/i },
    { text: 'Welcher Punktwert ist hier angesetzt und wie rechnet sich daraus das Honorar der K1?', erwartet: [/106/, /1,3497/, /143,07/] },
    { text: 'Zahlt der Patient bei dieser Schiene etwas selbst?', erwartet: /nichts|kein(en)? Eigenanteil|trägt die Kasse|Sachleistung/i, verboten: /andersartig|gleichartig|Festzuschuss (von|in Höhe|beträgt)/i },
  ],
})
