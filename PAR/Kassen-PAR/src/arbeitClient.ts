/**
 * KI-Zeile spricht den offenen Plan an. Ja und Nein gelten nur für die letzte
 * vorgeschlagene Anpassung. Ohne Vorschlag geht der Satz weiter an Clara.
 */
const ARBEIT = 'planr-arbeit'

export type PlanAntwort = { art: 'fremd' | 'antwort' | 'vorschlag' | 'erledigt' | 'hinweis'; text: string; id?: string }

let offen: { id: string; plan: string } | null = null
let lauf = 0

const sauber = (text: string) => text.trim().replace(/[.!?\s]+$/g, '').replace(/\s+/g, ' ')

export function istJa(text: string): boolean {
  return /^(?:(?:ok|meinetwegen|na gut)[, ]+)?(?:ja|ja bitte|ja gerne|genau|richtig|passt|einverstanden|mach das|bitte anpassen|jawohl)$/i.test(sauber(text))
}

export function istNein(text: string): boolean {
  return /^(?:nein|nee|lass das|abbrechen|stopp|doch nicht|nicht ändern|nicht aendern)$/i.test(sauber(text))
}

/**
 * „öffne den Plan Zaharia“ → der Name. Eine Änderung am offenen Plan bleibt null,
 * die spricht der Plan selbst.
 */
export function planNameGesucht(text: string): string | null {
  const m = text.trim().match(/^(?:bitte\s+)?(?:öffne|oeffne|zeig(?:e)?|lad(?:e)?|hol(?:e)?)\s+(?:mir\s+)?(?:mal\s+)?(?:den\s+|die\s+|das\s+)?(?:plan|hkp)\b\s*(.*)$/i)
  if (!m) return null
  const name = m[1].replace(/^(?:von|für|fuer|zu)\s+/i, '').replace(/^(?:frau|herrn?)\s+/i, '').replace(/[.!]+$/g, '').trim()
  if (!name || /änder|aender|9050|implantat|setz|nimm|nehm/i.test(name)) return null
  return name
}

/** Ein Auftrag an den Plan, keine allgemeine Frage. */
export function istPlanAuftrag(text: string): boolean {
  const t = text.trim()
  if (/implantatsystem|implantat[-\s]?system/i.test(t)) return true
  if (/9050/.test(t)) return true
  if (/\?\s*$/.test(t)) return false
  return /\b(änder\w*|aender\w*|nimm|nehm\w*|setz\w*|stell\w*|wechsel\w*|entfern\w*|streich\w*|hinzu\w*|lösch\w*|loesch\w*|faktor)\b/i.test(t)
}

export function planGespraechVergessen() {
  offen = null
}

function fragen(fenster: Window, body: { aktion: 'vorschlag'; text: string } | { aktion: 'anwenden' | 'verwerfen'; vorschlag: string }): Promise<PlanAntwort | null> {
  const id = `m${Date.now().toString(36)}${(lauf++).toString(36)}`
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', auf)
      resolve(null)
    }, 2500)
    const auf = (ev: MessageEvent) => {
      if (ev.source !== fenster) return
      const d = ev.data as { type?: string; id?: string; art?: PlanAntwort['art']; text?: string; vorschlag?: string }
      if (!d || d.type !== ARBEIT || d.id !== id || typeof d.text !== 'string' || !d.art) return
      window.clearTimeout(timer)
      window.removeEventListener('message', auf)
      resolve({ art: d.art, text: d.text, id: d.vorschlag || undefined })
    }
    window.addEventListener('message', auf)
    fenster.postMessage({ type: ARBEIT, id, ...body }, '*')
  })
}

/**
 * Antwort des offenen Plans, oder null wenn der Satz nicht hierher gehört
 * (dann spricht Clara). Schlägt der Plan etwas vor, merkt sich die Zeile das
 * und ein kurzes Ja setzt es um.
 */
export async function planArbeit(fenster: Window, text: string, plan: string): Promise<PlanAntwort | null> {
  const t = text.trim()
  if (!t) return null
  if (!offen || offen.plan !== plan) offen = null
  if (offen && istJa(t)) {
    const id = offen.id
    offen = null
    const r = await fragen(fenster, { aktion: 'anwenden', vorschlag: id })
    return r ?? { art: 'hinweis', text: 'Der Plan hat nicht geantwortet. Ich habe nichts geändert.' }
  }
  if (offen && istNein(t)) {
    const id = offen.id
    offen = null
    const r = await fragen(fenster, { aktion: 'verwerfen', vorschlag: id })
    return r ?? { art: 'hinweis', text: 'Alles klar, ich lasse den Plan so.' }
  }
  let r = await fragen(fenster, { aktion: 'vorschlag', text: t })
  if (!r && istPlanAuftrag(t)) {
    await new Promise((resolve) => window.setTimeout(resolve, 400))
    r = await fragen(fenster, { aktion: 'vorschlag', text: t })
  }
  if (!r) return istPlanAuftrag(t) ? { art: 'hinweis', text: 'Der offene Plan antwortet gerade nicht. Ich habe nichts geändert.' } : null
  if (r.art === 'fremd') {
    offen = null
    return istPlanAuftrag(t) ? { art: 'hinweis', text: 'Das kann ich an diesem Plan nicht ändern. Ich habe nichts geschrieben.' } : null
  }
  if (r.art === 'vorschlag' && r.id) offen = { id: r.id, plan }
  else offen = null
  return r
}

