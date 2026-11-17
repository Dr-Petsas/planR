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
  { id: 'wsr', kuerzel: 'S', titel: 'Wurzelspitzenresektion', kurz: 'WSR', kasse: 'bema',
    hinweis: 'GOZ 3110 (Frontzahn) bzw. 3120 (Seitenzahn) je resezierter Wurzelspitze; retrograde Aufbereitung 2410 und Füllung 2440, Defektauffüllung 4110, Membran 4138 gesondert (BZÄK-Kommentar zu 3120).' },
  { id: 'zyste', kuerzel: 'Z', titel: 'Zystektomie', kurz: 'Zystektomie', kasse: 'bema',
    hinweis: 'GOZ 3200 als selbstständige Leistung. Defektauffüllung: 4110 nur bei parodontalem Defekt bis zur Größe einer Zahnregion, sonst Eigenknochen 9090 bzw. Knochenersatzmaterial analog (BZÄK-Kommentar zu 3200). Zusammen mit einer Wurzelspitzenresektion am selben Zahn: Therapie WSR wählen und dort »Zystektomie« (GOZ 3190) anklicken. Kleine Zysten oder Granulationsgewebe bei Extraktion, Osteotomie oder WSR sind nicht gesondert berechnungsfähig.' },
]

export const THERAPIE: Record<Therapie, TherapieEintrag> = Object.fromEntries(THERAPIEN.map((t) => [t.id, t])) as Record<Therapie, TherapieEintrag>
export const THERAPIE_NACH_KUERZEL: Record<string, TherapieEintrag> = Object.fromEntries(THERAPIEN.map((t) => [t.kuerzel, t]))

/**
 * Mengenbezug einer Zusatzleistung:
 * zahn · kanal · sitzung (Sitzungen am Zahn) · zwischen (Sitzungen − 1)
 * region (je Kieferhälfte/Front) · regionSitzung (Kofferdam: je Kieferhälfte und Sitzung)
 * kiefer · tag (je Behandlungstag) · plan (einmal) · kanalSitzung (je Kanal und Sitzung)
 */
export type Menge = 'zahn' | 'kanal' | 'kanalSitzung' | 'sitzung' | 'zwischen' | 'region' | 'regionSitzung' | 'kiefer' | 'tag' | 'plan'

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
  /** ab dieser Regler-Stufe gilt ein weiterer Mengenbezug bzw. eine höhere Anzahl */
  mehr?: { stufe: number; menge?: Menge; anzahl?: number }
  quelle: string
}

const FUELLUNG: Therapie[] = ['komposit', 'inlay', 'goldhaemmer']
const ENDO: Therapie[] = ['endo', 'revision']
const OP: Therapie[] = ['wsr', 'zyste']
const ALLE: Therapie[] = ['komposit', 'inlay', 'goldhaemmer', 'endo', 'revision', 'vital', 'versiegelung', 'aufbau', 'infiltration', 'veneer', 'bleaching', 'wsr', 'zyste']

