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
