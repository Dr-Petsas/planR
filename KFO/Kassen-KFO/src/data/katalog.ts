// Fachliche Tabellen des Kassen-KFO-Planers – jede mit ihrer Quelle (KFO/_quellen/kassen-kfo.json):
// KIG nach Anlage 1/2 der KFO-Richtlinie (G-BA), Einstufungsraster 119/120 nach BEMA Teil 3,
// Mehr-/Zusatzleistungen nach Anlage B BMV-Z, Vorlagen mit BEL-II-Laborketten.

import type { BehandlungsArt, Ebene, KigGruppe, PlanArt, PrivatArt } from '../types'

/** KIG-Einstufung (Anlage 1 KFO-Richtlinie). Leistungspflichtig sind nur die Grade 3 bis 5. */
export const KIG: { gruppe: KigGruppe; name: string; grade: Partial<Record<1 | 2 | 3 | 4 | 5, string>> }[] = [
  { gruppe: 'A', name: 'Lippen-Kiefer-Gaumenspalte bzw. andere kraniofaziale Anomalie', grade: { 5: 'Spalte bzw. andere kraniofaziale Anomalie' } },
  { gruppe: 'U', name: 'Unterzahl', grade: { 4: 'Unterzahl (nur bei präprothetischer Kieferorthopädie oder kieferorthopädischem Lückenschluss)' } },
  { gruppe: 'S', name: 'Durchbruchsstörungen', grade: { 4: 'Retention (außer Achter)', 5: 'Verlagerung (außer Achter)' } },
  { gruppe: 'D', name: 'Sagittale Stufe distal', grade: { 1: 'bis 3 mm', 2: 'über 3 bis 6 mm', 4: 'über 6 bis 9 mm', 5: 'über 9 mm' } },
  { gruppe: 'M', name: 'Sagittale Stufe mesial', grade: { 4: '0 bis 3 mm', 5: 'über 3 mm' } },
  { gruppe: 'O', name: 'Vertikale Stufe offen', grade: { 1: 'bis 1 mm', 2: 'über 1 bis 2 mm', 3: 'über 2 bis 4 mm', 4: 'über 4 mm, habituell offen', 5: 'über 4 mm, skelettal offen' } },
  { gruppe: 'T', name: 'Vertikale Stufe tief', grade: { 1: 'über 1 bis 3 mm', 2: 'über 3 mm, mit/ohne Gingivakontakt', 3: 'über 3 mm, traumatischer Gingivakontakt' } },
  { gruppe: 'B', name: 'Transversale Abweichung: Bukkal-/Lingualokklusion', grade: { 4: 'Bukkal- oder Lingualokklusion' } },
  { gruppe: 'K', name: 'Transversale Abweichung: Kreuzbiss', grade: { 2: 'Kopfbiss', 3: 'beidseitiger Kreuzbiss', 4: 'einseitiger Kreuzbiss' } },
  { gruppe: 'E', name: 'Kontaktpunktabweichung, Engstand', grade: { 1: 'unter 1 mm', 2: 'über 1 bis 3 mm', 3: 'über 3 bis 5 mm', 4: 'über 5 mm' } },
  { gruppe: 'P', name: 'Platzmangel', grade: { 2: 'bis 3 mm', 3: 'über 3 bis 4 mm', 4: 'über 4 mm' } },
]

export const kigText = (g: KigGruppe | '', grad: number) => (g ? `${g}${grad || ''}` : '')

/** Frühbehandlung (Richtlinie B8 c, BEMA-Bestimmung 5 zu 119/120). */
export const KIG_FRUEH = ['D5', 'K3', 'K4', 'B4', 'M4', 'M5', 'P3']
/** Frühe Behandlung (B8 d): Spalte/kraniofaziale Anomalie, skelettal offener Biss, Progenie (dazu verletzungsbedingte Fehlstellungen). */
export const KIG_FRUEHE = ['A5', 'O5', 'M4', 'M5']
/** Erwachsene: nur kombiniert kieferchirurgisch-kieferorthopädisch (§ 28 Abs. 2 Satz 7 SGB V, Richtlinie B4). */
export const KIG_KOMBI = ['A5', 'D4', 'D5', 'M4', 'M5', 'O5', 'B4', 'K4']

