// BEMA-Positionen Teil 4 – Systematische Behandlung von Parodontopathien.
// Bewertungszahlen (Punkte) laut BEMA-Z, Stand 01.01.2026.
// Euro = Punkte × regionaler KZV-Punktwert.

export interface BemaPos {
  nr: string
  titel: string
  punkte: number
  einheit: 'fall' | 'sitzung' | 'zahn_ein' | 'zahn_mehr' | 'zahn'
  kurz: string
}

export const BEMA_PAR: Record<string, BemaPos> = {
  '04': { nr: '04', titel: 'Erhebung Parodontaler Screening-Index (PSI)', punkte: 12, einheit: 'fall', kurz: 'PSI-Screening' },
  '4': { nr: '4', titel: 'Befundaufnahme und Erstellen eines Parodontalstatus', punkte: 44, einheit: 'fall', kurz: 'Parodontalstatus (Antrag)' },
  ATG: { nr: 'ATG', titel: 'Parodontologisches Aufklärungs- und Therapiegespräch', punkte: 28, einheit: 'fall', kurz: 'Aufklärungsgespräch' },
  MHU: { nr: 'MHU', titel: 'Patientenindividuelle Mundhygieneunterweisung', punkte: 45, einheit: 'fall', kurz: 'Mundhygieneunterweisung' },
  AITa: { nr: 'AIT a', titel: 'Antiinfektiöse Therapie je einwurzeligem Zahn', punkte: 14, einheit: 'zahn_ein', kurz: 'AIT einwurzelig' },
  AITb: { nr: 'AIT b', titel: 'Antiinfektiöse Therapie je mehrwurzeligem Zahn', punkte: 26, einheit: 'zahn_mehr', kurz: 'AIT mehrwurzelig' },
  BEVa: { nr: 'BEV a', titel: 'Befundevaluation nach AIT', punkte: 32, einheit: 'fall', kurz: 'Befundevaluation (BEVa)' },
  BEVb: { nr: 'BEV b', titel: 'Befundevaluation nach CPT', punkte: 32, einheit: 'fall', kurz: 'Befundevaluation (BEVb)' },
  CPTa: { nr: 'CPT a', titel: 'Chirurgische Therapie je einwurzeligem Zahn', punkte: 22, einheit: 'zahn_ein', kurz: 'CPT einwurzelig' },
  CPTb: { nr: 'CPT b', titel: 'Chirurgische Therapie je mehrwurzeligem Zahn', punkte: 34, einheit: 'zahn_mehr', kurz: 'CPT mehrwurzelig' },
  UPTa: { nr: 'UPT a', titel: 'Mundhygienekontrolle', punkte: 18, einheit: 'sitzung', kurz: 'UPT a Mundhygienekontrolle' },
  UPTb: { nr: 'UPT b', titel: 'Mundhygieneunterweisung (soweit erforderlich)', punkte: 24, einheit: 'sitzung', kurz: 'UPT b Mundhygieneunterweisung' },
  UPTc: { nr: 'UPT c', titel: 'Supragingivale und gingivale Reinigung aller Zähne, je Zahn', punkte: 3, einheit: 'zahn', kurz: 'UPT c Reinigung je Zahn' },
  UPTd: { nr: 'UPT d', titel: 'Messung von Sondierungstiefen und Sondierungsbluten', punkte: 15, einheit: 'sitzung', kurz: 'UPT d ST-/BOP-Messung' },
  UPTe: { nr: 'UPT e', titel: 'Subgingivale Instrumentierung je einwurzeligem Zahn (ST ≥ 4 mm + BOP bzw. ≥ 5 mm)', punkte: 5, einheit: 'zahn_ein', kurz: 'UPT e subgingival einwurzelig' },
  UPTf: { nr: 'UPT f', titel: 'Subgingivale Instrumentierung je mehrwurzeligem Zahn (ST ≥ 4 mm + BOP bzw. ≥ 5 mm)', punkte: 12, einheit: 'zahn_mehr', kurz: 'UPT f subgingival mehrwurzelig' },
  UPTg: { nr: 'UPT g', titel: 'Untersuchung des Parodontalzustands (ST, BOP, Lockerung, Furkation, Knochenabbau %/Alter)', punkte: 32, einheit: 'fall', kurz: 'UPT g Parodontal-Untersuchung' },
  '108': { nr: '108', titel: 'Einschleifen des natürlichen Gebisses zum Kauebenenausgleich, je Sitzung', punkte: 6, einheit: 'sitzung', kurz: '108 Einschleifen' },
  '111': { nr: '111', titel: 'Nachbehandlung im Rahmen der systematischen PAR-Behandlung, je Sitzung', punkte: 10, einheit: 'sitzung', kurz: '111 PAR-Nachbehandlung' },
}
