import type { Abformung, HkpPlan, ImplantatAngaben, Position, ZahnZeilen } from '../types'
import { GEGENUEBER } from './implantat'
import { bereich } from './zusatzleistungen'
import { OBERKIEFER, UNTERKIEFER, kieferVon } from './zahnschema'
import { DIGITAL } from './digital'
import { kronenEinheiten } from './material'

/** BEB-Positionen des digitalen Ablaufs nach Intraoralscan (Standardpositionen jeder BEB-Liste) */
export const DIGITAL_BEB = {
  oralscan: '0007', praepFreilegen: '0013', druckstumpf: '0017', sintern: '0032',
  auftragsdaten: '0901', registrierung: '0902', segmentierung: '0903', segment: '0904', praepgrenze: '0905',
  glanzbrand: '0906', krone: '0907', glied: '0908', kauflaeche: '0909', verbinder: '0910', nacharbeiten: '0911',
} as const

/** Erste Abformung: präparierte Zähne bzw. Primärkronen und Implantate */
export const ABFORMUNG_ARTEN: { id: Exclude<Abformung, ''>; titel: string; text: string }[] = [
  {
    id: 'scan', titel: 'Intraoralscan',
    text: 'GOZ 0065 je Kieferhälfte/Frontzahnbereich (präparierte Bereiche und Gegenkiefer, zahnloser Kiefer ganz), gedruckte Modelle (BEB 0009) statt Gips-, Säge- und Situationsmodell, digitaler Laborablauf (Präp freilegen, Druckstumpf, CAD-Konstruktion, Sintern). Privatleistung – die Versorgung wird gleichartig.',
  },
  {
    id: 'abdruck', titel: 'Abdruck (konventionell)',
    text: 'Abformung ist in den Kronen-/Brückenleistungen enthalten, Gips- und Sägemodelle nach BEL bzw. BEB.',
  },
]

/** Zweite Abformung bei Kombinations-/Prothesenarbeiten: der herausnehmbare Teil, z. B. über die eingesetzten Primärkronen */
export const PROTHESE_ARTEN: { id: Exclude<Abformung, ''>; titel: string; text: string }[] = [
  {
    id: 'scan', titel: 'Intraoralscan',
    text: 'Zweiter Scan des ganzen Kiefers für den herausnehmbaren Teil: GOZ 0065 für alle drei Bereiche des Kiefers, gedrucktes Modell (BEB 0009).',
  },
  {
    id: 'abdruck', titel: 'Abdruck (Überabdruck)',
    text: 'Überabdruck mit individuellem Löffel (BEMA 98a/BEL 0211 bzw. GOZ 5170/BEB 1006), Meistermodell aus Gips.',
  },
]

export const LOEFFEL: { id: 'offen' | 'geschlossen'; titel: string }[] = [
  { id: 'geschlossen', titel: 'geschlossener Löffel' },
  { id: 'offen', titel: 'offener Löffel (individuell, GOZ 5170)' },
]

/** Abformart für die Implantatkronen aus der Planwahl (ältere Pläne: Angabe aus den Implantatfeldern) */
export function implantatAbformung(plan: Pick<HkpPlan, 'implantat'> & Partial<Pick<HkpPlan, 'abformung'>>): ImplantatAngaben['abformung'] {
  if (plan.abformung === 'scan') return 'scan'
  if (plan.abformung === 'abdruck') return plan.implantat.abformung === 'offen' ? 'offen' : 'geschlossen'
  return plan.implantat.abformung
}

let zaehler = 0
const pos = (ebene: Position['ebene'], nr: string, zahn: string, extra: Partial<Position> = {}): Position =>
  ({ id: `abf-${Date.now().toString(36)}-${(zaehler++).toString(36)}`, ebene, nr, zahn, anzahl: 1, auto: true, ...extra })

