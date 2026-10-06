/** Zahnreihenfolge von links nach rechts (Blick auf den Patienten) */
export const OBERKIEFER = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
export const UNTERKIEFER = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']
export const ALLE_ZAEHNE = [...OBERKIEFER, ...UNTERKIEFER]

export const kieferVon = (zahn: string): 'OK' | 'UK' => (zahn[0] === '1' || zahn[0] === '2' ? 'OK' : 'UK')
export const istFrontzahn = (zahn: string) => ['1', '2', '3'].includes(zahn[1])
export const istWeisheitszahn = (zahn: string) => zahn.endsWith('8')

/** Befund (Status) – gleiche Kürzel wie im Heil- und Kostenplan */
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
  i: 'Implantat (ohne Suprakonstruktion)',
  ix: 'zu entfernendes Implantat',
  k: 'klinisch intakte Krone',
  kw: 'erneuerungsbedürftige Krone',
  pkw: 'erneuerungsbedürftige Teilkrone',
  pw: 'Zahn mit partiellen Substanzdefekten',
  r: 'Wurzelstiftkappe mit ersetztem Zahn',
  rw: 'erneuerungsbedürftige Wurzelstiftkappe',
  sb: 'implantatgetragenes Brückenglied',
  sbw: 'erneuerungsbedürftiges implantatgetragenes Brückenglied',
  se: 'ersetzter Zahn einer implantatgetragenen Prothese',
  sew: 'erneuerungsbedürftiger ersetzter Zahn einer implantatgetragenen Prothese',
  sk: 'implantatgetragene intakte Krone',
  skw: 'erneuerungsbedürftige implantatgetragene Krone',
  so: 'implantatgetragenes Verbindungselement',
  sow: 'erneuerungsbedürftiges implantatgetragenes Verbindungselement',
  st: 'implantatgetragene Teleskopkrone',
  stw: 'erneuerungsbedürftige implantatgetragene Teleskopkrone',
  t: 'Teleskopkrone',
  t2w: 'erneuerungsbedürftiges Sekundärteil einer Teleskopkrone',
  tw: 'erneuerungsbedürftige Teleskopkrone',
  ur: 'unzureichende Retention',
  ww: 'Zahn mit weitgehender Zerstörung',
  x: 'nicht erhaltungswürdiger Zahn',
  ')(': 'Lückenschluss',
}

/** Planung – gleiche Kürzel wie Zeile TP im Heil- und Kostenplan */
export const PLANUNG_KUERZEL: Record<string, string> = {
  K: 'Krone (Metall)',
  KV: 'Krone mit vestibulärer Verblendung',
  KM: 'Krone vollkeramisch / vollverblendet',
  KH: 'Krone mit Halteelement',
  KVH: 'Krone verblendet mit Halteelement',
  KMH: 'Krone vollkeramisch mit Halteelement',
  KO: 'Krone mit Geschiebe',
  KVO: 'Krone verblendet mit Geschiebe',
  KMO: 'Krone vollkeramisch mit Geschiebe',
  PK: 'Teilkrone (Metall)',
  PKV: 'Teilkrone mit Verblendung',
  PKM: 'Teilkrone Keramik',
  VE: 'Veneer (Keramik)',
  VEK: 'Veneer (Komposit, laborgefertigt)',
  T: 'Teleskopkrone',
  TV: 'Teleskopkrone verblendet',
  TM: 'Teleskopkrone vollverblendet',
  T2: 'Sekundärteil einer Teleskopkrone',
  T2V: 'Sekundärteil verblendet',
  T2M: 'Sekundärteil vollverblendet',
  B: 'Brückenglied (Metall)',
  BV: 'Brückenglied verblendet',
  BM: 'Brückenglied vollkeramisch / vollverblendet',
  A: 'Adhäsivbrücke (Anker)',
  ABV: 'Adhäsivbrücke (Glied verblendet)',
  ABM: 'Adhäsivbrücke (Glied vollkeramisch)',
  SK: 'Implantatkrone (Metall)',
  SKV: 'Implantatkrone verblendet',
  SKM: 'Implantatkrone vollkeramisch',
  SKO: 'Implantatkrone mit Geschiebe',
  SKVO: 'Implantatkrone verblendet mit Geschiebe',
  SKMO: 'Implantatkrone vollkeramisch mit Geschiebe',
  SB: 'implantatgetragenes Brückenglied',
  SBV: 'implantatgetragenes Brückenglied verblendet',
  SBM: 'implantatgetragenes Brückenglied vollkeramisch',
  ST: 'Implantat-Teleskopkrone',
  STV: 'Implantat-Teleskopkrone verblendet',
  STM: 'Implantat-Teleskopkrone vollverblendet',
  SO: 'Implantat-Verbindungselement (Locator/Steg)',
  SE: 'ersetzter Zahn einer implantatgetragenen Prothese',
  SEO: 'ersetzter Zahn einer implantatgetragenen Prothese mit Steg',
  E: 'zu ersetzender Zahn (Prothese)',
  EO: 'zu ersetzender Zahn mit Stegverbindung',
  H: 'gegossene Halte- und Stützvorrichtung',
  R: 'Wurzelstiftkappe',
  ')(': 'Lückenschluss',
}

/** Befunde mit vorhandener Krone/Brückenanker, die vor der Neuversorgung entfernt wird */
export const ALTE_KRONE = new Set(['kw', 'pkw', 'tw', 'aw', 'rw', 'skw', 'stw', 't2w'])
