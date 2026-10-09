// Leistungskatalog des Privat-KB-Planers (Schienentherapie und Funktionsdiagnostik).
// GOZ: Abschnitt H (Aufbissbehelfe, Schienen, Langzeitprovisorien) und J (Funktionsanalyse),
// Texte und Punkte aus der amtlichen GOZ-Liste. Labor: BEB 97 mit Bedeutung nach BEB 97 –
// die Hausliste des Labors (z. B. ITZ) nummeriert teils anders, deshalb ordnet `labor`
// jeder BEB-Position die Labornummer gleicher Bedeutung zu (Quelle KB/_quellen/privat-kb.json).

export type GozGruppe = 'Aufbissbehelf' | 'Provisorium' | 'Funktionsanalyse' | 'Begleitend'

export interface GozPosition {
  nr: string
  gruppe: GozGruppe
  /** Mengeneinheit für die Anzeige */
  je?: string
  bema?: string
}

export const GOZ_POSITIONEN: GozPosition[] = [
  { nr: '7000', gruppe: 'Aufbissbehelf', bema: 'K2' },
  { nr: '7010', gruppe: 'Aufbissbehelf', bema: 'K1' },
  { nr: '7020', gruppe: 'Aufbissbehelf', bema: 'K3' },
  { nr: '7030', gruppe: 'Aufbissbehelf', bema: 'K6' },
  { nr: '7040', gruppe: 'Aufbissbehelf', bema: 'K7' },
  { nr: '7050', gruppe: 'Aufbissbehelf', je: 'Sitzung', bema: 'K8' },
  { nr: '7060', gruppe: 'Aufbissbehelf', je: 'Sitzung', bema: 'K9' },
  { nr: '7070', gruppe: 'Aufbissbehelf', je: 'Interdentalraum', bema: 'K4' },
  { nr: '7080', gruppe: 'Provisorium', je: 'Zahn/Implantat' },
  { nr: '7090', gruppe: 'Provisorium', je: 'Brückenglied' },
  { nr: '7100', gruppe: 'Provisorium', je: 'Krone/Spanne' },
  { nr: '8000', gruppe: 'Funktionsanalyse' },
  { nr: '8010', gruppe: 'Funktionsanalyse', je: 'Registrat' },
  { nr: '8020', gruppe: 'Funktionsanalyse' },
  { nr: '8030', gruppe: 'Funktionsanalyse' },
  { nr: '8035', gruppe: 'Funktionsanalyse' },
  { nr: '8050', gruppe: 'Funktionsanalyse', je: 'Sitzung' },
  { nr: '8060', gruppe: 'Funktionsanalyse', je: 'Sitzung' },
  { nr: '8065', gruppe: 'Funktionsanalyse', je: 'Sitzung' },
  { nr: '8080', gruppe: 'Funktionsanalyse', je: 'Sitzung' },
  { nr: '8090', gruppe: 'Funktionsanalyse', je: 'Sitzung' },
  { nr: '8100', gruppe: 'Funktionsanalyse', je: 'Zahnpaar' },
  { nr: '0040', gruppe: 'Begleitend' },
  { nr: '0060', gruppe: 'Begleitend' },
  { nr: '0065', gruppe: 'Begleitend', je: 'Kieferhälfte/Frontzahnbereich' },
  { nr: '4040', gruppe: 'Begleitend', je: 'Sitzung' },
]

/** Funktionsanalytische Leistungen rechnen mit dem eigenen Faktor-Regler. */
export const istFunktionsanalyse = (nr: string) => nr.startsWith('80')

export interface BebPosition {
  nr: string
  text: string
  /** Nummer derselben Leistung in der Laborpreisliste (ITZ) */
  labor?: string
  begleit?: boolean
  hinweis?: string
  /** Fremdlabor-Leistung ohne Listenpreis: `preis` ist ein Platzhalter bis zum Kostenvoranschlag */
  fremd?: boolean
  preis?: number
}

