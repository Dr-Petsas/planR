import type {
  BebEintrag, BelEintrag, BemaEintrag, FestzuschussEintrag, GozEintrag, HkpPlan, Labor, Position, Preisliste, Versorgungsart,
} from '../types'
import { kombinationenPruefen } from './kombinationen'
import { zusatzleistungen } from './zusatzleistungen'
import { andersartig } from './therapie'
import { ALLE_ZAEHNE, kieferVon } from './zahnschema'
import { standardBegruendung } from './begruendung'
import { implantatZaehne } from './implantat'
import { eigenFinden, type EigenPosition } from './eigenlabor'
import { mitDigital } from './digital'
import { kronenEinheiten, materialErmitteln, werkstoffVon } from './material'
import { DIGITAL_BEB } from './abformung'

export interface Listen {
  bema?: Preisliste<'bema'>
  goz?: Preisliste<'goz'>
  bel?: Preisliste<'bel2'>
  beb?: Preisliste<'beb'>
  fz?: Preisliste<'festzuschuss'>
  /** praxiseigene Laborpositionen */
  eigen?: EigenPosition[]
  /** Hinweise der Listenauswahl (KZV-Bereich, Stichtag, veraltete Listen) */
  hinweise?: Hinweis[]
}

export interface BerechnetePosition extends Position {
  bezeichnung: string
  einzelpreis: number
  betrag: number
  punkte?: number
  /** Höchstpreis bzw. Listenpreis, an dem sich der Einzelpreis orientiert */
  listenpreis?: number
  /** Begründung einer Zusatzleistung */
  begruendung?: string
  /** Nummer der praxiseigenen Laborposition, die Preis und Text liefert */
  eigen?: string
  /** Preis stammt aus einer BEB-Standardposition, die die Praxis noch nicht bepreist hat */
  richtpreis?: boolean
  fehler?: string
}

/** Herstellendes Labor einer Position; Praxismaterial (MAT ohne Labor) liefert undefined. */
export function laborVon(p: Position, plan: HkpPlan): Labor | undefined {
  if (p.ebene === 'BEL' || p.ebene === 'BEB') return p.labor ?? (plan.einstellungen.labor === 'praxis' ? 'eigen' : 'fremd')
  if (p.ebene === 'MAT') return p.labor
  return undefined
}

export interface BerechneterBefund {
  id: string
  nr: string
  zahnGebiet: string
  anzahl: number
  text: string
  einzelbetrag: number
  betrag: number
  betrag100: number
  auto?: boolean
  fakultativ?: boolean
  nachtraeglich?: boolean
  fehler?: string
}

/** Formularzeile in Abschnitt II: gleiche Befund-Nr. an Einzelzähnen in einer Zeile */
export interface BefundZeile extends BerechneterBefund {
  ids: string[]
}

export function befundeZusammenfassen(befunde: BerechneterBefund[]): BefundZeile[] {
  const zeilen: BefundZeile[] = []
  const gruppe = new Map<string, BefundZeile>()
  for (const b of befunde) {
    const einzelzahn = ALLE_ZAEHNE.includes(b.zahnGebiet.trim())
    const key = `${b.nr}|${b.fakultativ ? 1 : 0}|${b.nachtraeglich ? 1 : 0}`
    const z = einzelzahn ? gruppe.get(key) : undefined
    if (!z) {
      const neu = { ...b, ids: [b.id] }
      zeilen.push(neu)
      if (einzelzahn) gruppe.set(key, neu)
      continue
    }
    const zaehne = [...z.zahnGebiet.split(','), b.zahnGebiet.trim()].sort((x, y) => ALLE_ZAEHNE.indexOf(x) - ALLE_ZAEHNE.indexOf(y))
    Object.assign(z, {
      zahnGebiet: zaehne.join(','), anzahl: z.anzahl + b.anzahl, ids: [...z.ids, b.id],
      betrag: runden(z.betrag + b.betrag), betrag100: runden(z.betrag100 + b.betrag100), fehler: z.fehler ?? b.fehler,
    })
  }
  return zeilen
}

