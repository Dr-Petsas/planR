// Therapien und Zusatzleistungen der privaten Kons.
//
// Analogleistungen nach § 6 Abs. 1 GOZ: die Bezugsziffer ist ein VORSCHLAG
// (BZÄK-Analogkatalog bzw. gängige Kommentierung). Welche gleichwertige Leistung
// herangezogen wird, entscheidet die Praxis; die Rechnung nennt die Bezugsziffer.
//
// Kassenpatienten mit BEMA-Grundleistung (Vereinbarungsart "gkvZusatz"): privat
// vereinbar sind nur eigenständige Leistungen, die das BEMA nicht kennt
// (§ 8 Abs. 7 BMV-Z). Eine Zuzahlung zur Kassenleistung ist verboten
// (§ 2 Abs. 2 SGB V, BSG B 6 KA 67/00 R) – deshalb gelten 0110/0120 (Zuschläge zu
// GOZ-Leistungen) dort nicht; an ihre Stelle treten eigenständige Analogleistungen.

import type { Therapie } from '../types'

export type KassenWeg = 'bema' | 'mkv' | 'privat'

export interface TherapieEintrag {
  id: Therapie
  kuerzel: string
  titel: string
  kurz: string
  kasse: KassenWeg
  hinweis: string
}

export const THERAPIEN: TherapieEintrag[] = [
  { id: 'komposit', kuerzel: 'F', titel: 'Kompositfüllung in Adhäsivtechnik', kurz: 'Komposit adhäsiv', kasse: 'mkv',
    hinweis: 'GOZ 2060–2120 nach Flächen, einschließlich Mehrschichttechnik und Polieren.' },
  { id: 'inlay', kuerzel: 'I', titel: 'Einlagefüllung (Inlay)', kurz: 'Inlay', kasse: 'mkv',
    hinweis: 'GOZ 2150–2170, adhäsive Befestigung 2197 bei Keramik, Laborleistung nach Rechnung.' },
  { id: 'goldhaemmer', kuerzel: 'G', titel: 'Goldhämmerfüllung', kurz: 'Goldhämmer (analog)', kasse: 'mkv',
    hinweis: 'Analog § 6 Abs. 1 GOZ, Bezug Einlagefüllung nach Flächen (BZÄK-Analogkatalog).' },
  { id: 'endo', kuerzel: 'W', titel: 'Wurzelkanalbehandlung', kurz: 'Endo', kasse: 'bema',
    hinweis: 'Vital: Exstirpation 2360 je Kanal; avital: Trepanation 2390. Aufbereitung 2410 und Füllung 2440 je Kanal.' },
  { id: 'revision', kuerzel: 'R', titel: 'Revision einer Wurzelkanalbehandlung', kurz: 'Revision', kasse: 'bema',
    hinweis: 'Entfernung der alten Wurzelfüllung analog je Kanal, Aufbereitung 2410 und Füllung 2440 je Kanal.' },
  { id: 'vital', kuerzel: 'U', titel: 'Vitalerhaltung der Pulpa', kurz: 'Vitalerhaltung', kasse: 'bema',
    hinweis: 'Indirekte Überkappung 2330, direkte Überkappung 2340 oder Pulpotomie 2350.' },
  { id: 'versiegelung', kuerzel: 'V', titel: 'Fissurenversiegelung', kurz: 'Versiegelung', kasse: 'privat',
    hinweis: 'GOZ 2000 je Zahn. Bei 6- bis 17-Jährigen sind die Molaren Kassenleistung (BEMA IP 5).' },
  { id: 'aufbau', kuerzel: 'A', titel: 'Aufbau eines zerstörten Zahnes', kurz: 'Aufbau', kasse: 'privat',
    hinweis: 'Plastisch 2180 oder Glasfaserstift 2195, jeweils mit adhäsiver Befestigung 2197.' },
  { id: 'infiltration', kuerzel: 'K', titel: 'Kariesinfiltration', kurz: 'Kariesinfiltration (analog)', kasse: 'privat',
    hinweis: 'Analog § 6 Abs. 1 GOZ, Vorschlag Bezug GOZ 2060 (z. B. ICON).' },
  { id: 'veneer', kuerzel: 'D', titel: 'Direktes Kompositveneer', kurz: 'Komposit-Veneer (analog)', kasse: 'privat',
    hinweis: 'Analog § 6 Abs. 1 GOZ, Vorschlag Bezug GOZ 2120.' },
  { id: 'bleaching', kuerzel: 'B', titel: 'Internes Bleichen eines devitalen Zahnes', kurz: 'Internes Bleaching (analog)', kasse: 'privat',
    hinweis: 'Analog § 6 Abs. 1 GOZ je Sitzung, Vorschlag Bezug GOZ 2360.' },
]

