// Leistungskatalog des Privat-KFO-Planers. GOZ Abschnitt G mit den Kriterien für den
// Behandlungsumfang im Wortlaut der GOZ, die Analogleistungen der BZÄK-Liste
// ("Analog zu berechnende Leistungen", Abschnitt G), Material über dem Standard nach der
// Allgemeinen Bestimmung zu Abschnitt G und Laborpositionen der Laborliste.
// Belege: KFO/_quellen/privat-kfo.json

import type { Aufgabe, KriteriumRegelbiss, KriteriumUmformung } from '../types'

export const KRITERIEN_UMFORMUNG: Record<KriteriumUmformung, string> = {
  a: 'Zahl der bewegten Zahngruppen: zwei und mehr Zahngruppen',
  b: 'Ausmaß der Zahnbewegung: mehr als 2 Millimeter',
  c: 'Art der Zahnbewegung: körperlich mehr als 2 Millimeter, kontrollierte Wurzelbewegung, direkte Veränderung der Bisshöhe, Zahndrehung mehr als 30 Grad',
  d: 'Richtung der Zahnbewegung: entgegen Wanderungstendenz',
  e: 'Verankerung: mit zusätzlichen intra- oder extraoralen Maßnahmen',
}

export const KRITERIEN_REGELBISS: Record<KriteriumRegelbiss, string> = {
  a: 'Ausmaß der Bissverschiebung: mehr als 4 Millimeter',
  b: 'Richtung der Bissverschiebung, Unterkiefer relativ zum Oberkiefer: dorsal',
  c: 'Skelettale Bedingungen: ungünstige Wachstumsvoraussetzungen',
}

/** GOZ 6030/6040/6050: mittlerer Umfang ab drei, hoher Umfang ab vier Kriterien a–e. */
export const umformungNr = (k: KriteriumUmformung[]) => (k.length >= 4 ? '6050' : k.length >= 3 ? '6040' : '6030')
/** GOZ 6060/6070/6080: mittlerer Umfang ab einem, hoher Umfang ab zwei Kriterien a–c. */
export const regelbissNr = (k: KriteriumRegelbiss[]) => (k.length >= 2 ? '6080' : k.length >= 1 ? '6070' : '6060')
export const UMFANG: Record<string, string> = {
  '6030': 'geringer Umfang', '6040': 'mittlerer Umfang', '6050': 'hoher Umfang',
  '6060': 'geringer Umfang', '6070': 'mittlerer Umfang', '6080': 'hoher Umfang',
}

export const leereAufgabe = (): Aufgabe => ({
  umformungOk: false, kriterienOk: [], umformungUk: false, kriterienUk: [],
  regelbiss: false, kriterienRegelbiss: [], alveolaerOk: false, alveolaerUk: false,
})

/** Komplexleistungen 6030–6080 (Zeitraum bis vier Jahre) */
export const istKomplex = (nr: string) => /^60[3-8]0$/.test(nr)
/** neben 6030–6080 nicht berechnungsfähig */
export const NICHT_NEBEN_KOMPLEX = ['6190', '6200', '6210', '6220', '6230', '6240', '6250', '6260']

export type GozGruppe = 'Diagnostik' | 'Apparatur' | 'Einzelleistung' | 'Begleitend'

export interface GozPosition { nr: string; gruppe: GozGruppe; je?: string }

export const GOZ_POSITIONEN: GozPosition[] = [
  { nr: '0010', gruppe: 'Diagnostik' },
  { nr: '0040', gruppe: 'Diagnostik' },
  { nr: '0060', gruppe: 'Diagnostik' },
  { nr: '0065', gruppe: 'Diagnostik', je: 'Kieferhälfte/Frontzahnbereich' },
  { nr: '6000', gruppe: 'Diagnostik', je: 'Aufnahme' },
  { nr: '6010', gruppe: 'Diagnostik', je: 'Leistung nach 0060' },
  { nr: '6020', gruppe: 'Diagnostik', je: 'Methode' },
  { nr: '6100', gruppe: 'Apparatur', je: 'Klebestelle' },
  { nr: '6110', gruppe: 'Apparatur', je: 'Bracket' },
  { nr: '6120', gruppe: 'Apparatur', je: 'Band' },
  { nr: '6130', gruppe: 'Apparatur', je: 'Band' },
  { nr: '6140', gruppe: 'Apparatur', je: 'Bogen' },
  { nr: '6150', gruppe: 'Apparatur', je: 'Bogen und Kiefer' },
  { nr: '6160', gruppe: 'Apparatur' },
  { nr: '6170', gruppe: 'Apparatur' },
  { nr: '6180', gruppe: 'Apparatur', je: 'Kiefer und Sitzung' },
  { nr: '6190', gruppe: 'Einzelleistung' },
  { nr: '6200', gruppe: 'Einzelleistung' },
  { nr: '6210', gruppe: 'Einzelleistung', je: 'Sitzung' },
  { nr: '6220', gruppe: 'Einzelleistung', je: 'Kiefer' },
  { nr: '6230', gruppe: 'Einzelleistung', je: 'Kiefer' },
  { nr: '6240', gruppe: 'Einzelleistung' },
  { nr: '6250', gruppe: 'Einzelleistung' },
  { nr: '6260', gruppe: 'Einzelleistung' },
  { nr: '2000', gruppe: 'Begleitend', je: 'Zahn' },
  { nr: '2197', gruppe: 'Begleitend' },
  { nr: '9020', gruppe: 'Begleitend', je: 'Implantat' },
  { nr: '0510', gruppe: 'Begleitend' },
]

