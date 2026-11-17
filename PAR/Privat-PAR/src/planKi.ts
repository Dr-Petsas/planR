/**
 * Der offene Plan für die KI-Zeile: ein Stand zum Lesen (ohne Patientendaten) und Schritte zum Ändern.
 * Der Planer prüft jeden Schritt selbst und schreibt nur, was er kennt.
 */

export interface KiPosition {
  id: string
  ebene: string
  nr: string
  zahn: string
  anzahl: number
  faktor?: number
  einzel?: number
  betrag: number
  text: string
  /** aus der Planung errechnet (nicht von Hand angelegt) */
  auto?: boolean
  sitzung?: string
  begruendung?: string
  /** Nummer steht nicht in der Gebührenliste des Planers */
  ohnePreis?: boolean
}

export interface KiSchalter {
  name: string
  text: string
  wert: boolean | string | number
  /** erlaubte Werte einer Auswahl */
  werte?: string[]
}

export type Stufe = 'fehler' | 'warnung' | 'info'
/** Was eine Meldung des Prüfmoduls bemängelt; daran erkennt die KI-Zeile, wie sie zu lösen ist. */
export type PruefArt =
  | 'anzahl_null' | 'kein_betrag' | 'kein_preis' | 'kein_text'
  | 'faktor_ueber_35' | 'faktor_ueber_35_vereinbart' | 'faktor_unter_1' | 'begruendung_fehlt'
  | 'doppelt' | 'ausschluss' | 'rechnung'
export interface Meldung {
  stufe: Stufe
  text: string
  art?: PruefArt
  /** Positionen, an denen die Meldung hängt */
  ids?: string[]
}

export type KiOp = 'schalter' | 'hinzu' | 'setze' | 'weg' | 'zurueck' | 'zahn'

/** Ein Feld, das der Plan je Zahn führt (Befund, Planung, Flächen …). */
export interface KiZahnFeld {
  name: string
  text: string
  /** erlaubte Werte mit ihrer Bedeutung; '' leert das Feld */
  werte?: Record<string, string>
  /** Zahl in diesem Bereich */
  von?: number
  bis?: number
  /** Ja/Nein */
  ja?: boolean
}
export type KiZahnWerte = Record<string, string | number | boolean>

export interface PlanBlick {
  planart: string
  name: string
  nummer: string
  gesperrt: boolean
  kann: KiOp[]
  /** Ebenen, in denen der Plan freie Positionen aufnimmt */
  ebenen: string[]
  positionen: KiPosition[]
  summen: Record<string, number>
  /** Befund, Planung und weitere Angaben in Klartext */
  angaben: Record<string, string>
  schalter: KiSchalter[]
  /** was die KI-Zeile je Zahn eintragen kann (Befund, Planung …); fehlt, wenn der Plan kein Zahnschema führt */
  zahnfelder?: KiZahnFeld[]
  hinweise: Meldung[]
  /** das Prüfmodul rechnet noch (Ausschlüsse vom Server stehen aus) */
  pruefLaeuft?: boolean
}

export type KiSchritt =
  | { op: 'schalter'; name: string; wert: boolean | string | number }
  | { op: 'hinzu'; ebene: string; nr: string; zahn: string; anzahl: number; faktor?: number; preis?: number; text?: string }
  | { op: 'setze'; id: string; anzahl?: number; faktor?: number; preis?: number; begruendung?: string }
  | { op: 'weg'; id: string }
  | { op: 'zahn'; zahn: string; felder: KiZahnWerte }
  | { op: 'zurueck' }

export interface KiErgebnis {
  getan: string[]
  nicht: string[]
  gesamt?: number
}

export interface PlanKiDienst {
  lesen: () => PlanBlick
  aendern: (schritte: KiSchritt[]) => KiErgebnis
}

/** Was das Prüfmodul gerade zeigt; die KI-Zeile liest es mit. */
let gemerkt: Meldung[] = []
let laeuft = false
export const pruefMerken = (m: Meldung[], nochLaeuft = false) => { gemerkt = m; laeuft = nochLaeuft }
export const pruefGemerkt = () => gemerkt
export const pruefLaeuft = () => laeuft

const zahl = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 2 })
export const kiName = (p: { ebene: string; nr: string; zahn?: string }) =>
  `${p.ebene === 'GOAE' ? 'GOÄ' : p.ebene} ${p.nr}${p.zahn ? ` (${p.zahn})` : ''}`