const KRONE = (p: Position) => /^\d\d$/.test(p.zahn) &&
  ((p.ebene === 'BEMA' && /^(20[abc]|91[abcd])$/.test(p.nr)) || (p.ebene === 'GOZ' && /^(22[012]0|50[0-4]0)$/.test(p.nr)))
/** Gips-Arbeitsmodell (Sägemodell) und Gegenkiefermodell des festsitzenden Zahnersatzes */
const GIPSMODELL = (p: Position) =>
  ((p.ebene === 'BEL' && p.nr === '0051') || (p.ebene === 'BEB' && p.nr === '0021')) ||
  (p.zahn === '' && ((p.ebene === 'BEL' && p.nr === '0010') || (p.ebene === 'BEB' && p.nr === '0002')))

/** Herausnehmbarer Zahnersatz je Kiefer (Prothese, Kombinationsversorgung) */
const PROTHESE = (p: Position) => (p.zahn === 'OK' || p.zahn === 'UK') &&
  ((p.ebene === 'BEMA' && /^(9[67][abcd]|98[b-h])$/.test(p.nr)) || (p.ebene === 'GOZ' && /^(5180|5190|52[0-3]0)$/.test(p.nr)))
/** Funktionsabformung mit individuellem Löffel ist schon enthalten (zahnloser Kiefer) */
const FUNKTIONSABFORMUNG = (p: Position) => (p.ebene === 'BEMA' && /^98[bc]$/.test(p.nr)) || (p.ebene === 'GOZ' && /^(5180|5190)$/.test(p.nr))

const KIEFER_BEREICHE = { OK: ['OK rechts', 'OK-Front', 'OK links'], UK: ['UK rechts', 'UK-Front', 'UK links'] } as const

/**
 * Zweite Abformung für den herausnehmbaren Teil (z. B. über die eingesetzten Primärkronen):
 * Scan → GOZ 0065 für die drei Bereiche des Kiefers und gedrucktes Modell;
 * Abdruck → individueller Löffel (BEMA 98a/BEL 0211 bei Kassenprothese, sonst GOZ 5170/BEB 1006).
 * Kiefer mit Funktionsabformung (zahnlos, BEMA 98b/c bzw. GOZ 5180/5190) bekommen keine zweite Abformung (Scan dort: zahnlosScannen).
 */
function protheseAbformen(positionen: Position[], art: Abformung, erste: Abformung): { positionen: Position[]; hinweise: string[] } {
  const kiefer = (['OK', 'UK'] as const).filter((k) => positionen.some((p) => p.zahn === k && PROTHESE(p)))
  if (!kiefer.length) return { positionen, hinweise: [] }
  if (!art) {
    const offen = kiefer.filter((k) => !positionen.some((p) => p.zahn === k && FUNKTIONSABFORMUNG(p)))
    return {
      positionen,
      hinweise: erste === 'scan' && offen.length
        ? [`Herausnehmbarer Teil ${offen.join(', ')}: zweite Abformung (Scan oder Überabdruck) noch offen.`]
        : [],
    }
  }
  const neu: Position[] = []
  const funktion: string[] = []
  const bearbeitet: string[] = []
  for (const k of kiefer) {
    const imKiefer = positionen.filter((p) => p.zahn === k)
    if (imKiefer.some(FUNKTIONSABFORMUNG)) { funktion.push(k); continue }
    bearbeitet.push(k)
    if (art === 'scan') {
      neu.push(...KIEFER_BEREICHE[k].map((b) => pos('GOZ', '0065', b, { text: `Optisch-elektronische Abformung ${k} für den herausnehmbaren Teil` })))
      neu.push(pos('BEB', '0009', k, { text: `Modell aus Kunststoff ${k} (herausnehmbarer Teil)` }))
      continue
    }
    const kasse = imKiefer.some((p) => p.ebene === 'BEMA' && PROTHESE(p))
    const [honorar, labor] = kasse ? [pos('BEMA', '98a', k), pos('BEL', '0211', k)] : [pos('GOZ', '5170', k), pos('BEB', '1006', k)]
    const laborVon = imKiefer.find((p) => p.ebene === labor.ebene && p.labor)?.labor
    if (!imKiefer.some((p) => p.ebene === honorar.ebene && p.nr === honorar.nr)) neu.push(honorar)
    if (!imKiefer.some((p) => p.ebene === labor.ebene && p.nr === labor.nr)) neu.push(laborVon ? { ...labor, labor: laborVon } : labor)
  }
  const hinweise: string[] = []
  if (bearbeitet.length)
    hinweise.push(art === 'scan'
      ? `Herausnehmbarer Teil ${bearbeitet.join(', ')}: zweiter Intraoralscan – GOZ 0065 je Bereich des Kiefers und gedrucktes Modell (BEB 0009); Gipsmodelle der Prothese ggf. streichen.`
      : `Herausnehmbarer Teil ${bearbeitet.join(', ')}: Überabdruck mit individuellem Löffel${neu.length ? ` (${neu.map((p) => `${p.ebene} ${p.nr}`).join(', ')})` : ''}, Meistermodell aus Gips.`)
  if (funktion.length && art !== 'scan')
    hinweise.push(`${funktion.join(', ')}: Funktionsabformung mit individuellem Löffel ist schon enthalten – bleibt konventionell.`)
  return { positionen: [...positionen, ...neu], hinweise }
}

