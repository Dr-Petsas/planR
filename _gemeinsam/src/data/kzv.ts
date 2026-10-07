/**
 * Die 17 Kassenzahnärztlichen Vereinigungen und ihre BEL-II-Höchstpreislisten.
 * Die Listen erscheinen als CSV im VDDS-Format „<KZV-Nr>la<MMJJ>.csv“ (MMJJ = Gültigkeitsbeginn).
 * Wird auch vom Aktualisierungsdienst tools/listen-aktualisieren.ts verwendet (keine Imports!).
 */
export interface Kzv {
  /** KZV-Nummer (Präfix der VDDS-Datei) */
  nr: string
  /** Kurzname für IDs (bel2-<slug>-<jahr>) */
  slug: string
  name: string
  kurz: string
  /** Abrechnungsbereich in der Labor-XML (KZBV/VDZI/VDDS) */
  bereich: string
  /** Seite, auf der die KZV die BEL-II-Liste veröffentlicht */
  seite: string
  /** Weitere Seiten, die nach dem CSV-Link durchsucht werden */
  weitereSeiten?: string[]
  /** Feste Dateiadressen mit {MM}/{JJ}/{JJJJ}, falls die Seite den Link nicht im HTML enthält */
  muster?: string[]
  /** Nur Praxislaborpreise in der CSV: Gewerbepreis = Praxis / 0,95 */
  nurPraxis?: boolean
  /** Liste nicht öffentlich (Login) */
  login?: boolean
}

export const KZVEN: Kzv[] = [
  {
    nr: '02', slug: 'bw', name: 'Baden-Württemberg', kurz: 'KZV BW', bereich: 'BW',
    seite: 'https://www.kzvbw.de/zahnaerzte/abrechnung/punktwerte-formulare-vordrucke/bel-leistungen-download/',
    muster: ['https://www.kzvbw.de/wp-content/uploads/02la{MM}{JJ}.csv'],
  },
  {
    nr: '11', slug: 'bayern', name: 'Bayern', kurz: 'KZVB', bereich: 'BY',
    seite: 'https://www.kzvb.de/abrechnung/bel-preise',
    muster: ['https://www.kzvb.de/fileadmin/user_upload/Abrechnung/BEL/11la{MM}{JJ}.csv'],
  },
  {
    nr: '30', slug: 'berlin', name: 'Berlin', kurz: 'KZV Berlin', bereich: 'BE',
    seite: 'https://www.kzv-berlin.de/fuer-praxen/abrechnung/bel-ii-laborpreise',
    muster: ['https://www.kzv-berlin.de/fileadmin/user_upload_kzv/Praxis-Service/1_Abrechnung/8_BEL_II__Laborpreise/30la{MM}{JJ}.csv'],
  },
  {
    nr: '53', slug: 'brandenburg', name: 'Brandenburg', kurz: 'KZVLB', bereich: 'BBG',
    seite: 'https://www.kzvlb.de/service/downloadcenter',
    muster: ['https://www.kzvlb.de/fileadmin/user_upload/sw/53la{MM}{JJ}.csv'],
  },
  {
    nr: '31', slug: 'bremen', name: 'Bremen', kurz: 'KZV Bremen', bereich: 'HB',
    seite: 'https://www.kzv-bremen.de/mitglieder/abrechnung/bel', login: true,
  },
  {
    nr: '32', slug: 'hamburg', name: 'Hamburg', kurz: 'KZV Hamburg', bereich: 'HH',
    seite: 'https://www.zahnaerzte-hh.de/zahnaerzte-portal/praxis/abrechnung/kassenabrechnung-kzv/punktwerte-laborpreise-bel-materialkosten',
    muster: ['https://www.zahnaerzte-hh.de/fileadmin/Redaktion/KZV/Abrechnung/32la{MM}{JJ}.csv'],
  },
  {
    nr: '20', slug: 'hessen', name: 'Hessen', kurz: 'KZVH', bereich: 'HS',
    seite: 'https://www.kzvh.de/BEL-Preisliste/index.html',
    muster: ['https://www.kzvh.de/wcm/idc/groups/public/documents/web/mdiw/bgew/~edisp/20la{MM}{JJ}.csv'],
  },
  {
    nr: '52', slug: 'mv', name: 'Mecklenburg-Vorpommern', kurz: 'KZV M-V', bereich: 'MVO',
    seite: 'https://www.kzvmv.de/bkv-download/index.html',
    muster: ['https://www.kzvmv.de/dokumente/52la{MM}{JJ}.csv'],
  },
  {
    nr: '04', slug: 'niedersachsen', name: 'Niedersachsen', kurz: 'KZVN', bereich: 'NS',
    seite: 'https://www.kzvn.de/abrechnung/punktwerte-formulare/bel-ll/',
  },
  {
    nr: '13', slug: 'nordrhein', name: 'Nordrhein', kurz: 'KZV Nordrhein', bereich: 'NR',
    seite: 'https://www.kzvnr.de/praxis/abrechnung-honorar/bel-ii-listen', nurPraxis: true,
    muster: ['https://www.kzvnr.de/fileadmin/user_upload/PDF/Zahnaerzteseite/BEL-II-Listen/13la{MM}{JJ}.csv'],
  },
  {
    nr: '06', slug: 'rlp', name: 'Rheinland-Pfalz', kurz: 'KZV RLP', bereich: 'RP',
    seite: 'https://www.kzvrlp.de/mitglieder/abrechnung/bel-ii/',
  },
  {
    nr: '35', slug: 'saarland', name: 'Saarland', kurz: 'KZV Saarland', bereich: 'SAA',
    seite: 'https://www.kzv-saarland.de/praxen/abrechnung/zahntechnik-bel',
  },
  {
    nr: '56', slug: 'sachsen', name: 'Sachsen', kurz: 'KZVS', bereich: 'SA',
    seite: 'https://www.zahnaerzte-in-sachsen.de/zahnarztpraxis/abrechnung/bema-abrechnung/allgemeine-abrechnungsinformationen/',
    muster: ['https://www.zahnaerzte-in-sachsen.de/fileadmin/Praxis/KZVS/Abrechnung/BEL_II/{JJJJ}/56la{MM}{JJ}.csv'],
  },
  {
    nr: '54', slug: 'lsa', name: 'Sachsen-Anhalt', kurz: 'KZV LSA', bereich: 'SAN',
    seite: 'https://www.kzv-lsa.de/f%C3%BCr-die-praxis/abrechnung/bel-liste.html',
    muster: ['https://www.kzv-lsa.de/files/Inhalte/Abrechnung/BEL/{JJJJ}/54la{MM}{JJ}csv_mitU.csv'],
  },
  {
    nr: '36', slug: 'sh', name: 'Schleswig-Holstein', kurz: 'KZV S-H', bereich: 'SH',
    seite: 'https://www.kzv-sh.de/fuer-die-praxis/abrechnung/bel-csv/',
  },
  {
    nr: '55', slug: 'thueringen', name: 'Thüringen', kurz: 'KZV Thüringen', bereich: 'TH',
    seite: 'https://www.kzvth.de/bel-beb',
    muster: ['https://www.kzvth.de/services/asset/KZVTh/Downloadbereich/BEL/BEL%20{JJJJ}/55la{MM}{JJ}.csv'],
  },
  {
    nr: '37', slug: 'wl', name: 'Westfalen-Lippe', kurz: 'ZÄKWL/KZVWL', bereich: 'WL',
    seite: 'https://zahnaerzte-wl.de/pages/aktuelle-abrechnungsinfos',
  },
]

