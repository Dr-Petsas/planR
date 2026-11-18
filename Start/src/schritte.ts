/**
 * Behandlungsschritte aus den Leistungen eines Plans: was am Stuhl der Reihe nach zu tun ist.
 * Quelle ist die Fassung, die der Planer beim Speichern rechnet (dieselben Positionen wie im Kostenvoranschlag).
 * Ändert sich der Plan, ändern sich die Schritte mit.
 */
import { GOZ_SCHRITTE } from './gozSchritte'

export type Abschnitt = 'vor' | 'haupt' | 'kontrolle'

export interface SchrittPosition {
  ebene?: string
  nr?: string
  zahn?: string
  anzahl?: number
  bezeichnung?: string
  /** Behandlungssitzung, wenn der Planer sie kennt (Implantologie) */
  sitzung?: number
}

export interface Schritt {
  text: string
  /** Zahn oder Gebiet, leer wenn der Schritt für den ganzen Mund gilt */
  zahn: string
  /** Leistung dahinter, z. B. „GOZ 9010“ */
  leistung: string
  /** Sitzung (Implantologie) oder Stufe im Hauptteil, unter der der Schritt steht */
  phase?: string
}

export interface Schritte { vor: Schritt[]; haupt: Schritt[]; kontrolle: Schritt[] }

export const ABSCHNITT_NAME: Record<Abschnitt, string> = {
  vor: 'Vorbereitende Maßnahmen', haupt: 'Hauptmaßnahmen', kontrolle: 'Kontrolle',
}

/** Sitzungen der Implantologie, wie der Planer sie zählt. */
const PHASEN_IMPL = ['', 'Planung', 'Knochenaufbau', 'Implantation', 'Freilegung', 'Nachsorge']

interface Regel {
  a: Abschnitt
  /** Reihenfolge innerhalb einer Sitzung */
  rang: number
  text: string
  /** Ein Schritt je Zahn („Injektion 13“, „Injektion 15“) */
  jeZahn?: boolean
  /** Röntgen: vor dem Eingriff Diagnostik, danach Kontrolle */
  bild?: boolean
  /** Wortlaut, wenn die Leistung erst in der Sitzung des Eingriffs anfällt */
  spaeter?: string
}

const r = (a: Abschnitt, rang: number, text: string, mehr: Partial<Regel> = {}): Regel => ({ a, rang, text, ...mehr })