// ?? Der Plan als Ganzes: lesen, das Modell fragen, Schritte im Plan ausführen ??????????????

export interface KiMeldung { stufe?: string; text?: string; art?: string; ids?: string[] }
interface KiBlick { planart?: string; gesperrt?: boolean; kann?: string[]; summen?: Record<string, number>; hinweise?: KiMeldung[]; pruefLaeuft?: boolean }
interface KiErgebnis { getan?: string[]; nicht?: string[]; gesamt?: number }
type KiRueck = { art: 'blick'; blick: KiBlick } | { art: 'geaendert'; ergebnis: KiErgebnis }

function fragenKi(fenster: Window, body: { aktion: 'lesen' } | { aktion: 'aendern'; schritte: unknown[] }, ms: number): Promise<KiRueck | null> {
  const id = `k${Date.now().toString(36)}${(lauf++).toString(36)}`
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', auf)
      resolve(null)
    }, ms)
    const auf = (ev: MessageEvent) => {
      if (ev.source !== fenster) return
      const d = ev.data as { type?: string; id?: string; art?: string; blick?: KiBlick; ergebnis?: KiErgebnis }
      if (!d || d.type !== ARBEIT || d.id !== id) return
      // Ohne PlanR-Rahmen spricht die Zeile im selben Fenster: die eigene Anfrage ist keine Antwort.
      if (!d.art) return
      window.clearTimeout(timer)
      window.removeEventListener('message', auf)
      if (d.art === 'blick' && d.blick) resolve({ art: 'blick', blick: d.blick })
      else if (d.art === 'geaendert' && d.ergebnis) resolve({ art: 'geaendert', ergebnis: d.ergebnis })
      else resolve(null)
    }
    window.addEventListener('message', auf)
    fenster.postMessage({ type: ARBEIT, id, ...body }, '*')
  })
}