export const istZahn = (z: string) => z.length === 2 && '1234'.includes(z[0]) && '12345678'.includes(z[1])

/**
 * Prüft die Felder eines Zahn-Schritts gegen das, was der Planer führt. Groß- und Kleinschreibung der Kürzel
 * richtet sich nach der Liste des Planers. Ergebnis: die bereinigten Werte oder der Grund der Ablehnung.
 */
export function zahnWerte(felder: KiZahnFeld[], s: { zahn: string; felder: KiZahnWerte }): KiZahnWerte | string {
  if (!istZahn(s.zahn)) return `Zahn ${s.zahn}: diese Zahnnummer gibt es im Schema nicht.`
  const aus: KiZahnWerte = {}
  for (const [name, roh] of Object.entries(s.felder ?? {})) {
    const f = felder.find((x) => x.name === name)
    if (!f) return `Zahn ${s.zahn}: das Feld »${name}« führt dieser Plan nicht.`
    if (f.werte) {
      const w = String(roh).trim()
      const treffer = Object.keys(f.werte).find((k) => k === w) ?? Object.keys(f.werte).find((k) => k.toLowerCase() === w.toLowerCase())
      if (treffer === undefined) return `Zahn ${s.zahn}, ${f.text}: »${w}« kennt dieser Planer nicht.`
      aus[name] = treffer
    } else if (f.ja) {
      if (typeof roh !== 'boolean') return `Zahn ${s.zahn}, ${f.text}: das geht nur mit ja oder nein.`
      aus[name] = roh
    } else {
      const n = Number(roh)
      if (typeof roh === 'boolean' || !Number.isFinite(n) || n < (f.von ?? -Infinity) || n > (f.bis ?? Infinity)) {
        return `Zahn ${s.zahn}, ${f.text}: erlaubt ist ${f.von ?? ''} bis ${f.bis ?? ''}.`
      }
      aus[name] = n
    }
  }
  if (!Object.keys(aus).length) return `Zahn ${s.zahn}: es fehlt, was dort eingetragen werden soll.`
  return aus
}

/** »Zahn 16: Befund f (fehlt), Planung I (Implantat)« für die Rückmeldung. */
export function zahnText(felder: KiZahnFeld[], zahn: string, werte: KiZahnWerte): string {
  const teile = Object.entries(werte).map(([name, w]) => {
    const f = felder.find((x) => x.name === name)
    const kopf = f?.text.split(' (')[0] ?? name
    if (typeof w === 'boolean') return `${kopf}: ${w ? 'ja' : 'nein'}`
    if (w === '') return `${kopf} geleert`
    const sinn = f?.werte?.[String(w)]
    return `${kopf} ${w}${sinn ? ` (${sinn})` : ''}`
  })
  return `Zahn ${zahn}: ${teile.join(', ')}`
}

/** Planereigene Umsetzung eines Zahn-Schritts: neuer Plan mit Text oder der Grund der Ablehnung. */
export type ZahnSetzen<P> = (plan: P, zahn: string, werte: KiZahnWerte) => { plan: P; text: string } | string

function zahnSchritt<P>(plan: P, s: { zahn: string; felder: KiZahnWerte }, felder: KiZahnFeld[] | undefined, setzen: ZahnSetzen<P> | undefined) {
  if (!felder?.length || !setzen) return 'Das Zahnschema dieses Plans ändere ich noch nicht selbst.'
  const w = zahnWerte(felder, { zahn: String(s.zahn ?? '').trim(), felder: s.felder })
  return typeof w === 'string' ? w : setzen(plan, String(s.zahn).trim(), w)
}

interface FreiPosition {
  id: string; ebene: string; nr: string; zahn: string; anzahl: number
  faktor?: number; preis?: number; text?: string; begruendung?: string
}
/** Pläne mit Positionen aus der Planung, Anpassungen daran und frei angelegten Zeilen. */
export interface FreiPlan {
  manuell: FreiPosition[]
  anpassungen: Record<string, Partial<Pick<FreiPosition, 'anzahl' | 'faktor' | 'preis' | 'begruendung'>>>
  entfernt: string[]
}

