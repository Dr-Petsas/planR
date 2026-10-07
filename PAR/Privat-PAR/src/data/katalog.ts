// Leistungskatalog des Privat-PAR-Planers (PAR/_quellen/privat-par.json).
//
// Analogleistungen (§ 6 Abs. 1 GOZ): die Bewertung kommt aus der Referenzleistung der
// GOZ-Liste (Nummer ohne "a"), so rechnet eine aktualisierte GOZ automatisch mit.
// Zwei zulässige Varianten: BZÄK-Neubewertung 2026 ('aktuell') und Beratungsforum
// BZÄK/PKV/Beihilfe ('beratungsforum').

import type { Phase, Variante } from '../types'

export type Analog = 'diagnostik' | 'formblatt' | 'atg' | 'aitEin' | 'aitMehr' | 'bev' | 'uptEin' | 'uptMehr' | 'psiMehr'

export const ANALOG: Record<Analog, { text: string; aktuell: string; beratungsforum: string; bema: string }> = {
  diagnostik: { text: 'PAR-Diagnostik einschließlich Staging und Grading, Dokumentation', aktuell: '7080a', beratungsforum: '8000a', bema: '4' },
  formblatt: { text: 'Ausfertigung des PAR-Formblatts für den Zahlungspflichtigen', aktuell: '3290a', beratungsforum: '4030a', bema: '—' },
  atg: { text: 'Parodontologisches Aufklärungs- und Therapiegespräch (ATG)', aktuell: '9090a', beratungsforum: '2110a', bema: 'ATG' },
  aitEin: { text: 'Subgingivale Instrumentierung (antiinfektiöse Therapie), einwurzeliger Zahn', aktuell: '4000a', beratungsforum: '3010a', bema: 'AIT a' },
  aitMehr: { text: 'Subgingivale Instrumentierung (antiinfektiöse Therapie), mehrwurzeliger Zahn', aktuell: '3130a', beratungsforum: '4138a', bema: 'AIT b' },
  bev: { text: 'Befundevaluation PAR', aktuell: '3110a', beratungsforum: '5070a', bema: 'BEV' },
  uptEin: { text: 'Subgingivale Instrumentierung in der UPT, einwurzeliger Zahn', aktuell: '2000a', beratungsforum: '0090a', bema: 'UPT e' },
  uptMehr: { text: 'Subgingivale Instrumentierung in der UPT, mehrwurzeliger Zahn', aktuell: '2380a', beratungsforum: '2197a', bema: 'UPT f' },
  psiMehr: { text: 'Erhebung eines Gingival- und/oder Parodontalindex, mehr als zweimal im Jahr', aktuell: '3210a', beratungsforum: '4005a', bema: 'UPT d' },
}

export const analogNr = (a: Analog, v: Variante) => ANALOG[a][v]
/** "7080a" → "7080" */
export const referenzNr = (nr: string) => nr.replace(/a$/, '')
export const istAnalog = (nr: string) => /^\d{4}a$/.test(nr)

export const VARIANTE_NAME: Record<Variante, string> = {
  aktuell: 'BZÄK-Neubewertung 2026',
  beratungsforum: 'Beratungsforum BZÄK/PKV/Beihilfe',
}

export const PHASE_NAME: Record<Phase, string> = {
  diagnostik: 'Diagnostik und Planung',
  atg: 'Aufklärung und Mundhygiene',
  ait: 'Antiinfektiöse Therapie (AIT)',
  bev: 'Befundevaluation',
  cpt: 'Chirurgische Therapie (CPT)',
  upt: 'Unterstützende Parodontitistherapie (UPT)',
  zusatz: 'Weitere Leistungen und Material',
}

/** UPT-Sitzungen je Jahr nach dem Grad (S3-Leitlinie, wie BEMA UPT) */
export const UPT_FREQUENZ: Record<'A' | 'B' | 'C', number> = { A: 1, B: 2, C: 3 }

/** GOZ-Nummern, die zusätzlich angeboten werden (Abschnitt E und Begleitleistungen) */
export const ZUSATZ_NUMMERN = [
  '0030', '0090', '0100', '0110', '0500', '0510', '0520', '1000', '1010', '1040', '4000', '4005', '4020', '4025', '4030',
  '4040', '4050', '4055', '4060', '4070', '4075', '4080', '4090', '4100', '4110', '4120', '4130', '4133', '4136', '4138', '4150', '6190',
]

export const FRONTZAEHNE = new Set(['13', '12', '11', '21', '22', '23', '43', '42', '41', '31', '32', '33'])
/** mehrwurzelig wie im Kassen-PAR-Planer (obere Prämolaren 14/24 zweiwurzelig) */
export const MEHRWURZELIG = new Set(['18', '17', '16', '14', '24', '26', '27', '28', '48', '47', '46', '36', '37', '38'])
export const OK = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
export const UK = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']
export const ALLE_ZAEHNE = [...OK, ...UK]
