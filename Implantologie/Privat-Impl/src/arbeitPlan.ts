/**
 * KI-Zeile am offenen Implantatplan: das System aller geplanten Implantate, erst nach Bestätigung.
 * GOZ 9050 ist die prothetische Leistung und wird hier nicht dazuerfunden.
 */
import type { Plan } from './types'
import { IMPLANTATKOERPER } from './data/implantatkoerper'
import { implantatZaehne } from './engine/planung'
import { STANDARD_IMPLANTAT } from './components/ImplantatDetails'
import { arbeitVerstehen, systemAusText, type ArbeitStand } from './arbeitDialog'
import { arbeitHoeren, type Anfrage, type ArbeitAntwort } from './arbeitFenster'

const LEISTUNGEN = 'An dieser Implantatplanung kann ich das Implantatsystem ändern. GOZ 9050 ist die prothetische Abformung und Eingliederung, die trage ich hier nicht ein. Ich schreibe erst nach Ihrer Bestätigung.'

interface Offen { plan: Plan; text: string; stempel: string }
const offen = new Map<string, Offen>()

function nameVon(id: string): string {
  if (!id || id === 'durchschnitt') return ''
  return IMPLANTATKOERPER.find((s) => s.id === id)?.hersteller ?? ''
}

function standVon(plan: Plan, gesperrt: boolean): ArbeitStand {
  const implantZaehne = implantatZaehne(plan)
  const ids = [...new Set(implantZaehne.map((z) => plan.implantate[z]?.system || 'durchschnitt'))]
  const systemId = ids.length === 1 && ids[0] !== 'durchschnitt' ? ids[0] : ''
  const namen = [...new Set(implantZaehne.map((z) => nameVon(plan.implantate[z]?.system ?? '')))]
  const systemName = namen.length === 1 ? namen[0] : namen.filter(Boolean).length > 1 ? 'unterschiedlich' : ''
  return {
    implantZaehne, systemName, systemId, goz9050: [], gesperrt9050: [],
    kannSystem: implantZaehne.length > 0 && !gesperrt, kann9050: false, gesperrt, leistungen: LEISTUNGEN,
  }
}

function systemAus(text: string) {
  const s = systemAusText(text)
  return s && IMPLANTATKOERPER.some((x) => x.id === s.id) ? s : null
}

function stempel(plan: Plan): string {
  return JSON.stringify({ zaehne: plan.zaehne, implantate: plan.implantate })
}

export function implDienst(anfrage: Anfrage, lesen: () => { plan: Plan; gesperrt: boolean }, schreiben: (plan: Plan) => void): ArbeitAntwort {
  if (anfrage.aktion === 'verwerfen') {
    offen.delete(anfrage.id)
    return { art: 'hinweis', text: 'Alles klar, ich lasse den Plan so.' }
  }
  if (anfrage.aktion === 'anwenden') {
    const vor = offen.get(anfrage.id)
    offen.delete(anfrage.id)
    if (!vor) return { art: 'hinweis', text: 'Ich habe keine offene Anpassung mehr. Bitte sagen Sie sie noch einmal.' }
    const jetzt = lesen()
    if (jetzt.gesperrt) return { art: 'hinweis', text: 'Dieser Plan ist freigegeben. Ich ändere ihn nicht.' }
    if (stempel(jetzt.plan) !== vor.stempel) return { art: 'hinweis', text: 'Der Plan wurde inzwischen geändert. Bitte sagen Sie die Anpassung noch einmal.' }
    schreiben(vor.plan)
    return { art: 'erledigt', text: `Erledigt: ${vor.text.replace(/Soll ich das anpassen\??/g, '').replace(/\s+/g, ' ').trim()}.` }
  }
  const { plan, gesperrt } = lesen()
  const r = arbeitVerstehen(anfrage.text, standVon(plan, gesperrt), systemAus)
  if (r.art === 'fremd') return { art: 'fremd', text: '' }
  if (r.art !== 'vorschlag' || r.tun.art === '9050') return r.art === 'vorschlag' ? { art: 'antwort', text: r.text } : r
  const id = `v${Math.random().toString(36).slice(2, 10)}`
  const systemId = r.tun.systemId
  const implantate = { ...plan.implantate }
  for (const z of implantatZaehne(plan)) implantate[z] = { ...STANDARD_IMPLANTAT, ...implantate[z], system: systemId }
  const neu = { ...plan, implantate }
  offen.set(id, { plan: neu, text: r.text, stempel: stempel(plan) })
  return { art: 'vorschlag', text: r.text, vorschlag: id }
}

export function implAnmelden(lesen: () => { plan: Plan; gesperrt: boolean }, schreiben: (plan: Plan) => void): () => void {
  return arbeitHoeren((a) => implDienst(a, lesen, schreiben))
}
