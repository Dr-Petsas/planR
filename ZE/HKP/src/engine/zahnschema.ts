/** Zahnreihenfolge, wie sie im HKP-Formular von links nach rechts erscheint. */
export const OBERKIEFER = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
export const UNTERKIEFER = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']
export const ALLE_ZAEHNE = [...OBERKIEFER, ...UNTERKIEFER]

/** Verblendbereich nach Festzuschuss-Richtlinie: 15–25 und 34–44 */
const VERBLEND = new Set(['15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '34', '33', '32', '31', '41', '42', '43', '44'])
export const imVerblendbereich = (zahn: string) => VERBLEND.has(zahn)

export const istWeisheitszahn = (zahn: string) => zahn.endsWith('8')
export const istFrontzahn = (zahn: string) => ['1', '2', '3'].includes(zahn[1])
export const kieferVon = (zahn: string): 'OK' | 'UK' => (zahn[0] === '1' || zahn[0] === '2' ? 'OK' : 'UK')

export const BEFUND_KUERZEL: Record<string, string> = {
  a: 'Adhäsivbrücke (Anker)',
  ab: 'Adhäsivbrücke (Brückenglied)',
  abw: 'erneuerungsbedürftige Adhäsivbrücke (Brückenglied)',
  aw: 'erneuerungsbedürftige Adhäsivbrücke (Anker)',
  b: 'Brückenglied',
  bw: 'erneuerungsbedürftiges Brückenglied',
  e: 'ersetzter Zahn',
  ew: 'ersetzter, aber erneuerungsbedürftiger Zahn',
  f: 'fehlender Zahn',
  ix: 'zu entfernendes Implantat',
  k: 'klinisch intakte Krone',
  kw: 'erneuerungsbedürftige Krone',
  pkw: 'erneuerungsbedürftige Teilkrone',
  pw: 'erhaltungswürdiger Zahn mit partiellen Substanzdefekten',
  r: 'Wurzelstiftkappe mit ersetztem Zahn',
  rw: 'erneuerungsbedürftige Wurzelstiftkappe',
  sb: 'implantatgetragenes Brückenglied',
  sbw: 'erneuerungsbedürftiges implantatgetragenes Brückenglied',
  se: 'ersetzter Zahn einer implantatgetragenen (Teil-)Prothese',
  sew: 'erneuerungsbedürftiger ersetzter Zahn einer implantatgetragenen Prothese',
  sk: 'implantatgetragene intakte Krone',
  skw: 'erneuerungsbedürftige implantatgetragene Krone',
  so: 'implantatgetragenes Verbindungselement mit ersetztem Zahn',
  sow: 'erneuerungsbedürftiges implantatgetragenes Verbindungselement',
  st: 'implantatgetragene Teleskopkrone',
  stw: 'erneuerungsbedürftige implantatgetragene Teleskopkrone',
  t: 'Teleskopkrone',
  t2w: 'erneuerungsbedürftiges Sekundärteil einer Teleskopkrone',
  tw: 'erneuerungsbedürftige Teleskopkrone',
  ur: 'unzureichende Retention',
  ww: 'erhaltungswürdiger Zahn mit weitgehender Zerstörung',
  x: 'nicht erhaltungswürdiger Zahn',
  ')(': 'Lückenschluss',
}

export const THERAPIE_KUERZEL: Record<string, string> = {
  A: 'Adhäsivbrücke (Anker)',
  ABV: 'Adhäsivbrücke (Brückenglied mit vestibulärer Verblendung)',
  ABM: 'Adhäsivbrücke (Brückenglied vollkeramisch/vollverblendet)',
  B: 'Brückenglied',
  BM: 'Brückenglied vollkeramisch oder keramisch vollverblendet',
  BV: 'Brückenglied mit vestibulärer Verblendung',
  E: 'zu ersetzender Zahn',
  EO: 'zu ersetzender Zahn mit Stegverbindung',
  H: 'gegossene Halte- und Stützvorrichtung',
  K: 'Krone',
  KH: 'Krone mit Halteelement',
  KM: 'Krone vollkeramisch oder keramisch vollverblendet',
  KMH: 'Krone vollkeramisch/vollverblendet mit Halteelement',
  KMO: 'Krone vollkeramisch/vollverblendet mit Geschiebe',
  KO: 'Krone mit Geschiebe',
  KV: 'Krone mit vestibulärer Verblendung',
  KVH: 'Krone mit vestibulärer Verblendung und Halteelement',
  KVO: 'Krone mit vestibulärer Verblendung und Geschiebe',
  PK: 'Teilkrone',
  PKM: 'Teilkrone vollkeramisch oder keramisch vollverblendet',
  PKV: 'Teilkrone mit vestibulärer Verblendung',
  R: 'Wurzelstiftkappe',
  SB: 'implantatgetragenes Brückenglied',
  SBV: 'implantatgetragenes Brückenglied mit vestibulärer Verblendung',
  SBM: 'implantatgetragenes Brückenglied vollkeramisch/vollverblendet',
  SE: 'zu ersetzender Zahn einer implantatgetragenen (Teil-)Prothese',
  SEO: 'zu ersetzender Zahn einer implantatgetragenen Prothese mit Stegverbindung',
  SK: 'implantatgetragene Krone',
  SKM: 'implantatgetragene Krone vollkeramisch/vollverblendet',
  SKMO: 'implantatgetragene Krone vollkeramisch/vollverblendet mit Geschiebe',
  SKO: 'implantatgetragene Krone mit Geschiebe',
  SKV: 'implantatgetragene Krone mit vestibulärer Verblendung',
  SKVO: 'implantatgetragene Krone mit vestibulärer Verblendung und Geschiebe',
  SO: 'implantatgetragenes Verbindungselement',
  ST: 'implantatgetragene Teleskopkrone',
  STM: 'implantatgetragene Teleskopkrone vollkeramisch/vollverblendet',
  STV: 'implantatgetragene Teleskopkrone mit vestibulärer Verblendung',
  T: 'Teleskopkrone',
  TM: 'Teleskopkrone vollkeramisch oder keramisch vollverblendet',
  TV: 'Teleskopkrone mit vestibulärer Verblendung',
  T2: 'Sekundärteil einer Teleskopkrone',
  T2M: 'Sekundärteil einer Teleskopkrone vollkeramisch/vollverblendet',
  T2V: 'Sekundärteil einer Teleskopkrone mit vestibulärer Verblendung',
  ')(': 'Lückenschluss',
}

/** Befundkürzel, die einen fehlenden oder zu ersetzenden Zahn bedeuten */
export const FEHLEND = new Set(['f', 'x', 'b', 'bw', 'e', 'ew', 'ab', 'abw', 'sb', 'sbw', 'se', 'sew', 'r', 'rw', 'so', 'sow'])
/** davon versorgungsbedürftig (lösen eine Neuversorgung aus) */
export const VERSORGUNG_NOETIG = new Set(['f', 'x', 'bw', 'ew', 'abw'])
/** Befunde, die eine Krone des Zahnes erfordern */
export const KRONE_NOETIG = new Set(['ww', 'kw', 'aw', 'ur'])
export const TEILKRONE_NOETIG = new Set(['pw', 'pkw'])
