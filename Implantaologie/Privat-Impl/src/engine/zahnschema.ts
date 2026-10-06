import type { Region } from '../types'

/** Zahnreihenfolge von links nach rechts (Blick auf den Patienten) */
export const OBERKIEFER = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
export const UNTERKIEFER = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']
export const ALLE_ZAEHNE = [...OBERKIEFER, ...UNTERKIEFER]

export const kieferVon = (zahn: string): 'OK' | 'UK' => (zahn[0] === '1' || zahn[0] === '2' ? 'OK' : 'UK')
export const istFrontzahn = (zahn: string) => ['1', '2', '3'].includes(zahn[1])
export const istWeisheitszahn = (zahn: string) => zahn.endsWith('8')

/** Kieferhälfte/Front einer Zahnregion – für GOÄ/GOZ-Positionen „je Kieferhälfte oder Frontzahnbereich". */
export function regionVon(zahn: string): Region {
  const ok = kieferVon(zahn) === 'OK'
  if (istFrontzahn(zahn)) return ok ? 'OK-F' : 'UK-F'
  // rechter Quadrant: FDI 1x (OK) bzw. 4x (UK); linker: 2x bzw. 3x
  const rechts = zahn[0] === '1' || zahn[0] === '4'
  if (ok) return rechts ? 'OK-R' : 'OK-L'
  return rechts ? 'UK-R' : 'UK-L'
}

export const zaehneDerRegion: Record<Region, string[]> = {
  'OK-R': ['18', '17', '16', '15', '14'],
  'OK-F': ['13', '12', '11', '21', '22', '23'],
  'OK-L': ['24', '25', '26', '27', '28'],
  'UK-L': ['34', '35', '36', '37', '38'],
  'UK-F': ['43', '42', '41', '31', '32', '33'],
  'UK-R': ['48', '47', '46', '45', '44'],
}

/**
 * Befund – ausgangslage je Zahn (Kleinbuchstaben).
 * Implantologisch interessieren vor allem Lücke, nicht erhaltungswürdiger Zahn
 * und vorhandene Implantate.
 */
export const BEFUND_KUERZEL: Record<string, string> = {
  f: 'fehlender Zahn (Lücke)',
  x: 'nicht erhaltungswürdiger Zahn (Entfernung geplant)',
  xw: 'nicht erhaltungswürdige Wurzel',
  k: 'klinisch intakte Krone',
  kw: 'erneuerungsbedürftige Krone',
  ww: 'weitgehend zerstörter Zahn',
  r: 'Wurzelrest',
  i: 'vorhandenes Implantat',
  ix: 'zu entfernendes (periimplantär erkranktes) Implantat',
  pz: 'parodontal geschädigter Zahn',
}

/**
 * Planung – chirurgische/implantologische Kürzel (Großbuchstaben).
 * Prothetik (Krone/Brücke) wird im Privat-ZE-Planer geplant; hier nur, was den
 * chirurgischen Aufwand bestimmt.
 */
export const PLANUNG_KUERZEL: Record<string, string> = {
  EX: 'Extraktion',
  OX: 'operative Entfernung / Osteotomie',
  XS: 'Extraktion mit Socket Preservation',
  I: 'Implantat setzen',
  IS: 'Sofortimplantat (nach Extraktion)',
  ISS: 'Sofortimplantat mit Socket-Shield',
  IF: 'Implantat freilegen (zweite Phase)',
  IK: 'Implantat setzen, Krone geplant (ZE)',
  IB: 'Implantat setzen, Brückenpfeiler (ZE)',
  IST: 'Implantat setzen, Teleskop/Steg (ZE)',
  A: 'Augmentation an diesem Zahn',
  IA: 'Implantat setzen + simultane Augmentation',
  EXP: 'Explantation',
  ')(': 'Lückenschluss (kein Ersatz)',
}

/** Planungskürzel, die ein zu setzendes Implantat bedeuten. */
export const IMPLANTAT_KUERZEL = new Set(['I', 'IS', 'ISS', 'IK', 'IB', 'IST', 'IA'])
/** Sofortimplantat-Kürzel (Insertion in dieselbe Alveole). */
export const SOFORT_KUERZEL = new Set(['IS', 'ISS'])
/** Planungskürzel mit simultaner/lokaler Augmentation am Zahn. */
export const AUGMENTATION_KUERZEL = new Set(['A', 'IA'])
/** Planungskürzel, die eine Zahnentfernung bedeuten. */
export const ENTFERNUNG_KUERZEL = new Set(['EX', 'OX', 'XS', 'EXP'])

export const istImplantat = (tp: string) => IMPLANTAT_KUERZEL.has(tp.trim().toUpperCase())