export const PLANART_NAME: Record<PlanArt, string> = {
  plan: 'Behandlungsplan',
  aenderung: 'Therapieänderung',
  verlaengerung: 'Verlängerung',
}

export const BEHANDLUNGSART_NAME: Record<BehandlungsArt, string> = {
  regel: 'Regelbehandlung (spätes Wechselgebiss)',
  frueh: 'Frühbehandlung (B8 c, höchstens 6 Quartale)',
  fruehe: 'Frühe Behandlung (B8 d)',
  kombi: 'Kombiniert kieferchirurgisch-kieferorthopädisch (Erwachsene)',
}

/** Einstufungsraster BEMA 119 (Umformung eines Kiefers): Punkte je Spalte, Summe → a–d. */
export const RASTER_119 = [
  { name: 'Zahl der bewegten Zähne bzw. Zahngruppen', stufen: [['1–2', 1], ['1–2 Zahngruppen', 2], ['alle Zahngruppen', 3]] },
  { name: 'Größe der Bewegung', stufen: [['1–2 mm', 1], ['3–5 mm', 3], ['mehr als 5 mm', 5]] },
  { name: 'Art und Richtung der Bewegung', stufen: [['günstig kippend', 1], ['ungünstig kippend', 3], ['körperlich', 5]] },
  { name: 'Verankerung', stufen: [['einfach', 1], ['mittelschwer', 2], ['schwierig', 5]] },
  { name: 'Reaktionsweise (Alter, Konstitution, Früh- und Spätbehandlung)', stufen: [['sehr günstig', 1], ['gut', 3], ['ungünstig', 5]] },
] as const

/** Einstufungsraster BEMA 120 (Einstellung des Unterkiefers in den Regelbiss). */
export const RASTER_120 = [
  { name: 'Größe der Bissverlagerung', stufen: [['1–2 mm', 1], ['½ Prämolarenbreite', 3], ['über ½ bis 1 Prämolarenbreite', 5]] },
  { name: 'Lokalisation', stufen: [['einseitig', 1], null, ['beiderseitig', 3]] },
  { name: 'Richtung der Bissverschiebung', stufen: [['mesial', 1], ['lateral', 2], ['distal', 3]] },
  { name: 'Reaktionsweise (Alter, Konstitution, Früh- und Spätbehandlung)', stufen: [['sehr günstig', 1], ['gut', 3], ['ungünstig', 10]] },
] as const

/** 119: 5–7 = a, 8–10 = b, 11–15 = c, ab 16 = d */
export const stufe119 = (p: number) => (p >= 16 ? 'd' : p >= 11 ? 'c' : p >= 8 ? 'b' : p >= 5 ? 'a' : '')
/** 120: 4–8 = a, 9–10 = b, 11–12 = c, ab 13 = d */
export const stufe120 = (p: number) => (p >= 13 ? 'd' : p >= 11 ? 'c' : p >= 9 ? 'b' : p >= 4 ? 'a' : '')

/** Mehr-, Zusatz- und andere Leistungen (Anlage B BMV-Z; A = nicht im Katalog, KZV Berlin). */
export interface MehrLeistung {
  id: string
  art: PrivatArt
  titel: string
  /** GOZ-Nummer; leer = freier Preis (Analogberechnung nach § 6 Abs. 1 GOZ durch die Praxis) */
  goz: string
  vergleich?: string
  vergleichJe?: number
  /** private Material-/Laborkosten fallen an */
  material?: boolean
}