export const kzvNachNr = (nr: string) => KZVEN.find((k) => k.nr === nr)

/**
 * PLZ-Leitbereiche → KZV-Nr. Zweistellig, mit dreistelligen Ausnahmen an Landesgrenzen.
 * Näherung: Postleitzahlen folgen nicht exakt den Landesgrenzen – die KZV lässt sich in den Einstellungen festlegen.
 */
const PLZ2: Record<string, string> = {
  '01': '56', '02': '56', '03': '53', '04': '56', '06': '54', '07': '55', '08': '56', '09': '56',
  '10': '30', '12': '30', '13': '30', '14': '53', '15': '53', '16': '53', '17': '52', '18': '52', '19': '52',
  '20': '32', '21': '32', '22': '32', '23': '36', '24': '36', '25': '36', '26': '04', '27': '04', '28': '31', '29': '04',
  '30': '04', '31': '04', '32': '37', '33': '37', '34': '20', '35': '20', '36': '20', '37': '04', '38': '04', '39': '54',
  '40': '13', '41': '13', '42': '13', '44': '37', '45': '13', '46': '13', '47': '13', '48': '37', '49': '04',
  '50': '13', '51': '13', '52': '13', '53': '13', '54': '06', '55': '06', '56': '06', '57': '37', '58': '37', '59': '37',
  '60': '20', '61': '20', '63': '20', '64': '20', '65': '20', '66': '35', '67': '06', '68': '02', '69': '02',
  '70': '02', '71': '02', '72': '02', '73': '02', '74': '02', '75': '02', '76': '02', '77': '02', '78': '02', '79': '02',
  '80': '11', '81': '11', '82': '11', '83': '11', '84': '11', '85': '11', '86': '11', '87': '11', '88': '02', '89': '02',
  '90': '11', '91': '11', '92': '11', '93': '11', '94': '11', '95': '11', '96': '11', '97': '11', '98': '55', '99': '55',
}
const PLZ3: Record<string, string> = {
  '019': '53', '046': '55', '049': '53', '140': '30', '141': '30', '172': '53',
  '210': '32', '211': '32', '212': '04', '213': '04', '214': '04', '215': '36', '216': '04', '217': '04',
  '228': '36', '229': '36', '239': '52', '275': '31', '288': '04', '289': '04',
  '364': '55', '372': '20', '373': '55', '388': '54', '389': '54',
  '455': '37', '456': '37', '457': '37', '458': '37', '459': '37', '462': '37', '463': '37',
  '484': '04', '485': '04', '494': '37', '495': '37',
  '534': '06', '535': '06', '536': '06', '575': '06', '576': '06',
  '637': '11', '638': '11', '639': '11', '668': '06', '669': '06', '685': '20', '686': '20',
  '767': '06', '768': '06', '769': '06', '881': '11', '892': '11', '893': '11', '894': '11', '979': '02',
}

export function kzvAusPlz(plz: string): string {
  const p = plz.replace(/\D/g, '')
  if (p.length < 2) return ''
  return PLZ3[p.slice(0, 3)] ?? PLZ2[p.slice(0, 2)] ?? ''
}
