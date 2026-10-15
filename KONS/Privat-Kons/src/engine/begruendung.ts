/**
 * Standardbegründungen für GOZ-Faktoren über dem Schwellenwert 2,3 (§ 10 Abs. 3 GOZ).
 * Sie müssen sich auf Schwierigkeit, Zeitaufwand oder Umstände bei der Ausführung beziehen (§ 5 Abs. 2 GOZ)
 * und sind im Einzelfall patientenbezogen zu prüfen. DENS speichert höchstens 274 Zeichen je Begründung.
 */
const GRUPPEN: [RegExp, string][] = [
  [/^(0080|0090|0100)$/, 'Erschwerte Anästhesie durch anatomische Besonderheiten und entzündlich verändertes Gewebe; Nachinjektion und verlängerte Einwirkzeit erforderlich.'],
  [/^0065$/, 'Erhöhter Zeitaufwand bei der digitalen Abformung durch subgingival liegende Kavitätenränder, Blutungsneigung und mehrfache Teilscans.'],
  [/^2000$/, 'Erschwerte Versiegelung durch tief zerklüftete Fissuren, eingeschränkte Zugänglichkeit und schwierige Trockenlegung.'],
  [/^(2030|2040)$/, 'Erschwerte Trockenlegung durch eingeschränkte Mundöffnung, starken Speichelfluss und subgingivale Defektränder.'],
  [/^(20[5-9]0|2100|2110|2120)$/, 'Erhöhter Zeitaufwand durch subgingival reichende Kavitätenränder, erschwerte Trockenlegung und aufwendige adhäsive Mehrschichttechnik mit anatomischer Gestaltung der Kontaktpunkte.'],
  [/^(21[5-7]0|2200|2210|2220)$/, 'Erschwerte Präparation durch subgingival reichende Kavitätenränder; erhöhter Zeitaufwand für Blutstillung, Darstellung der Präparationsgrenze, Anprobe und adhäsive Befestigung.'],
  [/^(2180|2190|2195|2197)$/, 'Überdurchschnittlicher Zeitaufwand durch stark zerstörte Zahnhartsubstanz mit tief subgingivalen Defekträndern; aufwendige Trockenlegung und adhäsive Mehrschichttechnik.'],
  [/^(2310|2320)$/, 'Erhöhter Aufwand für Reinigung, Anpassung und Kontrolle der Passung vor der Wiederbefestigung.'],
  [/^(2330|2340|2350)$/, 'Erschwerte Vitalerhaltung durch tiefe, pulpanahe Karies und Blutungsneigung; erhöhter Zeitaufwand für keimarmes Vorgehen und dichte Abdeckung.'],
  [/^(2360|2380|2390)$/, 'Erschwerter Zugang zum Kanalsystem durch eingeschränkte Mundöffnung, Kalzifikationen oder versteckte Kanaleingänge; erhöhter Zeitaufwand.'],
  [/^(2400|2410|2420|2430|2440)$/, 'Erschwerte Wurzelkanalbehandlung durch stark gekrümmte, obliterierte oder verzweigte Kanäle; erhöhter Zeitaufwand für Längenbestimmung, Aufbereitung, Desinfektion und dichte Füllung.'],
]

const ALLGEMEIN = 'Überdurchschnittlicher Schwierigkeitsgrad und Zeitaufwand bei der Ausführung aufgrund der individuellen anatomischen und klinischen Verhältnisse.'

export const standardBegruendung = (nr: string): string => GRUPPEN.find(([re]) => re.test(nr.trim()))?.[1] ?? ALLGEMEIN
