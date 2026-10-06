// Standardbegründungen für Faktoren über der Schwelle (§ 10 Abs. 3 GOZ bzw.
// § 5 Abs. 2 GOÄ). Je nach Leistungsgruppe ein passender Text; im KV einzeln
// überschreibbar.

const GRUPPEN: [RegExp, string][] = [
  [/^90(00|03|05)$/, 'Erhöhter Zeit- und Analyseaufwand bei der dreidimensionalen Implantatplanung und Schablonenkontrolle.'],
  [/^9010$/, 'Erschwerte Implantatinsertion bei reduziertem Knochenangebot, besondere Lagerbedingungen und erhöhter Aufwand für primärstabile Positionierung.'],
  [/^90(40|50|60)$/, 'Erhöhter Aufwand bei der Freilegung bzw. Aufbaumontage durch verdickte Mukosa und schwierige Zugänglichkeit.'],
  [/^9090$/, 'Erschwerte Knochengewinnung bei dünner Kortikalis und eingeschränktem Zugang.'],
  [/^91(00|10|20|30)$/, 'Aufwändige Augmentation bei ausgedehntem vertikalem/horizontalem Defekt, erschwerte Darstellung und Membranfixierung.'],
  [/^9140$/, 'Erschwerte intraorale Knochenblockentnahme mit Darstellung und Schonung benachbarter Strukturen.'],
  [/^9150$/, 'Aufwändige Fixation des Augmentates mit mehrfacher Osteosynthese zur Lagestabilisierung.'],
  [/^91(60|70)$/, 'Erschwerte Materialentfernung durch Osteotomie bei verwachsenem Lager.'],
  [/^30(00|10|20|30|40|45)$/, 'Erschwerte Zahn-/Wurzelentfernung bei besonderer Lagebeziehung und erhöhtem Zeitaufwand zur Schonung der Nachbarstrukturen.'],
  [/^3(100|240|210|230)$/, 'Aufwändige plastische Weichgewebsdeckung mit spannungsfreier Adaptation und erhöhtem Nahtaufwand.'],
  [/^41(00|10|20|30|33|38)$/, 'Erhöhter Aufwand bei der regenerativen bzw. plastischen Maßnahme durch ausgedehnten Defekt und erschwerte Darstellung.'],
  [/^00(80|90)$|^0100$/, 'Erhöhter Aufwand der Anästhesie bei ausgedehntem Operationsgebiet und mehreren Injektionsorten.'],
]

export function standardBegruendung(nr: string): string {
  for (const [re, text] of GRUPPEN) if (re.test(nr)) return text
  return 'Überdurchschnittlicher Schwierigkeitsgrad und Zeitaufwand im konkreten Behandlungsfall.'
}