export interface Hinweis {
  stufe: 'fehler' | 'warnung' | 'info'
  text: string
}

export interface Ergebnis {
  versorgungsart: Versorgungsart
  /** Festzuschuss wird von der Kasse an den Versicherten ausgezahlt („Weitere Angaben“ im HKP) */
  direktabrechnung: boolean
  positionen: BerechnetePosition[]
  befunde: BerechneterBefund[]
  summen: {
    bemaPunkte: number
    bemaHonorar: number
    gozHonorar: number
    belNetto: number
    bebNetto: number
    /** Eigenlabor (Praxislabor): Kasse = BEL II, privat = BEB */
    eigenBel: number
    eigenBeb: number
    /** Legierungen und Rohlinge aus dem Eigenlabor */
    eigenMat: number
    eigenNetto: number
    eigenMwst: number
    /** Fremdlabor (gewerblich): BEL, BEB/NBL und Material/Edelmetall aus der Laborrechnung */
    fremdBel: number
    fremdBeb: number
    fremdMat: number
    fremdNetto: number
    fremdMwst: number
    laborMwst: number
    material: number
    materialUndLabor: number
    gesamt: number
    festzuschuss: number
    festzuschuss100: number
    kassenanteil: number
    eigenanteil: number
    /** Teil 2: Eigenanteil, der bei Wahl der Regelversorgung anfiele */
    eigenanteilRegel: number
  }
  hinweise: Hinweis[]
  /** Zusatzleistungen der gewählten Stufe, die mangels Indikation nicht angesetzt wurden */
  zusatzNichtAngesetzt: string[]
}

/** § 5 Abs. 1 GOZ: Gebührenrahmen 1,0- bis 3,5-fach; darüber nur mit Vereinbarung nach § 2 */
export const GOZ_HOECHSTSATZ = 3.5
export const GOZ_SCHWELLENWERT = 2.3
export const BEB_AUFSCHLAG_MAX = 100

export const runden = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const belNrNorm = (nr: string) => nr.replace(/\s/g, '')
export const belNrAnzeige = (nr: string) => {
  const n = belNrNorm(nr)
  return n.length === 4 ? `${n.slice(0, 3)} ${n[3]}` : n
}

function finden<T extends { nr: string }>(liste: { eintraege: T[] } | undefined, nr: string, norm = (s: string) => s.trim().toLowerCase()) {
  const n = norm(nr)
  return liste?.eintraege.find((e) => norm(e.nr) === n)
}

const bemaNorm = (s: string) => s.replace(/\s/g, '').toLowerCase()

/** Zähne einer Zahn-/Gebietsangabe wie „15-13“, „16,26“, „OK“ oder „UK links“ */
export function zaehneVon(gebiet: string): string[] {
  const t = gebiet.trim().toUpperCase()
  if (/^(OK|UK)\b/.test(t)) return ALLE_ZAEHNE.filter((z) => kieferVon(z) === t.slice(0, 2))
  const zaehne = new Set<string>()
  for (const teil of t.split(/[,;\s]+/)) {
    const [a, b] = teil.split('-')
    if (!ALLE_ZAEHNE.includes(a)) continue
    if (!b || !ALLE_ZAEHNE.includes(b) || kieferVon(a) !== kieferVon(b)) { zaehne.add(a); continue }
    const i = ALLE_ZAEHNE.indexOf(a), j = ALLE_ZAEHNE.indexOf(b)
    ALLE_ZAEHNE.slice(Math.min(i, j), Math.max(i, j) + 1).forEach((z) => zaehne.add(z))
  }
  return [...zaehne]
}

/** Zähne, deren Planung (TP) andersartig gegenüber der Regelversorgung ist */
function andersartigeZaehne(plan: HkpPlan): Set<string> {
  const eintraege = Object.entries(plan.zaehne)
  const prothesenKiefer = new Set(eintraege.filter(([, v]) => v.R === 'E').map(([z]) => kieferVon(z)))
  return new Set(eintraege.filter(([z, v]) => v.TP.trim() && andersartig(v.R, v.TP, prothesenKiefer.has(kieferVon(z)))).map(([z]) => z))
}

