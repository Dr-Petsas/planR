/**
 * Stammdatenzeile der Bridge (/patients/<nr>) → Anmeldedaten der Planer (_gemeinsam/stammdaten.ts).
 * DENS liefert Kasse, IK und Versichertennummer; DS-Win nur Name, Geburtsdatum und Anschrift.
 */
export interface PvsStammdaten {
  anrede: string; vorname: string; name: string; geburtsdatum: string
  strasse: string; plz: string; ort: string; kasse: string; kassenNr: string; versichertenNr: string
}

const text = (z: Record<string, unknown>, k: string) => (typeof z[k] === 'string' ? (z[k] as string).trim() : '')

/** JJJJ-MM-TT aus JJJJ-MM-TT, TT.MM.JJJJ oder JJJJMMTT; sonst leer */
export function isoDatum(roh: string): string {
  const s = roh.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}

export function stammdatenAusPvs(z: Record<string, unknown>): PvsStammdaten {
  let plz = text(z, 'postalCode')
  let ort = text(z, 'city')
  const zusammen = text(z, 'postalCodeAndCity')
  if (!plz && !ort && zusammen) {
    const m = /^(?:D-)?(\d{4,5})\s+(.+)$/.exec(zusammen)
    if (m) { plz = m[1]; ort = m[2] } else ort = zusammen
  }
  const titel = text(z, 'title') || text(z, 'salutation')
  return {
    anrede: titel === 'Frau' || titel === 'Herr' ? titel : '',
    vorname: text(z, 'firstName'),
    name: text(z, 'lastName'),
    geburtsdatum: isoDatum(text(z, 'birthDate')),
    strasse: text(z, 'street'),
    plz,
    ort,
    kasse: text(z, 'insurance'),
    kassenNr: /^\d{9}$/.test(text(z, 'insuranceIk')) ? text(z, 'insuranceIk') : '',
    versichertenNr: text(z, 'insuranceNumber'),
  }
}