/**
 * Schritte auf einen Plan mit `manuell`, `anpassungen` und `entfernt` anwenden.
 * `schalter` setzt die planereigenen Felder und gibt den neuen Plan oder einen Grund zurück.
 */
export function freiAnwenden<P extends FreiPlan>(
  plan: P,
  schritte: KiSchritt[],
  zeilen: KiPosition[],
  o: {
    ebenen: string[]; maxFaktor?: number
    schalter?: (plan: P, name: string, wert: boolean | string | number) => { plan: P; text: string } | string
    zahnfelder?: (plan: P) => KiZahnFeld[]
    zahn?: ZahnSetzen<P>
  },
): { plan: P; getan: string[]; nicht: string[] } {
  let p = plan
  const getan: string[] = []
  const nicht: string[] = []
  const zeile = (id: string) => zeilen.find((z) => z.id === id)
  for (const s of schritte) {
    if (s.op === 'schalter') {
      const r = o.schalter ? o.schalter(p, s.name, s.wert) : 'Diese Einstellung kenne ich hier nicht.'
      if (typeof r === 'string') nicht.push(r)
      else { p = r.plan; getan.push(r.text) }
    } else if (s.op === 'zahn') {
      const r = zahnSchritt(p, s, o.zahnfelder?.(p), o.zahn)
      if (typeof r === 'string') nicht.push(r)
      else { p = r.plan; getan.push(r.text) }
    } else if (s.op === 'hinzu') {
      if (!o.ebenen.includes(s.ebene)) { nicht.push(`${kiName(s)}: diese Ebene nimmt der Plan nicht auf.`); continue }
      if (zeilen.some((z) => z.ebene === s.ebene && z.nr === s.nr && z.zahn === s.zahn) || p.manuell.some((m) => m.ebene === s.ebene && m.nr === s.nr && m.zahn === s.zahn)) {
        nicht.push(`${kiName(s)} steht schon im Plan.`)
        continue
      }
      const neu = {
        id: `m:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        ebene: s.ebene, nr: s.nr, zahn: s.zahn, anzahl: s.anzahl || 1,
        ...(s.faktor ? { faktor: s.faktor } : {}), ...(s.preis !== undefined ? { preis: s.preis } : {}), ...(s.text ? { text: s.text } : {}),
      } as P['manuell'][number]
      p = { ...p, manuell: [...p.manuell, neu] }
      getan.push(`${kiName(s)} hinzugefügt${s.anzahl > 1 ? `, ${s.anzahl}×` : ''}${s.faktor ? `, Faktor ${zahl(s.faktor)}` : ''}`)
    } else if (s.op === 'weg') {
      const z = zeile(s.id)
      if (!z) { nicht.push('Die Position zum Entfernen finde ich nicht mehr.'); continue }
      p = p.manuell.some((m) => m.id === s.id)
        ? { ...p, manuell: p.manuell.filter((m) => m.id !== s.id) }
        : { ...p, entfernt: [...new Set([...p.entfernt, s.id])] }
      getan.push(`${kiName(z)} entfernt`)
    } else if (s.op === 'setze') {
      const z = zeile(s.id)
      if (!z) { nicht.push('Die Position zum Ändern finde ich nicht mehr.'); continue }
      if (s.faktor !== undefined && o.maxFaktor && s.faktor > o.maxFaktor) {
        nicht.push(`${kiName(z)}: Faktor ${zahl(s.faktor)} liegt über ${zahl(o.maxFaktor)}; das braucht eine Vereinbarung nach § 2 GOZ (Praxis-Einstellung).`)
        continue
      }
      const aend = {
        ...(s.anzahl !== undefined ? { anzahl: s.anzahl } : {}), ...(s.faktor !== undefined ? { faktor: s.faktor } : {}),
        ...(s.preis !== undefined ? { preis: s.preis } : {}), ...(s.begruendung !== undefined ? { begruendung: s.begruendung } : {}),
      }
      if (!Object.keys(aend).length) continue
      p = p.manuell.some((m) => m.id === s.id)
        ? { ...p, manuell: p.manuell.map((m) => (m.id === s.id ? { ...m, ...aend } : m)) }
        : { ...p, anpassungen: { ...p.anpassungen, [s.id]: { ...p.anpassungen[s.id], ...aend } } }
      const was = [
        s.anzahl !== undefined ? `Anzahl ${s.anzahl}` : '', s.faktor !== undefined ? `Faktor ${zahl(s.faktor)}` : '',
        s.preis !== undefined ? `Preis ${zahl(s.preis)} €` : '', s.begruendung !== undefined ? 'Begründung eingetragen' : '',
      ].filter(Boolean).join(', ')
      getan.push(`${kiName(z)}: ${was}`)
    }
  }
  return { plan: p, getan, nicht }
}

/**
 * Rahmen für jeden Planer: sperrt freigegebene Pläne, merkt den Stand vor der letzten Änderung
 * (»zurück«) und meldet die neue Summe.
 */
export function kiDienst<P>(o: {
  lesen: () => { plan: P; gesperrt: boolean }
  schreiben: (plan: P) => void
  blick: (plan: P, gesperrt: boolean) => PlanBlick
  anwenden: (plan: P, schritte: KiSchritt[]) => { plan: P; getan: string[]; nicht: string[] }
  gesamt: (plan: P) => number
}): PlanKiDienst {
  const zurueck: P[] = []
  return {
    lesen: () => {
      const { plan, gesperrt } = o.lesen()
      const b = o.blick(plan, gesperrt)
      const kann = b.kann.includes('zurueck') || !b.kann.length ? b.kann : [...b.kann, 'zurueck' as const]
      return { ...b, kann, hinweise: b.hinweise.length ? b.hinweise : pruefGemerkt() }
    },
    aendern: (schritte) => {
      const { plan, gesperrt } = o.lesen()
      if (gesperrt) return { getan: [], nicht: ['Dieser Plan ist freigegeben. Ich ändere ihn nicht.'], gesamt: o.gesamt(plan) }
      if (schritte.some((s) => s.op === 'zurueck')) {
        const alt = zurueck.pop()
        if (!alt) return { getan: [], nicht: ['Ich habe in diesem Plan nichts geändert, das ich zurücknehmen könnte.'], gesamt: o.gesamt(plan) }
        o.schreiben(alt)
        return { getan: ['Meine letzte Änderung zurückgenommen'], nicht: [], gesamt: o.gesamt(alt) }
      }
      const r = o.anwenden(plan, schritte)
      if (r.getan.length && r.plan !== plan) {
        zurueck.push(plan)
        if (zurueck.length > 10) zurueck.shift()
        o.schreiben(r.plan)
      }
      return { getan: r.getan, nicht: r.nicht, gesamt: o.gesamt(r.getan.length ? r.plan : plan) }
    },
  }
}

/**
 * Eine Einstellung des Plans (Regler, Auswahl, Ja/Nein, Freitext), wie die Seite sie führt.
 * `werte` = Auswahl, `von`/`bis` = Zahl, weder noch und Text = freier Text.
 */
export interface KiFeld<P> {
  name: string
  text: string
  lesen: (plan: P) => boolean | string | number
  setzen: (plan: P, wert: never) => P
  werte?: string[]
  von?: number
  bis?: number
  /** fehlt die Einstellung in diesem Plan gerade (z. B. Abformung ohne Einlagefüllung)? */
  da?: (plan: P) => boolean
}

const feldDa = <P>(felder: KiFeld<P>[], plan: P) => felder.filter((f) => !f.da || f.da(plan))

/** Die Einstellungen als SCHALTER für die KI-Zeile. */
export const felderSchalter = <P>(felder: KiFeld<P>[], plan: P): KiSchalter[] =>
  feldDa(felder, plan).map((f) => ({
    name: f.name,
    text: f.von !== undefined ? `${f.text} (Zahl von ${zahl(f.von)} bis ${zahl(f.bis ?? f.von)})` : f.text,
    wert: f.lesen(plan),
    ...(f.werte ? { werte: f.werte } : {}),
  }))

/** Setzt eine Einstellung nach Prüfung. null: diese Einstellung führt die Liste nicht. */
export function feldSetzen<P>(felder: KiFeld<P>[], plan: P, name: string, wert: boolean | string | number): { plan: P; text: string } | string | null {
  const f = feldDa(felder, plan).find((x) => x.name === name)
  if (!f) return null
  const kopf = f.text.split(' (')[0]
  const jetzt = f.lesen(plan)
  let neu: boolean | string | number
  let text: string
  if (typeof jetzt === 'boolean') {
    if (typeof wert !== 'boolean') return `${kopf}: das geht nur mit ja oder nein.`
    neu = wert
    text = `${kopf}: ${wert ? 'ja' : 'nein'}`
  } else if (typeof jetzt === 'number') {
    const n = typeof wert === 'number' ? Math.round(wert * 100) / 100 : NaN
    if (!Number.isFinite(n) || n < (f.von ?? -Infinity) || n > (f.bis ?? Infinity)) return `${kopf}: erlaubt ist ${zahl(f.von ?? 0)} bis ${zahl(f.bis ?? 0)}.`
    neu = n
    text = `${kopf}: ${zahl(n)}`
  } else if (f.werte) {
    if (typeof wert !== 'string' || !f.werte.includes(wert)) return `${kopf}: diesen Wert kenne ich nicht.`
    neu = wert
    text = `${kopf}: ${wert || 'ohne'}`
  } else {
    if (typeof wert !== 'string') return `${kopf}: das ist ein Textfeld.`
    neu = wert.trim().slice(0, 600)
    text = neu ? `${kopf} eingetragen: »${neu.length > 80 ? `${neu.slice(0, 80)}…` : neu}«` : `${kopf} geleert`
  }
  if (neu === jetzt) return `${kopf} ist schon so eingestellt.`
  return { plan: f.setzen(plan, neu as never), text }
}

/**
 * Zielbetrag eines privaten Plans: die Gesamtsumme folgt einem Faktor des Plans (dem Regler der Seite).
 * Die KI-Zeile nennt den Wunschbetrag, der Planer stellt den Faktor passend ein.
 */
export interface KiZiel<P> {
  gesamt: (plan: P) => number
  lesen: (plan: P) => number
  setzen: (plan: P, faktor: number) => P
  /** Name des Faktors in der Antwort, z. B. »GOZ-Faktor« */
  was: string
  von?: number
  bis?: number
}
const geld = (x: number) => `${x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const zielStufen = <P>(z: KiZiel<P>) => {
  const von = z.von ?? 1
  const bis = z.bis ?? 3.5
  return Array.from({ length: Math.round((bis - von) * 10) + 1 }, (_, i) => Math.round((von + i / 10) * 10) / 10)
}

/** SCHALTER »zielbetrag«; fehlt, wenn der Faktor an der Summe dieses Plans nichts ändert. */
export function zielSchalter<P>(plan: P, z: KiZiel<P>): KiSchalter[] {
  const stufen = zielStufen(z)
  const min = z.gesamt(z.setzen(plan, stufen[0]))
  const max = z.gesamt(z.setzen(plan, stufen[stufen.length - 1]))
  if (!(max - min > 0.005)) return []
  return [{
    name: 'zielbetrag',
    text: `Zielbetrag: gewünschte Gesamtsumme dieses Plans in Euro; der Planer stellt dafür den ${z.was} zwischen ${zahl(stufen[0])} und ${zahl(stufen[stufen.length - 1])} passend ein (möglich ${geld(min)} bis ${geld(max)}; Labor, Material und Positionen mit eigenem Faktor oder festem Preis bleiben)`,
    wert: Math.round(z.gesamt(plan) * 100) / 100,
  }]
}

/** Stellt den Faktor so, dass die Gesamtsumme dem Wunschbetrag am nächsten kommt. */
export function zielSetzen<P>(plan: P, z: KiZiel<P>, wert: boolean | string | number): { plan: P; text: string } | string {
  if (typeof wert !== 'number' || !(wert > 0)) return 'Zielbetrag: ich brauche die gewünschte Gesamtsumme als Betrag in Euro.'
  const stufen = zielStufen(z)
  const stand = stufen.map((f) => ({ f, summe: z.gesamt(z.setzen(plan, f)) }))
  const min = stand[0].summe
  const max = stand[stand.length - 1].summe
  if (!(max - min > 0.005)) return `Zielbetrag: der ${z.was} ändert an der Summe dieses Plans nichts.`
  if (wert < min - 0.005 || wert > max + 0.005) {
    return `Zielbetrag ${geld(wert)}: über den ${z.was} sind ${geld(min)} bis ${geld(max)} möglich. Für ${wert < min ? 'weniger' : 'mehr'} müsste sich am Umfang des Plans etwas ändern. Ich habe nichts verstellt.`
  }
  const best = stand.reduce((a, b) => (Math.abs(b.summe - wert) < Math.abs(a.summe - wert) ? b : a))
  const jetzt = z.lesen(plan)
  if (best.f === jetzt && Math.abs(z.gesamt(plan) - best.summe) < 0.005) return `Zielbetrag ${geld(wert)}: näher als ${geld(best.summe)} (${z.was} ${zahl(best.f)}) geht es in Zehntelschritten nicht; der Plan steht schon so.`
  const genau = Math.abs(best.summe - wert) < 0.005
  return {
    plan: z.setzen(plan, best.f),
    text: `Zielbetrag ${geld(wert)}: ${z.was} ${zahl(best.f)}, Gesamtsumme ${geld(best.summe)}${genau ? '' : ' (näher geht es in Zehntelschritten des Faktors nicht)'}`,
  }
}

/** Zeile einer Rechnung, wie sie die Planer mit Positionsliste liefern. */
export interface ListenZeile {
  id?: string; ebene?: string; nr: string; zahn?: string; text: string; anzahl: number
  faktor?: number; einzel?: number; summe?: number; betrag?: number
  ohnePreis?: boolean; auto?: boolean; begruendung?: string
}
/** Rechnungszeilen für KI-Zeile und Prüfmodul; Zeilen ohne eigene Kennung bekommen eine laufende. */
export function listenZeilen(zeilen: ListenZeile[], o: { ebene?: (z: ListenZeile) => string; frei?: (id: string) => boolean } = {}): KiPosition[] {
  return zeilen.map((z, i) => {
    const id = z.id ?? `z${i}`
    return {
      id, ebene: o.ebene ? o.ebene(z) : z.ebene ?? 'GOZ', nr: z.nr, zahn: z.zahn ?? '', anzahl: z.anzahl,
      ...(z.faktor !== undefined ? { faktor: z.faktor } : {}),
      ...(z.einzel !== undefined ? { einzel: z.einzel } : {}),
      betrag: z.summe ?? z.betrag ?? 0, text: z.text,
      ...(z.auto || !z.id || (o.frei && !o.frei(id)) ? { auto: true } : {}),
      ...(z.begruendung ? { begruendung: z.begruendung } : {}),
      ...(z.ohnePreis ? { ohnePreis: true } : {}),
    }
  })
}

export interface ListenPos { id: string; ebene?: string; nr: string; anzahl: number; faktor?: number; preis?: number; text?: string }

/** Schritte auf eine Positionsliste anwenden (Pläne ohne Zahnbezug der einzelnen Zeile). */
export function listeAnwenden<T extends ListenPos>(
  liste: T[],
  schritte: KiSchritt[],
  zeilen: KiPosition[],
  o: { ebenen: string[]; maxFaktor?: number; neu: (s: Extract<KiSchritt, { op: 'hinzu' }>, id: string) => T },
): { liste: T[]; getan: string[]; nicht: string[] } {
  let l = liste
  const getan: string[] = []
  const nicht: string[] = []
  const zeile = (id: string) => zeilen.find((z) => z.id === id)
  const errechnet = (z: KiPosition) => `${kiName(z)} errechnet der Planer aus der Planung. Das ändern Sie über Befund, Planung oder die Regler.`
  for (const s of schritte) {
    if (s.op === 'schalter') nicht.push('Diese Einstellung kenne ich hier nicht.')
    else if (s.op === 'zahn') nicht.push('Das Zahnschema dieses Plans ändere ich noch nicht selbst.')
    else if (s.op === 'hinzu') {
      if (!o.ebenen.includes(s.ebene)) { nicht.push(`${kiName(s)}: diese Ebene nimmt der Plan nicht auf.`); continue }
      if (zeilen.some((z) => z.ebene === s.ebene && z.nr === s.nr)) { nicht.push(`${kiName({ ...s, zahn: '' })} steht schon im Plan. Ich kann dort die Anzahl ändern.`); continue }
      if (s.faktor && o.maxFaktor && s.faktor > o.maxFaktor) { nicht.push(`${kiName(s)}: Faktor ${zahl(s.faktor)} liegt über ${zahl(o.maxFaktor)}; das braucht eine Vereinbarung nach § 2 GOZ.`); continue }
      l = [...l, o.neu(s, `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`)]
      getan.push(`${kiName({ ...s, zahn: '' })} hinzugefügt${s.anzahl > 1 ? `, ${s.anzahl}×` : ''}${s.faktor ? `, Faktor ${zahl(s.faktor)}` : ''}`)
    } else if (s.op === 'weg') {
      const z = zeile(s.id)
      if (!z) { nicht.push('Die Position zum Entfernen finde ich nicht mehr.'); continue }
      if (!l.some((x) => x.id === s.id)) { nicht.push(errechnet(z)); continue }
      l = l.filter((x) => x.id !== s.id)
      getan.push(`${kiName(z)} entfernt`)
    } else if (s.op === 'setze') {
      const z = zeile(s.id)
      if (!z) { nicht.push('Die Position zum Ändern finde ich nicht mehr.'); continue }
      if (!l.some((x) => x.id === s.id)) { nicht.push(errechnet(z)); continue }
      if (s.faktor !== undefined && o.maxFaktor && s.faktor > o.maxFaktor) {
        nicht.push(`${kiName(z)}: Faktor ${zahl(s.faktor)} liegt über ${zahl(o.maxFaktor)}; das braucht eine Vereinbarung nach § 2 GOZ.`)
        continue
      }
      if (s.anzahl !== undefined && !(s.anzahl > 0)) { nicht.push(`${kiName(z)}: eine Anzahl von 0 geht nicht. Soll die Position weg, sagen Sie es.`); continue }
      const aend = {
        ...(s.anzahl !== undefined ? { anzahl: s.anzahl } : {}), ...(s.faktor !== undefined ? { faktor: s.faktor } : {}),
        ...(s.preis !== undefined ? { preis: s.preis } : {}),
      }
      if (s.begruendung !== undefined) nicht.push(`${kiName(z)}: die Begründung führt dieser Planer im Dokument; dort steht ein Vorschlag, den Sie anpassen können.`)
      if (!Object.keys(aend).length) continue
      l = l.map((x) => (x.id === s.id ? { ...x, ...aend } : x))
      const was = [
        s.anzahl !== undefined ? `Anzahl ${s.anzahl}` : '', s.faktor !== undefined ? `Faktor ${zahl(s.faktor)}` : '',
        s.preis !== undefined ? `Preis ${zahl(s.preis)} €` : '',
      ].filter(Boolean).join(', ')
      getan.push(`${kiName(z)}: ${was}`)
    }
  }
  return { liste: l, getan, nicht }
}

/**
 * Frisch angelegte Tarifpositionen, die die Gebührenliste des Planers nicht kennt, wieder herausnehmen.
 * `leer` sind die neuen Zeilen ohne Betrag; `ohne` liefert den Plan ohne sie.
 */
export function unbekannteRaus<P>(r: { plan: P; getan: string[]; nicht: string[] }, leer: KiPosition[], ohne: (plan: P, ids: Set<string>) => P) {
  if (!leer.length) return r
  const plan = ohne(r.plan, new Set(leer.map((z) => z.id)))
  let getan = r.getan
  const nicht = [...r.nicht]
  for (const z of leer) {
    const kopf = kiName({ ...z, zahn: '' })
    getan = getan.filter((g) => !g.startsWith(`${kopf} `) && !g.startsWith(`${kopf}(`))
    nicht.push(`${kopf} kennt die Gebührenliste dieses Planers nicht. Ich habe sie nicht eingetragen.`)
  }
  return { plan, getan, nicht }
}

/** Fertiger Dienst für Planer, deren Plan eine Positionsliste führt. */
export function listenDienst<P extends { nummer: string }, T extends ListenPos>(o: {
  planart: string
  name: string
  ebenen: string[]
  /** Ebenen mit Gebührenliste: unbekannte Nummern werden nicht eingetragen */
  tarif: string[]
  maxFaktor?: number
  lesen: () => { plan: P; gesperrt: boolean }
  schreiben: (plan: P) => void
  liste: (plan: P) => T[]
  mitListe: (plan: P, liste: T[]) => P
  neu: (s: Extract<KiSchritt, { op: 'hinzu' }>, id: string) => T
  rechnen: (plan: P) => { zeilen: KiPosition[]; summen: Record<string, number>; gesamt: number }
  angaben: (plan: P) => Record<string, string>
  schalter?: (plan: P) => KiSchalter[]
  schalterSetzen?: (plan: P, name: string, wert: boolean | string | number) => { plan: P; text: string } | string
  /** Felder je Zahn (Befund, Therapie …) und ihre Umsetzung im Plan */
  zahnfelder?: (plan: P) => KiZahnFeld[]
  zahnSetzen?: ZahnSetzen<P>
  /** Schritte, die der Planer selbst umsetzt (z. B. Faktor einer errechneten Zeile); null = nicht zuständig */
  eigen?: (plan: P, schritt: KiSchritt, zeilen: KiPosition[]) => { plan: P; text: string } | string | null
}): PlanKiDienst {
  const anwenden = (plan: P, schritte: KiSchritt[]) => {
    const vorher = o.rechnen(plan).zeilen
    let p = plan
    const getan: string[] = []
    const nicht: string[] = []
    const rest: KiSchritt[] = []
    for (const s of schritte) {
      const r = s.op === 'schalter' && o.schalterSetzen ? o.schalterSetzen(p, s.name, s.wert)
        : s.op === 'zahn' && o.zahnSetzen ? zahnSchritt(p, s, o.zahnfelder?.(p), o.zahnSetzen)
          : o.eigen ? o.eigen(p, s, vorher) : null
      if (r === null) { rest.push(s); continue }
      if (typeof r === 'string') nicht.push(r)
      else { p = r.plan; getan.push(r.text) }
    }
    const r = listeAnwenden(o.liste(p), rest, vorher, { ebenen: o.ebenen, maxFaktor: o.maxFaktor, neu: o.neu })
    p = r.liste === o.liste(p) ? p : o.mitListe(p, r.liste)
    const alt = new Set(vorher.map((z) => z.id))
    const nachher = o.rechnen(p).zeilen
    const da = new Set(nachher.map((z) => z.id))
    const leer = [
      ...nachher.filter((z) => !alt.has(z.id) && o.tarif.includes(z.ebene) && (z.ohnePreis ?? !(z.betrag > 0))),
      // die Rechnung lässt unbekannte Nummern ganz weg
      ...o.liste(p).filter((x) => !da.has(x.id) && !o.liste(plan).some((y) => y.id === x.id) && o.tarif.includes(x.ebene ?? o.ebenen[0]))
        .map((x) => ({ id: x.id, ebene: x.ebene ?? o.ebenen[0], nr: x.nr, zahn: '', anzahl: x.anzahl, betrag: 0, text: '' })),
    ]
    return unbekannteRaus({ plan: p, getan: [...getan, ...r.getan], nicht: [...nicht, ...r.nicht] }, leer,
      (pl, ids) => o.mitListe(pl, o.liste(pl).filter((x) => !ids.has(x.id))))
  }
  return kiDienst<P>({
    lesen: o.lesen,
    schreiben: o.schreiben,
    blick: (plan, gesperrt) => {
      const r = o.rechnen(plan)
      return {
        planart: o.planart, name: o.name, nummer: plan.nummer, gesperrt,
        kann: gesperrt ? [] : [...(o.schalter ? ['schalter' as const] : []), ...(o.zahnSetzen ? ['zahn' as const] : []), 'hinzu', 'setze', 'weg', 'zurueck'],
        ebenen: o.ebenen, positionen: r.zeilen, summen: r.summen, angaben: o.angaben(plan),
        schalter: o.schalter ? o.schalter(plan) : [], hinweise: [],
        ...(o.zahnSetzen && o.zahnfelder ? { zahnfelder: o.zahnfelder(plan) } : {}),
      }
    },
    anwenden,
    gesamt: (plan) => o.rechnen(plan).gesamt,
  })
}

/** Nur lesen: der Planer zeigt der KI-Zeile den Plan, Änderungen laufen über die Seite. */
export function leseDienst(blick: () => PlanBlick, gesamt: () => number): PlanKiDienst {
  return {
    lesen: () => { const b = blick(); return { ...b, kann: [], hinweise: b.hinweise.length ? b.hinweise : pruefGemerkt() } },
    aendern: () => ({ getan: [], nicht: ['In diesem Planer ändere ich noch nichts selbst. Ich sage Ihnen, wo Sie es einstellen.'], gesamt: gesamt() }),
  }
}