export const ZUSAETZE: Zusatz[] = [
  // ---------- Stufe 1: Standard ----------
  { id: 'kofferdam', titel: 'Kofferdam', ebene: 'GOZ', nr: '2040', menge: 'regionSitzung', stufe: 1, auto: true,
    therapien: [...FUELLUNG, ...ENDO, 'vital', 'aufbau', 'veneer', 'infiltration'], neben: true,
    quelle: 'GOZ 2040 je Kieferhälfte oder Frontzahnbereich und Sitzung; neben Kassen-Endo privat vereinbar (BEMA kennt keinen Kofferdam).' },
  { id: 'anaesthesie', titel: 'Infiltrationsanästhesie', ebene: 'GOZ', nr: '0090', menge: 'sitzung', stufe: 1, auto: true,
    therapien: [...FUELLUNG, 'endo', 'vital', 'aufbau', 'veneer', ...OP], neben: false,
    quelle: 'GOZ 0090 je Zahn einmal; mehrfach je Zahn nur mit Begründung in der Rechnung (Abrechnungsbestimmung). Anästhetikum gesondert berechnungsfähig. Bei Kassen-Endo ist die Anästhesie BEMA-Leistung.' },
  { id: 'vitalitaet', titel: 'Vitalitätsprüfung', ebene: 'GOZ', nr: '0070', menge: 'tag', stufe: 1, auto: true,
    therapien: [...ENDO, 'vital'], neben: false, quelle: 'GOZ 0070 je Sitzung, auch mehrere Zähne.' },
  { id: 'roentgen', titel: 'Röntgen (Ausgang, Messaufnahme, Kontrolle)', ebene: 'GOAE', nr: '5000', menge: 'zahn', anzahl: 3, stufe: 1, auto: true,
    mehr: { stufe: 3, anzahl: 5 },
    therapien: ENDO, neben: false, quelle: 'GOÄ 5000 je Projektion, Faktor 1,8 (technische Leistung). Ab Stufe 3 fünf Aufnahmen (zusätzlich Masterpoint und exzentrische Aufnahme).' },
  { id: 'roentgenDiag', titel: 'Röntgen zur Diagnostik (Zahnfilm oder Bissflügel)', ebene: 'GOAE', nr: '5000', menge: 'region', stufe: 1, auto: true,
    therapien: [...FUELLUNG, 'vital', 'aufbau', 'veneer', 'infiltration'], neben: false,
    quelle: 'GOÄ 5000 je Projektion, Faktor 1,8; eine Aufnahme je Kieferhälfte oder Frontzahnbereich mit geplanter Behandlung. Rechtfertigende Indikation nach § 83 StrlSchG.' },
  { id: 'roentgenOp', titel: 'Röntgen (vor und nach dem Eingriff)', ebene: 'GOAE', nr: '5000', menge: 'zahn', anzahl: 2, stufe: 1, auto: true,
    therapien: OP, neben: false, quelle: 'GOÄ 5000 je Projektion, Faktor 1,8; neben 3110/3120 und 3200 berechnungsfähig (BZÄK-Kommentar).' },
  { id: 'retroAufbereitung', titel: 'Retrograde Aufbereitung', ebene: 'GOZ', nr: '2410', menge: 'kanal', stufe: 1, auto: true,
    therapien: ['wsr'], neben: false, quelle: 'GOZ 2410 (auch retrograd) je Kanal; neben 3110/3120 gesondert berechnungsfähig (BZÄK-Kommentar zu 3120).' },
  { id: 'retroFuellung', titel: 'Retrograde Wurzelfüllung', ebene: 'GOZ', nr: '2440', menge: 'kanal', stufe: 1, auto: true,
    therapien: ['wsr'], neben: false, quelle: 'GOZ 2440 je Kanal; die retrograde Füllung ist nicht Inhalt der 3110/3120 (BZÄK-Kommentar).' },
  { id: 'laenge', titel: 'Elektrometrische Längenbestimmung', ebene: 'GOZ', nr: '2400', menge: 'kanal', stufe: 1, auto: true,
    mehr: { stufe: 2, menge: 'kanalSitzung' },
    therapien: ENDO, neben: true, quelle: 'GOZ 2400 je Kanal, höchstens zweimal je Sitzung, in Folgesitzungen erneut (Abrechnungsbestimmung und BZÄK-Kommentar). Ab Stufe 2 je Kanal und Sitzung.' },
  { id: 'einlage', titel: 'Medikamentöse Einlage', ebene: 'GOZ', nr: '2430', menge: 'zwischen', stufe: 1, auto: true,
    therapien: ENDO, neben: false, quelle: 'GOZ 2430 je Zahn und Sitzung, in Verbindung mit 2360/2410.' },
  { id: 'verschluss', titel: 'Temporärer speicheldichter Verschluss', ebene: 'GOZ', nr: '2020', menge: 'zwischen', stufe: 1, auto: true,
    therapien: [...ENDO, 'inlay', 'bleaching'], neben: false, quelle: 'GOZ 2020 je Verschluss zwischen den Sitzungen.' },
  { id: 'wfEntfernung', titel: 'Entfernung der alten Wurzelfüllung', ebene: 'ANALOG', nr: '2300', menge: 'kanal', stufe: 1, auto: true,
    therapien: ['revision'], neben: true,
    quelle: 'Analog § 6 Abs. 1 GOZ, einmal je Kanal und Revisionsfall. Beratungsforum für Gebührenordnungsfragen Nr. 62: PKV-Verband und Beihilfe halten 2300a für angemessen; die BZÄK empfiehlt keine bestimmte Analoggebühr.' },

  // ---------- Stufe 2: erweitert ----------
  { id: 'niti', titel: 'NiTi-Einmalfeilen', ebene: 'MAT', nr: 'niti', menge: 'kanal', stufe: 2, auto: true,
    therapien: ENDO, neben: true, quelle: 'Nur einmal verwendbare Nickel-Titan-Instrumente sind gesondert berechnungsfähig (Allgemeine Bestimmungen GOZ Abschnitt C). Preis in den Einstellungen.' },
  { id: 'elektrophysik', titel: 'Elektrophysikalisch-chemische Methode', ebene: 'GOZ', nr: '2420', menge: 'kanalSitzung', stufe: 2, auto: true,
    therapien: ENDO, neben: true, quelle: 'GOZ 2420 je Kanal und Sitzung, unabhängig von der Zahl der Anwendungen (BZÄK-Kommentar zu 2420).' },
  { id: 'trepanation', titel: 'Trepanation', ebene: 'GOZ', nr: '2390', menge: 'zahn', stufe: 2, auto: true,
    therapien: ENDO, neben: false,
    quelle: 'GOZ 2390 je Zahn; weitere endodontische Leistungen sind im Anschluss daran berechnungsfähig (BZÄK-Kommentar zu 2390). Nicht berechnungsfähig, wenn das Pulpenkavum schon eröffnet ist – dann abwählen.' },
  { id: 'deckfuellung', titel: 'Adhäsiver Verschluss der Zugangskavität', ebene: 'GOZ', nr: '2060', menge: 'zahn', stufe: 2, auto: true,
    therapien: ENDO, neben: false, quelle: 'GOZ 2060: definitive einflächige Kompositrestauration nach der Wurzelfüllung, eigenständige Leistung.' },
  { id: 'kontrolleOp', titel: 'Kontrolle nach dem Eingriff', ebene: 'GOZ', nr: '3290', menge: 'region', stufe: 2, auto: true,
    therapien: OP, neben: false, quelle: 'GOZ 3290 als selbstständige Leistung in einer Folgesitzung, je Kieferhälfte oder Frontzahnbereich.' },
  { id: 'defekt', titel: 'Auffüllen des Knochendefekts', ebene: 'GOZ', nr: '4110', menge: 'zahn', stufe: 2, auto: true,
    therapien: OP, neben: true,
    quelle: 'GOZ 4110 je Zahn, auch neben Wurzelspitzenresektion und Zystektomie, solange der Defekt als parodontaler Defekt die Größe einer Zahnregion nicht übersteigt (BZÄK-Kommentar zu 4110 und 3190). Größerer Defekt, Zystektomie mit Extraktion oder nicht-odontogene Zyste: 4110 nicht berechnungsfähig – Eigenknochen 9090, Knochenersatzmaterial analog § 6 Abs. 1. Bei der selbstständigen Zystektomie 3200 deshalb nur von Hand.' },
  { id: 'kem', titel: 'Knochenersatzmaterial', ebene: 'MAT', nr: 'kem', menge: 'zahn', stufe: 2, auto: true,
    therapien: OP, neben: true, quelle: 'Knochenersatzmaterial ist gesondert berechnungsfähig (Allgemeine Bestimmungen GOZ Abschnitt D). Preis in den Einstellungen.' },
  { id: 'mikroskop', titel: 'OP-Mikroskop (Zuschlag)', ebene: 'ZUSCHLAG', nr: '0110', menge: 'tag', stufe: 2, auto: true,
    therapien: [...ENDO, 'vital', 'aufbau', ...OP], neben: false, ersatzNeben: 'mikroskopAnalog',
    quelle: 'GOZ 0110 einmal je Behandlungstag, einfacher Satz, u. a. neben 2195, 2330, 2340, 2360, 2410, 2440, 3110, 3120, 3190, 3200.' },
  { id: 'mikroskopAnalog', titel: 'Mikroskopische Untersuchung in eigener Sitzung', ebene: 'ANALOG', nr: '2290', menge: 'zahn', stufe: 2, auto: false,
    therapien: ENDO, neben: true, nurNeben: true,
    quelle: 'Beratungsforum für Gebührenordnungsfragen Nr. 50: analog § 6 Abs. 1 GOZ nur als alleinige endodontische Leistung der Sitzung oder neben der Trepanation 2390 – nicht in einer Sitzung mit Aufbereitung oder Wurzelfüllung. PKV-Verband und Beihilfe halten 2290a bis zum 2,3fachen Satz für angemessen; die BZÄK empfiehlt keine bestimmte Analoggebühr. Der Zuschlag 0110 ist nicht analog berechnungsfähig (Beratungsforum Nr. 1).' },
  { id: 'nekrose', titel: 'Entfernung nekrotischen Pulpengewebes', ebene: 'ANALOG', nr: '2180', menge: 'kanal', stufe: 2, auto: true,
    therapien: ['endo'], neben: false, quelle: 'Analog § 6 Abs. 1 GOZ je Wurzelkanal, nur am avitalen Zahn. BZÄK-Verzeichnis analoger Leistungen Nr. 3 (zm 17/2026): 2180a. Beratungsforum für Gebührenordnungsfragen Nr. 9 bestätigt die Analogberechnung; der PKV-Verband hält dort nur 2360a für angemessen – Erstattung kann darunter liegen.' },
  { id: 'praeendo', titel: 'Präendodontischer Stumpfaufbau in Adhäsivtechnik', ebene: 'ANALOG', nr: '2100', menge: 'zahn', stufe: 3, auto: true,
    therapien: ENDO, neben: true, quelle: 'BZÄK-Verzeichnis analoger Leistungen Nr. 2 (zm 12/2026): 2100a. Präendodontische Kavitätenversorgungen entsprechen nicht der 2020 (BZÄK-Kommentar zu 2020).' },
  { id: 'besondere', titel: 'Besondere Maßnahmen (Separieren, Blutstillung)', ebene: 'GOZ', nr: '2030', menge: 'region', stufe: 2, auto: true,
    therapien: [...FUELLUNG, 'veneer'], neben: false, quelle: 'GOZ 2030 je Kieferhälfte oder Frontzahnbereich, je Sitzung höchstens einmal beim Präparieren und einmal beim Füllen (Abrechnungsbestimmung).' },
  { id: 'oberflaeche', titel: 'Oberflächenanästhesie', ebene: 'GOZ', nr: '0080', menge: 'region', stufe: 3, auto: true,
    therapien: [...FUELLUNG, 'endo', 'vital', 'aufbau', 'veneer', ...OP], neben: false, quelle: 'GOZ 0080 je Kieferhälfte oder Frontzahnbereich.' },
  { id: 'polieren', titel: 'Finieren/Polieren in separater Sitzung', ebene: 'GOZ', nr: '2130', menge: 'zahn', stufe: 2, auto: false,
    therapien: ['komposit', 'veneer', 'goldhaemmer', 'inlay'], neben: false, quelle: 'GOZ 2130 je Restauration, nur in separater Sitzung.' },
  { id: 'desensibilisierung', titel: 'Behandlung überempfindlicher Zahnflächen', ebene: 'GOZ', nr: '2010', menge: 'kiefer', stufe: 2, auto: false,
    therapien: ['komposit', 'inlay', 'veneer', 'versiegelung', 'bleaching'], neben: true, quelle: 'GOZ 2010 je Kiefer.' },
  { id: 'fluorid', titel: 'Lokale Fluoridierung', ebene: 'GOZ', nr: '1020', menge: 'tag', stufe: 2, auto: false,
    therapien: ['versiegelung', 'infiltration', 'bleaching'], neben: true, quelle: 'GOZ 1020 je Sitzung.' },

  // ---------- Stufe 3: Analog und Exoten ----------
  { id: 'kostenplan', titel: 'Schriftlicher Heil- und Kostenplan', ebene: 'GOZ', nr: '0030', menge: 'plan', stufe: 3, auto: true,
    therapien: ALLE, neben: false, quelle: 'GOZ 0030: Aufstellung eines schriftlichen Heil- und Kostenplans nach Befundaufnahme, einmal je Plan.' },
  { id: 'dvt', titel: 'DVT (digitale Volumentomografie)', ebene: 'GOAE', nr: '5370', menge: 'plan', stufe: 3, auto: true,
    therapien: [...ENDO, ...OP], neben: true,
    quelle: 'GOÄ 5370 (2000 Punkte), Faktor 1,8; DVT-Fachkunde nötig, rechtfertigende Indikation (BZÄK-Stellungnahme Digitale Volumentomografie).' },
  { id: 'dvtAnalyse', titel: 'DVT: computergesteuerte Analyse mit 3D-Rekonstruktion', ebene: 'GOAE', nr: '5377', menge: 'plan', stufe: 3, auto: true,
    therapien: [...ENDO, ...OP], neben: true,
    quelle: 'GOÄ 5377 (800 Punkte), nur einfacher Satz; nur für den Behandler, der das DVT selbst erstellt (BZÄK, BGH III ZR 241/21).' },
  { id: 'cp', titel: 'Indirekte Überkappung bei pulpanaher Karies', ebene: 'GOZ', nr: '2330', menge: 'zahn', stufe: 3, auto: true,
    therapien: [...FUELLUNG, 'aufbau'], neben: false, quelle: 'GOZ 2330 je Kavität neben der Füllung, wenn die Pulpa gefährdet ist (Caries profunda). Ohne diese Indikation abwählen.' },
  { id: 'kariesdetektor', titel: 'Kariesdetektor', ebene: 'ANALOG', nr: '2030', menge: 'zahn', stufe: 3, auto: true,
    therapien: [...FUELLUNG, 'vital', 'aufbau'], neben: true,
    quelle: 'Analog § 6 Abs. 1 GOZ (BZÄK-Katalog analoger Leistungen: Kariesdetektor). Bezug 2030 ist ein Vorschlag der Praxis – die BZÄK nennt keine Bezugsziffer.' },
  { id: 'wundverschluss', titel: 'Plastischer Wundverschluss', ebene: 'GOZ', nr: '3100', menge: 'zahn', stufe: 3, auto: false,
    therapien: OP, neben: false, quelle: 'GOZ 3100 nur, wenn eine einfache Readaptation der Wundränder nicht möglich oder nicht indiziert ist (plastische Deckung mit Lappenbildung). Der primäre Wundverschluss ist Bestandteil der 3110/3120/3200 (Allgemeine Bestimmungen GOZ Abschnitt D). Deshalb nur von Hand.' },
  { id: 'membran', titel: 'Membran über dem Knochendefekt', ebene: 'GOZ', nr: '4138', menge: 'zahn', stufe: 3, auto: true,
    therapien: OP, neben: true, quelle: 'GOZ 4138 je Zahn einschließlich Fixierung, neben 4110 berechnungsfähig; kann auch nach einer Zystenoperation indiziert sein (BZÄK-Kommentar zu 4138 und 4110).' },
  { id: 'membranMat', titel: 'Membran (Material)', ebene: 'MAT', nr: 'membran', menge: 'zahn', stufe: 3, auto: true,
    therapien: OP, neben: true, quelle: 'Membranen sind gesondert berechnungsfähig (Allgemeine Bestimmungen GOZ Abschnitt D). Preis in den Einstellungen.' },
  { id: 'zyste', titel: 'Zystektomie in Verbindung mit der WSR', ebene: 'GOZ', nr: '3190', menge: 'zahn', stufe: 3, auto: false,
    therapien: ['wsr'], neben: false, quelle: 'GOZ 3190 je Zyste in Verbindung mit der Wurzelspitzenresektion. Kleine Zysten und Granulationsgewebe sind nicht gesondert berechnungsfähig (Abrechnungsbestimmung).' },
  { id: 'eigenknochen', titel: 'Eigenknochen einbringen (Defekt größer als eine Zahnregion)', ebene: 'GOZ', nr: '9090', menge: 'zahn', stufe: 3, auto: false,
    therapien: OP, neben: true, quelle: 'GOZ 9090 für autologen Knochen aus dem Operationsgebiet, wenn der Defekt die Größe einer Zahnregion übersteigt oder kein parodontaler Defekt vorliegt (Zystektomie mit Extraktion, nicht-odontogene Zyste). Dann ist 4110 nicht berechnungsfähig und entfällt hier. Kleine Knochenentnahme im Operationsgebiet bei 4110 ist dort enthalten; Entnahme aus getrenntem Gebiet: 9140 (BZÄK-Kommentar zu 3190, 3200, 4110, 9090).' },
  { id: 'laser', titel: 'Laser bei der Aufbereitung (Zuschlag)', ebene: 'ZUSCHLAG', nr: '0120', menge: 'tag', stufe: 3, auto: true,
    therapien: ENDO, neben: false, ersatzNeben: 'laserAnalog',
    quelle: 'GOZ 0120 einmal je Behandlungstag: 100 % des einfachen Satzes der Leistung (2410), höchstens 68 €.' },
  { id: 'laserAnalog', titel: 'Laser-Dekontamination des Wurzelkanals', ebene: 'ANALOG', nr: '2420', menge: 'kanal', stufe: 3, auto: false,
    therapien: ENDO, neben: true, quelle: 'Analog § 6 Abs. 1 GOZ: Kanalsterilisation mit dem Laser in separater Sitzung nach Abschluss der mechanischen Aufbereitung (BZÄK-Kommentar zu 2410). Bezug 2420 ist ein Vorschlag der Praxis.' },
  { id: 'pdt', titel: 'Photodynamische Desinfektion (PDT)', ebene: 'ANALOG', nr: '2430', menge: 'zahn', stufe: 3, auto: true,
    therapien: [...ENDO, 'komposit'], neben: true, quelle: 'Analog § 6 Abs. 1 GOZ (Bezug Vorschlag 2430).' },
  { id: 'ozon', titel: 'Ozonbehandlung', ebene: 'ANALOG', nr: '2010', menge: 'zahn', stufe: 3, auto: false,
    therapien: [...ENDO, 'komposit', 'infiltration', 'versiegelung'], neben: true, quelle: 'BZÄK-Analogkatalog, analog § 6 Abs. 1 GOZ (Bezug Vorschlag 2010).' },
  { id: 'adhaesivWf', titel: 'Adhäsive Wurzelkanalfüllung', ebene: 'GOZ', nr: '2197', menge: 'kanal', stufe: 3, auto: true,
    therapien: ENDO, neben: true, quelle: 'GOZ 2197 neben 2440 bei adhäsiver Befestigung der Wurzelfüllung (Beratungsforum für Gebührenordnungsfragen Nr. 4).' },
  { id: 'farbindikator', titel: 'Kanaleingänge mit Farbindikator darstellen', ebene: 'ANALOG', nr: '2400', menge: 'zahn', stufe: 3, auto: true,
    therapien: ENDO, neben: true, quelle: 'BZÄK-Analogkatalog, analog § 6 Abs. 1 GOZ (Bezug Vorschlag 2400).' },
  { id: 'fragment', titel: 'Entfernung eines frakturierten Instruments', ebene: 'ANALOG', nr: '2300', menge: 'zahn', stufe: 3, auto: false,
    therapien: ENDO, neben: true, quelle: 'Analog § 6 Abs. 1 GOZ. Beratungsforum für Gebührenordnungsfragen Nr. 8: selbstständige Leistung; PKV-Verband hält 2300a für angemessen, die BZÄK empfiehlt keine bestimmte Analoggebühr.' },
  { id: 'perforation', titel: 'Perforationsverschluss', ebene: 'ANALOG', nr: '2060', menge: 'zahn', stufe: 3, auto: false,
    therapien: ENDO, neben: true, quelle: 'Analog § 6 Abs. 1 GOZ. Beratungsforum für Gebührenordnungsfragen Nr. 7: Verschluss einer Perforation innerhalb des Parodontiums ist selbstständige Leistung; PKV-Verband hält 2060a für angemessen.' },
  { id: 'mtaApikal', titel: 'Apikaler MTA-Verschluss', ebene: 'ANALOG', nr: '2060', menge: 'zahn', stufe: 3, auto: false,
    therapien: ENDO, neben: true, quelle: 'Analog § 6 Abs. 1 GOZ. Beratungsforum für Gebührenordnungsfragen Nr. 6: nur bei atypisch weitem Foramen, wenn ohne apikalen Verschluss keine ordnungsgemäße Wurzelfüllung möglich ist; Wurzelfüllung in getrennter Sitzung. PKV-Verband hält 2060a für angemessen.' },
  { id: 'parapulpaer', titel: 'Parapulpärer Stift', ebene: 'ANALOG', nr: '2197', menge: 'zahn', stufe: 3, auto: false,
    therapien: ['komposit', 'aufbau'], neben: true, quelle: 'BZÄK-Analogkatalog, analog § 6 Abs. 1 GOZ (Bezug Vorschlag 2197).' },
  { id: 'mehrschicht', titel: 'Mehrschichtiger Kompositaufbau statt 2180', ebene: 'ANALOG', nr: '2120', menge: 'zahn', stufe: 3, auto: false,
    therapien: ['aufbau'], neben: true, quelle: 'BZÄK-Verzeichnis analoger Leistungen Nr. 1 (zm 10/2026): 2120a, ersetzt den plastischen Aufbau 2180. Die Adhäsivtechnik ist Teil der Analogleistung – 2197 für den Aufbau entfällt.' },
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
  { id: 'kem', name: 'Knochenersatzmaterial (0,5 g)', preis: 85 },
  { id: 'membran', name: 'Kollagenmembran', preis: 95 },
]

export const KLASSE_FAKTOR = [0.85, 1, 1.2] as const
export const klasseName = (k: number) => ['günstig', 'Standard', 'hochwertig'][k] ?? 'Standard'