export const BEB_POSITIONEN: BebPosition[] = [
  { nr: '7601', text: 'Schiene tiefgezogen (nicht adjustiert)', labor: '7602' },
  { nr: '7602', text: 'Schiene tiefgezogen, zweiphasig', hinweis: 'GOZ-Zuordnung strittig (7000 oder 7010)' },
  { nr: '7603', text: 'Knirscherschiene aus Kunststoff', labor: '7621' },
  { nr: '7604', text: 'Knirscherschiene aus Weichkunststoff' },
  { nr: '7605', text: 'Retentionsschiene' },
  { nr: '7606', text: 'Medikamententrägerschiene', labor: '7606' },
  { nr: '7611', text: 'Schienungskappe aus Kunststoff, je Zahn' },
  { nr: '7612', text: 'Schienungskappe aus Metall, je Zahn' },
  { nr: '7613', text: 'Aufbisskappe aus Kunststoff, je Zahn' },
  { nr: '7614', text: 'Aufbisskappe aus Metall, je Zahn' },
  { nr: '7621', text: 'Adjustierte Aufbissschiene (Michigan-Typ)', labor: '7621' },
  { nr: '7622', text: 'Aufbissschiene nach Schöttl' },
  { nr: '7623', text: 'Aufbissschiene nach Shore' },
  { nr: '7624', text: 'Aufbissplatte nach Schulz-Bongert' },
  { nr: '7625', text: 'Bissführungsplatte' },
  { nr: '2957', text: 'Fräsen einer Aufbissschiene bei Datenanlieferung (PMMA)', labor: '2957' },
  { nr: '2958', text: 'Fräsen einer Aufbissschiene bei Datenanlieferung (Nylon)', labor: '2958' },
  { nr: '2959', text: 'Konstruktion und Fräsen einer Aufbissschiene bei Modellanlieferung (Nylon)', labor: '2959' },
  { nr: '2960', text: 'Konstruktion und Fräsen einer Aufbissschiene bei Modellanlieferung (PMMA)', labor: '2960' },
  { nr: '7201', text: 'Frontaler oder lateraler Aufbiss, hart', labor: '7201', begleit: true },
  { nr: '7202', text: 'Frontaler oder lateraler Aufbiss, weich', labor: '7202', begleit: true },
  { nr: '8015', text: 'Instandsetzen einer Aufbissschiene, Grundeinheit', begleit: true },
  { nr: '8016', text: 'Erweitern einer Aufbissschiene, Grundeinheit', begleit: true },
  { nr: '8021', text: 'Leistungseinheit, Sprung aus Kunststoff', labor: '8021', begleit: true },
  { nr: '0001', text: 'Modell aus Hartgips', labor: '0001', begleit: true },
  { nr: '0002', text: 'Modell aus Superhartgips', labor: '0002', begleit: true },
  { nr: '0241', text: 'Dublieren eines Modells oder Modellteils', labor: '0241', begleit: true },
  { nr: '0303', text: 'Modell ausblocken, je Zahn oder Kieferteil', begleit: true },
  { nr: '0402', text: 'Modellmontage in Mittelwertartikulator', labor: '0402', begleit: true },
  { nr: '0404', text: 'Modellmontage in Mittelwertartikulator nach Gesichtsbogen', labor: '0404', begleit: true },
  { nr: '0405', text: 'Modellmontage in individuellen Artikulator', labor: '0405', begleit: true },
  { nr: '0511', text: 'Mehraufwand für Einstellen nach Zentrikregistrat', labor: '0511', begleit: true },
  { nr: '0521', text: 'Auswerten eines Registrates', labor: '0521', begleit: true },
  { nr: '1115', text: 'Registrierplatte und -stift auf Basen', labor: '1115', begleit: true },
  { nr: '1122', text: 'Wachsplatte für zentrische Bissnahme vorbereiten', labor: '1122', begleit: true },
  { nr: '0732', text: 'Desinfektion', labor: '0732', begleit: true },
  { nr: '0009', text: 'Modell aus Kunststoff, gedruckt nach Intraoralscan', labor: '0009', begleit: true },
  { nr: '0701', text: 'Versand je Versandgang', labor: '0701', begleit: true },
  { nr: '0036', text: 'Versand bei Datenlieferung', labor: '0036', begleit: true },
  // Die ITZ-Liste kennt keine UKPS: Fremdlabor-Platzhalter, bis der Kostenvoranschlag (XML) eingelesen ist.
  { nr: 'F-UKPS', text: 'Unterkieferprotrusionsschiene zweiteilig, Fremdlabor (lt. Kostenvoranschlag)', fremd: true, preis: 480 },
  { nr: 'F-UKPS-REP', text: 'Instandsetzung/Erneuerung Protrusionselemente UKPS, Fremdlabor', fremd: true, preis: 90, begleit: true },
]

export const BEB = new Map(BEB_POSITIONEN.map((b) => [b.nr, b] as const))

export interface VorlagenPosition {
  ebene: 'GOZ' | 'LABOR'
  /** `UKPS` = Bemessungsleistung aus den Einstellungen */
  nr: string
  anzahl: number
  analog?: boolean
  text?: string
}

export type VorlagenGruppe = 'Schienen' | 'UKPS bei OSAS' | 'Funktion und Nachsorge'

export interface Vorlage {
  id: string
  gruppe: VorlagenGruppe
  titel: string
  text: string
  pos: VorlagenPosition[]
}

const G = (nr: string, anzahl = 1): VorlagenPosition => ({ ebene: 'GOZ', nr, anzahl })
const L = (nr: string, anzahl = 1): VorlagenPosition => ({ ebene: 'LABOR', nr, anzahl })
const A = (nr: string, text: string, anzahl = 1): VorlagenPosition => ({ ebene: 'GOZ', nr, anzahl, analog: true, text })