/**
 * Direktabrechnung (Festzuschuss von der Kasse an den Versicherten): bei andersartiger Versorgung;
 * im Mischfall nur, wenn mehr als 50 % des zahnärztlichen Honorars auf andersartige Leistungen entfallen (KZBV-Kompendium 7.1).
 */
function direktabrechnungErmitteln(plan: HkpPlan, versorgungsart: Versorgungsart, positionen: BerechnetePosition[]) {
  if (versorgungsart !== 'andersartig') return { direkt: false, anteil: 0 }
  const anders = andersartigeZaehne(plan)
  const honorar = positionen.filter((p) => p.ebene === 'BEMA' || p.ebene === 'GOZ')
  const gesamt = honorar.reduce((s, p) => s + p.betrag, 0)
  if (!anders.size || gesamt <= 0) return { direkt: true, anteil: 1 }
  const andersHonorar = honorar.filter((p) => zaehneVon(p.zahn).some((z) => anders.has(z))).reduce((s, p) => s + p.betrag, 0)
  const anteil = andersHonorar / gesamt
  return { direkt: anteil > 0.5, anteil }
}

/** Ermittelt Regel-, gleich- oder andersartige Versorgung aus Zeile R und TP. */
export function versorgungsartErmitteln(plan: HkpPlan): Versorgungsart {
  if (plan.versorgungsart !== 'auto') return plan.versorgungsart
  if (andersartigeZaehne(plan).size) return 'andersartig'
  const mehr = Object.values(plan.zaehne).some((v) => v.TP.trim() && v.TP.trim().toUpperCase() !== v.R)
  return mehr || plan.positionen.some((p) => p.ebene === 'GOZ' || p.ebene === 'BEB') ? 'gleichartig' : 'regel'
}