export const THERAPIE: Record<Therapie, TherapieEintrag> = Object.fromEntries(THERAPIEN.map((t) => [t.id, t])) as Record<Therapie, TherapieEintrag>
export const THERAPIE_NACH_KUERZEL: Record<string, TherapieEintrag> = Object.fromEntries(THERAPIEN.map((t) => [t.kuerzel, t]))

/**
 * Mengenbezug einer Zusatzleistung:
 * zahn · kanal · sitzung (Sitzungen am Zahn) · zwischen (Sitzungen − 1)
 * region (je Kieferhälfte/Front) · regionSitzung (Kofferdam: je Kieferhälfte und Sitzung)
 * kiefer · tag (je Behandlungstag) · plan (einmal)
 */
export type Menge = 'zahn' | 'kanal' | 'sitzung' | 'zwischen' | 'region' | 'regionSitzung' | 'kiefer' | 'tag' | 'plan'

export interface Zusatz {
  id: string
  titel: string
  ebene: 'GOZ' | 'ANALOG' | 'GOAE' | 'MAT' | 'ZUSCHLAG'
  nr: string // GOZ-/GOÄ-Nummer bzw. Bezugsziffer der Analogleistung bzw. Material-Kennung
  menge: Menge
  stufe: 1 | 2 | 3
  auto: boolean // ab seiner Stufe automatisch vorgeschlagen
  therapien: Therapie[]
  /** bei Kassen-Grundleistung privat vereinbar (eigenständige Leistung) */
  neben: boolean
  /** nur neben Kassen-Grundleistung (Ersatz für einen GOZ-Zuschlag) */
  nurNeben?: boolean
  ersatzNeben?: string
  anzahl?: number // Standardanzahl je Mengeneinheit (z. B. drei Röntgenbilder)
  quelle: string
}

const FUELLUNG: Therapie[] = ['komposit', 'inlay', 'goldhaemmer']
const ENDO: Therapie[] = ['endo', 'revision']