export const GOAE_POSITIONEN = ['1', '5', '5004', '5090', '5095', '5037', '5020', '2702']

export interface AnalogLeistung {
  id: string
  text: string
  /** Bezugsleistung, wenn eine Quelle sie nennt – sonst wählt die Praxis (§ 6 Abs. 1 GOZ) */
  bezug?: string
  quelle: string
}

/** BZÄK-Liste "Analog zu berechnende Leistungen", Abschnitt G – die BZÄK nennt keine Bezugsleistungen. */
export const ANALOG_LEISTUNGEN: AnalogLeistung[] = [
  { id: 'attachment', text: 'Eingliederung eines Attachments (Aligner-Therapie), je Zahn', bezug: '6100', quelle: 'verbreitete Praxis (BZÄK/BLZK: analog)' },
  { id: 'asr', text: 'Approximale Schmelzreduktion, je Zahnzwischenraum', bezug: '4070', quelle: 'Beispiel IWW Abrechnungswissen' },
  { id: 'digimodell', text: 'Analyse digitaler Kiefermodelle', bezug: '6010', quelle: 'Beratungsforum Nr. 53 (PKV/Beihilfe)' },
  { id: 'foto', text: 'Fotografie ohne kieferorthopädische Auswertung', bezug: '6000', quelle: 'Beratungsforum Nr. 15 (PKV-Empfehlung)' },
  { id: 'setup', text: 'Digitale Behandlungsplanung / Set-up (z. B. ClinCheck) bei Aligner-Therapie', quelle: 'BZÄK-Liste, Bezugsleistung frei' },
  { id: 'frs-digital', text: 'Digitale Auswertung des Fernröntgenseitenbildes', quelle: 'BZÄK-Liste, Bezugsleistung frei' },
  { id: 'intraoral', text: 'Elektronische Auswertung intraoraler Darstellungen', quelle: 'BZÄK-Liste, Bezugsleistung frei' },
  { id: 'schablone', text: 'Eingliederung einer Bracket-Positionierungsschablone', quelle: 'BZÄK-Liste, Bezugsleistung frei; Labor nach § 9' },
  { id: 'reparatur', text: 'Reparatur einer festsitzenden Apparatur', quelle: 'BZÄK-Liste (6180 gilt nur für herausnehmbare Geräte)' },
  { id: 'zementreste', text: 'Entfernung von Zementresten nach Abnahme durch einen anderen Behandler', quelle: 'BZÄK-Liste, Bezugsleistung frei' },
]

export interface MehrMaterial { id: string; text: string; gegen: string }

/** Material über dem Standard (Allg. Bestimmung Abschnitt G) – Preise trägt die Praxis ein. */
export const MEHR_MATERIAL: MehrMaterial[] = [
  { id: 'keramik', text: 'Keramikbracket', gegen: 'unprogrammiertes Edelstahlbracket' },
  { id: 'selbstligierend', text: 'Selbstligierendes Bracket', gegen: 'unprogrammiertes Edelstahlbracket' },
  { id: 'lingual', text: 'Lingualbracket (individuell)', gegen: 'unprogrammiertes Edelstahlbracket' },
  { id: 'programmiert', text: 'Programmiertes Bracket (z. B. Straight-Wire)', gegen: 'unprogrammiertes Edelstahlbracket' },
  { id: 'niti', text: 'Hochelastischer Bogen (NiTi, superelastisch)', gegen: 'Edelstahlbogen' },
  { id: 'tma', text: 'Bogen aus Beta-Titan (TMA)', gegen: 'Edelstahlbogen' },
  { id: 'band', text: 'Gegossenes oder individuelles Band', gegen: 'Edelstahlband' },
]
export const MEHR = new Map(MEHR_MATERIAL.map((m) => [m.id, m] as const))

