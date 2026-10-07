// Vorlagen des Kassen-KB-Planers: BEMA Teil 2 mit den typischen BEL-II-Laborketten
// (KZV Berlin, KZVB; Quelle KB/_quellen/kassen-kb.json). Alles bleibt einzeln änderbar.

import type { Art, Ebene } from '../types'

export interface VorlagenPosition { ebene: Ebene; nr: string; anzahl: number }

export interface Vorlage {
  id: string
  titel: string
  text: string
  art: Art
  pos: VorlagenPosition[]
}

const B = (nr: string, anzahl = 1): VorlagenPosition => ({ ebene: 'BEMA', nr, anzahl })
const L = (nr: string, anzahl = 1): VorlagenPosition => ({ ebene: 'BEL', nr, anzahl })
/** Abformung (Pauschale 605) */
const A = (anzahl: number): VorlagenPosition => ({ ebene: 'MATERIAL', nr: '605', anzahl })

export const VORLAGEN: Vorlage[] = [
  {
    id: 'k1', art: 'kiefergelenk', titel: 'K1 Aufbissbehelf adjustiert', text: 'z. B. Michigan-Schiene · 2 Modelle, Mittelwertartikulator',
    pos: [B('2'), B('K1'), L('0010', 2), L('0120'), L('4010'), A(2)],
  },
  {
    id: 'k2', art: 'kiefergelenk', titel: 'K2 Aufbissbehelf ohne adj. Oberfläche', text: 'akuter Schmerz, z. B. Miniplast',
    pos: [B('2'), B('K2'), L('0010'), L('4020'), A(1)],
  },
  {
    id: 'k3', art: 'kiefergelenk', titel: 'K3 Prothese umarbeiten', text: 'zum adjustierten Aufbissbehelf',
    pos: [B('2'), B('K3'), L('0010', 2), L('0120'), L('4030'), A(2)],
  },
  {
    id: 'k4', art: 'kiefergelenk', titel: 'K4 Semipermanente Schienung', text: 'Ätztechnik, je Interdentalraum',
    pos: [B('2'), B('K4', 5)],
  },
  {
    id: 'kontrolle', art: 'kiefergelenk', titel: 'Kontrollen K7/K8', text: '2 × Kontrolle, 1 × Einschleifen',
    pos: [B('K7', 2), B('K8')],
  },
  {
    id: 'k9', art: 'kiefergelenk', titel: 'K9 neue adjustierte Oberfläche', text: 'additive Methode',
    pos: [B('K9')],
  },
  {
    id: 'k6', art: 'kiefergelenk', titel: 'K6 Wiederherstellung', text: 'Unterfütterung oder Reparatur des Behelfs',
    pos: [B('K6'), L('8610'), L('8620')],
  },
  {
    id: 'ukps', art: 'kiefergelenk', titel: 'Unterkieferprotrusionsschiene', text: 'UP1–UP3 · nur auf Veranlassung Schlafmedizin',
    pos: [B('UP1'), B('UP2'), B('UP3'), L('0015', 2), L('0125'), L('0205'), L('5010'), L('5100', 2), L('5110', 2), A(2)],
  },
  {
    id: 'bruch-schiene', art: 'kieferbruch', titel: 'Schiene am gebrochenen Kiefer', text: 'GOÄ 2699 mit Modellen',
    pos: [B('Ä2699'), L('0010', 2), A(2)],
  },
  {
    id: 'bruch-ligatur', art: 'kieferbruch', titel: 'Drahtligaturen', text: 'GOÄ 2697 je Kieferhälfte / Frontzahnbereich',
    pos: [B('Ä2697', 2)],
  },
  {
    id: 'bruch-entfernung', art: 'kieferbruch', titel: 'Schiene entfernen', text: 'GOÄ 2702 je Kiefer',
    pos: [B('Ä2702')],
  },
]

export const ART_NAME: Record<Art, string> = {
  kiefergelenk: 'Kiefergelenkserkrankung',
  kieferbruch: 'Kieferbruch',
}
