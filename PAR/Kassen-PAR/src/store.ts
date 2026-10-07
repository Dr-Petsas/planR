import { useEffect, useState } from 'react'
import { ALLE_ZAEHNE } from './engine/zahnschema'
import { useAblage } from './ablage'
import { mk } from './mandant'
import { leererPatient, patientMigrieren, praxisMigrieren, standardPraxis } from './stammdaten'
import type {
  Anamnese, Befund, BefundPhase, Einstellungen, ParFall, Planung, Termin, ZahnBefund, Zusatzformulare,
} from './types'

const K_FALL = mk('kassen-par.fall.v2')
const K_EINST = mk('kassen-par.einstellungen.v2')
const K_LISTE = mk('kassen-par.liste.v1')
// Alt-Schluessel (v1) zur einmaligen Uebernahme
const K_FALL_ALT = mk('kassen-par.plan.v1')

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  praxis: standardPraxis(),
  punktwertFest: {},
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
  werte: {},
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
    st: [null, null],
    bop: [false, false],
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
    patient: leererPatient(),
    antrag: {
      antragsnummer: '', antragsnummerUrspruenglich: '', verarbeitungskennzeichen: '',
      artBehandlungsplan: 'initial', wechselkennzeichen: '', aktenzeichenPVS: '',
      logVersion: '2.1.0',
    },
    anamnese: {
      diabetesMellitus: false, tabakkonsum: false, sonstigesAn: false, sonstiges: '', sonstigesFortsetzung: '',
      fruehereParTherapie: false, fruehereParJahr: '',
    },
    diagnose: {
      alter: 0, knochenabbauProzent: 0, knochenabbauZahn: '', calMax: 0,
      zahnverlustPar: 0, raucher: 'nein', diabetes: 'nein', st6plus: false,
      vertikalerKA3: false, furkationII_III: false, komplexeReha: false, mipMuster: false,
      diagnoseTyp: 'parodontitis',
      stadiumManuell: null, gradManuell: null, ausmassManuell: null, kaIndexManuell: null, st5horizontal: null,
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
    zusatz: { ...STANDARD_ZUSATZ, vorherLeistungen: { ...STANDARD_ZUSATZ.vorherLeistungen }, werte: {} },
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

/**
 * Alte Befunde mit 6 Messstellen [mb, b, db, mo, o, do] auf mesial/distal
 * zusammenlegen: je Seite der tiefere Wert; ein tieferer Wert der Mittelstellen
 * geht an die flachere Seite, damit Diagnose und AIT-Zaehne gleich bleiben.
 */
export function zweiMessstellen(z: ZahnBefund): ZahnBefund {
  if (z.st.length === 2 && z.bop.length === 2) return z
  const max = (...w: (number | null | undefined)[]) => {
    const n = w.filter((x): x is number => x != null)
    return n.length ? Math.max(...n) : null
  }
  const [mb, b, db, mo, o, dd] = z.st
  const st: (number | null)[] = [max(mb, mo), max(db, dd)]
  const bop = [!!(z.bop[0] || z.bop[3]), !!(z.bop[2] || z.bop[5])]
  const mitte = max(b, o)
  if (mitte != null && mitte > (max(st[0], st[1]) ?? -1)) {
    const i = (st[0] ?? -1) <= (st[1] ?? -1) ? 0 : 1
    st[i] = mitte
    bop[i] = bop[i] || !!(z.bop[1] || z.bop[4])
  }
  return { ...z, st, bop }
}

/** Vor dem Sonstiges-Kreuz stand der ganze Freitext in `sonstiges`: er ist die Fortsetzung. */
function anamneseMigrieren(a: Anamnese, alt: Partial<Anamnese> | undefined): Anamnese {
  if (!alt || alt.sonstigesAn != null) return a
  return { ...a, sonstigesAn: !!alt.sonstiges?.trim(), sonstiges: '', sonstigesFortsetzung: alt.sonstiges ?? '' }
}

function fixBefund(b: Partial<Befund> | undefined, vorgabe: Befund): Befund {
  if (!b) return vorgabe
  const zaehne: Record<string, ZahnBefund> = {}
  for (const z of ALLE_ZAEHNE) {
    const alt = b.zaehne?.[z]
    zaehne[z] = alt ? zweiMessstellen({ ...leererZahnBefund(), ...alt }) : leererZahnBefund()
  }
  return {
    id: b.id ?? id(),
    phase: b.phase ?? vorgabe.phase,
    datum: b.datum ?? vorgabe.datum,
    bezeichnung: b.bezeichnung ?? vorgabe.bezeichnung,
    zaehne,
  }
}

const hatMesswerte = (b: Befund) => Object.values(b.zaehne).some((z) => z.st.some((w) => w != null))

/**
 * Je Phase nur EIN Befund (UPT: einer je Datum). Bleibt der erste mit
 * Messwerten, sonst der erste; mehrfach angeklickte leere Kopien fallen weg.
 */
export function befundeBereinigen(befunde: Befund[]): Befund[] {
  const gewaehlt = new Map<string, Befund>()
  for (const b of befunde) {
    const k = b.phase === 'upt' ? `upt:${b.datum}` : b.phase
    const da = gewaehlt.get(k)
    if (!da || (!hatMesswerte(da) && hatMesswerte(b))) gewaehlt.set(k, b)
  }
  const behalten = new Set(gewaehlt.values())
  return befunde.filter((b) => behalten.has(b))
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
    patient: patientMigrieren(p.patient),
    antrag: { ...v.antrag, ...p.antrag },
    anamnese: anamneseMigrieren({ ...v.anamnese, ...p.anamnese }, p.anamnese),
    diagnose: { ...v.diagnose, ...p.diagnose },
    befunde: befundeBereinigen(befunde),
    termine: Array.isArray(p.termine) ? p.termine.map(fixTermin) : [],
    planung: { ...v.planung, ...p.planung },
    modus: p.modus ?? v.modus,
    zielGesamt: p.zielGesamt ?? 0,
    zusatz: {
      ...v.zusatz, ...p.zusatz,
      vorherLeistungen: { ...v.zusatz.vorherLeistungen, ...p.zusatz?.vorherLeistungen },
      werte: { ...p.zusatz?.werte },
    },
  }
}

export function einstMigrieren(roh: unknown): Einstellungen {
  // kzvNr / bemaPunktwertOverride / kchPunktwertOverride: Stand vor den einheitlichen Anmeldedaten
  const { kzvNr, bemaPunktwertOverride, kchPunktwertOverride, bemaPunktwert: _alt, ...e } = (roh ?? {}) as Partial<Einstellungen> & {
    bemaPunktwert?: number; kzvNr?: string; bemaPunktwertOverride?: number | null; kchPunktwertOverride?: number | null
  }
  void _alt
  return {
    ...STANDARD_EINSTELLUNGEN,
    ...e,
    praxis: praxisMigrieren(e.praxis, kzvNr),
    punktwertFest: e.punktwertFest ?? {
      ...(bemaPunktwertOverride ? { PAR: bemaPunktwertOverride } : {}),
      ...(kchPunktwertOverride ? { KCH: kchPunktwertOverride } : {}),
    },
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

export const useParAblage = () => useAblage<ParFall>(K_LISTE)

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
