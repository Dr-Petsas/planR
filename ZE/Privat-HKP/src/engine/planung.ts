import type { Abformung, Ebene, ImplantatAngaben, Position, Zahn } from '../types'
import { ALTE_KRONE, OBERKIEFER, UNTERKIEFER, istFrontzahn, istWeisheitszahn, kieferVon } from './zahnschema'
import { KOMPONENTEN, implantatsystem, type Komponente } from '../data/implantatsysteme'
import { brueckenBereiche, pfeilerIm } from './bruecken'
import { DIGITAL } from './digital'

export const ABUTMENTS: { id: ImplantatAngaben['abutment']; titel: string }[] = [
  { id: 'standard', titel: 'konfektioniert (Titan)' },
  { id: 'individuell', titel: 'individuell CAD/CAM (Hybrid auf Ti-Base)' },
  { id: 'keramik', titel: 'individuell Keramik (Zirkon auf Ti-Base)' },
]

export const LOEFFEL: { id: ImplantatAngaben['loeffel']; titel: string }[] = [
  { id: 'geschlossen', titel: 'geschlossener Löffel' },
  { id: 'offen', titel: 'offener Löffel (individuell, GOZ 5170)' },
]

/** Kieferhälfte bzw. Frontzahnbereich im Sinne der GOZ (13–23 und 33–43 = Frontzahnbereich) */
export function bereich(zahn: string) {
  if (Number(zahn[1]) <= 3) return zahn[0] === '1' || zahn[0] === '2' ? 'OK-Front' : 'UK-Front'
  return { '1': 'OK rechts', '2': 'OK links', '3': 'UK links', '4': 'UK rechts' }[zahn[0]] ?? zahn[0]
}

/**
 * Rein private Planung: Befund und Planung je Zahn werden direkt in GOZ-Honorar und BEB-Laborleistungen
 * übersetzt – ohne Regelversorgung, Festzuschüsse, BEMA oder BEL II.
 */

/** Planungskürzel → GOZ (Krone; `anker` als Brücken-/Prothesenanker) und BEB-Laborleistungen */
export const ZUORDNUNG: Record<string, { goz: string; anker?: string; beb: string[] }> = {
  K: { goz: '2210', anker: '5010', beb: ['2101'] },
  KV: { goz: '2210', anker: '5010', beb: ['2121', '2611'] },
  KM: { goz: '2210', anker: '5010', beb: ['2281', '2612'] },
  KH: { goz: '2210', anker: '5010', beb: ['2101'] },
  KVH: { goz: '2210', anker: '5010', beb: ['2121', '2611'] },
  KMH: { goz: '2210', anker: '5010', beb: ['2281', '2612'] },
  KO: { goz: '2210', anker: '5010', beb: ['2101', '3023'] },
  KVO: { goz: '2210', anker: '5010', beb: ['2121', '2611', '3023'] },
  KMO: { goz: '2210', anker: '5010', beb: ['2281', '2612', '3023'] },
  PK: { goz: '2220', beb: ['2104'] },
  PKV: { goz: '2220', beb: ['2126', '2611'] },
  PKM: { goz: '2220', beb: ['2534'] },
  VE: { goz: '2220', beb: ['0833', '2653', '2951'] },
  VEK: { goz: '2220', beb: ['0833', '2663', '2945'] },
  T: { goz: '5040', beb: ['3001'] },
  TV: { goz: '5040', beb: ['3001', '2611'] },
  TM: { goz: '5040', beb: ['3001', '2612'] },
  T2: { goz: '5100', beb: ['3001'] },
  T2V: { goz: '5100', beb: ['3001', '2611'] },
  T2M: { goz: '5100', beb: ['3001', '2612'] },
  SK: { goz: '2200', anker: '5000', beb: ['2101'] },
  SKV: { goz: '2200', anker: '5000', beb: ['2121', '2611'] },
  SKM: { goz: '2200', anker: '5000', beb: ['2281', '2612'] },
  SKO: { goz: '2200', anker: '5000', beb: ['2101', '3023'] },
  SKVO: { goz: '2200', anker: '5000', beb: ['2121', '2611', '3023'] },
  SKMO: { goz: '2200', anker: '5000', beb: ['2281', '2612', '3023'] },
  ST: { goz: '5040', beb: ['3001'] },
  STV: { goz: '5040', beb: ['3001', '2611'] },
  STM: { goz: '5040', beb: ['3001', '2612'] },
  A: { goz: '', beb: ['2155'] },
  ABV: { goz: '', beb: ['2361', '2611'] },
  ABM: { goz: '', beb: ['2351', '2612'] },
  B: { goz: '', beb: ['2361'] },
  BV: { goz: '', beb: ['2361', '2611'] },
  BM: { goz: '', beb: ['2351', '2612'] },
  SB: { goz: '', beb: ['2361'] },
  SBV: { goz: '', beb: ['2361', '2611'] },
  SBM: { goz: '', beb: ['2351', '2612'] },
}

