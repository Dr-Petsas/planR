/**
 * Was die privaten Planer heute schon als GOZ ansetzen.
 * Quelle: ZE/Privat-HKP planung.ts (ZUORDNUNG und die Zusätze im selben Lauf),
 * KONS/Privat-Kons kons.ts, Implantologie planung.ts, KB/Privat-KB.
 * Haken und Entfernen auf der Prüfseite ändern diese Liste für die Praxis.
 */
export interface GozKlasse {
  id: string
  planer: string
  kuerzel: string
  titel: string
  /** Ziffern, die die Engine für diese Klasse setzt. */
  standard: string[]
}

export const GOZ_KLASSEN: GozKlasse[] = [
  { id: 'ze-0030', planer: 'Privat-ZE', kuerzel: 'Plan', titel: 'Schriftlicher Heil- und Kostenplan', standard: ['0030'] },
  { id: 'ze-0065', planer: 'Privat-ZE', kuerzel: 'Scan', titel: 'Intraoralscan', standard: ['0065'] },
  { id: 'ze-2290', planer: 'Privat-ZE', kuerzel: 'Entfernen', titel: 'Vorhandene Krone oder Brücke entfernen', standard: ['2290'] },
  { id: 'ze-2180', planer: 'Privat-ZE', kuerzel: 'Aufbau', titel: 'Aufbau vor der Überkronung', standard: ['2180'] },

  { id: 'ze-k', planer: 'Privat-ZE', kuerzel: 'K', titel: 'Krone (Metall)', standard: ['2210', '2270'] },
  { id: 'ze-kv', planer: 'Privat-ZE', kuerzel: 'KV', titel: 'Krone mit vestibulärer Verblendung', standard: ['2210', '2270'] },
  { id: 'ze-km', planer: 'Privat-ZE', kuerzel: 'KM', titel: 'Krone vollkeramisch / vollverblendet', standard: ['2210', '2270'] },
  { id: 'ze-kh', planer: 'Privat-ZE', kuerzel: 'KH', titel: 'Krone mit Halteelement', standard: ['2210', '2270'] },
  { id: 'ze-kvh', planer: 'Privat-ZE', kuerzel: 'KVH', titel: 'Krone verblendet mit Halteelement', standard: ['2210', '2270'] },
  { id: 'ze-kmh', planer: 'Privat-ZE', kuerzel: 'KMH', titel: 'Krone vollkeramisch mit Halteelement', standard: ['2210', '2270'] },
  { id: 'ze-ko', planer: 'Privat-ZE', kuerzel: 'KO', titel: 'Krone mit Geschiebe', standard: ['2210', '2270', '5080'] },
  { id: 'ze-kvo', planer: 'Privat-ZE', kuerzel: 'KVO', titel: 'Krone verblendet mit Geschiebe', standard: ['2210', '2270', '5080'] },
  { id: 'ze-kmo', planer: 'Privat-ZE', kuerzel: 'KMO', titel: 'Krone vollkeramisch mit Geschiebe', standard: ['2210', '2270', '5080'] },

  { id: 'ze-pk', planer: 'Privat-ZE', kuerzel: 'PK', titel: 'Teilkrone (Metall)', standard: ['2220', '2270'] },
  { id: 'ze-pkv', planer: 'Privat-ZE', kuerzel: 'PKV', titel: 'Teilkrone mit Verblendung', standard: ['2220', '2270'] },
  { id: 'ze-pkm', planer: 'Privat-ZE', kuerzel: 'PKM', titel: 'Teilkrone Keramik', standard: ['2220', '2270'] },
  { id: 'ze-ve', planer: 'Privat-ZE', kuerzel: 'VE', titel: 'Veneer (Keramik)', standard: ['2220', '2197', '2270'] },
  { id: 'ze-vek', planer: 'Privat-ZE', kuerzel: 'VEK', titel: 'Veneer (Komposit, laborgefertigt)', standard: ['2220', '2197', '2270'] },

  { id: 'ze-i1', planer: 'Privat-ZE', kuerzel: 'I1', titel: 'Inlay, eine Fläche', standard: ['2150'] },
  { id: 'ze-i2', planer: 'Privat-ZE', kuerzel: 'I2', titel: 'Inlay, zwei Flächen', standard: ['2160'] },
  { id: 'ze-i3', planer: 'Privat-ZE', kuerzel: 'I3', titel: 'Inlay, drei Flächen', standard: ['2170'] },
  { id: 'ze-i4', planer: 'Privat-ZE', kuerzel: 'I4', titel: 'Inlay, mehr als drei Flächen', standard: ['2170'] },
  { id: 'ze-c1', planer: 'Privat-ZE', kuerzel: 'C1', titel: 'Keramikinlay, eine Fläche', standard: ['2150'] },
  { id: 'ze-c2', planer: 'Privat-ZE', kuerzel: 'C2', titel: 'Keramikinlay, zwei Flächen', standard: ['2160'] },
  { id: 'ze-c3', planer: 'Privat-ZE', kuerzel: 'C3', titel: 'Keramikinlay, drei Flächen', standard: ['2170'] },
  { id: 'ze-on', planer: 'Privat-ZE', kuerzel: 'ON', titel: 'Onlay', standard: ['2170'] },

  { id: 'ze-t', planer: 'Privat-ZE', kuerzel: 'T', titel: 'Teleskopkrone', standard: ['5040', '2270'] },
  { id: 'ze-tv', planer: 'Privat-ZE', kuerzel: 'TV', titel: 'Teleskopkrone verblendet', standard: ['5040', '2270'] },
  { id: 'ze-tm', planer: 'Privat-ZE', kuerzel: 'TM', titel: 'Teleskopkrone vollverblendet', standard: ['5040', '2270'] },
  { id: 'ze-t2', planer: 'Privat-ZE', kuerzel: 'T2', titel: 'Sekundärteil einer Teleskopkrone', standard: ['5100'] },
  { id: 'ze-b', planer: 'Privat-ZE', kuerzel: 'B', titel: 'Brückenglied', standard: ['5070', '5140'] },
  { id: 'ze-a', planer: 'Privat-ZE', kuerzel: 'A', titel: 'Adhäsivbrücke, Anker', standard: ['5150', '5070'] },
  { id: 'ze-prothese', planer: 'Privat-ZE', kuerzel: 'E', titel: 'Herausnehmbarer Zahnersatz', standard: ['5170', '5180', '5190', '5210', '5220', '5230'] },

  { id: 'ze-sk', planer: 'Privat-ZE', kuerzel: 'SK', titel: 'Implantatkrone (Metall)', standard: ['2200', '9050', '2270'] },
  { id: 'ze-skv', planer: 'Privat-ZE', kuerzel: 'SKV', titel: 'Implantatkrone verblendet', standard: ['2200', '9050', '2270'] },
  { id: 'ze-skm', planer: 'Privat-ZE', kuerzel: 'SKM', titel: 'Implantatkrone vollkeramisch', standard: ['2200', '9050', '2270'] },
  { id: 'ze-sko', planer: 'Privat-ZE', kuerzel: 'SKO', titel: 'Implantatkrone mit Geschiebe', standard: ['2200', '9050', '2270', '5080'] },
  { id: 'ze-st', planer: 'Privat-ZE', kuerzel: 'ST', titel: 'Implantat-Teleskopkrone', standard: ['5040', '9050', '2270'] },

  { id: 'kons-komposit', planer: 'Privat-Kons', kuerzel: 'F', titel: 'Kompositfüllung', standard: ['2060', '2080', '2100', '2120'] },
  { id: 'kons-inlay', planer: 'Privat-Kons', kuerzel: 'Inlay', titel: 'Einlagefüllung', standard: ['2150', '2160', '2170', '2197'] },
  { id: 'kons-endo', planer: 'Privat-Kons', kuerzel: 'Endo', titel: 'Wurzelkanalbehandlung', standard: ['2360', '2390', '2410', '2440'] },
  { id: 'kons-revision', planer: 'Privat-Kons', kuerzel: 'Revision', titel: 'Revision', standard: ['2410', '2440'] },
  { id: 'kons-vital', planer: 'Privat-Kons', kuerzel: 'Cp', titel: 'Überkappung und Pulpotomie', standard: ['2330', '2340', '2350'] },
  { id: 'kons-versiegelung', planer: 'Privat-Kons', kuerzel: 'IP', titel: 'Fissurenversiegelung', standard: ['2000'] },
  { id: 'kons-aufbau', planer: 'Privat-Kons', kuerzel: 'Aufbau', titel: 'Aufbau mit oder ohne Stift', standard: ['2180', '2195', '2197'] },

  { id: 'impl-planung', planer: 'Implantologie', kuerzel: 'Plan', titel: 'Implantatbezogene Analyse', standard: ['9000'] },
  { id: 'impl-setzen', planer: 'Implantologie', kuerzel: 'I', titel: 'Implantat setzen', standard: ['9010', '9040'] },
  { id: 'impl-zahn', planer: 'Implantologie', kuerzel: 'X', titel: 'Zahn entfernen vor der Implantation', standard: ['3000', '3030'] },
  { id: 'impl-explant', planer: 'Implantologie', kuerzel: 'ix', titel: 'Implantat entfernen', standard: ['9170'] },
  { id: 'impl-knochen', planer: 'Implantologie', kuerzel: 'Aug', titel: 'Knochenaufbau', standard: ['9090', '9100', '9130', '9140', '9150'] },
  { id: 'impl-sinus', planer: 'Implantologie', kuerzel: 'Sinus', titel: 'Sinuslift', standard: ['9110', '9120'] },
  { id: 'impl-weich', planer: 'Implantologie', kuerzel: 'WG', titel: 'Weichgewebe', standard: ['3100', '3240', '4130', '4133', '4138'] },

  { id: 'kb-michigan', planer: 'Privat-KB', kuerzel: '7010', titel: 'Adjustierte Aufbissschiene', standard: ['7010'] },
  { id: 'kb-tiefzieh', planer: 'Privat-KB', kuerzel: '7000', titel: 'Tiefziehschiene', standard: ['7000'] },
  { id: 'kb-kontrolle', planer: 'Privat-KB', kuerzel: 'Kontrolle', titel: 'Kontrollen und Einschleifen', standard: ['7040', '7050'] },
  { id: 'kb-schienung', planer: 'Privat-KB', kuerzel: '7070', titel: 'Semipermanente Schienung', standard: ['7070'] },
  { id: 'kb-lzp', planer: 'Privat-KB', kuerzel: '7080', titel: 'Langzeitprovisorium', standard: ['7080', '7090'] },
  { id: 'kb-fal', planer: 'Privat-KB', kuerzel: 'FA', titel: 'Klinische Funktionsanalyse', standard: ['8000', '0040'] },
  { id: 'kb-fdi', planer: 'Privat-KB', kuerzel: 'FDI', titel: 'Instrumentelle Funktionsanalyse', standard: ['8010', '8020', '8050', '8080'] },
  { id: 'kb-ukps', planer: 'Privat-KB', kuerzel: 'UKPS', titel: 'Unterkieferprotrusionsschiene', standard: ['0040', '0065', '6070', '8050'] },
]

export const GOZ_KLASSEN_IDS = new Set(GOZ_KLASSEN.map((k) => k.id))
