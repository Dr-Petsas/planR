/**
 * Stammdatenzeile der Bridge (/patients/<nr>) → Anmeldedaten der Planer (_gemeinsam/stammdaten.ts).
 * DENS liefert Kasse, IK und Versichertennummer; DS-Win nur Name, Geburtsdatum, Anschrift und E-Mail.
 */
export interface PvsStammdaten {
  anrede: string; titel: string; vorname: string; name: string; geburtsdatum: string
  strasse: string; plz: string; ort: string; kasse: string; kassenNr: string; versichertenNr: string; email: string
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

/** „Herr Dr.“ → Anrede Herr, Titel Dr.; nur Dr./Prof.-Titel werden übernommen */
function anredeUndTitel(roh: string): { anrede: string; titel: string } {
  const anrede = /\b(Frau|Herr)\b/.exec(roh)?.[1] ?? ''
  const titel = roh.replace(/\b(Frau|Herr)\b/, '').trim()
  return { anrede, titel: /^(Prof\.|Dr\.)/.test(titel) ? titel.slice(0, 40) : '' }
}

export function stammdatenAusPvs(z: Record<string, unknown>): PvsStammdaten {
  let plz = text(z, 'postalCode')
  let ort = text(z, 'city')
  const zusammen = text(z, 'postalCodeAndCity')
  if (!plz && !ort && zusammen) {
    const m = /^(?:D-)?(\d{4,5})\s+(.+)$/.exec(zusammen)
    if (m) { plz = m[1]; ort = m[2] } else ort = zusammen
  }
  const { anrede, titel } = anredeUndTitel(`${text(z, 'salutation')} ${text(z, 'title')}`)
  const email = text(z, 'email')
  return {
    anrede,
    titel,
    vorname: text(z, 'firstName'),
    name: text(z, 'lastName'),
    geburtsdatum: isoDatum(text(z, 'birthDate')),
    strasse: text(z, 'street'),
    plz,
    ort,
    kasse: text(z, 'insurance'),
    kassenNr: /^\d{9}$/.test(text(z, 'insuranceIk')) ? text(z, 'insuranceIk') : '',
    versichertenNr: text(z, 'insuranceNumber'),
    email: /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email) ? email.slice(0, 120) : '',
  }
}