/** Nummer → Schritt in der Sprache der Behandlung. Schlüssel: Ebene und Nummer. */
const REGELN: Record<string, Regel> = {
  // Gespräch, Untersuchung, Planung
  'GOAE:1': r('vor', 10, 'Beratung'),
  'GOAE:3': r('vor', 11, 'Eingehende Beratung'),
  'GOAE:5': r('vor', 12, 'Untersuchung'),
  'GOAE:6': r('vor', 12, 'Untersuchung des Kauorgans'),
  'GOAE:34': r('vor', 14, 'Aufklärungsgespräch (mindestens 20 Minuten)'),
  'GOZ:0010': r('vor', 12, 'Eingehende Untersuchung, Befund aufnehmen'),
  'GOZ:0070': r('vor', 16, 'Vitalität prüfen'),
  'GOZ:0030': r('vor', 20, 'Heil- und Kostenplan aufstellen'),
  'GOZ:0040': r('vor', 20, 'Heil- und Kostenplan aufstellen'),
  // Bildgebung
  'GOAE:5000': r('vor', 30, 'Röntgen Einzelzahnaufnahme', { bild: true }),
  'GOAE:5002': r('vor', 30, 'Röntgen Einzelzahnaufnahmen', { bild: true }),
  'GOAE:5004': r('vor', 31, 'Röntgen OPG', { bild: true }),
  'GOAE:5370': r('vor', 32, 'Röntgen DVT', { bild: true }),
  'GOAE:5377': r('vor', 33, 'DVT auswerten', { bild: true }),
  // Modelle, Schablonen
  'GOZ:0050': r('vor', 40, 'Abformung für das Planungsmodell'),
  'GOZ:0060': r('vor', 40, 'Abformung beider Kiefer für Planungsmodelle'),
  'GOZ:0065': r('vor', 40, 'Intraoralscan'),
  'GOZ:5170': r('vor', 41, 'Abformung mit individuellem Löffel'),
  'GOZ:9000': r('vor', 45, 'Implantatposition analysieren und vermessen'),
  'GOZ:9003': r('vor', 46, 'Orientierungsschablone erstellen und anpassen', { spaeter: 'Orientierungsschablone einsetzen' }),
  // Vorbehandlung
  'GOZ:1000': r('vor', 50, 'Mundhygienestatus und Unterweisung'),
  'GOZ:1010': r('vor', 51, 'Mundhygiene kontrollieren'),
  'GOZ:1040': r('vor', 52, 'Professionelle Zahnreinigung'),
  'GOZ:4050': r('vor', 53, 'Zahnstein und Beläge entfernen'),
  'GOZ:4055': r('vor', 53, 'Zahnstein und Beläge entfernen'),
  // Betäubung
  'GOZ:0080': r('haupt', 100, 'Oberflächenanästhesie'),
  'GOZ:0090': r('haupt', 101, 'Injektion', { jeZahn: true }),
  'GOZ:0100': r('haupt', 102, 'Leitungsanästhesie'),
  'GOZ:9005': r('haupt', 105, 'Bohrschablone einsetzen'),
  'GOZ:2040': r('haupt', 110, 'Kofferdam anlegen'),
  'GOZ:2030': r('haupt', 112, 'Arbeitsfeld vorbereiten (separieren, Blutung stillen)'),
  'GOZ:2290': r('haupt', 120, 'Alte Krone oder Füllung entfernen', { jeZahn: true }),
  'GOZ:2300': r('haupt', 121, 'Wurzelstift entfernen', { jeZahn: true }),
  // Wurzelbehandlung
  'GOZ:2390': r('haupt', 130, 'Zahn eröffnen (Trepanation)', { jeZahn: true }),
  'GOZ:2360': r('haupt', 131, 'Nerv entfernen (Vitalexstirpation)', { jeZahn: true }),
  'GOZ:2410': r('haupt', 132, 'Wurzelkanäle aufbereiten', { jeZahn: true }),
  'GOZ:2400': r('haupt', 133, 'Kanallänge elektrisch messen', { jeZahn: true }),
  'GOZ:2420': r('haupt', 134, 'Wurzelkanäle spülen und desinfizieren', { jeZahn: true }),
  'GOZ:2430': r('haupt', 135, 'Medikamentöse Einlage', { jeZahn: true }),
  'GOZ:2440': r('haupt', 136, 'Wurzelkanäle füllen', { jeZahn: true }),
  // Chirurgie
  'GOZ:3070': r('haupt', 140, 'Inzision', { jeZahn: true }),
  'GOZ:3000': r('haupt', 150, 'Zahn ziehen', { jeZahn: true }),
  'GOZ:3010': r('haupt', 150, 'Zahn ziehen (mehrwurzelig)', { jeZahn: true }),
  'GOZ:3020': r('haupt', 150, 'Tief zerstörten Zahn entfernen', { jeZahn: true }),
  'GOZ:3030': r('haupt', 151, 'Zahn operativ entfernen (Osteotomie)', { jeZahn: true }),
  'GOZ:3040': r('haupt', 151, 'Verlagerten Zahn operativ entfernen', { jeZahn: true }),
  'GOZ:3045': r('haupt', 151, 'Tief verlagerten Zahn operativ entfernen', { jeZahn: true }),
  'GOZ:3110': r('haupt', 152, 'Wurzelspitze kappen (Frontzahn)', { jeZahn: true }),
  'GOZ:3120': r('haupt', 152, 'Wurzelspitze kappen (Seitenzahn)', { jeZahn: true }),
  'GOZ:3190': r('haupt', 153, 'Zyste entfernen'),
  'GOZ:9090': r('haupt', 155, 'Knochen gewinnen'),
  'GOZ:9140': r('haupt', 155, 'Knochen im Mund entnehmen'),
  'GOZ:9100': r('haupt', 156, 'Knochenaufbau'),
  'GOZ:9110': r('haupt', 157, 'Interner Sinuslift'),
  'GOZ:9120': r('haupt', 157, 'Externer Sinuslift'),
  'GOZ:9130': r('haupt', 157, 'Kieferkamm spalten und dehnen'),
  'GOZ:9150': r('haupt', 158, 'Augmentat fixieren'),
  'GOZ:9170': r('haupt', 159, 'Im Knochen liegendes Material entfernen'),
  'GOZ:9160': r('haupt', 159, 'Schrauben und Platten entfernen'),
  'GOZ:9010': r('haupt', 160, 'Implantat setzen', { jeZahn: true }),
  'GOZ:9020': r('haupt', 160, 'Übergangsimplantat setzen', { jeZahn: true }),
  'GOZ:9040': r('haupt', 161, 'Implantat freilegen, Gingivaformer einsetzen', { jeZahn: true }),
  'GOZ:9050': r('haupt', 170, 'Aufbauteile am Implantat wechseln', { jeZahn: true }),
  'GOZ:9060': r('haupt', 171, 'Aufbauteil am Implantat auswechseln', { jeZahn: true }),
  'GOAE:2442': r('haupt', 175, 'Biomaterial einbringen'),
  'GOAE:2381': r('haupt', 180, 'Lappenplastik'),
  'GOAE:2382': r('haupt', 180, 'Schwierige Lappenplastik'),
  'GOZ:3240': r('haupt', 181, 'Vestibulumplastik'),
  'GOZ:3100': r('haupt', 185, 'Wunde plastisch decken'),
  'GOZ:3050': r('haupt', 190, 'Blutung stillen'),
  'GOZ:3060': r('haupt', 190, 'Blutung stillen (umstechen, abbinden)'),
  // Füllung, Aufbau, Krone
  'GOZ:2180': r('haupt', 195, 'Aufbaufüllung', { jeZahn: true }),
  'GOZ:2190': r('haupt', 196, 'Gegossenen Stiftaufbau einsetzen', { jeZahn: true }),
  'GOZ:2195': r('haupt', 196, 'Stift oder Schraube setzen', { jeZahn: true }),
  'GOZ:2050': r('haupt', 200, 'Füllung legen (einflächig)', { jeZahn: true }),
  'GOZ:2060': r('haupt', 200, 'Kompositfüllung legen (einflächig)', { jeZahn: true }),
  'GOZ:2070': r('haupt', 200, 'Füllung legen (zweiflächig)', { jeZahn: true }),
  'GOZ:2080': r('haupt', 200, 'Kompositfüllung legen (zweiflächig)', { jeZahn: true }),
  'GOZ:2090': r('haupt', 200, 'Füllung legen (dreiflächig)', { jeZahn: true }),
  'GOZ:2100': r('haupt', 200, 'Kompositfüllung legen (dreiflächig)', { jeZahn: true }),
  'GOZ:2110': r('haupt', 200, 'Füllung legen (mehr als dreiflächig)', { jeZahn: true }),
  'GOZ:2120': r('haupt', 200, 'Kompositfüllung legen (mehr als dreiflächig)', { jeZahn: true }),
  'GOZ:2020': r('haupt', 205, 'Provisorisch verschließen', { jeZahn: true }),
  'GOZ:2150': r('haupt', 210, 'Inlay präparieren und einsetzen (einflächig)', { jeZahn: true }),
  'GOZ:2160': r('haupt', 210, 'Inlay präparieren und einsetzen (zweiflächig)', { jeZahn: true }),
  'GOZ:2170': r('haupt', 210, 'Inlay präparieren und einsetzen (mehrflächig)', { jeZahn: true }),
  'GOZ:2200': r('haupt', 220, 'Krone präparieren und eingliedern', { jeZahn: true }),
  'GOZ:2210': r('haupt', 220, 'Krone präparieren und eingliedern', { jeZahn: true }),
  'GOZ:2220': r('haupt', 220, 'Teilkrone oder Veneer präparieren und eingliedern', { jeZahn: true }),
  'GOZ:5000': r('haupt', 221, 'Brückenanker präparieren (Krone)', { jeZahn: true }),
  'GOZ:5010': r('haupt', 221, 'Brückenanker präparieren (Krone)', { jeZahn: true }),
  'GOZ:5020': r('haupt', 221, 'Brückenanker präparieren (Teilkrone)', { jeZahn: true }),
  'GOZ:5030': r('haupt', 221, 'Teleskopkrone präparieren', { jeZahn: true }),
  'GOZ:5040': r('haupt', 221, 'Teleskopkrone präparieren', { jeZahn: true }),
  'GOZ:5070': r('haupt', 222, 'Brückenspanne eingliedern'),
  'GOZ:2260': r('haupt', 215, 'Provisorium anfertigen', { jeZahn: true }),
  'GOZ:2270': r('haupt', 215, 'Provisorium anfertigen', { jeZahn: true }),
  'GOZ:5120': r('haupt', 215, 'Provisorische Brücke anfertigen'),
  'GOZ:5140': r('haupt', 216, 'Provisorische Brückenspanne anfertigen'),
  'GOZ:5200': r('haupt', 225, 'Teilprothese eingliedern'),
  'GOZ:5210': r('haupt', 225, 'Modellgussprothese eingliedern'),
  'GOZ:5220': r('haupt', 225, 'Totalprothese eingliedern (Oberkiefer)'),
  'GOZ:5230': r('haupt', 225, 'Totalprothese eingliedern (Unterkiefer)'),
  'GOZ:2197': r('haupt', 230, 'Adhäsiv befestigen', { jeZahn: true }),
  'GOZ:6190': r('haupt', 290, 'Verhaltensregeln besprechen'),
  // Funktionsanalyse und Schiene: erst untersuchen und registrieren, dann Modelle, dann eingliedern
  'GOZ:8000': r('haupt', 60, 'Klinische Funktionsanalyse'),
  'GOZ:8010': r('haupt', 70, 'Zentrallage des Unterkiefers registrieren'),
  'GOZ:8020': r('haupt', 71, 'Scharnierachse bestimmen (Gesichtsbogen)'),
  'GOZ:8030': r('haupt', 71, 'Scharnierachse kinematisch bestimmen'),
  'GOZ:8035': r('haupt', 71, 'Scharnierachse elektronisch bestimmen'),
  'GOZ:8050': r('haupt', 72, 'Unterkieferbewegungen registrieren'),
  'GOZ:8060': r('haupt', 72, 'Unterkieferbewegungen registrieren (voll adjustierbarer Artikulator)'),
  'GOZ:8065': r('haupt', 72, 'Unterkieferbewegungen elektronisch aufzeichnen'),
  'GOZ:8080': r('haupt', 80, 'Modelle im Artikulator auswerten'),
  'GOZ:8090': r('haupt', 81, 'Funktionsflächen diagnostisch aufbauen'),
  'GOZ:7000': r('haupt', 226, 'Aufbissbehelf eingliedern'),
  'GOZ:7010': r('haupt', 226, 'Schiene mit adjustierter Oberfläche eingliedern'),
  'GOZ:7020': r('haupt', 226, 'Prothese zum Aufbissbehelf umarbeiten'),
  'GOZ:7070': r('haupt', 227, 'Zähne schienen (Ätztechnik)'),
  'GOZ:7030': r('haupt', 228, 'Aufbissbehelf wiederherstellen'),
  'GOZ:7080': r('haupt', 215, 'Langzeitprovisorium eingliedern'),
  'GOZ:7090': r('haupt', 215, 'Langzeitprovisorium eingliedern'),
  'GOZ:7100': r('haupt', 228, 'Langzeitprovisorium wiederherstellen'),
  'GOZ:8100': r('haupt', 240, 'Okklusion einschleifen'),
  'GOZ:4040': r('haupt', 240, 'Grobe Vorkontakte einschleifen'),
  'BEMA:K1': r('haupt', 226, 'Schiene mit adjustierter Oberfläche eingliedern'),
  'BEMA:K2': r('haupt', 226, 'Aufbissbehelf eingliedern'),
  'BEMA:K3': r('haupt', 226, 'Prothese zum Aufbissbehelf umarbeiten'),
  'BEMA:K4': r('haupt', 227, 'Zähne schienen'),
  'BEMA:K6': r('haupt', 228, 'Aufbissbehelf wiederherstellen'),
  'BEMA:7a': r('vor', 40, 'Abformung für Planungsmodelle'),
  'BEMA:7b': r('vor', 40, 'Abformung für Planungsmodelle'),
  // Parodontologie
  'GOZ:4000': r('vor', 13, 'Parodontalstatus erheben'),
  'GOZ:4005': r('vor', 13, 'Gingival- oder Parodontalindex erheben'),
  'GOZ:4020': r('haupt', 141, 'Mundschleimhaut lokal behandeln'),
  'GOZ:4030': r('haupt', 142, 'Scharfe Kanten und Reize beseitigen'),
  'GOZ:4070': r('haupt', 145, 'Zahnfleischtaschen reinigen (einwurzelige Zähne)'),
  'GOZ:4075': r('haupt', 145, 'Zahnfleischtaschen reinigen (mehrwurzelige Zähne)'),
  'GOZ:4025': r('haupt', 146, 'Antibakterielles Medikament in die Taschen einbringen'),
  'GOZ:4080': r('haupt', 147, 'Zahnfleisch abtragen und formen'),
  'GOZ:4090': r('haupt', 148, 'Lappenoperation (Frontzahn)'),
  'GOZ:4100': r('haupt', 148, 'Lappenoperation (Seitenzahn)'),
  'GOZ:4136': r('haupt', 148, 'Knochen formen, Krone verlängern'),
  'GOZ:4110': r('haupt', 149, 'Knochendefekt auffüllen'),
  'GOZ:4138': r('haupt', 149, 'Membran einbringen'),
  'GOZ:4120': r('haupt', 182, 'Schleimhautlappen verlegen'),
  'GOZ:4130': r('haupt', 182, 'Schleimhaut transplantieren'),
  'GOZ:4133': r('haupt', 182, 'Bindegewebe transplantieren'),
  'BEMA:4': r('vor', 13, 'Parodontalstatus erheben'),
  'BEMA:ATG': r('vor', 15, 'Aufklärungs- und Therapiegespräch'),
  'BEMA:MHU': r('vor', 50, 'Mundhygiene unterweisen'),
  'BEMA:AITa': r('haupt', 145, 'Zahnfleischtaschen reinigen (einwurzelige Zähne)'),
  'BEMA:AITb': r('haupt', 145, 'Zahnfleischtaschen reinigen (mehrwurzelige Zähne)'),
  'BEMA:CPT': r('haupt', 148, 'Chirurgische Parodontitistherapie'),
  'BEMA:CPTa': r('haupt', 148, 'Chirurgische Parodontitistherapie (einwurzelige Zähne)'),
  'BEMA:CPTb': r('haupt', 148, 'Chirurgische Parodontitistherapie (mehrwurzelige Zähne)'),
  'BEMA:108': r('haupt', 240, 'Einschleifen'),
  // Kieferorthopädie
  'GOZ:6000': r('vor', 42, 'Profil- und Enface-Fotos auswerten'),
  'GOZ:6010': r('vor', 43, 'Modelle analysieren'),
  'GOZ:6020': r('vor', 44, 'Fernröntgenbild auswerten'),
  'GOZ:6220': r('vor', 47, 'Behandlungsmittel vorbereiten (Abformung, Bissnahme)'),
  'GOZ:6030': r('haupt', 232, 'Kiefer umformen (geringer Umfang)'),
  'GOZ:6040': r('haupt', 232, 'Kiefer umformen (mittlerer Umfang)'),
  'GOZ:6050': r('haupt', 232, 'Kiefer umformen (hoher Umfang)'),
  'GOZ:6060': r('haupt', 232, 'Kiefer in den Regelbiss einstellen (geringer Umfang)'),
  'GOZ:6070': r('haupt', 232, 'Kiefer in den Regelbiss einstellen (mittlerer Umfang)'),
  'GOZ:6080': r('haupt', 232, 'Kiefer in den Regelbiss einstellen (hoher Umfang)'),
  'GOZ:6090': r('haupt', 232, 'Okklusion alveolär ausgleichen'),
  'GOZ:6100': r('haupt', 233, 'Brackets kleben'),
  'GOZ:6120': r('haupt', 233, 'Bänder setzen'),
  'GOZ:6140': r('haupt', 234, 'Teilbogen eingliedern'),
  'GOZ:6150': r('haupt', 234, 'Bogen eingliedern'),
  'GOZ:6160': r('haupt', 235, 'Verankerung eingliedern (z. B. Headgear)'),
  'GOZ:6170': r('haupt', 235, 'Kopf-Kinn-Kappe eingliedern'),
  'GOZ:6200': r('haupt', 236, 'Hilfsmittel gegen Funktionsstörungen eingliedern'),
  'GOZ:6230': r('haupt', 236, 'Behandlungsgerät eingliedern'),
  'GOZ:6240': r('haupt', 237, 'Lücke offenhalten'),
  'GOZ:6250': r('haupt', 237, 'Diastema schließen'),
  'GOZ:6260': r('haupt', 237, 'Verlagerten Zahn einordnen'),
  'GOZ:6180': r('haupt', 238, 'Behandlungsgerät wiederherstellen oder erweitern'),
  'GOZ:6110': r('haupt', 245, 'Brackets entfernen, Zähne polieren'),
  'GOZ:6130': r('haupt', 245, 'Bänder entfernen, Zähne polieren'),
  'BEMA:116': r('vor', 42, 'Fotos auswerten'),
  'BEMA:117': r('vor', 43, 'Modelle analysieren'),
  'BEMA:118': r('vor', 44, 'Fernröntgenbild auswerten'),
  'BEMA:119': r('haupt', 232, 'Kiefer umformen'),
  'BEMA:120': r('haupt', 232, 'Kiefer in den Regelbiss einstellen'),
  'BEMA:126a': r('haupt', 233, 'Brackets kleben'),
  'BEMA:126b': r('haupt', 233, 'Bänder setzen'),
  'BEMA:127a': r('haupt', 234, 'Teilbogen eingliedern'),
  'BEMA:128a': r('haupt', 234, 'Bogen eingliedern'),
  // Kasse: Untersuchung, Betäubung, Füllung
  'BEMA:01': r('vor', 12, 'Eingehende Untersuchung'),
  'BEMA:04': r('vor', 13, 'Parodontalen Screening-Index erheben'),
  'BEMA:107': r('vor', 53, 'Zahnstein entfernen'),
  'BEMA:40': r('haupt', 101, 'Injektion', { jeZahn: true }),
  'BEMA:41a': r('haupt', 102, 'Leitungsanästhesie'),
  'BEMA:105': r('haupt', 141, 'Mundschleimhaut lokal behandeln'),
  'BEMA:13a': r('haupt', 200, 'Füllung legen (einflächig)', { jeZahn: true }),
  'BEMA:13b': r('haupt', 200, 'Füllung legen (zweiflächig)', { jeZahn: true }),
  'BEMA:13c': r('haupt', 200, 'Füllung legen (dreiflächig)', { jeZahn: true }),
  'BEMA:13d': r('haupt', 200, 'Füllung legen (mehr als dreiflächig)', { jeZahn: true }),
  // Kontrolle
  'GOZ:3290': r('kontrolle', 300, 'Kontrolle nach dem Eingriff'),
  'GOZ:3300': r('kontrolle', 301, 'Wunde nachbehandeln'),
  'GOZ:3310': r('kontrolle', 302, 'Wunde chirurgisch nachversorgen'),
  'GOZ:2130': r('kontrolle', 310, 'Füllung kontrollieren und polieren', { jeZahn: true }),
  'GOZ:1020': r('kontrolle', 320, 'Fluoridieren'),
  'GOZ:4150': r('kontrolle', 303, 'Kontrolle und Nachbehandlung nach dem Parodontaleingriff'),
  'BEMA:111': r('kontrolle', 303, 'Nachbehandlung'),
  'BEMA:BEV': r('kontrolle', 304, 'Befund neu erheben und auswerten'),
  'BEMA:BEVa': r('kontrolle', 304, 'Befund nach der Taschenreinigung neu erheben'),
  'BEMA:BEVb': r('kontrolle', 305, 'Befund nach dem Eingriff neu erheben'),
  'GOZ:4060': r('kontrolle', 321, 'Kontrolle nach der Zahnreinigung'),
  'GOZ:7040': r('kontrolle', 330, 'Aufbissbehelf kontrollieren'),
  'GOZ:7050': r('kontrolle', 331, 'Schiene kontrollieren und einschleifen'),
  'GOZ:7060': r('kontrolle', 332, 'Schiene kontrollieren und aufbauen'),
  'BEMA:K7': r('kontrolle', 330, 'Aufbissbehelf kontrollieren'),
  'BEMA:K8': r('kontrolle', 331, 'Schiene kontrollieren und einschleifen'),
  'BEMA:K9': r('kontrolle', 332, 'Schiene kontrollieren und aufbauen'),
  'GOZ:6210': r('kontrolle', 335, 'Verlauf kontrollieren, Retention weiterführen'),
  'BEMA:122a': r('kontrolle', 335, 'Verlauf kontrollieren'),
  'BEMA:UPTa': r('kontrolle', 340, 'Unterstützende Parodontitistherapie'),
  'BEMA:UPTb': r('kontrolle', 340, 'Unterstützende Parodontitistherapie'),
  'BEMA:UPTc': r('kontrolle', 340, 'Unterstützende Parodontitistherapie'),
  'BEMA:UPTd': r('kontrolle', 340, 'Unterstützende Parodontitistherapie'),
  'BEMA:UPTe': r('kontrolle', 340, 'Unterstützende Parodontitistherapie'),
  'BEMA:UPTf': r('kontrolle', 340, 'Unterstützende Parodontitistherapie'),
  'BEMA:UPTg': r('kontrolle', 340, 'Unterstützende Parodontitistherapie'),
}