export const ZUSAETZE: Zusatz[] = [
  // ---------- Stufe 1: Standard ----------
  { id: 'kofferdam', titel: 'Kofferdam', ebene: 'GOZ', nr: '2040', menge: 'regionSitzung', stufe: 1, auto: true,
    therapien: [...FUELLUNG, ...ENDO, 'vital', 'aufbau', 'veneer', 'infiltration'], neben: true,
    quelle: 'GOZ 2040 je Kieferhälfte oder Frontzahnbereich und Sitzung; neben Kassen-Endo privat vereinbar (BEMA kennt keinen Kofferdam).' },
  { id: 'anaesthesie', titel: 'Infiltrationsanästhesie', ebene: 'GOZ', nr: '0090', menge: 'sitzung', stufe: 1, auto: true,
    therapien: [...FUELLUNG, 'endo', 'vital', 'aufbau', 'veneer'], neben: false,
    quelle: 'GOZ 0090 je Injektion; bei Kassen-Endo ist die Anästhesie BEMA-Leistung.' },
  { id: 'vitalitaet', titel: 'Vitalitätsprüfung', ebene: 'GOZ', nr: '0070', menge: 'tag', stufe: 1, auto: true,
    therapien: [...ENDO, 'vital'], neben: false, quelle: 'GOZ 0070 je Sitzung, auch mehrere Zähne.' },
  { id: 'roentgen', titel: 'Röntgen (Ausgang, Messaufnahme, Kontrolle)', ebene: 'GOAE', nr: '5000', menge: 'zahn', anzahl: 3, stufe: 1, auto: true,
    therapien: ENDO, neben: false, quelle: 'GOÄ 5000 je Projektion, Faktor 1,8 (technische Leistung).' },
  { id: 'laenge', titel: 'Elektrometrische Längenbestimmung', ebene: 'GOZ', nr: '2400', menge: 'kanal', stufe: 1, auto: true,
    therapien: ENDO, neben: true, quelle: 'GOZ 2400 je Kanal; neben Kassen-Endo als eigenständige Leistung privat vereinbar.' },
  { id: 'einlage', titel: 'Medikamentöse Einlage', ebene: 'GOZ', nr: '2430', menge: 'zwischen', stufe: 1, auto: true,
    therapien: ENDO, neben: false, quelle: 'GOZ 2430 je Zahn und Sitzung, in Verbindung mit 2360/2410.' },
  { id: 'verschluss', titel: 'Temporärer speicheldichter Verschluss', ebene: 'GOZ', nr: '2020', menge: 'zwischen', stufe: 1, auto: true,
    therapien: [...ENDO, 'inlay', 'bleaching'], neben: false, quelle: 'GOZ 2020 je Verschluss zwischen den Sitzungen.' },
  { id: 'wfEntfernung', titel: 'Entfernung der alten Wurzelfüllung', ebene: 'ANALOG', nr: '2300', menge: 'kanal', stufe: 1, auto: true,
    therapien: ['revision'], neben: true,
    quelle: 'Analog § 6 Abs. 1 GOZ je Kanal (Bezug 2300). Von einzelnen Erstattern bestritten – Begründung beilegen.' },

  // ---------- Stufe 2: erweitert ----------
  { id: 'niti', titel: 'NiTi-Einmalfeilen', ebene: 'MAT', nr: 'niti', menge: 'kanal', stufe: 2, auto: true,
    therapien: ENDO, neben: true, quelle: 'Einmal-Instrumente als Material je Kanal (Preis in den Einstellungen).' },
  { id: 'elektrophysik', titel: 'Elektrophysikalisch-chemische Methode', ebene: 'GOZ', nr: '2420', menge: 'kanal', stufe: 2, auto: true,
    therapien: ENDO, neben: true, quelle: 'GOZ 2420 je Kanal, z. B. Depotphorese oder Iontophorese.' },
  { id: 'mikroskop', titel: 'OP-Mikroskop (Zuschlag)', ebene: 'ZUSCHLAG', nr: '0110', menge: 'tag', stufe: 2, auto: true,
    therapien: [...ENDO, 'vital', 'aufbau'], neben: false, ersatzNeben: 'mikroskopAnalog',
    quelle: 'GOZ 0110 einmal je Behandlungstag, einfacher Satz, nur neben 2195, 2330, 2340, 2360, 2410, 2440.' },
  { id: 'mikroskopAnalog', titel: 'Intrakanaläre Diagnostik mit Dentalmikroskop', ebene: 'ANALOG', nr: '2340', menge: 'sitzung', stufe: 2, auto: true,
    therapien: ENDO, neben: true, nurNeben: true,
    quelle: 'BZÄK-Analogkatalog: eigenständige Leistung neben Kassen-Endo, analog § 6 Abs. 1 GOZ (Bezug Vorschlag 2340).' },
  { id: 'nekrose', titel: 'Entfernung nekrotischen Pulpagewebes', ebene: 'ANALOG', nr: '2360', menge: 'kanal', stufe: 2, auto: true,
    therapien: ['endo'], neben: false, quelle: 'Analog § 6 Abs. 1 GOZ je Kanal (Bezug 2360) – nur avitale Zähne, 2360 selbst gilt für vitale Pulpa.' },
  { id: 'praeendo', titel: 'Präendodontischer adhäsiver Aufbau', ebene: 'ANALOG', nr: '2100', menge: 'zahn', stufe: 2, auto: false,
    therapien: ENDO, neben: true, quelle: 'BZÄK-Analogkatalog, analog § 6 Abs. 1 GOZ (Bezug Vorschlag 2100).' },
  { id: 'besondere', titel: 'Besondere Maßnahmen (Separieren, Blutstillung)', ebene: 'GOZ', nr: '2030', menge: 'region', stufe: 2, auto: true,
    therapien: [...FUELLUNG, 'veneer'], neben: false, quelle: 'GOZ 2030 je Kieferhälfte oder Frontzahnbereich.' },
  { id: 'oberflaeche', titel: 'Oberflächenanästhesie', ebene: 'GOZ', nr: '0080', menge: 'region', stufe: 2, auto: false,
    therapien: [...FUELLUNG, 'endo', 'vital', 'aufbau', 'veneer'], neben: false, quelle: 'GOZ 0080 je Kieferhälfte oder Frontzahnbereich.' },
  { id: 'polieren', titel: 'Finieren/Polieren in separater Sitzung', ebene: 'GOZ', nr: '2130', menge: 'zahn', stufe: 2, auto: false,
    therapien: ['komposit', 'veneer', 'goldhaemmer', 'inlay'], neben: false, quelle: 'GOZ 2130 je Restauration, nur in separater Sitzung.' },
  { id: 'desensibilisierung', titel: 'Behandlung überempfindlicher Zahnflächen', ebene: 'GOZ', nr: '2010', menge: 'kiefer', stufe: 2, auto: false,
    therapien: ['komposit', 'inlay', 'veneer', 'versiegelung', 'bleaching'], neben: true, quelle: 'GOZ 2010 je Kiefer.' },
  { id: 'fluorid', titel: 'Lokale Fluoridierung', ebene: 'GOZ', nr: '1020', menge: 'tag', stufe: 2, auto: false,
    therapien: ['versiegelung', 'infiltration', 'bleaching'], neben: true, quelle: 'GOZ 1020 je Sitzung.' },

  // ---------- Stufe 3: Analog und Exoten ----------
  { id: 'laser', titel: 'Laser bei der Aufbereitung (Zuschlag)', ebene: 'ZUSCHLAG', nr: '0120', menge: 'tag', stufe: 3, auto: false,
    therapien: ENDO, neben: false, ersatzNeben: 'laserAnalog',
    quelle: 'GOZ 0120 einmal je Behandlungstag: 100 % des einfachen Satzes der Leistung (2410), höchstens 68 €.' },
  { id: 'laserAnalog', titel: 'Laser-Dekontamination des Wurzelkanals', ebene: 'ANALOG', nr: '2420', menge: 'kanal', stufe: 3, auto: false,
    therapien: ENDO, neben: true, quelle: 'BZÄK-Analogkatalog, analog § 6 Abs. 1 GOZ je Kanal (Bezug Vorschlag 2420).' },
  { id: 'pdt', titel: 'Photodynamische Desinfektion (PDT)', ebene: 'ANALOG', nr: '2430', menge: 'zahn', stufe: 3, auto: false,
    therapien: [...ENDO, 'komposit'], neben: true, quelle: 'Analog § 6 Abs. 1 GOZ (Bezug Vorschlag 2430).' },
  { id: 'ozon', titel: 'Ozonbehandlung', ebene: 'ANALOG', nr: '2010', menge: 'zahn', stufe: 3, auto: false,
    therapien: [...ENDO, 'komposit', 'infiltration', 'versiegelung'], neben: true, quelle: 'BZÄK-Analogkatalog, analog § 6 Abs. 1 GOZ (Bezug Vorschlag 2010).' },
  { id: 'adhaesivWf', titel: 'Adhäsive Wurzelkanalfüllung', ebene: 'GOZ', nr: '2197', menge: 'kanal', stufe: 3, auto: false,
    therapien: ENDO, neben: true, quelle: 'GOZ 2197 je Kanal neben 2440 (adhäsive Befestigung).' },
  { id: 'farbindikator', titel: 'Kanaleingänge mit Farbindikator darstellen', ebene: 'ANALOG', nr: '2400', menge: 'zahn', stufe: 3, auto: false,
    therapien: ENDO, neben: true, quelle: 'BZÄK-Analogkatalog, analog § 6 Abs. 1 GOZ (Bezug Vorschlag 2400).' },
  { id: 'fragment', titel: 'Entfernung eines frakturierten Instruments', ebene: 'ANALOG', nr: '2300', menge: 'zahn', stufe: 3, auto: false,
    therapien: ENDO, neben: true, quelle: 'Analog § 6 Abs. 1 GOZ je Fragment (Bezug 2300).' },
  { id: 'perforation', titel: 'Perforationsverschluss', ebene: 'ANALOG', nr: '2060', menge: 'zahn', stufe: 3, auto: false,
    therapien: ENDO, neben: true, quelle: 'Analog § 6 Abs. 1 GOZ (Bezug Vorschlag 2060), z. B. mit MTA.' },
  { id: 'mtaApikal', titel: 'Apikaler MTA-Verschluss', ebene: 'ANALOG', nr: '2060', menge: 'zahn', stufe: 3, auto: false,
    therapien: ENDO, neben: true, quelle: 'Analog § 6 Abs. 1 GOZ (Bezug Vorschlag 2060), z. B. bei offenem Apex.' },
  { id: 'parapulpaer', titel: 'Parapulpärer Stift', ebene: 'ANALOG', nr: '2197', menge: 'zahn', stufe: 3, auto: false,
    therapien: ['komposit', 'aufbau'], neben: true, quelle: 'BZÄK-Analogkatalog, analog § 6 Abs. 1 GOZ (Bezug Vorschlag 2197).' },
  { id: 'mehrschicht', titel: 'Mehrschichtiger Kompositaufbau statt 2180', ebene: 'ANALOG', nr: '2120', menge: 'zahn', stufe: 3, auto: false,
    therapien: ['aufbau'], neben: true, quelle: 'BZÄK-Analogkatalog: ersetzt den plastischen Aufbau 2180 (Bezug 2120).' },
  { id: 'fragmentKleben', titel: 'Wiederbefestigung eines Zahnfragments', ebene: 'ANALOG', nr: '2100', menge: 'zahn', stufe: 3, auto: false,
    therapien: ['komposit', 'veneer'], neben: true, quelle: 'BZÄK-Analogkatalog, analog § 6 Abs. 1 GOZ (Bezug Vorschlag 2100).' },
  { id: 'diastema', titel: 'Diastemaschluss mit Komposit', ebene: 'ANALOG', nr: '2080', menge: 'zahn', stufe: 3, auto: false,
    therapien: ['veneer', 'komposit'], neben: true, quelle: 'BZÄK-Analogkatalog, analog § 6 Abs. 1 GOZ je Zahn (Bezug Vorschlag 2080).' },
  { id: 'erosion', titel: 'Versiegelung erosiver Zahnflächen', ebene: 'ANALOG', nr: '2000', menge: 'zahn', stufe: 3, auto: false,
    therapien: ['versiegelung', 'infiltration'], neben: true, quelle: 'BZÄK-Analogkatalog, analog § 6 Abs. 1 GOZ (Bezug 2000).' },
  { id: 'bewe', titel: 'BEWE-Erosionsscreening', ebene: 'ANALOG', nr: '4005', menge: 'plan', stufe: 3, auto: false,
    therapien: ['versiegelung', 'infiltration', 'komposit', 'veneer'], neben: true, quelle: 'BZÄK-Analogkatalog, analog § 6 Abs. 1 GOZ (Bezug Vorschlag 4005).' },
  { id: 'liquidDam', titel: 'Flüssiger Kofferdam (Gingivaschutz)', ebene: 'ANALOG', nr: '2040', menge: 'sitzung', stufe: 3, auto: false,
    therapien: ['bleaching'], neben: true, quelle: 'BZÄK-Analogkatalog, analog § 6 Abs. 1 GOZ (Bezug 2040).' },
]

export const ZUSATZ: Record<string, Zusatz> = Object.fromEntries(ZUSAETZE.map((z) => [z.id, z]))

export const stufeName = (s: number) => ['nur Grundleistung', 'Standard', 'erweitert', 'mit Analog und Exoten'][s] ?? 'Standard'

export const STANDARD_LABOR = [
  { id: 'keramik', name: 'Keramik-Inlay (Fremdlabor)', preis: 185 },
  { id: 'cadcam', name: 'CAD/CAM-Keramik (chairside)', preis: 120 },
  { id: 'gold', name: 'Gold-Inlay (Labor + Legierung)', preis: 330 },
]

export const STANDARD_MATERIAL = [
  { id: 'niti', name: 'NiTi-Einmalfeilen je Kanal', preis: 25 },
  { id: 'glasfaser', name: 'Glasfaserstift', preis: 18 },
]

export const KLASSE_FAKTOR = [0.85, 1, 1.2] as const
export const klasseName = (k: number) => ['günstig', 'Standard', 'hochwertig'][k] ?? 'Standard'