/** Situationsmodell eines Prothesenkiefers: BEL 0010 bzw. BEB 0002 mit Kieferangabe */
const SITUATIONSMODELL = (k: string) => (p: Position) =>
  p.zahn === k && ((p.ebene === 'BEL' && p.nr === '0010') || (p.ebene === 'BEB' && p.nr === '0002'))

/**
 * Zahnloser Kiefer (Funktionsabformung, BEMA 98b/c bzw. GOZ 5180/5190) mit Intraoralscan (Chef 09.10.2026):
 * der Scan ersetzt die anatomische Erstabformung – GOZ 0065 für die drei Bereiche des Kiefers und ein
 * gedrucktes Modell (BEB 0009) statt des Situationsmodells. Individueller Löffel und Funktionsabformung bleiben.
 */
function zahnlosScannen(positionen: Position[]): { positionen: Position[]; hinweise: string[] } {
  const kiefer = (['OK', 'UK'] as const).filter((k) => positionen.some((p) => p.zahn === k && PROTHESE(p) && FUNKTIONSABFORMUNG(p)))
  if (!kiefer.length) return { positionen, hinweise: [] }
  let out = positionen
  const neu: Position[] = []
  for (const k of kiefer) {
    const gescannt = new Set(out.filter((p) => p.ebene === 'GOZ' && p.nr === '0065').map((p) => p.zahn))
    neu.push(...KIEFER_BEREICHE[k].filter((b) => !gescannt.has(b))
      .map((b) => pos('GOZ', '0065', b, { text: `Optisch-elektronische Abformung ${k} (zahnloser Kiefer)` })))
    if (out.some((p) => p.ebene === 'BEB' && p.nr === '0009' && p.zahn === k)) continue
    const modell = out.find(SITUATIONSMODELL(k))
    if (modell) out = out.flatMap((p) => (p !== modell ? [p] : (p.anzahl ?? 1) > 1 ? [{ ...p, anzahl: (p.anzahl ?? 1) - 1 }] : []))
    neu.push(pos('BEB', '0009', k, { text: `Modell aus Kunststoff ${k} (gedruckt)`, ...(modell?.labor ? { labor: modell.labor } : {}) }))
  }
  return {
    positionen: [...out, ...neu],
    hinweise: [`${kiefer.join(', ')} zahnlos: Intraoralscan statt anatomischer Erstabformung – GOZ 0065 je Bereich des Kiefers, gedrucktes Modell (BEB 0009) statt Situationsmodell; individueller Löffel und Funktionsabformung bleiben.`],
  }
}

