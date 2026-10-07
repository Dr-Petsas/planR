import { useEffect, useState } from 'react'
import { ALLE_ZAEHNE } from './engine/zahnschema'
import type {
  Befund, BefundPhase, Einstellungen, ParFall, Planung, Termin, ZahnBefund, Zusatzformulare,
} from './types'

const K_FALL = 'kassen-par.fall.v2'
const K_EINST = 'kassen-par.einstellungen.v2'
// Alt-Schluessel (v1) zur einmaligen Uebernahme
const K_FALL_ALT = 'kassen-par.plan.v1'

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  praxis: {
    name: 'Zahnarztpraxis',
    strasse: '',
    plz: '',
    ort: '',
    telefon: '',
    zahnarztNr: '',
    abrechnungsNr: '',
    behandler: '',
  },
  kzvNr: '',
  bemaPunktwertOverride: null,
  kchPunktwertOverride: null,
  gozFaktor: 2.3,
  roentgenFaktor: 1.8,
  analogPunkte: {},
  naechsteNummer: 1,
}

export const STANDARD_PLANUNG: Planung = {
  start: '',
  genehmigungTage: 21,
  mitPzr: false,
  aitSitzungen: 2,
  aitAbstandTage: 7,
  cptSitzungen: 2,
  einstieg: 'komplett',
  uptAb: 1,
  uptStart: '',
  verlaengerungMonate: 0,
  par22a: false,
  werktage: 5,
}

export const STANDARD_ZUSATZ: Zusatzformulare = {
  wechselText: '',
  wechselAntragsnummerVorher: '',
  wechselIkVorher: '',
  vorherLeistungen: { '4': 0, ATG: 0, MHU: 0, AITa: 0, AITb: 0, BEVa: 0 },
  vorherLetzteUpt: 0,
  verlaengerungUeber6: false,
  verlaengerungMonateGesamt: 6,
  verlaengerungBegruendung: '',
  par22aMundhygiene: false,
  par22aKooperation: false,
  par22aNarkoseGeschlossen: false,
  par22aNarkoseOffen: false,
  mitteilungsnummer: '',
  cptUeberweisung: false,
}