const GLIED = /^(S?B|AB)[VM]?$/
const PROTHESENZAHN = /^(S?EO?|SO)$/
const STEGZAHN = /^S?EO$/
const GESCHIEBE = /^S?K[VM]?O$/
const PFEILERKRONE = /^(S?K|PK|S?T)/
const IMPLANTAT = /^S(K|T|O)/
const FESTSITZEND = /^(S?K|PK|VE|S?B|AB|A$|R$)/
const VENEER = /^VEK?$/

export interface PlanungsErgebnis {
  positionen: Position[]
  hinweise: string[]
}

const spanne = (z: string[]) => (z.length === 1 ? z[0] : `${z[0]}-${z[z.length - 1]}`)

/** Kieferhälften und Frontzahnbereiche für die optisch-elektronische Abformung (GOZ 0065) */
function scanBereich(zahn: string) {
  if (istFrontzahn(zahn)) return kieferVon(zahn) === 'OK' ? 'OK-Front' : 'UK-Front'
  return `Q${zahn[0]}`
}

export const STANDARD_IMPLANTAT: ImplantatAngaben = { system: 'durchschnitt', loeffel: 'geschlossen', abutment: 'standard' }

/**
 * `abformung`: präparierte Zähne bzw. Primärkronen;
 * `prothese`: zweite Abformung für den herausnehmbaren Teil einer Kombinationsarbeit (eigene Sitzung)
 */