export function positionBerechnen(p: Position, listen: Listen, plan: HkpPlan): BerechnetePosition {
  const anzahl = p.anzahl || 0
  const basis = { ...p, bezeichnung: p.text ?? '', einzelpreis: 0, betrag: 0 }
  switch (p.ebene) {
    case 'BEMA': {
      const e = finden<BemaEintrag>(listen.bema, p.nr, bemaNorm)
      const pw = listen.bema?.punktwert ?? 0
      if (!e && p.preis === undefined) return { ...basis, fehler: `BEMA-Nr. ${p.nr} nicht in der Liste` }
      const einzel = p.preis ?? runden((e?.punkte ?? 0) * pw)
      return { ...basis, bezeichnung: p.text || e?.text || '', punkte: e?.punkte, einzelpreis: einzel, betrag: runden(einzel * anzahl) }
    }
    case 'GOZ': {
      const e = finden<GozEintrag>(listen.goz, p.nr)
      const pw = listen.goz?.punktwert ?? 0.0562421
      if (!e && p.preis === undefined) return { ...basis, fehler: `GOZ-Nr. ${p.nr} nicht in der Liste` }
      const eigen = p.faktor ?? plan.einstellungen.gozFaktor
      const regler = Math.min(plan.einstellungen.honorarFaktor || 0, GOZ_HOECHSTSATZ)
      const faktor = Math.max(eigen, regler)
      // § 5 Abs. 1 GOZ: Rundung erst nach Multiplikation mit dem Steigerungsfaktor
      const einzel = p.preis ?? runden((e?.punkte ?? 0) * pw * faktor)
      const faktorBegruendung = faktor > GOZ_SCHWELLENWERT ? p.faktorBegruendung?.trim() || standardBegruendung(p.nr) : undefined
      return { ...basis, faktor, faktorBegruendung, bezeichnung: p.text || e?.text || '', punkte: e?.punkte, einzelpreis: einzel, betrag: runden(einzel * anzahl) }
    }
    case 'BEL': {
      const labor = laborVon(p, plan)
      const e = finden<BelEintrag>(listen.bel, p.nr, belNrNorm)
      if (!e && p.preis === undefined) return { ...basis, labor, fehler: `BEL-Nr. ${belNrAnzeige(p.nr)} nicht in der Liste` }
      const hoechst = e ? (labor === 'eigen' ? e.praxis : e.gewerbe) : undefined
      const anteil = Math.min(Math.max(0, plan.einstellungen.eigenKasseProzent ?? 100), 100) / 100
      const einzel = p.preis ?? (labor === 'eigen' ? runden(hoechst! * anteil) : hoechst!)
      const fehler = hoechst !== undefined && einzel > hoechst + 0.004
        ? `BEL ${belNrAnzeige(p.nr)} (${labor === 'eigen' ? 'Eigenlabor' : 'Fremdlabor'}): ${einzel.toFixed(2)} € über dem Höchstpreis ${hoechst.toFixed(2)} € der KZV-Liste`
        : undefined
      return { ...basis, labor, bezeichnung: p.text || e?.text || '', listenpreis: hoechst, einzelpreis: einzel, betrag: runden(einzel * anzahl), fehler }
    }
    case 'BEB': {
      const labor = laborVon(p, plan)
      const e = finden<BebEintrag>(listen.beb, p.nr, (s) => s.trim().padStart(4, '0'))
      const eigen = labor === 'eigen' || !e ? eigenFinden(mitDigital(listen.eigen), p.nr) : undefined
      if (eigen) {
        const einzel = p.preis ?? eigen.preis
        return { ...basis, labor, eigen: eigen.nr, bezeichnung: p.text || eigen.text, listenpreis: eigen.preis, einzelpreis: einzel, betrag: runden(einzel * anzahl) }
      }
      if (!e && p.preis === undefined) return { ...basis, labor, fehler: `BEB-Nr. ${p.nr} nicht in der Liste` }
      const aufschlag = labor === 'eigen' ? Math.min(Math.max(0, plan.einstellungen.eigenPrivatAufschlag || 0), BEB_AUFSCHLAG_MAX) : 0
      const einzel = p.preis ?? runden(e!.preis * (1 + aufschlag / 100))
      const richtpreis = p.preis === undefined && e?.richtpreis ? { richtpreis: true } : {}
      return { ...basis, labor, bezeichnung: p.text || e?.text || '', listenpreis: e?.preis, einzelpreis: einzel, betrag: runden(einzel * anzahl), ...richtpreis }
    }
    case 'MAT': {
      const einzel = p.preis ?? 0
      return { ...basis, labor: p.labor, bezeichnung: p.text || 'Material', einzelpreis: einzel, betrag: runden(einzel * anzahl) }
    }
  }
}

/**
 * Kronenmaterial als abgeleitete MAT-Positionen (Menge in g bzw. Einheiten). Edelmetall auf BEL-Einheiten
 * ersetzt dort den NEM-Verarbeitungsaufwand (L-Nr. 970 0). Mit eingelesener Laborrechnung bleibt das
 * Fremdlabor-Material deren Sache.
 */
export function kronenmaterial(plan: HkpPlan) {
  const labor = plan.positionen
    .filter((p) => p.ebene === 'BEL' || p.ebene === 'BEB')
    .map((p) => ({ zahn: p.zahn, ebene: p.ebene, nr: p.nr, labor: laborVon(p, plan) }))
    .filter((p) => !(plan.fremdlabor.import && p.labor === 'fremd'))
  const m = materialErmitteln(labor, plan.werkstoffe ?? {})
  let abzug = m.edelmetallBel
  const ohneSintern = new Set(kronenEinheiten(plan.positionen.filter((p) => p.ebene === 'BEL' || p.ebene === 'BEB'))
    .filter((e) => e.art === 'keramik' && werkstoffVon(e, plan.werkstoffe ?? {}).werkstoff !== 'zirkon').map((e) => e.zahn))
  const basis = plan.positionen.flatMap((p) => {
    if (p.auto && p.ebene === 'BEB' && p.nr === DIGITAL_BEB.sintern && ohneSintern.has(p.zahn)) return []
    if (!abzug || p.ebene !== 'BEL' || belNrNorm(p.nr) !== '9700') return [p]
    const weg = Math.min(abzug, p.anzahl)
    abzug -= weg
    return p.anzahl > weg ? [{ ...p, anzahl: p.anzahl - weg }] : []
  })
  const positionen = m.zeilen.map((z): Position => ({
    id: `mat-${z.zahn}`, ebene: 'MAT', nr: '', zahn: z.zahn, anzahl: z.menge, preis: z.einzel, text: z.text,
    labor: z.labor as Labor | undefined, auto: true, material: true,
  }))
  return { basis, positionen, hinweise: m.hinweise, edelmetallKasse: new Set(m.edelmetallKasse) }
}

