/** Export eines HKP ins PVS über den lokalen pvsConnectoR. Mapping und Schreiben macht der Connector. */

/** PVS mit fertigem HKP-Connector; die Adresse kennt nur der Server der Übersicht */
export const PVS_CONNECTOR: Record<string, string> = {
  dens: 'http://127.0.0.1:8770',
}

export interface PvsTreffer {
  id: string
  firstName?: string
  lastName?: string
  birthDate?: string
}

export interface PlanPatient {
  vorname?: string
  name?: string
  geburtsdatum?: string
}

/** „TT.MM.JJJJ“ oder ISO → „JJJJ-MM-TT“, sonst '' */
export function datumIso(s: unknown): string {
  const t = String(s ?? '').trim()
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const de = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  return de ? `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}` : ''
}

const gleich = (a: unknown, b: unknown) => {
  const n = (s: unknown) => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de')
  return n(a) === n(b)
}

/**
 * Patient im PVS zum Plan: Vor- und Nachname exakt, Geburtsdatum muss passen, wenn der Plan eins hat.
 * Ohne eindeutigen Treffer wird nichts geschrieben.
 */
export function patientWaehlen(treffer: PvsTreffer[], p: PlanPatient, pvsName: string): { id?: string; fehler?: string } {
  const wer = `${p.vorname ?? ''} ${p.name ?? ''}`.trim()
  if (!p.name?.trim() || !p.vorname?.trim()) return { fehler: 'Im Plan fehlt Vor- oder Nachname des Patienten.' }
  const namen = treffer.filter((t) => gleich(t.firstName, p.vorname) && gleich(t.lastName, p.name))
  const geb = datumIso(p.geburtsdatum)
  const passend = geb ? namen.filter((t) => datumIso(t.birthDate) === geb) : namen
  if (passend.length === 1) return { id: passend[0].id }
  if (!namen.length) return { fehler: `${wer} gibt es in ${pvsName} nicht – Schreibweise prüfen oder den Patienten dort anlegen.` }
  if (!passend.length) return { fehler: `${wer} gibt es in ${pvsName}, aber mit anderem Geburtsdatum als im Plan.` }
  return {
    fehler: geb
      ? `${wer} gibt es in ${pvsName} ${passend.length}-mal mit gleichem Geburtsdatum – bitte dort zusammenführen.`
      : `${wer} gibt es in ${pvsName} ${passend.length}-mal – im Plan das Geburtsdatum eintragen.`,
  }
}

type Obj = Record<string, unknown>
const nur = (o: unknown, felder: string[]): Obj =>
  Object.fromEntries(felder.filter((f) => (o as Obj | undefined)?.[f] !== undefined).map((f) => [f, (o as Obj)[f]]))

/**
 * HKP für den Connector: Positionen so, wie MAS sie berechnet hat (inkl. Material, Edelmetall und
 * Zusatzleistungen, Mengen nach Werkstoff) – die gespeicherten Planzeilen allein ergeben falsche Laborsummen.
 */
export function hkpFuerPvs(plan: Obj, ergebnis: Obj): string {
  const berechnet = Array.isArray(ergebnis.positionen) ? (ergebnis.positionen as Obj[]) : []
  return JSON.stringify({
    verwaltung: nur(plan.verwaltung, ['ausstellungsdatum']),
    zuschuss: plan.zuschuss,
    zaehne: plan.zaehne,
    positionen: berechnet.map((p) => nur(p, ['id', 'ebene', 'nr', 'anzahl', 'zahn', 'labor', 'eigen', 'bezeichnung'])),
    ergebnis: {
      versorgungsart: ergebnis.versorgungsart,
      summen: ergebnis.summen,
      befunde: ergebnis.befunde,
      positionen: berechnet.map((p) => nur(p, ['id', 'betrag', 'einzelpreis', 'punkte', 'punktwert', 'faktor'])),
    },
  })
}

/** Vermerk, dass ein HKP schon im PVS liegt */
export interface PvsVermerk {
  pvs: string
  patientId: string
  planNr: number
  am: string
}

export const vermerkText = (v: PvsVermerk, pvsName: string) =>
  `In ${pvsName} als Plan Nr. ${v.planNr} angelegt (${new Date(v.am).toLocaleDateString('de-DE')})`
