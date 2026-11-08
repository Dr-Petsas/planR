/**
 * KI-Zeile am offenen Privat-ZE: Implantatsystem und GOZ 9050, erst nach Bestätigung.
 */
import type { Plan } from './types'
import { IMPLANTATSYSTEME } from './data/implantatsysteme'
import { arbeitVerstehen, systemAusText, type ArbeitStand, type ArbeitTun } from './arbeitDialog'
import { arbeitHoeren, type Anfrage, type ArbeitAntwort } from './arbeitFenster'

const IMPLANTAT = /^S[KTO]|^ZAS$/
const LEISTUNGEN = 'An diesem privaten Zahnersatz kann ich das Implantatsystem und die Anzahl von GOZ 9050 ändern. Ich schreibe erst, wenn Sie die Anpassung bestätigen.'

interface Offen { plan: Plan; text: string; stempel: string }
const offen = new Map<string, Offen>()

const nameVon = (id: string) => {
  const s = IMPLANTATSYSTEME.find((x) => x.id === id)
  return s && id !== 'durchschnitt' ? s.hersteller : ''
}

function zaehne(plan: Plan): string[] {
  return Object.entries(plan.zaehne).filter(([, z]) => IMPLANTAT.test((z.TP || '').trim().toUpperCase())).map(([n]) => n)
}

function standVon(plan: Plan, gesperrt: boolean): ArbeitStand {
  const implantZaehne = zaehne(plan)
  const goz9050 = implantZaehne.map((z) => {
    const id = `auto:GOZ:9050:${z}`
    const anzahl = plan.entfernt.includes(id) ? 0 : plan.anpassungen[id]?.anzahl ?? 2
    return { zahn: z, anzahl }
  })
  return {
    implantZaehne, systemName: nameVon(plan.implantat.system), systemId: plan.implantat.system === 'durchschnitt' ? '' : plan.implantat.system, goz9050, gesperrt9050: [],
    kannSystem: implantZaehne.length > 0 && !gesperrt, kann9050: implantZaehne.length > 0 && !gesperrt,
    gesperrt, leistungen: LEISTUNGEN,
  }
}

function systemAus(text: string) {
  const s = systemAusText(text)
  return s && IMPLANTATSYSTEME.some((x) => x.id === s.id) ? s : null
}

function umsetzen(plan: Plan, tun: ArbeitTun): Plan {
  let p = plan
  if (tun.art === 'system' || tun.art === 'beides') {
    p = { ...p, implantat: { ...p.implantat, system: tun.systemId } }
  }
  if (tun.art === '9050' || tun.art === 'beides') {
    const anpassungen = { ...p.anpassungen }
    let entfernt = p.entfernt
    for (const z of zaehne(p)) {
      const id = `auto:GOZ:9050:${z}`
      entfernt = entfernt.filter((x) => x !== id)
      anpassungen[id] = { ...anpassungen[id], anzahl: tun.anzahl }
    }
    p = { ...p, anpassungen, entfernt }
  }
  return p
}

function stempel(plan: Plan): string {
  return JSON.stringify({ system: plan.implantat.system, anpassungen: plan.anpassungen, entfernt: plan.entfernt, zaehne: plan.zaehne })
}

export function privatDienst(anfrage: Anfrage, lesen: () => { plan: Plan; gesperrt: boolean }, schreiben: (plan: Plan) => void): ArbeitAntwort {
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
  if (r.art !== 'vorschlag') return r
  const id = `v${Math.random().toString(36).slice(2, 10)}`
  const neu = umsetzen(plan, r.tun)
  offen.set(id, { plan: neu, text: r.text, stempel: stempel(plan) })
  return { art: 'vorschlag', text: r.text, vorschlag: id }
}

export function privatAnmelden(lesen: () => { plan: Plan; gesperrt: boolean }, schreiben: (plan: Plan) => void): () => void {
  return arbeitHoeren((a) => privatDienst(a, lesen, schreiben))
}
