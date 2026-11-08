/**
 * KI-Zeile am offenen HKP. Dieselben Funktionen wie die Helferin in PlanR
 * (Ausführung, Positionen, GOZ 9050). Geschrieben wird der Vorschlag erst auf Ja.
 */
import type { HkpPlan } from './types'
import { ausfuehrungAendern, ausfuehrungIn, positionAendern, systemSprech } from './clara/index'
import { implantatZaehne } from './engine/implantat'
import { planStand } from './store/register'
import {
  arbeitVerstehen, type ArbeitStand, type ArbeitTun,
} from './arbeitDialog'
import { arbeitHoeren, type Anfrage, type ArbeitAntwort } from './arbeitFenster'

const LEISTUNGEN = 'An diesem HKP kann ich Material, Verblendung, Abformung, Labor, Implantatsystem, die Eigenlabor-Stufe und einzelne Positionen ändern. Ich schreibe erst, wenn Sie die Anpassung bestätigen.'

interface Offen {
  stand: string
  plan: HkpPlan
  text: string
}

const offen = new Map<string, Offen>()

function standVon(plan: HkpPlan): ArbeitStand {
  const zaehne = implantatZaehne(plan.zaehne)
  const goz9050 = plan.positionen
    .filter((p) => p.ebene === 'GOZ' && p.nr === '9050')
    .map((p) => ({ zahn: p.zahn, anzahl: p.anzahl }))
  const gesperrt9050 = zaehne.filter((z) => plan.positionen.some((p) => p.ebene === 'GOZ' && (p.nr === '9010' || p.nr === '9040') && p.zahn.split(/[^0-9]+/).includes(z)))
  const gesetzt = plan.implantat.system && plan.implantat.system !== 'durchschnitt' ? plan.implantat.system : ''
  return {
    implantZaehne: zaehne, systemName: gesetzt ? systemSprech(gesetzt) : '', systemId: gesetzt, goz9050, gesperrt9050,
    kannSystem: zaehne.length > 0, kann9050: zaehne.length > 0, leistungen: LEISTUNGEN,
  }
}

function systemAus(text: string): { id: string; name: string } | null {
  const id = ausfuehrungIn(text).implantatSystem
  return id ? { id, name: systemSprech(id) } : null
}

function zahnt(p: { zahn: string }, zahn: string) {
  return p.zahn.split(/[^0-9]+/).includes(zahn)
}

/** 9050 je Implantat auf die genannte Anzahl, ohne Zähne mit 9010 oder 9040. */
function setze9050(plan: HkpPlan, anzahl: number, stand: ArbeitStand): { plan: HkpPlan; hinweis: string } {
  let p = plan
  const hinweise: string[] = []
  for (const zahn of stand.implantZaehne) {
    if (stand.gesperrt9050.includes(zahn)) continue
    const treffer = p.positionen.filter((x) => x.ebene === 'GOZ' && x.nr === '9050' && zahnt(x, zahn))
    if (treffer.length > 1) {
      const weg = new Set(treffer.slice(1).map((x) => x.id))
      p = { ...p, positionen: p.positionen.filter((x) => !weg.has(x.id)) }
    }
    const aktion = treffer.length ? 'anzahl' as const : 'hinzufuegen' as const
    const e = positionAendern(p, { aktion, ebene: 'GOZ', nr: '9050', zahn, anzahl }, {})
    if (!e.ok) hinweise.push(e.meldung)
    else p = e.plan
  }
  return { plan: p, hinweis: hinweise[0] ?? '' }
}

function tunAnwenden(plan: HkpPlan, tun: ArbeitTun, stand: ArbeitStand): { ok: true; plan: HkpPlan; hinweis: string } | { ok: false; text: string } {
  let p = plan
  let hinweis = ''
  if (tun.art === 'system' || tun.art === 'beides') {
    const e = ausfuehrungAendern(p, { implantatSystem: tun.systemId }, {})
    if (!e.ok && tun.art === 'system') return { ok: false, text: e.meldung }
    if (e.ok) p = e.plan
    else hinweis = e.meldung
  }
  if (tun.art === '9050' || tun.art === 'beides') {
    const s = setze9050(p, tun.anzahl, stand)
    p = s.plan
    hinweis = hinweis || s.hinweis
  }
  return { ok: true, plan: p, hinweis }
}