export const MEHR_LEISTUNGEN: MehrLeistung[] = [
  { id: 'keramik', art: 'M', titel: 'Keramikbracket', goz: '6100', vergleich: '126a', material: true },
  { id: 'mini', art: 'M', titel: 'Minibracket', goz: '6100', vergleich: '126a', material: true },
  { id: 'lingual', art: 'M', titel: 'Lingualbracket', goz: '6100', vergleich: '126a', material: true },
  { id: 'selbstligierend', art: 'M', titel: 'Selbstligierendes Bracket', goz: '6100', vergleich: '126a', material: true },
  { id: 'kunststoff', art: 'M', titel: 'Kunststoffbracket', goz: '6100', vergleich: '126a', material: true },
  { id: 'band-gegossen', art: 'M', titel: 'Gegossenes Band (Ausnahmefall, z. B. Lingualtechnik)', goz: '6120', vergleich: '126b', material: true },
  { id: 'entfernen', art: 'M', titel: 'Entfernung eines Keramik- oder Lingualbrackets', goz: '6110', vergleich: '126d' },
  { id: 'teilbogen', art: 'M', titel: 'Teilbogen aus anderem Material als Edelstahl', goz: '6140', vergleich: '127a', material: true },
  { id: 'vollbogen', art: 'M', titel: 'Konfektionierter Vollbogen aus anderem Material als Edelstahl (z. B. NiTi)', goz: '6150', vergleich: '128a', material: true },
  { id: 'vollbogen-ind', art: 'M', titel: 'Individualisierter Vollbogen aus anderem Material als Edelstahl', goz: '6150', vergleich: '128b', material: true },
  { id: 'digital', art: 'M', titel: 'Digitale Abformung statt 7a (je Kieferhälfte/Frontzahnbereich)', goz: '0065', vergleich: '7a', vergleichJe: 4 },
  { id: 'retainer-ok', art: 'Z', titel: 'Festsitzender Oberkiefer-Frontzahnretainer (Ein- oder Ausgliedern)', goz: '', material: true },
  { id: 'retainer-uk', art: 'Z', titel: 'Festsitzender UK-Frontzahnretainer ohne E3/E4 in der UK-Front', goz: '', material: true },
  { id: 'retainer-ersatz', art: 'Z', titel: 'Wiedereingliedern oder Ersatz eines festsitzenden Frontzahnretainers', goz: '', material: true },
  { id: 'minischraube', art: 'Z', titel: 'Implantologische Verankerung (Minischraube, Minipin)', goz: '', material: true },
  { id: 'apparatur', art: 'Z', titel: 'Andere ergänzende festsitzende Apparatur (Pendulum, Nance, Frosch, Beneslider, Wilson)', goz: '', material: true },
  { id: 'gne', art: 'Z', titel: 'Gegossene GNE bzw. GNE mit implantologischer Verankerung', goz: '', material: true },
  { id: 'bisslage', art: 'Z', titel: 'Andere Apparatur zur Bisslagekorrektur (Jasper-Jumper, BioBiteCorrector, gegossenes Herbstscharnier, Herbst ohne 131b-Indikation)', goz: '', material: true },
  { id: 'foto', art: 'Z', titel: 'Fotografie über die Höchstzahl von 116 hinaus', goz: '6000' },
  { id: 'modellanalyse', art: 'Z', titel: 'Modellanalyse über die Höchstzahl von 117 hinaus', goz: '6010' },
  { id: 'kephalometrie', art: 'Z', titel: 'Kephalometrische Auswertung über die Höchstzahl von 118 hinaus', goz: '6020' },
  { id: 'versiegelung', art: 'A', titel: 'Bracketumfeldversiegelung, je Zahn', goz: '2000' },
  { id: 'adhaesiv', art: 'A', titel: 'Adhäsive Befestigung, je Zahn', goz: '2197' },
  { id: 'pzr', art: 'A', titel: 'Professionelle Zahnreinigung, je Zahn', goz: '1040' },
  { id: 'schablone', art: 'A', titel: 'Klebeschablone (indirektes Kleben)', goz: '', material: true },
]
export const MEHR = new Map(MEHR_LEISTUNGEN.map((m) => [m.id, m] as const))

export const PRIVAT_ART_NAME: Record<PrivatArt, string> = {
  M: 'Mehrleistung – die Kasse trägt die vergleichbare BEMA-Leistung',
  Z: 'Zusatzleistung – trägt die/der Versicherte vollständig',
  A: 'Andere Leistung – trägt die/der Versicherte vollständig',
}

/** BEL-II-Nummern, die bei kieferorthopädischen Geräten vorkommen (BEL II 2014, 701 0 bis 751 0, Reparaturen 86x). */
export const BEL_KFO = [
  '0010', '0021', '0054', '0111', '0130', '0201', '0202', '7010', '7020', '7030', '7040', '7050', '7100', '7110', '7121', '7122',
  '7200', '7210', '7220', '7300', '7310', '7320', '7330', '7340', '7400', '7410', '7420', '7430', '7440', '7500', '7510',
  '8610', '8620', '8630', '8640', '8700', '9330',
]