/**
 * Erste Abformung (präparierte Zähne): Scan → GOZ 0065 je Bereich (mit Gegenkiefer) und gedruckte Modelle
 * statt Gipsmodellen; der Abdruck ändert nichts. Implantatkronen regelt implantatPositionen.
 * Danach die zweite Abformung für den herausnehmbaren Teil.
 */
export function abformungAnwenden(
  positionen: Position[], zaehne: Record<string, ZahnZeilen>, abformung: Abformung, prothese: Abformung = '', eigenlabor = false,
): { positionen: Position[]; hinweise: string[] } {
  const erste = abformung === 'scan' ? scanAnwenden(positionen, zaehne) : { positionen, hinweise: [] }
  const digital = abformung === 'scan' ? digitalerWorkflow(erste.positionen, zaehne, eigenlabor) : { positionen: erste.positionen, hinweise: [] }
  const zweite = protheseAbformen(digital.positionen, prothese, abformung)
  const zahnlos = abformung === 'scan' || prothese === 'scan' ? zahnlosScannen(zweite.positionen) : { positionen: zweite.positionen, hinweise: [] }
  return { positionen: zahnlos.positionen, hinweise: [...erste.hinweise, ...digital.hinweise, ...zweite.hinweise, ...zahnlos.hinweise] }
}

const istImplantat = (zaehne: Record<string, ZahnZeilen>, z: string) => /^S/i.test((zaehne[z]?.TP.trim() || zaehne[z]?.R || '').toUpperCase())
/** Mittelwertartikulator des festsitzenden Zahnersatzes (BEL 0120 bzw. BEB 0402 ohne Kieferangabe) */
const ARTIKULATOR = (p: Position) => p.zahn === '' && ((p.ebene === 'BEL' && p.nr === '0120') || (p.ebene === 'BEB' && p.nr === '0402'))
const VERBLENDUNG = (p: Position) => (p.ebene === 'BEL' && /^16\d\d$/.test(p.nr)) || (p.ebene === 'BEB' && /^26[0-9]{2}$/.test(p.nr))

const INLAY = (p: Position) => p.ebene === 'BEB' && /^(230[1-4]|255[1-9]|2560)$/.test(p.nr) && /^\d\d$/.test(p.zahn)
const KERAMIK_INLAY = /^(255[1-9]|2560)$/

/** Verbinder je Brücke: zwischen den Gliedern und zu jedem Anker daneben */
function verbinder(glieder: string[], anker: Set<string>): { zahn: string; anzahl: number }[] {
  const out: { zahn: string; anzahl: number }[] = []
  for (const reihe of [OBERKIEFER, UNTERKIEFER]) {
    let lauf: number[] = []
    const ende = () => {
      if (!lauf.length) return
      const a = lauf[0]
      const b = lauf[lauf.length - 1]
      const links = anker.has(reihe[a - 1] ?? '')
      const rechts = anker.has(reihe[b + 1] ?? '')
      const n = lauf.length - 1 + Number(links) + Number(rechts)
      if (n > 0) out.push({ zahn: `${reihe[links ? a - 1 : a]}-${reihe[rechts ? b + 1 : b]}`, anzahl: n })
      lauf = []
    }
    reihe.forEach((z, i) => (glieder.includes(z) ? lauf.push(i) : ende()))
    ende()
  }
  return out
}

/**
 * Digitaler Ablauf im Labor nach Intraoralscan (Eigen- und Fremdlabor, BEB): je Auftrag Oralscan aufbereiten,
 * CAD-Auftragsdaten und optisch digitale Registrierung statt Mittelwertartikulator; je Arbeitskiefer
 * Modellsegmentierung; je präpariertem Zahn Präp freilegen, Druckstumpf, Segment und Präpgrenze; CAD-Konstruktion
 * je Krone, Kaufläche (Teilkrone/Inlay) bzw. Brückenglied mit Verbindern und CAM-Nacharbeit je Element;
 * je Keramikeinheit Sintern (nur Zirkon, siehe kronenmaterial) und Glanz-/Kristallisationsbrand.
 * Steckartikulator (BEB 0401) nur, wenn von Hand verblendet wird; Scanbody-Matching nur im Eigenlabor.
 */