export function planen(zaehne: Record<string, Zahn>, abformung: Abformung, implantat: ImplantatAngaben = STANDARD_IMPLANTAT, prothese: Abformung = ''): PlanungsErgebnis {
  const positionen: Position[] = []
  const hinweise: string[] = []
  const gezaehlt = new Map<string, number>()
  const pos = (ebene: Ebene, nr: string, zahn: string, anzahl = 1, extra: Partial<Position> = {}) => {
    const basis = `auto:${ebene}:${nr}:${zahn}`
    const n = (gezaehlt.get(basis) ?? 0) + 1
    gezaehlt.set(basis, n)
    positionen.push({ id: n > 1 ? `${basis}#${n}` : basis, ebene, nr, zahn, anzahl, auto: true, ...extra })
  }
  const B = (z: string) => (zaehne[z]?.B ?? '').trim().toLowerCase()
  const P = (z: string) => (zaehne[z]?.TP ?? '').trim().toUpperCase()

  const geplant = [...OBERKIEFER, ...UNTERKIEFER].filter((z) => P(z))
  if (!geplant.length) return { positionen, hinweise: ['Noch keine Planung eingetragen – Kürzel in der Zeile „Planung“ eintragen (z. B. KM, BM, SK, T, E).'] }
  for (const z of geplant) if (P(z) !== ')(' && !ZUORDNUNG[P(z)] && !PROTHESENZAHN.test(P(z)) && !['H', 'R'].includes(P(z)))
    hinweise.push(`Kürzel „${P(z)}“ an Zahn ${z} ist unbekannt.`)

  pos('GOZ', '0030', '')

  const kieferMitArbeit: ('OK' | 'UK')[] = []
  const festsitzendKiefer = new Set<'OK' | 'UK'>()
  const scanBereiche = new Set<string>()
  const scanKiefer = new Set<'OK' | 'UK'>()
  /** gescannte präparierte Zähne (ohne Implantate) für den digitalen Workflow */
  const stuempfe: string[] = []
  /** Kiefer mit herausnehmbarem Teil; true = zahnlos (Funktionsabformung GOZ 5180/5190 schon enthalten) */
  const herausnehmbar = new Map<'OK' | 'UK', boolean>()

  for (const [kiefer, reihe] of [['OK', OBERKIEFER], ['UK', UNTERKIEFER]] as const) {
    if (!reihe.some((z) => P(z))) continue
    kieferMitArbeit.push(kiefer)
    const sitz = reihe.filter((z) => P(z) !== ')(' && B(z) !== ')(')
    const zahnlos = sitz.filter((z) => !istWeisheitszahn(z)).every((z) => ['f', 'x', 'e', 'ew', 'se', 'sew'].includes(B(z)) || PROTHESENZAHN.test(P(z)) || IMPLANTAT.test(P(z)))
    const laeufe = (f: (z: string) => boolean) => {
      const out: { zaehne: string[]; links?: string; rechts?: string }[] = []
      let akt: string[] = []
      sitz.forEach((z, i) => {
        if (f(z)) akt.push(z)
        if ((!f(z) || i === sitz.length - 1) && akt.length) {
          out.push({ zaehne: akt, links: sitz[sitz.indexOf(akt[0]) - 1], rechts: sitz[sitz.indexOf(akt[akt.length - 1]) + 1] })
          akt = []
        }
      })
      return out
    }
    const istPfeiler = (x: string | undefined): x is string => !!x && (PFEILERKRONE.test(P(x)) || P(x) === 'A')
    const markiert = brueckenBereiche(reihe, P, (z) => zaehne[z]).filter((b) => b.explizit)
    const bruecken = laeufe((z) => GLIED.test(P(z))).map((l) => {
      const m = markiert.find((b) => l.zaehne.every((z) => b.zaehne.includes(z)))
      return { ...l, anker: m ? pfeilerIm(m, P) : [l.links, l.rechts].filter(istPfeiler) }
    })
    const brueckenAnker = new Set(bruecken.flatMap((b) => b.anker))
    const stege = laeufe((z) => STEGZAHN.test(P(z)))
    const stegAnker = new Set(stege.flatMap((s) => [s.links, s.rechts]).filter((x): x is string => !!x))
    const prothesenZaehne = sitz.filter((z) => PROTHESENZAHN.test(P(z)) && P(z) !== 'SO')

    for (const b of bruecken) {
      if (!b.anker.length) hinweise.push(`Brückenglied ${spanne(b.zaehne)} ohne Brückenanker – Planung prüfen.`)
      else if (b.anker.length === 1) hinweise.push(`Brücke ${spanne(b.zaehne)}: Freiendbrücke mit nur einem Anker (${b.anker[0]}) – bitte prüfen.`)
    }

    // ---- je Zahn ----
    for (const z of sitz) {
      const k = P(z)
      if (!k) continue
      if (FESTSITZEND.test(k) && !GLIED.test(k)) festsitzendKiefer.add(kiefer)
      if (abformung === 'scan' && ((FESTSITZEND.test(k) && !GLIED.test(k)) || /^S?T/.test(k))) {
        scanBereiche.add(scanBereich(z))
        scanKiefer.add(kiefer)
        if (!IMPLANTAT.test(k)) stuempfe.push(z)
      }
      if (ALTE_KRONE.has(B(z)) && k !== ')(') pos('GOZ', '2290', z)
      if (B(z) === 'ww' && PFEILERKRONE.test(k) && !IMPLANTAT.test(k)) pos('GOZ', '2180', z)
      if (B(z) === 'x') hinweise.push(`Zahn ${z} ist nicht erhaltungswürdig – die Entfernung (GOZ 3000 ff.) und ggf. eine Sofortversorgung sind nicht enthalten.`)
      if (IMPLANTAT.test(k)) pos('GOZ', '9050', z, 2)
      if (k === 'R') {
        pos('GOZ', '5030', z)
        if (!stegAnker.has(z)) pos('BEB', '2181', z)
        continue
      }
      const zuo = ZUORDNUNG[k]
      if (!zuo) continue
      const anker = brueckenAnker.has(z) || GESCHIEBE.test(k) || stegAnker.has(z) || (prothesenZaehne.length > 0 && /^S?T/.test(k))
      const goz = anker && zuo.anker ? zuo.anker : zuo.goz
      if (goz) pos('GOZ', goz, z)
      for (const b of zuo.beb) pos('BEB', b, z)
      if (VENEER.test(k)) pos('GOZ', '2197', z)
      if (GESCHIEBE.test(k)) pos('GOZ', '5080', z)
      if (PFEILERKRONE.test(k)) pos('GOZ', brueckenAnker.has(z) ? '5120' : '2270', z)
    }

    // ---- Brücken ----
    for (const b of bruecken) {
      const zahn = spanne(b.zaehne)
      if (b.anker.some((a) => P(a) === 'A')) pos('GOZ', '5150', zahn)
      else pos('GOZ', '5070', zahn)
      if (b.anker.some((a) => P(a) !== 'A')) pos('GOZ', '5140', zahn)
    }

    // ---- Stege und Implantat-Einzelanker ----
    for (const s of stege) {
      const zahn = spanne(s.zaehne)
      pos('GOZ', '5070', zahn)
      pos('GOZ', '5080', zahn)
      pos('BEB', '3031', zahn)
      pos('BEB', '3032', zahn, s.zaehne.length)
    }
    for (const x of stegAnker) if (P(x) === 'SO') pos('BEB', '2035', x)
    const einzelanker = sitz.filter((z) => P(z) === 'SO' && !stegAnker.has(z))
    for (const z of einzelanker) {
      pos('GOZ', '5080', z)
      pos('BEB', '3027', z)
    }

    // ---- Prothese ----
    if (prothesenZaehne.length || stege.length || einzelanker.length) herausnehmbar.set(kiefer, zahnlos && prothesenZaehne.length > 0)
    if (prothesenZaehne.length) {
      const n = prothesenZaehne.length
      if (zahnlos) {
        pos('GOZ', kiefer === 'OK' ? '5220' : '5230', kiefer)
        pos('GOZ', kiefer === 'OK' ? '5180' : '5190', kiefer)
        pos('BEB', '6001', kiefer)
        pos('BEB', '6002', kiefer, n)
        pos('BEB', '6301', kiefer)
        pos('BEB', '6302', kiefer, n)
      } else {
        pos('GOZ', '5210', kiefer)
        pos('GOZ', '5170', kiefer)
        pos('BEB', '4001', kiefer)
        pos('BEB', '6001', kiefer)
        pos('BEB', '6003', kiefer, n)
        pos('BEB', '6311', kiefer)
        pos('BEB', '6312', kiefer, n)
      }
      if (sitz.some((z) => /H$/.test(P(z)))) hinweise.push(`${kiefer}: Halteelemente (H) – Klammern/Auflagen sind im Modellguss enthalten, gesonderte Halteelemente ggf. ergänzen.`)
    }
  }

  // ---- Abformung und Modelle ----
  if (!abformung) hinweise.push('Abformung noch offen – Intraoralscan oder Abdruck wählen. Bis dahin fehlen die Modelle und ggf. GOZ 0065.')
  else for (const kiefer of ['OK', 'UK'] as const) {
    const eigene = kieferMitArbeit.includes(kiefer)
    if (abformung === 'scan') {
      if (eigene || festsitzendKiefer.size || scanKiefer.size) pos('BEB', '0009', kiefer)
    } else {
      if (festsitzendKiefer.has(kiefer)) pos('BEB', '0021', kiefer)
      else if (eigene || festsitzendKiefer.size) pos('BEB', '0002', kiefer)
    }
  }
  if (abformung === 'scan' && scanBereiche.size) {
    const gegenkiefer = (['OK', 'UK'] as const).filter((k) => !scanKiefer.has(k)).length
    pos('GOZ', '0065', '', scanBereiche.size + gegenkiefer)
  }
  const impScan = abformung === 'scan' ? [...OBERKIEFER, ...UNTERKIEFER].filter((z) => IMPLANTAT.test(P(z))) : []
  const digital = stuempfe.length > 0 || impScan.length > 0
  if (digital) {
    pos('BEB', DIGITAL.daten, '')
    for (const z of stuempfe) { pos('BEB', DIGITAL.stumpf, z); pos('BEB', '0105', z) }
    for (const z of impScan) pos('BEB', DIGITAL.scanbody, z)
  }
  if (digital && !herausnehmbar.size) {
    pos('BEB', DIGITAL.artikulation, '')
    if (positionen.some((p) => p.ebene === 'BEB' && /^26\d\d$/.test(p.nr))) pos('BEB', '0401', '')
  } else if (kieferMitArbeit.length) pos('BEB', '0402', '')
  if (digital) hinweise.push(`Digitaler Workflow im Labor: ${[
    stuempfe.length && `virtuelle Stümpfe und Druckstümpfe ${stuempfe.join(', ')}`,
    impScan.length && `Scanbody-Matching ${impScan.join(', ')}`,
    herausnehmbar.size ? 'Mittelwertartikulator bleibt für die Aufstellung des herausnehmbaren Teils' : 'virtuelle Artikulation statt Mittelwertartikulator',
  ].filter(Boolean).join(', ')}. CAD-Konstruktion, Fräsen und Brände sind in den Kronen- und Brückenpositionen enthalten und werden nicht gesondert berechnet.`)
  if (geplant.some((z) => VENEER.test(P(z)))) pos('BEB', '0723', '')

  // ---- zweite Abformung: herausnehmbarer Teil (z. B. nach dem Einsetzen der Primärkronen) ----
  const zweite = [...herausnehmbar].filter(([, zahnlos]) => !zahnlos).map(([k]) => k)
  const zahnloseKiefer = [...herausnehmbar].filter(([, zahnlos]) => zahnlos).map(([k]) => k)
  if (zahnloseKiefer.length && prothese)
    hinweise.push(`${zahnloseKiefer.join(', ')} zahnlos: die Funktionsabformung (GOZ 5180/5190) ist in der Prothese enthalten – keine zweite Abformung berechnet.`)
  if (!prothese) {
    if (zweite.length && abformung)
      hinweise.push(`Herausnehmbarer Teil ${zweite.join(', ')}: zweite Abformung (Scan oder Überabdruck) noch offen – unter „Abformung“ Schritt 2 wählen.`)
  } else if (!zweite.length) {
    if (!zahnloseKiefer.length) hinweise.push('Zweite Abformung gewählt, aber kein herausnehmbarer Teil geplant – sie bringt keine zusätzlichen Leistungen.')
  } else if (prothese === 'scan') {
    for (const k of zweite) {
      pos('GOZ', '0065', k, 3, { text: `Optisch-elektronische Abformung (2. Sitzung, herausnehmbarer Teil ${k}), je Kieferhälfte/Frontzahnbereich` })
      pos('BEB', '0009', k)
    }
    hinweise.push(`Zweiter Intraoralscan für den herausnehmbaren Teil ${zweite.join(', ')} in eigener Sitzung: GOZ 0065 erneut je Kieferhälfte/Frontzahnbereich (3 je Kiefer) und gedrucktes Modell (BEB 0009).`)
  } else {
    for (const k of zweite) {
      if (!positionen.some((p) => p.ebene === 'GOZ' && p.nr === '5170' && p.zahn === k)) pos('GOZ', '5170', k)
      pos('BEB', '1006', k)
      pos('BEB', '0004', k)
    }
    hinweise.push(`Überabdruck für den herausnehmbaren Teil ${zweite.join(', ')} mit individuellem Löffel (GOZ 5170, BEB 1006) und Modell nach Überabformung (BEB 0004).`)
  }

  // ---- Implantatprothetik: Abformung, Labor, Abutment und Implantatteile des gewählten Systems ----
  const imp = [...OBERKIEFER, ...UNTERKIEFER].filter((z) => IMPLANTAT.test(P(z)))
  if (imp.length) {
    const sys = implantatsystem(implantat.system)
    const mat = (k: Komponente, zahn: string) =>
      pos('MAT', `MAT-${k}`, zahn, 1, { text: `${sys.hersteller} ${sys.system}: ${KOMPONENTEN[k]}`, preis: sys.preise[k] })
    const kiefer = [...new Set(imp.map(kieferVon))]
    if (abformung === 'scan') {
      for (const k of kiefer) pos('BEB', '0018', k)
      for (const z of imp) { pos('BEB', '0224', z); mat('scanbody', z); mat('laboranalog', z) }
    } else if (abformung === 'abdruck') {
      if (implantat.loeffel === 'offen')
        for (const k of kiefer) {
          if (!positionen.some((p) => p.ebene === 'GOZ' && p.nr === '5170' && p.zahn === k)) pos('GOZ', '5170', k)
          pos('BEB', '1108', k)
        }
      for (const k of kiefer) pos('BEB', '0018', k)
      for (const z of imp) { pos('BEB', '0225', z); mat('abdruckpfosten', z); mat('laboranalog', z) }
    } else {
      hinweise.push(`Implantat ${imp.join(', ')}: Abformung noch offen – Abformteile (Scanbody bzw. Abformpfosten) fehlen.`)
    }
    for (const h of new Set(imp.map(bereich))) pos('BEB', '0223', h)
    for (const z of imp) {
      if (implantat.abutment === 'standard' || P(z) === 'SO') { pos('BEB', '4421', z); mat('abutmentStandard', z) }
      else { pos('BEB', implantat.abutment === 'keramik' ? '6906' : '2033', z); mat('tiBase', z); mat('schraube', z) }
    }
    if (sys.genau !== 'ja')
      hinweise.push(`Implantatteile ${sys.hersteller} ${sys.system}: Preise ${sys.genau === 'teilweise' ? 'teilweise ' : ''}geschätzt (Stand ${sys.stand}) – mit der aktuellen Preisliste abgleichen.`)
    hinweise.push('Chirurgische Implantatleistungen (Implantation GOZ 9000 ff., Augmentation) sind nicht enthalten und gesondert zu planen.')
  }

  return { positionen, hinweise }
}
