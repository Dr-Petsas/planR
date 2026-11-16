/** Demodaten für einen Probe-Account: eine Patientin, damit die Übersicht nicht leer ist. */

export const PROBE_PASSWORT = '12345678'

export function demoImplantat(praxis: string) {
  const nummer = 'IMPL-2026-A001'
  const geaendert = new Date().toISOString()
  const plan = {
    nummer,
    datum: geaendert.slice(0, 10),
    patient: {
      anrede: 'Frau', titel: '', vorname: 'Anna', name: 'Berger', geburtsdatum: '1970-03-02',
      strasse: 'Musterstraße 1', plz: '40235', ort: 'Düsseldorf',
      kasse: '', kassenNr: '', versichertenNr: '', status: '', kassenart: 'primaer', email: '',
    },
    zaehne: { '14': { B: 'x', TP: '' }, '15': { B: 'x', TP: 'B' }, '16': { B: 'x', TP: '' }, '26': { B: 'ww', TP: 'K' } },
    implantate: {},
    regionen: {},
    global: { bildgebung: 'dvt', navigation: false, sedierung: 'lokal', risiko: false, blut: 'keine', roehrchen: 0, eigenesBlutlabor: true },
    manuell: [],
    anpassungen: {},
    entfernt: [],
    regler: { begleitStufe: 1, analogStufe: 1, analogBewertung: 1, gozFaktor: 0, goaeFaktor: 0, materialKlasse: 1, schabloneStufe: 0, laborAufschlag: 0, aus: [] },
    bemerkung: `Demodaten${praxis ? ` für ${praxis}` : ''}`,
  }
  return {
    karte: { modul: 'privat-impl', kuerzel: 'IMPL', art: 'Privat' as const, nummer, patient: 'Anna Berger', betrag: 0, status: 'entwurf', geaendert },
    plan,
  }
}
