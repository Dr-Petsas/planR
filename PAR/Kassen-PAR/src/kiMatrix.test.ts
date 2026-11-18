import { kiMatrix } from './kiMatrix'
import { neuerFall, STANDARD_EINSTELLUNGEN as E } from './store'
import { preiseAus } from './engine/leistungen'
import { parKi } from './kiPlan'

/** Probe-Matrix gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiMatrix.test.ts */
const preise = preiseAus(E, 1.2, 1.2)
const bau = (lesen: () => any, schreiben: (p: any) => void) => parKi(() => ({ fall: lesen(), gesperrt: false, preise, einst: E }), schreiben)
const start = () => neuerFall(1) as any

kiMatrix<any>({
  planer: 'PAR-Fall der Kasse',
  bau: bau,
  start: start,
  aendern: 'Schreib als Bemerkung dazu: Patient ist Raucher.',
  fragen: [
    { text: 'Welche BEMA-Positionen stecken in der Strecke und wie oft?', erwartet: [/AIT/, /UPT/, /ATG/], verboten: /\b(4000|1040|4070|4075|4080|4005)\b/ },
    { text: 'Wie lange läuft die UPT und wovon hängt ihre Frequenz ab?', erwartet: /Grad/i },
    { text: 'Muss die Strecke von der Kasse genehmigt werden?', erwartet: /genehmig/i },
  ],
})
