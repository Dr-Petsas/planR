/**
 * Standardbegründungen für GOZ-Faktoren über dem Schwellenwert 2,3 (§ 10 Abs. 3 GOZ).
 * Sie müssen sich auf Schwierigkeit, Zeitaufwand oder Umstände bei der Ausführung beziehen (§ 5 Abs. 2 GOZ)
 * und sind im Einzelfall patientenbezogen zu prüfen.
 */
const GRUPPEN: [RegExp, string][] = [
  [/^(0080|0090|0100)$/, 'Erschwerte Anästhesie durch anatomische Besonderheiten und entzündlich verändertes Gewebe; Nachinjektion und verlängerte Einwirkzeit erforderlich.'],
  [/^0065$/, 'Erhöhter Zeitaufwand bei der digitalen Abformung durch subgingival liegende Präparationsgrenzen, Blutungsneigung und mehrfache Teilscans.'],
  [/^(2030|2040)$/, 'Erschwerte Trockenlegung durch eingeschränkte Mundöffnung, starken Speichelfluss und subgingivale Defektränder.'],
  [/^(2180|2190|2195|2197)$/, 'Überdurchschnittlicher Zeitaufwand durch stark zerstörte Zahnhartsubstanz mit tief subgingivalen Defekträndern; aufwendige Trockenlegung und adhäsive Mehrschichttechnik, erschwerte Aufbereitung des Stiftbetts.'],
  [/^(2200|2210|2220)$/, 'Erschwerte Präparation durch tief subgingival reichende Defekt- und Füllungsränder; erhöhter Zeitaufwand für Blutstillung, Gingivaretraktion und Darstellung der Präparationsgrenze sowie für Anprobe und Okklusionseinstellung.'],
  [/^(2260|2270|5120|5140|7080|7090)$/, 'Erhöhter Zeitaufwand durch individuelle Gestaltung und mehrfache Anpassung des Provisoriums an Okklusion und Gingivaverlauf zur Ausformung des Weichgewebes.'],
  [/^(2290|2300)$/, 'Erhöhter Zeitaufwand durch fest zementierte bzw. tief verankerte Versorgung; besonders vorsichtiges Vorgehen zur Vermeidung einer Wurzelfraktur erforderlich.'],
  [/^(2310|2320|5090|5100|5110)$/, 'Erhöhter Aufwand für Reinigung, Anpassung und Kontrolle der Passung vor der Wiederbefestigung.'],
  [/^(50[0-4]0)$/, 'Erschwerte Präparation divergierender Pfeiler mit Herstellung einer gemeinsamen Einschubrichtung; erhöhter Zeitaufwand bei Abformung, Anprobe und Passungskontrolle mehrerer Pfeiler.'],
  [/^(5050|5060|5070|5080|5150)$/, 'Erhöhter Aufwand bei der Verbindung der Pfeiler: wiederholte Anprobe, Kontrolle von Einschubrichtung und Passung des Verbindungselements, Feinjustierung.'],
  [/^(5170|5180|5190)$/, 'Schwierige anatomische Verhältnisse (atrophierter Kiefer, ausgeprägte Muskel- und Bandansätze) mit mehrfacher funktioneller Randgestaltung.'],
  [/^(52[0-3]0|5240|5250|5260|5270|5280|5290|5300|5310)$/, 'Erhöhter Zeitaufwand durch ungünstige Kieferverhältnisse (Atrophie, Schlotterkamm, ungünstige Pfeilerverteilung) mit mehrfachen Anproben und Korrekturen zur Sicherung von Halt und Funktion.'],
  [/^(80\d0)$/, 'Erhöhter Zeitaufwand durch komplexe funktionelle Befunde mit wiederholter Registrierung und Kontrolle der Kieferrelation.'],
  [/^9040$/, 'Erschwerte Freilegung bei dicker, befestigter Mukosa; aufwendige Weichgewebsausformung um das Implantat.'],
  [/^(9050|9060)$/, 'Erhöhter Zeitaufwand durch mehrfachen Wechsel der Aufbauteile bei erschwerter Zugänglichkeit des Implantats; schonendes Vorgehen zum Schutz des periimplantären Gewebes.'],
]

const ALLGEMEIN = 'Überdurchschnittlicher Schwierigkeitsgrad und Zeitaufwand bei der Ausführung aufgrund der individuellen anatomischen und klinischen Verhältnisse.'

export const standardBegruendung = (nr: string): string => GRUPPEN.find(([re]) => re.test(nr.trim()))?.[1] ?? ALLGEMEIN