function digitalerWorkflow(positionen: Position[], zaehne: Record<string, ZahnZeilen>, eigenlabor: boolean): { positionen: Position[]; hinweise: string[] } {
  const zahnLabor = positionen.filter((p) => (p.ebene === 'BEL' || p.ebene === 'BEB') && /^\d\d$/.test(p.zahn))
  const einheiten = kronenEinheiten(zahnLabor).filter((e) => e.einheit !== 'sekundaerteleskop' && e.einheit !== 'veneer')
  const einheit = new Map(einheiten.map((e) => [e.zahn, e]))
  const stuempfe = [...new Set(positionen.filter(KRONE).map((p) => p.zahn))].filter((z) => !istImplantat(zaehne, z)).sort()
  const inlays = [...new Set(positionen.filter(INLAY).map((p) => p.zahn))].filter((z) => !einheit.has(z)).sort()
  const implantate = [...new Set(positionen.filter((p) => p.ebene === 'BEB' && p.nr === '0224').map((p) => p.zahn))]
  const kronen = [...new Set([
    ...einheiten.filter((e) => e.einheit !== 'glied' && e.einheit !== 'teilkrone').map((e) => e.zahn),
    ...stuempfe.filter((z) => !einheit.has(z) && !inlays.includes(z)),
  ])]
  const kauflaechen = [...einheiten.filter((e) => e.einheit === 'teilkrone').map((e) => e.zahn), ...inlays]
  const glieder = einheiten.filter((e) => e.einheit === 'glied').map((e) => e.zahn)
  const keramik = [
    ...einheiten.filter((e) => e.art === 'keramik').map((e) => e.zahn),
    ...inlays.filter((z) => positionen.some((p) => INLAY(p) && p.zahn === z && KERAMIK_INLAY.test(p.nr))),
  ].sort()
  const elemente = [...kronen, ...kauflaechen, ...glieder]
  if (!elemente.length && !implantate.length) return { positionen, hinweise: [] }

  const labor = (zahn: string) => (eigenlabor ? 'eigen' : zahnLabor.find((p) => p.zahn === zahn && p.labor)?.labor)
  const auftragLabor = eigenlabor ? 'eigen' : zahnLabor.find((p) => p.labor)?.labor
  const vorhanden = (nr: string, zahn: string) => positionen.some((p) => p.ebene === 'BEB' && p.nr === nr && p.zahn === zahn)
  const beb = (nr: string, zahn: string, l = /^\d\d$/.test(zahn) ? labor(zahn) : auftragLabor, anzahl = 1) =>
    (vorhanden(nr, zahn) ? [] : [pos('BEB', nr, zahn, { anzahl, ...(l ? { labor: l } : {}) })])
  const je = (zaehne: string[], ...nrs: string[]) => zaehne.flatMap((z) => nrs.flatMap((nr) => beb(nr, z)))
  const D = DIGITAL_BEB
  const arbeitsKiefer = [...new Set([...elemente, ...implantate].map(kieferVon))]
  const bruecken = verbinder(glieder, new Set([...kronen, ...kauflaechen]))
  const verblendet = positionen.some((p) => VERBLENDUNG(p) && /^\d\d$/.test(p.zahn) && (elemente.includes(p.zahn) || implantate.includes(p.zahn)))
  const neu = [
    ...beb(D.oralscan, ''), ...beb(D.auftragsdaten, ''), ...beb(D.registrierung, ''),
    ...arbeitsKiefer.flatMap((k) => beb(D.segmentierung, k)),
    ...je(stuempfe, D.praepFreilegen, D.druckstumpf, D.segment, D.praepgrenze),
    ...je(kronen, D.krone), ...je(kauflaechen, D.kauflaeche), ...je(glieder, D.glied),
    ...bruecken.flatMap((b) => beb(D.verbinder, b.zahn, labor(b.zahn.split('-')[0]), b.anzahl)),
    ...je(elemente, D.nacharbeiten),
    ...je(keramik, D.sintern, D.glanzbrand),
    ...(eigenlabor ? implantate.flatMap((z) => beb(DIGITAL.scanbody, z)) : []),
    ...(verblendet ? beb('0401', '') : []),
  ]
  const teile = [
    'Oralscan aufbereiten, CAD-Auftragsdaten und digitale Registrierung statt Mittelwertartikulator',
    stuempfe.length && `Präp freilegen, Druckstumpf, Segment und Präpgrenze je Stumpf (${stuempfe.join(', ')})`,
    `CAD-Konstruktion ${[kronen.length && `${kronen.length} Krone${kronen.length > 1 ? 'n' : ''}`, kauflaechen.length && `${kauflaechen.length} Kaufläche${kauflaechen.length > 1 ? 'n' : ''}`, glieder.length && `${glieder.length} Brückenglied${glieder.length > 1 ? 'er' : ''}`].filter(Boolean).join(', ') || 'Implantatversorgung'} mit CAM-Nacharbeit`,
    bruecken.length && `Verbinder ${bruecken.map((b) => b.zahn).join(', ')}`,
    keramik.length && `Sintern (Zirkon) und Glanz-/Kristallisationsbrand ${keramik.join(', ')}`,
    eigenlabor && implantate.length && `Scanbody-Matching ${implantate.join(', ')}`,
    verblendet && 'Steckartikulator für die Verblendung',
  ].filter(Boolean)
  return {
    positionen: [...positionen.filter((p) => !ARTIKULATOR(p)), ...neu],
    hinweise: [`Digitaler Ablauf nach Intraoralscan (${eigenlabor ? 'Eigenlabor' : 'Labor'}): ${teile.join('; ')}.`],
  }
}