const EBENEN = ['GOZ', 'BEMA', 'BEL', 'BEB'] as const
type Abrechnung = typeof EBENEN[number]

function istAbrechnung(wert: string): wert is Abrechnung {
  return (EBENEN as readonly string[]).includes(wert)
}

function ebeneFinden(plan: HkpPlan, nr: string, gesagt: string): Abrechnung | null {
  if (istAbrechnung(gesagt)) return gesagt
  const da = [...new Set(plan.positionen.filter((p) => p.nr === nr).map((p) => p.ebene))].filter(istAbrechnung)
  if (da.length === 1) return da[0]
  if (/^\d{4}$/.test(nr)) return 'GOZ'
  return null
}

/** „entferne GOZ 2197“, „9050 auf 3“, „Faktor 2,3 bei 2200“ – nur wenn die Nummer klar ist. */
function positionsSatz(plan: HkpPlan, text: string): { plan: HkpPlan; text: string } | { text: string } | null {
  const t = text.trim()
  if (/\?\s*$/.test(t) && !/setz|änder|aender|entfern|streich/i.test(t)) return null
  const nr = t.match(/\b(\d{3,4})\b/)?.[1]
  if (!nr || nr === '9050') return null
  const ebeneWort = t.match(/\b(GOZ|BEMA|BEL|BEB)\b/i)?.[1]?.toUpperCase() ?? ''
  const ebene = ebeneFinden(plan, nr, ebeneWort)
  if (!ebene) return { text: `Welche Ebene zu ${nr} – GOZ, BEMA, BEL oder BEB?` }
  const zahn = t.match(/\b([1-4][1-8])\b/)?.[1] ?? ''
  if (/entfern|streich|lösch|loesch/i.test(t)) {
    const e = positionAendern(plan, { aktion: 'entfernen', ebene, nr, ...(zahn ? { zahn } : {}) }, {})
    return e.ok ? { plan: e.plan, text: `${e.beschreibung}. Soll ich das anpassen?` } : { text: e.meldung }
  }
  const faktor = t.match(/faktor\s*(\d+(?:[.,]\d+)?)/i)
  if (faktor) {
    const e = positionAendern(plan, { aktion: 'faktor', ebene, nr, ...(zahn ? { zahn } : {}), faktor: Number(faktor[1].replace(',', '.')) }, {})
    return e.ok ? { plan: e.plan, text: `${e.beschreibung}. Soll ich das anpassen?` } : { text: e.meldung }
  }
  const anzahl = t.match(/(?:auf|anzahl)\s*(\d+)\b/i)
  if (anzahl && /setz|änder|aender|anzahl|auf\s*\d/i.test(t)) {
    const e = positionAendern(plan, { aktion: 'anzahl', ebene, nr, ...(zahn ? { zahn } : {}), anzahl: Number(anzahl[1]) }, {})
    return e.ok ? { plan: e.plan, text: `${e.beschreibung}. Soll ich das anpassen?` } : { text: e.meldung }
  }
  if (/hinzu|dazu|ergänz|ergaenz/i.test(t)) {
    const e = positionAendern(plan, { aktion: 'hinzufuegen', ebene, nr, ...(zahn ? { zahn } : {}), anzahl: 1 }, {})
    return e.ok ? { plan: e.plan, text: `${e.beschreibung}. Soll ich das anpassen?` } : { text: e.meldung }
  }
  return null
}

function kern(text: string): string {
  return text.replace(/Soll ich das anpassen\??/g, '').replace(/\s+/g, ' ').trim()
}