/** Laborpositionen der Laborliste, die in der KFO vorkommen (Nummer der Laborliste). */
export const LABOR_POSITIONEN = [
  '0001', '0002', '0007', '0009', '0241', '0833', '7001', '7002', '7104', '7105', '7106', '7122', '7201', '7202', '7301', '7501',
  '7503', '7504', '7090', '7091',
]

export interface VorlagenPosition { ebene: 'GOZ' | 'GOAE' | 'LABOR' | 'MATERIAL'; nr: string; anzahl: number; text?: string }

export interface Vorlage { id: string; titel: string; text: string; pos: VorlagenPosition[] }

const G = (nr: string, anzahl = 1): VorlagenPosition => ({ ebene: 'GOZ', nr, anzahl })
const A = (nr: string, anzahl = 1): VorlagenPosition => ({ ebene: 'GOAE', nr, anzahl })
const L = (nr: string, anzahl = 1): VorlagenPosition => ({ ebene: 'LABOR', nr, anzahl })
const M = (text: string, anzahl = 1): VorlagenPosition => ({ ebene: 'MATERIAL', nr: 'Mat.', anzahl, text })

/** Typische Bausteine – Anzahl, Faktor und Preis bleiben einzeln änderbar. */
export const VORLAGEN: Vorlage[] = [
  {
    id: 'diagnostik', titel: 'Diagnostik und Planung', text: 'Untersuchung, Plan, Modelle mit Analyse, Fotos, OPG, FRS mit Auswertung',
    pos: [G('0010'), G('0040'), G('0060'), G('6010'), G('6000', 2), G('6020'), A('5004'), A('5090')],
  },
  {
    id: 'scan', titel: 'Intraoralscan', text: 'beide Kiefer (4 Kieferhälften) statt Abformung',
    pos: [G('0065', 4)],
  },
  {
    id: 'platte', titel: 'Herausnehmbare Platte', text: 'ein Kiefer · Labor: Modell, Basis, 2 Klammern, Labialbogen, Schraube',
    pos: [L('0001'), L('7001'), L('7106', 2), L('7301'), L('7501')],
  },
  {
    id: 'funktionsregler', titel: 'Bimaxilläres Gerät', text: 'z. B. Aktivator · Labor: 2 Modelle, Basis bimaxillär, Labialbogen',
    pos: [L('0001', 2), L('7002'), L('7301')],
  },
  {
    id: 'mb-ok', titel: 'Multiband Oberkiefer', text: 'Beispiel: 10 Brackets, 2 Bänder, 3 Bögen, Versiegelung',
    pos: [G('6100', 10), G('6120', 2), G('6150', 3), G('2000', 10)],
  },
  {
    id: 'mb-uk', titel: 'Multiband Unterkiefer', text: 'Beispiel: 10 Brackets, 2 Bänder, 3 Bögen, Versiegelung',
    pos: [G('6100', 10), G('6120', 2), G('6150', 3), G('2000', 10)],
  },
  {
    id: 'entbaenderung', titel: 'Entfernen der Apparatur', text: 'beide Kiefer: 20 Brackets, 4 Bänder',
    pos: [G('6110', 20), G('6130', 4)],
  },
  {
    id: 'headgear', titel: 'Headgear', text: 'extraorale Verankerung · Hilfsmittel gesondert',
    pos: [G('6160'), M('Headgear (Gesichtsbogen, Zugvorrichtung)')],
  },
  {
    id: 'minipin', titel: 'Minischraube (Pin)', text: 'GOZ 9020 mit OP-Zuschlag 0510 · Schraube als Material',
    pos: [G('9020'), G('0510'), M('Minischraube (orthodontisches Implantat)')],
  },
  {
    id: 'skelett', titel: 'Skelettalter', text: 'Handröntgen mit Beurteilung (GOÄ 5037)',
    pos: [A('5037')],
  },
]

export const LABOR_KLASSE_FAKTOR = [0.85, 1, 1.2]
export const laborKlasseName = (k: number) => ['günstig', 'Standard', 'hochwertig'][k] ?? 'Standard'