function scanAnwenden(positionen: Position[], zaehne: Record<string, ZahnZeilen>): { positionen: Position[]; hinweise: string[] } {
  const implantat = (z: string) => /^S/i.test((zaehne[z]?.TP.trim() || zaehne[z]?.R || '').toUpperCase())
  const praepariert = [...new Set(positionen.filter(KRONE).map((p) => p.zahn))].filter((z) => !implantat(z))
  const hinweise: string[] = []
  if (!praepariert.length) return { positionen, hinweise }

  const bereiche = [...new Set(praepariert.map(bereich))]
  const gescannt = new Set(positionen.filter((p) => p.ebene === 'GOZ' && p.nr === '0065').map((p) => p.zahn))
  const regionen = [...new Set([...bereiche, ...bereiche.map((b) => GEGENUEBER[b])])].filter((r) => !gescannt.has(r))

  const labor = positionen.find(GIPSMODELL)?.labor
  const gedruckt = new Set(positionen.filter((p) => p.ebene === 'BEB' && p.nr === '0009').map((p) => p.zahn))
  const kiefer = (['OK', 'UK'] as const).filter((k) => !gedruckt.has(k))

  const neu = [
    ...regionen.map((r) => pos('GOZ', '0065', r)),
    ...kiefer.map((k) => pos('BEB', '0009', k, labor ? { labor } : {})),
  ]
  const arbeitsKiefer = [...new Set(praepariert.map(kieferVon))]
  hinweise.push(`Intraoralscan (${regionen.length ? regionen.join(', ') : 'bereits erfasst'}): GOZ 0065 statt konventioneller Abformung, gedruckte Modelle ${arbeitsKiefer.join('/')} mit Gegenkiefer (BEB 0009) statt Gips-/Sägemodell.`)
  return { positionen: [...positionen.filter((p) => !GIPSMODELL(p)), ...neu], hinweise }
}