const euro = (x: number) => x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
const satz = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`)

let verlauf: { plan: string; zuege: { wer: 'ich' | 'clara'; text: string }[] } = { plan: '', zuege: [] }

/** Fehler und Warnungen des Prüfmoduls; Hinweise der Rechnung zählen nicht als offen. */
export function pruefOffen(hinweise: KiMeldung[] | undefined): string[] {
  return (hinweise ?? []).filter((h) => h.text && (h.stufe === 'fehler' || h.stufe === 'warnung')).map((h) => String(h.text))
}

/** Was sich im Prüfmodul durch die Änderung getan hat. Leer, wenn es vorher und nachher nichts zeigt. */
export function pruefBericht(vorher: string[], nachher: string[]): string {
  if (!vorher.length && !nachher.length) return ''
  const erledigt = vorher.filter((t) => !nachher.includes(t)).length
  const neu = nachher.filter((t) => !vorher.includes(t))
  if (!nachher.length) return `Prüfmodul: ${erledigt === 1 ? 'die Meldung ist' : `alle ${erledigt} Meldungen sind`} behoben, es zeigt keine Fehler oder Warnungen mehr.`
  const liste = neu.length ? neu : nachher
  const zeigen = liste.slice(0, 3)
  const rest = liste.length - zeigen.length
  const kopf = erledigt ? `Prüfmodul: ${erledigt} behoben, ${nachher.length} noch offen` : `Prüfmodul: ${nachher.length} offen`
  return `${kopf}. ${neu.length ? 'Neu durch die Änderung' : 'Offen'}: ${zeigen.join(' ')}${rest > 0 ? ` (und ${rest} weitere)` : ''}`
}

const warten = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

/** Stand nach einer Änderung: wartet, bis das Prüfmodul des Plans den neuen Stand geprüft hat. */
async function nachPruefung(fenster: Window): Promise<KiBlick | null> {
  let blick: KiBlick | null = null
  for (let i = 0; i < 12; i++) {
    await warten(i ? 400 : 500)
    const r = await fragenKi(fenster, { aktion: 'lesen' }, 2500)
    if (r?.art !== 'blick') return blick
    blick = r.blick
    if (!blick.pruefLaeuft) return blick
  }
  return blick
}

type KiAntwort = { ok?: boolean; antwort?: string; schritte?: unknown[]; pruefung?: boolean; frage?: string; message?: string }

async function modellFragen(body: unknown): Promise<KiAntwort> {
  try {
    const r = await fetch('/api/plan/ki', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return (await r.json()) as KiAntwort
  } catch {
    return {}
  }
}

/** Höchstens so oft arbeitet die Zeile hintereinander an den Meldungen des Prüfmoduls. */
const RUNDEN = 3

/**
 * Der Satz geht mit dem ganzen Planstand an das Modell; dessen Schritte führt der Plan selbst aus.
 * Danach prüft das Prüfmodul den neuen Stand. Galt der Satz dem Prüfen und Korrigieren und ist noch etwas offen,
 * bekommt das Modell den neuen Stand und arbeitet weiter.
 * null: dieser Plan gibt seinen Stand noch nicht heraus, oder ein Ja/Nein gilt einem offenen Vorschlag.
 */
export async function planKiZug(fenster: Window, text: string, plan: string): Promise<{ text: string; geaendert: boolean } | null> {
  const t = text.trim()
  if (!t) return null
  if (offen && offen.plan === plan && (istJa(t) || istNein(t))) return null
  const gelesen = await fragenKi(fenster, { aktion: 'lesen' }, 2500)
  if (!gelesen || gelesen.art !== 'blick') return null
  // Was der Plan schon selbst als Vorschlag kennt (Implantatsystem), bleibt bei ihm.
  const eigen = await fragen(fenster, { aktion: 'vorschlag', text: t })
  if (eigen?.art === 'vorschlag' && eigen.id) {
    offen = { id: eigen.id, plan }
    return { text: eigen.text, geaendert: false }
  }
  offen = null
  if (verlauf.plan !== plan) verlauf = { plan, zuege: [] }

  const start = gelesen.blick
  // Ein Plan, dessen Prüfung gerade noch läuft, wird erst fertig gelesen.
  let blick: KiBlick = start.pruefLaeuft ? ((await nachPruefung(fenster)) ?? start) : start
  const vorher = pruefOffen(blick.hinweise)
  const teile: string[] = []
  const getanAlle: string[] = []
  let gesamt: number | undefined
  let nachlauf: { runde: number; getan: string[]; nicht: string[] } | undefined
  let vorschlag = false
  // Doppelte und sich ausschließende Positionen: die Praxis entscheidet, die Zeile fragt.
  let frage = ''

  for (let runde = 1; runde <= RUNDEN; runde++) {
    const d = await modellFragen({ text: t, blick, verlauf: verlauf.zuege.slice(-6), ...(nachlauf ? { nachlauf } : {}) })
    if (!d.ok || !d.antwort) {
      if (runde === 1) return { text: d.message || 'Ich erreiche das Modell gerade nicht. Der Plan ist unverändert.', geaendert: false }
      break
    }
    const schritte = Array.isArray(d.schritte) ? d.schritte : []
    // Im Korrekturlauf zählt, was der Plan und sein Prüfmodul danach melden, nicht die Ankündigung des Modells.
    if (d.frage) frage = d.frage
    // Ab der zweiten Runde ist die Antwort nur noch Nachrede zu bereits Erledigtem.
    const angesagt = !d.pruefung || (runde === 1 && !schritte.length && !d.frage) ? teile.push(satz(d.antwort)) - 1 : -1
    if (!schritte.length) break
    if (schritte.some((x) => typeof (x as { begruendung?: unknown })?.begruendung === 'string')) vorschlag = true
    const r = await fragenKi(fenster, { aktion: 'aendern', schritte }, 5000)
    if (!r || r.art !== 'geaendert') {
      teile.push('Der Plan hat die Änderung nicht bestätigt. Bitte prüfen Sie ihn.')
      break
    }
    const { getan = [], nicht = [] } = r.ergebnis
    // Hat der Plan nichts übernommen, zählt sein Grund und nicht die Ankündigung des Modells.
    if (!getan.length && angesagt >= 0) teile.splice(angesagt, 1)
    if (getan.length) teile.push(`Im Plan geändert: ${getan.join('; ')}.`)
    for (const n of nicht) teile.push(satz(n))
    if (!getan.length) {
      if (!nicht.length) teile.push('Am Plan hat sich nichts geändert.')
      break
    }
    getanAlle.push(...getan)
    gesamt = r.ergebnis.gesamt
    const neu = await nachPruefung(fenster)
    if (!neu) break
    blick = neu
    // Was auf die Entscheidung der Praxis wartet, löst keine weitere Runde aus.
    const wartet = (h: KiMeldung) => !!frage && (h.art === 'doppelt' || h.art === 'ausschluss')
    if (!d.pruefung || !pruefOffen((blick.hinweise ?? []).filter((h) => !wartet(h))).length) break
    nachlauf = { runde: runde + 1, getan, nicht }
  }

  if (getanAlle.length) {
    const bericht = pruefBericht(vorher, pruefOffen(blick.hinweise))
    if (bericht) teile.push(satz(bericht))
    if (vorschlag) teile.push('Die Begründungen sind Vorschläge. Bitte lesen Sie sie vor dem Ausdruck.')
    if (typeof gesamt === 'number') {
      const vor = start.summen?.gesamt
      teile.push(`Summe jetzt ${euro(gesamt)}${typeof vor === 'number' && Math.abs(vor - gesamt) >= 0.005 ? ` (vorher ${euro(vor)})` : ''}. Noch nicht gespeichert; „nimm das zurück“ macht die letzte Änderung rückgängig.`)
    }
  }
  if (frage) teile.push(frage)
  const aus = teile.join(' ')
  verlauf.zuege.push({ wer: 'ich', text: t }, { wer: 'clara', text: aus })
  verlauf.zuege = verlauf.zuege.slice(-8)
  return { text: aus, geaendert: getanAlle.length > 0 }
}

