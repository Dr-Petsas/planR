/**
 * Patient im Praxisprogramm für das Lesen der abgerechneten Leistungen (MAS, /api/intern/pvs/leistungen).
 * Eigene Regel, weil die Kartei in Pickadoc und das Praxisprogramm denselben Menschen nicht gleich schreiben:
 * das Praxisprogramm führt oft einen zweiten Vornamen, und bei aus Dampsoft übernommenen Akten liegt das
 * Geburtsdatum in Pickadoc teils einen Tag zu früh. Für das Schreiben von Plänen gilt weiter patientWaehlen (pvs.ts).
 *
 *  - Nachname gleich, erster Vorname gleich (in beide Richtungen: „Anna“ passt zu „Anna Maria“ und umgekehrt).
 *  - Ohne Patientennummer: Geburtsdatum genau gleich.
 *  - Mit Patientennummer (aus der Übernahme): genau dieser Patient, Geburtsdatum gleich oder im Praxisprogramm
 *    genau einen Tag später.
 *  - Nicht genau ein Treffer: kein Ergebnis.
 */
export interface LeseTreffer { id: string; firstName?: string; lastName?: string; birthDate?: string }
export interface LesePatient { vorname?: string; name?: string; geburtsdatum?: string }

const norm = (s: unknown) => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de')
const ersterVorname = (s: unknown) => norm(s).split(' ')[0]

function iso(s: unknown): string {
  const t = String(s ?? '').trim()
  const a = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (a) return `${a[1]}-${a[2]}-${a[3]}`
  const de = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  return de ? `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}` : ''
}

function tagDanach(tag: string): string {
  const d = new Date(`${tag}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function patientFuerLesen(treffer: LeseTreffer[], p: LesePatient, pvsName: string, nummer = ''): { id?: string; fehler?: string } {
  const wer = `${p.vorname ?? ''} ${p.name ?? ''}`.trim()
  const geb = iso(p.geburtsdatum)
  if (!norm(p.name) || !norm(p.vorname)) return { fehler: 'Vor- oder Nachname des Patienten fehlt.' }
  if (!geb) return { fehler: `Ohne Geburtsdatum finde ich ${wer} in ${pvsName} nicht sicher.` }
  const nr = nummer.trim()
  const kreis = nr ? treffer.filter((t) => t.id === nr) : treffer
  if (nr && !kreis.length) return { fehler: `Die Patientennummer ${nr} gibt es in ${pvsName} nicht.` }
  const namen = kreis.filter((t) => norm(t.lastName) === norm(p.name) && ersterVorname(t.firstName) === ersterVorname(p.vorname))
  if (!namen.length) {
    return { fehler: nr ? `Unter der Patientennummer ${nr} steht in ${pvsName} ein anderer Name als ${wer}.` : `${wer} gibt es in ${pvsName} nicht – Schreibweise prüfen.` }
  }
  const spaeter = nr ? tagDanach(geb) : ''
  const passend = namen.filter((t) => iso(t.birthDate) === geb || (!!spaeter && iso(t.birthDate) === spaeter))
  if (passend.length === 1) return { id: passend[0].id }
  if (!passend.length) return { fehler: `${wer} gibt es in ${pvsName}, aber mit anderem Geburtsdatum.` }
  return { fehler: `${wer} gibt es in ${pvsName} ${passend.length}-mal mit gleichem Geburtsdatum.` }
}