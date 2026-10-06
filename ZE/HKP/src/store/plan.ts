import { useEffect, useState } from 'react'
import type { HkpPlan } from '../types'
import { ALLE_ZAEHNE } from '../engine/zahnschema'
import { markeLesen } from '../engine/bruecken'

const PLAN_KEY = 'hkp.plan.v1'

export function leererPlan(): HkpPlan {
  return {
    patient: { name: '', vorname: '', geburtsdatum: '', kasse: '', kassenNr: '', versichertenNr: '', status: '', anschrift: '' },
    verwaltung: {
      lfdNr: '', eingliederungsdatum: '', herstellungsortEingliederung: '',
      antragsnummer: '', art: 'HKP', therapieschritt: '', therapieschritteGesamt: '',
      ausstellungsdatum: new Date().toISOString().slice(0, 10), herstellungsort: '',
      abrechnungsNr: '', zahnarztNr: '', antragsnummerUrspruenglich: '', aktenzeichen: '', erlaeuterung: '',
    },
    zaehne: Object.fromEntries(ALLE_ZAEHNE.map((z) => [z, { B: '', R: '', TP: '' }])),
    bemerkungen: '',
    weitere: {
      unfall: false, ser: false, immediatOK: false, immediatUK: false, interimOK: false, interimUK: false,
      unbrauchbarOK: false, unbrauchbarUK: false, alterOK: '', alterUK: '', nem: false, direktabrechnung: false,
    },
    klinisch: {
      stiftKonfektioniert: [], stiftGegossen: [], stiftAdhaesiv: [], stiftNachtraeglich: [], disparallel: [],
      metallbasisOK: false, metallbasisUK: false, stuetzstift: false, atrophieOK: false, atrophieUK: false,
    },
    reparaturen: [],
    abformung: '',
    abformungProthese: '',
    implantat: { system: 'durchschnitt', abformung: '', abutment: 'standard' },
    werkstoffe: {},
    befunde: [],
    positionen: [],
    ausgeschlossen: [],
    zuschuss: { bonus: '60', haertefall: false },
    versorgungsart: 'auto',
    fremdlabor: { name: '', auftragsnummer: '', laufendeNr: 1 },
    einstellungen: {
      bemaListe: 'auto', gozListe: 'goz-2012', belListe: 'auto', bebListe: 'beb-itz-2024', fzListe: 'auto', kzv: '',
      labor: 'gewerbe', mwstLabor: 7, gozFaktor: 2.3, honorarFaktor: 0, gozZusatzStufe: 0, gozZusatzAus: [],
      eigenKasseProzent: 100, eigenPrivatAufschlag: 0, eigenPrivatStufe: 0, eigenPrivatTp: {}, eigenPrivatAus: [], praxisPlz: '',
    },
  }
}

/** Frühere Pläne: Abformung in den Implantatangaben bzw. 'beides' (= Zähne gescannt, Überabdruck für die Prothese) */
function abformungMigrieren(p: Partial<HkpPlan>): Pick<HkpPlan, 'abformung' | 'abformungProthese'> {
  const alt = p.abformung as string | undefined
  if (alt === 'beides') return { abformung: 'scan', abformungProthese: 'abdruck' }
  return {
    abformung: p.abformung ?? (p.implantat?.abformung === 'scan' ? 'scan' : p.implantat?.abformung ? 'abdruck' : ''),
    abformungProthese: p.abformungProthese ?? '',
  }
}

/** Ergänzt fehlende Felder, z. B. nach dem Import eines älteren Plans. */
export function planNormalisieren(p: Partial<HkpPlan>): HkpPlan {
  const leer = leererPlan()
  return {
    ...leer,
    ...p,
    patient: { ...leer.patient, ...p.patient },
    verwaltung: { ...leer.verwaltung, ...p.verwaltung },
    zaehne: Object.fromEntries(ALLE_ZAEHNE.map((z) => {
      const d = { ...leer.zaehne[z], ...p.zaehne?.[z] }
      if (!d.TP.includes('-')) return [z, d]
      const m = markeLesen(d.TP)
      return [z, { ...d, TP: m.kuerzel, bAnfang: d.bAnfang || m.bAnfang, bEnde: d.bEnde || m.bEnde }]
    })),
    weitere: { ...leer.weitere, ...p.weitere },
    klinisch: { ...leer.klinisch, ...p.klinisch },
    reparaturen: p.reparaturen ?? [],
    ...abformungMigrieren(p),
    implantat: { ...leer.implantat, ...p.implantat },
    werkstoffe: { ...p.werkstoffe },
    ausgeschlossen: p.ausgeschlossen ?? [],
    zuschuss: { ...leer.zuschuss, ...p.zuschuss },
    fremdlabor: { ...leer.fremdlabor, ...p.fremdlabor },
    einstellungen: p.einstellungen && p.einstellungen.kzv === undefined
      ? listenMigrieren({ ...leer.einstellungen, ...p.einstellungen })
      : { ...leer.einstellungen, ...p.einstellungen },
  }
}

/** Frühere feste Standardlisten werden zur automatischen Auswahl (gleiches Ergebnis für Bayern 2026). */
const ALTE_STANDARDS: Partial<Record<keyof HkpPlan['einstellungen'], string>> = {
  bemaListe: 'bema-2026', belListe: 'bel2-bayern-2026', fzListe: 'fz-2026',
}
function listenMigrieren(e: HkpPlan['einstellungen']): HkpPlan['einstellungen'] {
  const neu = { ...e }
  for (const [feld, alt] of Object.entries(ALTE_STANDARDS) as [keyof typeof e, string][]) {
    if (neu[feld] === alt) (neu as Record<string, unknown>)[feld] = 'auto'
  }
  return neu
}

export function usePlan() {
  const [plan, setPlan] = useState<HkpPlan>(() => {
    try {
      const s = localStorage.getItem(PLAN_KEY)
      return s ? planNormalisieren(JSON.parse(s)) : leererPlan()
    } catch {
      return leererPlan()
    }
  })
  useEffect(() => {
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan))
  }, [plan])
  return [plan, setPlan] as const
}