/** Hauptteil als Behandlungsplan: Stufe nach dem Rang, in dieser Folge. */
const STUFEN: [bis: number, name: string][] = [
  [69, 'Funktionsanalyse'], [79, 'Registrierung'], [99, 'Modellanalyse'], [119, 'Betäubung und Arbeitsfeld'],
  [129, 'Alte Versorgung entfernen'], [139, 'Wurzelbehandlung'], [149, 'Parodontalbehandlung'], [194, 'Chirurgischer Eingriff'],
  [209, 'Aufbau und Füllung'], [219, 'Provisorium'], [231, 'Eingliederung'], [239, 'Kieferorthopädische Behandlung'],
  [249, 'Feineinstellung'], [289, 'Weitere Leistungen'], [299, 'Abschluss der Sitzung'],
]
const stufe = (rang: number) => STUFEN.find(([bis]) => rang <= bis)?.[1] ?? ''

/** Zuschläge sind kein eigener Handgriff. */
const KEIN_SCHRITT = new Set([
  'GOZ:0110', 'GOZ:0120', 'GOZ:0500', 'GOZ:0510', 'GOZ:0520', 'GOZ:0530',
  'GOAE:440', 'GOAE:441', 'GOAE:442', 'GOAE:443', 'GOAE:444', 'GOAE:445',
])