export function heute(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function id(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function leererZahnBefund(): ZahnBefund {
  return {
    zs: 0,
    st: [null, null, null, null, null, null],
    bop: [false, false, false, false, false, false],
    lockerung: 0,
    fb: 0,
    aitOverride: null,
  }
}

export function leererBefund(
  phase: BefundPhase = 'initial',
  bezeichnung = 'Initialbefund',
  datum = heute(),
): Befund {
  const zaehne: Record<string, ZahnBefund> = {}
  for (const z of ALLE_ZAEHNE) zaehne[z] = leererZahnBefund()
  return { id: id(), phase, datum, bezeichnung, zaehne }
}

export function nummerFormat(n: number): string {
  const jahr = new Date().getFullYear()
  return `PAR-${jahr}-${String(n).padStart(3, '0')}`
}

export function neuerFall(nummer: number): ParFall {
  return {
    nummer: nummerFormat(nummer),
    datum: heute(),
    patient: {
      name: '', vorname: '', geburtsdatum: '', kasse: '', versichertennr: '',
      kostentraegerkennung: '', kassennummer: '', kassenart: 'primaer',
    },
    antrag: {
      antragsnummer: '', antragsnummerUrspruenglich: '', verarbeitungskennzeichen: '',
      artBehandlungsplan: 'initial', wechselkennzeichen: '', aktenzeichenPVS: '',
      logVersion: '2.1.0',
    },
    anamnese: {
      diabetesMellitus: false, tabakkonsum: false, sonstiges: '',
      fruehereParTherapie: false, fruehereParJahr: '',
    },
    diagnose: {
      alter: 0, knochenabbauProzent: 0, knochenabbauZahn: '', calMax: 0,
      zahnverlustPar: 0, raucher: 'nein', diabetes: 'nein', st6plus: false,
      vertikalerKA3: false, furkationII_III: false, komplexeReha: false, mipMuster: false,
      diagnoseTyp: 'parodontitis',
    },
    befunde: [leererBefund()],
    termine: [],
    planung: { ...STANDARD_PLANUNG, start: heute() },
    modus: 'bemaplus',
    zielGesamt: 0,
    mitCPT: false,
    uebernahmefall: false,
    kkEntscheidung: 'offen',
    gutachten: 'offen',
    zusatz: { ...STANDARD_ZUSATZ, vorherLeistungen: { ...STANDARD_ZUSATZ.vorherLeistungen } },
    bemerkung: '',
  }
}

function fixTermin(t: Partial<Termin>): Termin {
  return {
    id: t.id ?? id(),
    schluessel: t.schluessel ?? '',
    art: t.art ?? 'kontrolle',
    titel: t.titel ?? '',
    datum: t.datum ?? '',
    datumManuell: t.datumManuell ?? false,
    erbracht: t.erbracht ?? false,
    zaehne: Array.isArray(t.zaehne) ? t.zaehne : null,
    module: t.module ?? [],
    verlaengerung: t.verlaengerung ?? false,
    auswahl: t.auswahl ?? [],
    abgewaehlt: t.abgewaehlt ?? [],
    auto: t.auto ?? [],
    mengen: t.mengen ?? {},
    faktoren: t.faktoren ?? {},
    roentgen: t.roentgen ?? '',
    bemerkung: t.bemerkung ?? '',
  }
}

function lade(key: string): unknown {
  try {
    const roh = localStorage.getItem(key)
    return roh ? JSON.parse(roh) : null
  } catch {
    return null
  }
}

function fixBefund(b: Partial<Befund> | undefined, vorgabe: Befund): Befund {
  if (!b) return vorgabe
  const zaehne: Record<string, ZahnBefund> = {}
  for (const z of ALLE_ZAEHNE) {
    const alt = b.zaehne?.[z]
    zaehne[z] = alt ? { ...leererZahnBefund(), ...alt } : leererZahnBefund()
  }
  return {
    id: b.id ?? id(),
    phase: b.phase ?? vorgabe.phase,
    datum: b.datum ?? vorgabe.datum,
    bezeichnung: b.bezeichnung ?? vorgabe.bezeichnung,
    zaehne,
  }
}

/** Fehlende Felder nach einem Schema-Update ergaenzen. */
export function fallMigrieren(roh: unknown): ParFall {
  const v = neuerFall(1)
  const p = (roh ?? {}) as Partial<ParFall> & { befunde?: unknown }
  // v1 hatte befunde als Objekt {initial, beva, bevb}
  let befunde: Befund[]
  if (Array.isArray(p.befunde)) {
    befunde = p.befunde.map((b, i) => fixBefund(b as Partial<Befund>, leererBefund(
      i === 0 ? 'initial' : 'beva', i === 0 ? 'Initialbefund' : 'Befund',
    )))
  } else if (p.befunde && typeof p.befunde === 'object') {
    const alt = p.befunde as Record<string, Partial<Befund>>
    befunde = []
    if (alt.initial) befunde.push(fixBefund(alt.initial, leererBefund('initial', 'Initialbefund')))
    if (alt.beva) befunde.push(fixBefund(alt.beva, leererBefund('beva', 'BEV a')))
    if (alt.bevb) befunde.push(fixBefund(alt.bevb, leererBefund('bevb', 'BEV b')))
    if (befunde.length === 0) befunde = [leererBefund()]
  } else {
    befunde = [leererBefund()]
  }
  return {
    ...v,
    ...p,
    patient: { ...v.patient, ...p.patient },
    antrag: { ...v.antrag, ...p.antrag },
    anamnese: { ...v.anamnese, ...p.anamnese },
    diagnose: { ...v.diagnose, ...p.diagnose },
    befunde,
    termine: Array.isArray(p.termine) ? p.termine.map(fixTermin) : [],
    planung: { ...v.planung, ...p.planung },
    modus: p.modus ?? v.modus,
    zielGesamt: p.zielGesamt ?? 0,
    zusatz: {
      ...v.zusatz, ...p.zusatz,
      vorherLeistungen: { ...v.zusatz.vorherLeistungen, ...p.zusatz?.vorherLeistungen },
    },
  }
}

export function einstMigrieren(roh: unknown): Einstellungen {
  const e = (roh ?? {}) as Partial<Einstellungen> & { bemaPunktwert?: number }
  return {
    ...STANDARD_EINSTELLUNGEN,
    ...e,
    praxis: { ...STANDARD_EINSTELLUNGEN.praxis, ...e.praxis },
    bemaPunktwertOverride: e.bemaPunktwertOverride ?? null,
    kchPunktwertOverride: e.kchPunktwertOverride ?? null,
    analogPunkte: { ...e.analogPunkte },
  }
}

export function useFall() {
  const [fall, setFall] = useState<ParFall>(() => {
    const g = lade(K_FALL) ?? lade(K_FALL_ALT)
    return g ? fallMigrieren(g) : neuerFall(1)
  })
  useEffect(() => {
    localStorage.setItem(K_FALL, JSON.stringify(fall))
  }, [fall])
  return [fall, setFall] as const
}

export function useEinstellungen() {
  const [einst, setEinst] = useState<Einstellungen>(() => {
    const g = lade(K_EINST)
    return g ? einstMigrieren(g) : STANDARD_EINSTELLUNGEN
  })
  useEffect(() => {
    localStorage.setItem(K_EINST, JSON.stringify(einst))
  }, [einst])
  return [einst, setEinst] as const
}