/** Vorschlag oder Antwort. Der übergebene Plan bleibt unverändert. */
export function hkpVorschlag(plan: HkpPlan, text: string): { art: 'fremd' | 'antwort'; text: string } | { art: 'vorschlag'; text: string; plan: HkpPlan } {
  const stand = standVon(plan)
  const dialog = arbeitVerstehen(text, stand, systemAus)
  let arbeit = plan
  const saetze: string[] = []
  if (dialog.art === 'vorschlag') {
    const e = tunAnwenden(plan, dialog.tun, stand)
    if (!e.ok) return { art: 'antwort', text: e.text }
    arbeit = e.plan
    saetze.push(dialog.text)
    if (e.hinweis) saetze.push(e.hinweis)
  } else if (dialog.art === 'antwort') {
    const ausf = ausfuehrungIn(text)
    delete ausf.implantatSystem
    if (!Object.keys(ausf).length) return dialog
  }

  const ausf = ausfuehrungIn(text)
  if (dialog.art === 'vorschlag' && (dialog.tun.art === 'system' || dialog.tun.art === 'beides')) delete ausf.implantatSystem
  const imperativ = /änder|aender|nimm|nehm|setz|stell|mach |wechsel|statt/i.test(text)
  if (Object.keys(ausf).length && (imperativ || !/\?\s*$/.test(text))) {
    const e = ausfuehrungAendern(arbeit, ausf, {})
    if (e.ok) {
      arbeit = e.plan
      saetze.push(e.beschreibung)
    } else if (!saetze.length && e.grund !== 'nichts') return { art: 'antwort', text: e.meldung }
  }

  if (!saetze.length) {
    const pos = positionsSatz(plan, text)
    if (!pos) {
      if (dialog.art === 'antwort') return dialog
      return { art: 'fremd', text: '' }
    }
    if (!('plan' in pos)) return { art: 'antwort', text: pos.text }
    return { art: 'vorschlag', text: pos.text, plan: pos.plan }
  }
  if (arbeit === plan) return { art: 'antwort', text: kern(saetze.join(' ')) || 'Ich habe nichts gefunden, das ich ändern könnte.' }
  const textSatz = saetze.join(' ').includes('Soll ich das anpassen')
    ? saetze.join(' ')
    : `${kern(saetze.join(' '))} Soll ich das anpassen?`
  return { art: 'vorschlag', text: textSatz.replace(/\s+/g, ' ').trim(), plan: arbeit }
}

export function hkpDienst(
  anfrage: Anfrage,
  lesen: () => HkpPlan,
  schreiben: (neu: HkpPlan, alt: HkpPlan) => void,
): ArbeitAntwort {
  if (anfrage.aktion === 'verwerfen') {
    offen.delete(anfrage.id)
    return { art: 'hinweis', text: 'Alles klar, ich lasse den Plan so.' }
  }
  if (anfrage.aktion === 'anwenden') {
    const vor = offen.get(anfrage.id)
    offen.delete(anfrage.id)
    if (!vor) return { art: 'hinweis', text: 'Ich habe keine offene Anpassung mehr. Bitte sagen Sie sie noch einmal.' }
    const jetzt = lesen()
    if (planStand(jetzt) !== vor.stand) return { art: 'hinweis', text: 'Der Plan wurde inzwischen geändert. Bitte sagen Sie die Anpassung noch einmal.' }
    schreiben(vor.plan, jetzt)
    return { art: 'erledigt', text: `Erledigt: ${kern(vor.text)}.` }
  }
  const plan = lesen()
  const r = hkpVorschlag(plan, anfrage.text)
  if (r.art !== 'vorschlag') return r.art === 'fremd' ? { art: 'fremd', text: '' } : { art: 'antwort', text: r.text }
  const id = `v${Math.random().toString(36).slice(2, 10)}`
  offen.set(id, { stand: planStand(plan), plan: r.plan, text: r.text })
  return { art: 'vorschlag', text: r.text, vorschlag: id }
}

export function hkpAnmelden(lesen: () => HkpPlan, schreiben: (neu: HkpPlan, alt: HkpPlan) => void): () => void {
  return arbeitHoeren((a) => hkpDienst(a, lesen, schreiben))
}