const GOZ_TEXT = new Map(GOZ_SCHRITTE.flatMap((s) => s.eintraege.map((e) => [e.nr, e.text] as const)))

const istZahn = (t: string) => t.length === 2 && t[0] >= '1' && t[0] <= '4' && t[1] >= '1' && t[1] <= '8'

/** Leistungstext auf den Handgriff kürzen: bis zur ersten Einschränkung, höchstens 80 Zeichen. */
function kurz(text: string): string {
  let t = text.trim()
  for (const ende of [', analog', ' analog §', ' pro Eingriff', ' gemäß', ' gem. ', ' entsprechend', ' einschließlich', ' einschl.', ', je ', ' je ', ' (z. B.']) {
    const i = t.indexOf(ende)
    if (i > 12) t = t.slice(0, i)
  }
  if (t.startsWith('analog')) return ''
  return t.length > 80 ? `${t.slice(0, 77).trimEnd()}…` : t
}

interface Zeile extends Schritt { a: Abschnitt; sitzung: number; rang: number; lauf: number }

/** Schritte aus den Positionen einer oder mehrerer Fassungen eines Plans. `impl`: Sitzungen heißen wie in der Implantologie. */
export function behandlungsschritte(positionen: SchrittPosition[], impl = false): Schritte {
  const zeilen: Zeile[] = []
  const mitSitzung = positionen.some((p) => (p.sitzung ?? 0) > 0)
  const letzte = Math.max(0, ...positionen.map((p) => p.sitzung ?? 0))
  const gesehen = new Set<string>()
  const bildSchon = new Set<string>()
  let lauf = 0
  for (const p of positionen) {
    const ebene = String(p.ebene ?? '')
    const nr = String(p.nr ?? '').trim()
    if (!nr || (ebene !== 'GOZ' && ebene !== 'GOAE' && ebene !== 'BEMA') || !(Number(p.anzahl ?? 1) > 0)) continue
    const schluessel = `${ebene}:${nr}`
    if (KEIN_SCHRITT.has(schluessel)) continue
    const regel = REGELN[schluessel]
    const sitzung = p.sitzung && p.sitzung > 0 ? p.sitzung : 0
    let a: Abschnitt = regel?.a ?? 'haupt'
    let text = regel?.text ?? (kurz(p.bezeichnung ?? '') || kurz(ebene === 'GOZ' ? GOZ_TEXT.get(nr) ?? '' : '') || `Analogleistung ${ebene === 'GOAE' ? 'GOÄ' : ebene} ${nr}`)
    if (mitSitzung && sitzung) {
      // Die Sitzung entscheidet: erste = Planung, letzte = Nachsorge; dazwischen der Eingriff.
      if (sitzung === 1) a = 'vor'
      else if (impl && sitzung === letzte && letzte >= 5) a = 'kontrolle'
      else if (regel?.bild) a = 'kontrolle'
      else if (a === 'vor') {
        a = 'haupt'
        if (regel?.spaeter) text = regel.spaeter
      }
    } else if (regel?.bild && bildSchon.has(schluessel)) {
      a = 'kontrolle'
    }
    if (regel?.bild) {
      bildSchon.add(schluessel)
      if (a === 'kontrolle') text = text.startsWith('Röntgen ') ? `Röntgenkontrolle ${text.slice(8)}` : text
    }
    const rang = regel?.rang ?? 250
    const phase = impl && sitzung ? PHASEN_IMPL[sitzung] : !sitzung && a === 'haupt' ? stufe(rang) || undefined : undefined
    const leistung = `${ebene === 'GOAE' ? 'GOÄ' : ebene} ${nr}`
    const zahn = String(p.zahn ?? '').trim()
    const teile = zahn.split(',').map((t) => t.trim()).filter(Boolean)
    const einzeln = regel?.jeZahn && teile.length > 1 && teile.every(istZahn) ? teile : [zahn]
    for (const z of einzeln) {
      const marke = `${a}|${sitzung}|${text}|${z}`
      if (gesehen.has(marke)) continue
      gesehen.add(marke)
      zeilen.push({ a, sitzung, rang, lauf: lauf++, text, zahn: z, leistung, ...(phase ? { phase } : {}) })
    }
  }
  const sortiert = (a: Abschnitt): Schritt[] => zeilen.filter((z) => z.a === a)
    .sort((x, y) => x.sitzung - y.sitzung || x.rang - y.rang || x.lauf - y.lauf)
    .map(({ text, zahn, leistung, phase }) => ({ text, zahn, leistung, ...(phase ? { phase } : {}) }))
  return { vor: sortiert('vor'), haupt: sortiert('haupt'), kontrolle: sortiert('kontrolle') }
}

export const schritteAnzahl = (s: Schritte) => s.vor.length + s.haupt.length + s.kontrolle.length

/** Positionen aus der gespeicherten Fassung eines Plans (ein oder zwei Pläne fürs Praxisprogramm). */
export function positionenAusFassung(pvs: unknown): SchrittPosition[] {
  if (!Array.isArray(pvs)) return []
  return pvs.flatMap((plan) => {
    const liste = (plan as { positionen?: unknown } | null)?.positionen
    return Array.isArray(liste) ? liste.filter((p) => p && typeof p === 'object') as SchrittPosition[] : []
  })
}