export const UKPS_TEXT = 'Unterkieferprotrusionsschiene zweiteilig bei OSAS: Bestimmung der therapeutischen Protrusion, Eingliederung und Einweisung'
export const UKPS_TITRATION_TEXT = 'Nachstellen der Protrusion einer UKPS (Titration), je Sitzung'
export const VORLAGEN_GRUPPEN: VorlagenGruppe[] = ['Schienen', 'UKPS bei OSAS', 'Funktion und Nachsorge']

/** Typische Behandlungen – fügen GOZ- und Laborpositionen hinzu, alles bleibt einzeln änderbar. */
const SCHIENEN: Omit<Vorlage, 'gruppe'>[] = [
  {
    id: 'michigan', titel: 'Adjustierte Aufbissschiene', text: 'Michigan-Typ, Mittelwertartikulator',
    pos: [G('7010'), L('0002', 3), L('0241'), L('0402'), L('7621'), L('0732', 2)],
  },
  {
    id: 'knirscher', titel: 'Knirscherschiene weich', text: 'Weichkunststoff, adjustiert',
    pos: [G('7010'), L('0002', 2), L('0402'), L('7604'), L('0732', 2)],
  },
  {
    id: 'tiefzieh', titel: 'Tiefziehschiene', text: 'nicht adjustiert (z. B. Miniplast)',
    pos: [G('7000'), L('0001'), L('7601'), L('0732', 2)],
  },
  {
    id: 'digital', titel: 'Digitale Schiene', text: 'Intraoralscan, gefräst (PMMA)',
    pos: [G('0065', 4), G('7010'), L('2957'), L('0732')],
  },
  {
    id: 'umarbeitung', titel: 'Prothese umarbeiten', text: 'zum Aufbissbehelf',
    pos: [G('7020'), L('0002', 2), L('0402'), L('0732', 2)],
  },
]

const UKPS: Omit<Vorlage, 'gruppe'>[] = [
  {
    id: 'ukps', titel: 'UKPS anfertigen', text: 'analog § 6 GOZ, Protrusionsregistrat, Fremdlabor',
    pos: [G('0060'), A('UKPS', UKPS_TEXT), G('8010'), L('0002', 2), L('0402'), L('F-UKPS'), L('0701'), L('0732', 2)],
  },
  {
    id: 'ukps-titration', titel: 'Titration und Kontrollen', text: '2 × Protrusion nachstellen, 2 × Kontrolle',
    pos: [A('7050', UKPS_TITRATION_TEXT, 2), G('7040', 2)],
  },
  {
    id: 'ukps-reparatur', titel: 'UKPS instand setzen', text: 'Wiederherstellung, Fremdlabor',
    pos: [G('7030'), L('F-UKPS-REP'), L('0701'), L('0732', 2)],
  },
]

const FUNKTION: Omit<Vorlage, 'gruppe'>[] = [
  {
    id: 'fal', titel: 'Klinische Funktionsanalyse', text: 'mit Heil- und Kostenplan',
    pos: [G('8000'), G('0040')],
  },
  {
    id: 'fdi', titel: 'Instrumentelle Funktionsanalyse', text: 'Zentrikregistrat, Gesichtsbogen, Modellanalyse',
    pos: [G('8010', 2), G('8020'), G('8050'), G('8080'), L('0002', 2), L('0404'), L('0511'), L('0521'), L('1122')],
  },
  {
    id: 'kontrolle', titel: 'Kontrollen', text: '2 × Kontrolle, 1 × Einschleifen',
    pos: [G('7040', 2), G('7050')],
  },
  {
    id: 'unterfuetterung', titel: 'Unterfütterung', text: 'Wiederherstellung der Funktion',
    pos: [G('7030'), L('8015'), L('0732', 2)],
  },
  {
    id: 'schienung', titel: 'Semipermanente Schienung', text: 'Ätztechnik, je Interdentalraum',
    pos: [G('7070', 5)],
  },
  {
    id: 'lzp', titel: 'Langzeitprovisorium', text: 'je Zahn, mindestens 3 Monate Tragezeit',
    pos: [G('7080', 4), G('7090')],
  },
]

export const VORLAGEN: Vorlage[] = [
  ...SCHIENEN.map((v) => ({ ...v, gruppe: 'Schienen' as const })),
  ...UKPS.map((v) => ({ ...v, gruppe: 'UKPS bei OSAS' as const })),
  ...FUNKTION.map((v) => ({ ...v, gruppe: 'Funktion und Nachsorge' as const })),
]

/** Gipsmodelle, die beim Intraoralscan durch gedruckte Modelle ersetzt werden */
export const LABOR_GIPSMODELLE = ['0001', '0002']
/** Entfallen beim Intraoralscan */
export const LABOR_NUR_ABDRUCK = ['0241']
/** 0065 je Kieferhälfte bzw. Frontzahnbereich: beide Kiefer = 6 */
export const SCAN_BEREICHE_BEIDE_KIEFER = 6

export const LABOR_KLASSE_FAKTOR = [0.85, 1, 1.2]
export const laborKlasseName = (k: number) => ['günstig', 'Standard', 'hochwertig'][k] ?? 'Standard'
