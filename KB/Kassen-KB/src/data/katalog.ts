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
/** UP1–UP3, Modelle/Artikulator/Löffel und Versand der VDZI-Beispielrouten */
const UKPS_HONORAR = [B('UP1'), B('UP2'), B('UP3')]
const UKPS_MODELLE = [L('0015', 6), L('0025', 2), L('0115'), L('0125'), L('0205'), L('0217', 2)]
const UKPS_VERSAND = L('9335', 6)

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
  // VDZI-Beispielrouten (KZVB-Abstract UKPS, Stand 11/2022). Nicht jede Zeile fällt immer an.
  // Keine Abformpauschale 605: Abformmaterial in der tatsächlich entstandenen Höhe. Halteelement 521 0 je Auftrag.
  {
    id: 'ukps', art: 'ukps', titel: 'UKPS lateral', text: 'VDZI: seitliche Elemente · 4× Befestigung, 2× Element, Mundöffnung',
    pos: [...UKPS_HONORAR, ...UKPS_MODELLE, L('5010'), L('5100', 4), L('5110', 2), L('5200', 4), UKPS_VERSAND],
  },
  {
    id: 'ukps-oral', art: 'ukps', titel: 'UKPS oral', text: 'VDZI: orales Element · 1× Befestigung, 1× Element',
    pos: [...UKPS_HONORAR, ...UKPS_MODELLE, L('5010'), L('5100'), L('5110'), UKPS_VERSAND],
  },
  {
    id: 'ukps-flosse', art: 'ukps', titel: 'UKPS Flosse', text: 'VDZI: vestibuläre Gleitflächen · 2× Befestigung, 2× Element',
    pos: [...UKPS_HONORAR, ...UKPS_MODELLE, L('5010'), L('5020', 2), L('5100', 2), L('5110', 2), UKPS_VERSAND],
  },
  {
    id: 'ukps-titration', art: 'ukps', titel: 'Nachadaption und Kontrollen', text: '2 × UP4 Protrusion nachstellen, 2 × UP5a Kontrolle',
    pos: [B('UP4', 2), B('UP5a', 2)],
  },
  {
    id: 'ukps-einschleifen', art: 'ukps', titel: 'Kontrolle mit Einschleifen', text: 'UP5b subtraktiv',
    pos: [B('UP5b')],
  },
  {
    id: 'ukps-aufbau', art: 'ukps', titel: 'Kontrolle mit Aufbau', text: 'UP5c additiv',
    pos: [B('UP5c')],
  },
  {
    id: 'ukps-reparatur', art: 'ukps', titel: 'Wiederherstellung mit Abformung', text: 'UP6b · Sprung/Bruch, Grundeinheit',
    pos: [B('UP6b'), L('0015'), L('8500'), L('8512'), L('9335')],
  },
  {
    id: 'ukps-element', art: 'ukps', titel: 'Protrusionselement erneuern', text: 'UP6e · 2 Elemente',
    pos: [B('UP6e'), L('8500'), L('5110', 2), L('9335')],
  },
  {
    id: 'ukps-unterfuetterung', art: 'ukps', titel: 'Teilunterfütterung', text: 'UP6c',
    pos: [B('UP6c'), L('8500'), L('8085'), L('9335')],
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
  ukps: 'UKPS bei OSAS',
  kieferbruch: 'Kieferbruch',
}

/**
 * Laborleistungen ohne BEL-II-Nummer. Die BEL II kennt keine gedruckten Modelle; eine Abformung per
 * Scanner mit Modellherstellung ist keine Kassenleistung (KZV Berlin, KB/_quellen/kassen-kb.json).
 * Preis: BEB-Liste der Praxis (ITZ 2024), in der Zeile änderbar.
 */
export const PRIVAT_LABOR: Record<string, { text: string; preis: number }> = {
  '0009': { text: 'Modell aus Kunststoff, gedruckt nach Intraoralscan (BEB 0009)', preis: 23 },
  '0036': { text: 'Versandkosten bei Datenlieferung (BEB 0036)', preis: 8.52 },
}

/** Modellpositionen der BEL II, die beim Intraoralscan durch gedruckte Modelle ersetzt werden */
export const BEL_MODELLE = ['0010', '0015']
/** Entfallen beim Intraoralscan: Doublieren und individueller Löffel */
export const BEL_NUR_ABDRUCK = ['0021', '0025', '0217']