export function berechnen(plan: HkpPlan, listen: Listen): Ergebnis {
  const hinweise: Hinweis[] = []
  const zusatz = zusatzleistungen(plan)
  const mat = kronenmaterial(plan)
  const allePositionen = [...mat.basis, ...zusatz.positionen, ...mat.positionen]
  const versorgungsart = versorgungsartErmitteln({ ...plan, positionen: allePositionen })
  const positionen = allePositionen.map((p) => positionBerechnen(p, listen, plan))

  const summe = (f: (p: BerechnetePosition) => boolean) => runden(positionen.filter(f).reduce((s, p) => s + p.betrag, 0))
  const bemaHonorar = summe((p) => p.ebene === 'BEMA')
  const gozHonorar = summe((p) => p.ebene === 'GOZ')
  const belNetto = summe((p) => p.ebene === 'BEL')
  const bebNetto = summe((p) => p.ebene === 'BEB')
  const eigenBel = summe((p) => p.ebene === 'BEL' && p.labor === 'eigen')
  const eigenBeb = summe((p) => p.ebene === 'BEB' && p.labor === 'eigen')
  const fremdBel = summe((p) => p.ebene === 'BEL' && p.labor === 'fremd')
  const fremdBeb = summe((p) => p.ebene === 'BEB' && p.labor === 'fremd')
  const eigenMat = summe((p) => p.ebene === 'MAT' && p.labor === 'eigen')
  const fremdMat = summe((p) => p.ebene === 'MAT' && p.labor === 'fremd')
  const material = summe((p) => p.ebene === 'MAT' && !p.labor)
  const satz = plan.einstellungen.mwstLabor / 100
  const eigenNetto = runden(eigenBel + eigenBeb + eigenMat)
  const fremdNetto = runden(fremdBel + fremdBeb + fremdMat)
  const eigenMwst = runden(eigenNetto * satz)
  const fremdMwst = runden(fremdNetto * satz)
  const laborMwst = runden(eigenMwst + fremdMwst)
  const materialUndLabor = runden(eigenNetto + fremdNetto + laborMwst + material)
  const gesamt = runden(bemaHonorar + gozHonorar + materialUndLabor)
  const bemaPunkte = positionen.filter((p) => p.ebene === 'BEMA').reduce((s, p) => s + (p.punkte ?? 0) * p.anzahl, 0)

  const stufe = plan.zuschuss.haertefall ? '100' : plan.zuschuss.bonus
  const befunde: BerechneterBefund[] = plan.befunde.map((b) => {
    const e = finden<FestzuschussEintrag>(listen.fz, b.nr)
    if (!e) return { ...b, text: '', einzelbetrag: 0, betrag: 0, betrag100: 0, fehler: `Befund ${b.nr} nicht in der Festzuschussliste` }
    return {
      ...b,
      text: e.text,
      einzelbetrag: e.betraege[stufe],
      betrag: runden(e.betraege[stufe] * b.anzahl),
      betrag100: runden(e.betraege['100'] * b.anzahl),
    }
  })
  const festzuschuss = runden(befunde.reduce((s, b) => s + b.betrag, 0))
  const festzuschuss100 = runden(befunde.reduce((s, b) => s + b.betrag100, 0))
  const festzuschussRegel = runden(
    befunde.reduce((s, b) => s + (finden<FestzuschussEintrag>(listen.fz, b.nr)?.betraege[plan.zuschuss.bonus] ?? 0) * b.anzahl, 0),
  )

  let kassenanteil: number
  if (plan.zuschuss.haertefall && versorgungsart === 'regel') {
    // Härtefall + Regelversorgung: Kasse trägt die tatsächlichen Kosten (bei NEM)
    const edelmetall = summe((p) => !!p.material && mat.edelmetallKasse.has(p.zahn))
    kassenanteil = runden(gesamt - edelmetall * (1 + satz))
    hinweise.push({ stufe: 'info', text: 'Härtefall mit Regelversorgung: Die Krankenkasse übernimmt die tatsächlichen Kosten (nur NEM-Legierung).' })
  } else {
    kassenanteil = Math.min(festzuschuss, gesamt)
  }
  const eigenanteil = runden(gesamt - kassenanteil)
  const eigenanteilRegel = plan.zuschuss.haertefall ? 0 : runden(festzuschuss100 - festzuschussRegel)

  // ---- Prüfungen ----
  hinweise.push(...(listen.hinweise ?? []))
  for (const text of mat.hinweise) hinweise.push({ stufe: text.startsWith('Kronenmaterial nicht') || text.startsWith('Lithium') ? 'warnung' : 'info', text })
  for (const p of positionen) if (p.fehler) hinweise.push({ stufe: 'fehler', text: p.fehler })
  const richtpreise = [...new Set(positionen.filter((p) => p.richtpreis).map((p) => p.nr))].sort()
  if (richtpreise.length)
    hinweise.push({ stufe: 'info', text: `BEB ${richtpreise.join(', ')}: Richtpreis der Standardposition – Preis in der BEB-Liste (Preislisten) prüfen und eintragen.` })
  for (const b of befunde) if (b.fehler) hinweise.push({ stufe: 'fehler', text: b.fehler })
  if (!plan.befunde.length) hinweise.push({ stufe: 'fehler', text: 'Ein Antrag ohne Befund-Nr. für Festzuschüsse ist nicht zulässig.' })
  if (zusatz.positionen.length)
    hinweise.push({ stufe: 'info', text: `Zusätzliche GOZ-Leistungen (${zusatz.positionen.length}): nur berechnen, wenn sie tatsächlich erbracht werden. Sie gehen über die Regelversorgung hinaus – die Versorgung wird gleichartig (Teil 2 ausfüllen, Patient aufklären).` })
  if (fremdNetto > 0) {
    const fl = plan.fremdlabor
    if (!fl.import) hinweise.push({ stufe: 'info', text: 'Fremdlabor: Preise sind vorläufig (BEL-Höchstpreis Gewerbe bzw. BEB-Liste) – Labor-XML (Kostenvoranschlag) einlesen.' })
    else if (Math.abs(fl.import.netto - fremdNetto) > 0.01)
      hinweise.push({ stufe: 'warnung', text: `Fremdlabor: Positionen (${fremdNetto.toFixed(2)} € netto) weichen von der eingelesenen Laborrechnung ${fl.import.rechnungsnummer} (${fl.import.netto.toFixed(2)} €) ab.` })
  }
  for (const text of kombinationenPruefen(plan.befunde)) hinweise.push({ stufe: text.includes('nicht') || text.includes('höchstens') ? 'warnung' : 'info', text })
  if (!Object.values(plan.zaehne).some((z) => z.B.trim()) && plan.verwaltung.art === 'HKP')
    hinweise.push({ stufe: 'warnung', text: 'Zeile B (Befund) ist leer – der Befund des gesamten Gebisses ist anzugeben.' })
  for (const p of positionen.filter((x) => x.ebene === 'GOZ')) {
    const f = p.faktor ?? 0
    if (f > 3.5) hinweise.push({ stufe: 'warnung', text: `GOZ ${p.nr} (Zahn ${p.zahn || '–'}): Faktor ${f} über 3,5 – schriftliche Vereinbarung nach § 2 GOZ vor Behandlung nötig.` })
    if (f < 1) hinweise.push({ stufe: 'fehler', text: `GOZ ${p.nr}: Faktor unter 1,0 ist nicht zulässig.` })
  }
  const begruendet = positionen.filter((p) => p.ebene === 'GOZ' && p.faktorBegruendung)
  if (begruendet.length) {
    const eigene = begruendet.filter((p) => p.faktorBegruendung !== standardBegruendung(p.nr)).length
    hinweise.push({ stufe: 'info', text: `${begruendet.length} GOZ-Position(en) über dem 2,3-fachen Satz: Begründung nach § 10 Abs. 3 GOZ ist eingesetzt (${eigene ? `${eigene} eigene, ` : ''}${begruendet.length - eigene} Standardtext) – bitte patientenbezogen prüfen.` })
  }
  const je9050 = new Map<string, number>()
  for (const p of positionen) if (p.ebene === 'GOZ' && p.nr === '9050') for (const z of p.zahn.split(/[^0-9]+/).filter(Boolean)) je9050.set(z, (je9050.get(z) ?? 0) + p.anzahl)
  for (const [z, n] of je9050) if (n > 3) hinweise.push({ stufe: 'warnung', text: `GOZ 9050 an Implantat ${z}: ${n}× – höchstens dreimal je Implantat und einmal je Sitzung.` })
  const ohne9050 = implantatZaehne(plan.zaehne).filter((z) => !je9050.has(z) && positionen.some((p) => p.ebene === 'GOZ' && p.zahn.split(/[^0-9]+/).includes(z)))
  if (ohne9050.length) hinweise.push({ stufe: 'info', text: `GOZ 9050 fehlt an Implantat ${ohne9050.join(', ')} – in der Regel 2× je Implantat (Abformung und Eingliederung).` })
  if (versorgungsart === 'regel' && (gozHonorar > 0 || bebNetto > 0))
    hinweise.push({ stufe: 'warnung', text: 'GOZ- oder BEB-Positionen bei Regelversorgung – Zeile TP ausfüllen oder Versorgungsart prüfen.' })
  if (versorgungsart !== 'regel' && gozHonorar === 0)
    hinweise.push({ stufe: 'warnung', text: 'Gleich-/andersartige Versorgung ohne GOZ-Positionen – Teil 2 ist verpflichtend auszufüllen.' })
  if (versorgungsart !== 'regel' && belNetto + bebNetto > 1000)
    hinweise.push({ stufe: 'info', text: 'Zahntechnische Leistungen über 1.000 €: Kostenvoranschlag nach § 9 GOZ auf Wunsch aushändigen.' })
  const direkt = direktabrechnungErmitteln(plan, versorgungsart, positionen)
  if (versorgungsart === 'andersartig')
    hinweise.push({
      stufe: 'info',
      text: direkt.direkt
        ? `Direktabrechnung: andersartige Versorgung${direkt.anteil < 1 ? ` (${Math.round(direkt.anteil * 100)} % des Honorars andersartig)` : ''} – der Patient erhält die Rechnung über die Gesamtkosten, die Kasse zahlt ihm den Festzuschuss (Vordruck 3e).`
        : `Mischfall: nur ${Math.round(direkt.anteil * 100)} % des Honorars andersartig (Grenze 50 %) – Abrechnung des Festzuschusses über die KZV, keine Direktabrechnung.`,
    })
  if (plan.zuschuss.haertefall && versorgungsart !== 'regel')
    hinweise.push({ stufe: 'info', text: 'Härtefall bei gleich-/andersartiger Versorgung: Zuschuss ist auf den Festzuschuss in Höhe von 100 % begrenzt.' })
  if (!plan.verwaltung.herstellungsort.trim())
    hinweise.push({ stufe: 'warnung', text: 'Herstellungsort bzw. -land des Zahnersatzes fehlt.' })

  return {
    versorgungsart,
    direktabrechnung: direkt.direkt,
    positionen,
    befunde,
    summen: {
      bemaPunkte, bemaHonorar, gozHonorar, belNetto, bebNetto, laborMwst, material, materialUndLabor,
      eigenBel, eigenBeb, eigenMat, eigenNetto, eigenMwst, fremdBel, fremdBeb, fremdMat, fremdNetto, fremdMwst,
      gesamt, festzuschuss, festzuschuss100, kassenanteil, eigenanteil, eigenanteilRegel,
    },
    hinweise,
    zusatzNichtAngesetzt: zusatz.nichtAngesetzt,
  }
}