export interface VorlagenPosition { ebene: Ebene; nr: string; anzahl: number; mehr?: string }
export interface Vorlage { id: string; titel: string; text: string; privat?: boolean; pos: VorlagenPosition[] }

const B = (nr: string, anzahl = 1): VorlagenPosition => ({ ebene: 'BEMA', nr, anzahl })
const L = (nr: string, anzahl = 1): VorlagenPosition => ({ ebene: 'BEL', nr, anzahl })
const P = (mehr: string, anzahl = 1): VorlagenPosition => ({ ebene: 'PRIVAT', nr: mehr, anzahl, mehr })

export const VORLAGEN: Vorlage[] = [
  { id: 'untersuchung', titel: 'Untersuchung 01k', text: 'Indikation und Zeitpunkt, ggf. KIG-Feststellung', pos: [B('01k')] },
  {
    id: 'diagnostik', titel: 'Diagnostik und Planung', text: 'Plan, Modelle mit Analyse, 2 Fotos, FRS mit Auswertung, OPG · Labor: 2 Modelle, gesockelt',
    pos: [B('5'), B('7a'), B('117'), B('116', 2), B('Ä934a'), B('118'), B('Ä935d'), L('0010', 2), L('0130')],
  },
  {
    id: 'platte', titel: 'Herausnehmbare Platte', text: 'ein Kiefer · Labor: Modell, Basis, Schraube, Labialbogen, 2 Halteelemente',
    pos: [L('0010'), L('7010'), L('7200'), L('7300'), L('7500', 2)],
  },
  {
    id: 'bimax', titel: 'Bimaxilläres Gerät', text: 'z. B. Aktivator · Labor: 2 Modelle, Konstruktionsbiss, Basis bimaxillär, Labialbogen',
    pos: [L('0010', 2), L('0202'), L('7020'), L('7300')],
  },
  { id: 'mb-ok', titel: 'Multiband Oberkiefer', text: 'Beispiel: 10 Brackets, 2 Bänder, 3 Vollbögen', pos: [B('126a', 10), B('126b', 2), B('128a', 3), B('128c', 2)] },
  { id: 'mb-uk', titel: 'Multiband Unterkiefer', text: 'Beispiel: 10 Brackets, 2 Bänder, 3 Vollbögen', pos: [B('126a', 10), B('126b', 2), B('128a', 3), B('128c', 2)] },
  { id: 'entbaenderung', titel: 'Entfernen der Apparatur', text: 'beide Kiefer: 20 Brackets, 4 Bänder, letzter Bogen', pos: [B('126d', 24), B('128c', 2)] },
  { id: 'uk-retainer', titel: 'UK-Frontzahnretainer', text: 'nur bei E3/E4 in der UK-Front: 6 × 126a, 1 × 127a', pos: [B('126a', 6), B('127a')] },
  { id: 'gne', titel: 'Gaumennahterweiterung', text: '131a mit 4 Bändern · Material und Labor gesondert', pos: [B('131a'), B('126b', 4)] },
  { id: 'separieren', titel: 'Separieren', text: 'BEMA 12 je Sitzung und Kieferhälfte', pos: [B('12', 2)] },
  { id: 'keramik-ok', privat: true, titel: 'Keramikbrackets OK', text: 'Mehrleistung: GOZ 6100 statt BEMA 126a, 10 Zähne', pos: [P('keramik', 10)] },
  { id: 'niti', privat: true, titel: 'NiTi-Bögen', text: 'Mehrleistung: GOZ 6150 statt BEMA 128a, 3 Bögen', pos: [P('vollbogen', 3)] },
  { id: 'scan', privat: true, titel: 'Intraoralscan', text: 'Mehrleistung: GOZ 0065 (4 ×) statt BEMA 7a', pos: [P('digital', 4)] },
  { id: 'versiegelung', privat: true, titel: 'Bracketumfeldversiegelung', text: 'andere Leistung: GOZ 2000, 20 Zähne', pos: [P('versiegelung', 20)] },
]
