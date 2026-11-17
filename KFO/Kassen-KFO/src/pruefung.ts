/** Prüfmodul der Privat-Planer: Regeln, die an jeder Positionsliste gelten. Ausschlüsse kommen vom Server dazu. */
import { kiName, type KiPosition, type Meldung } from './planKi'

export interface PruefOptionen {
  /** Hinweise der Rechen-Engine des Planers */
  hinweise?: string[]
  /** der Planer führt Begründungen je Position (§ 10 Abs. 3 GOZ) */
  begruendung?: boolean
  /** Vereinbarung nach § 2 GOZ ist in der Praxis zugelassen */
  ueber35?: boolean
  /** eigene Meldungen des Planers */
  eigene?: Meldung[]
}

const istGoz = (e: string) => e === 'GOZ'
const istHonorar = (e: string) => e === 'GOZ' || e === 'GOAE' || e === 'GOÄ'
const f = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 2 })

/** Jede Meldung trägt ihre Art und die Positionen, an denen sie hängt; so kann die KI-Zeile sie beheben. */
export function planPruefen(positionen: KiPosition[], o: PruefOptionen = {}): Meldung[] {
  const m: Meldung[] = [...(o.eigene ?? [])]
  const gesehen = new Map<string, string[]>()
  for (const p of positionen) {
    const name = kiName(p)
    const ids = [p.id]
    if (!(p.anzahl > 0)) m.push({ stufe: 'fehler', art: 'anzahl_null', ids, text: `${name}: Anzahl ist ${p.anzahl}. Die Position rechnet nichts.` })
    else if (!(p.betrag > 0)) {
      m.push(istHonorar(p.ebene)
        ? { stufe: 'fehler', art: 'kein_betrag', ids, text: `${name}: kein Betrag. Die Nummer ist in der Gebührenliste nicht hinterlegt oder der Faktor fehlt.` }
        : { stufe: 'warnung', art: 'kein_preis', ids, text: `${name}: kein Preis eingetragen.` })
    }
    if (!p.text.trim() || p.text.trim() === '–') m.push({ stufe: 'warnung', art: 'kein_text', ids, text: `${name}: kein Leistungstext.` })
    if (istHonorar(p.ebene) && p.faktor !== undefined) {
      if (p.faktor > 3.5) {
        m.push(o.ueber35
          ? { stufe: 'warnung', art: 'faktor_ueber_35_vereinbart', ids, text: `${name}: Faktor ${f(p.faktor)} über 3,5. Das gilt nur mit schriftlicher Vereinbarung nach § 2 Abs. 1 und 2 GOZ vor der Behandlung.` }
          : { stufe: 'fehler', art: 'faktor_ueber_35', ids, text: `${name}: Faktor ${f(p.faktor)} über 3,5 ohne Vereinbarung nach § 2 GOZ.` })
      } else if (p.faktor < 1) {
        m.push({ stufe: 'warnung', art: 'faktor_unter_1', ids, text: `${name}: Faktor ${f(p.faktor)} unter dem Einfachsatz.` })
      } else if (o.begruendung && istGoz(p.ebene) && p.faktor > 2.3 && !p.begruendung?.trim()) {
        m.push({ stufe: 'warnung', art: 'begruendung_fehlt', ids, text: `${name}: Faktor ${f(p.faktor)} über 2,3 ohne Begründung (§ 10 Abs. 3 GOZ).` })
      }
    }
    if (istHonorar(p.ebene)) {
      // Dieselbe Nummer an anderem Zahn oder in anderer Sitzung ist keine Doppelung.
      const k = `${p.ebene}|${p.nr}|${p.zahn}|${p.sitzung ?? ''}`
      const da = gesehen.get(k) ?? []
      da.push(p.id)
      gesehen.set(k, da)
    }
  }
  const auto = new Map(positionen.map((p) => [p.id, !!p.auto]))
  for (const da of gesehen.values()) {
    // Was der Planer selbst mehrfach errechnet (je Implantat, je Stelle), ist so gewollt.
    if (da.length < 2 || da.every((id) => auto.get(id))) continue
    const p = positionen.find((x) => x.id === da[0])!
    const mal = da.length === 2 ? 'zweimal' : `${da.length}-mal`
    m.push({ stufe: 'warnung', art: 'doppelt', ids: da, text: `${kiName(p)} steht ${mal} im Plan${p.zahn ? ' am selben Zahn oder Gebiet' : ' ohne Zahnangabe'}. Zulässig, wenn die Leistung dort mehrfach erbracht wird (je Implantat, Stelle oder Sitzung); sonst ist eine Zeile zu viel.` })
  }
  for (const h of new Set(o.hinweise ?? [])) m.push({ stufe: 'info', art: 'rechnung', text: h })
  const rang = { fehler: 0, warnung: 1, info: 2 }
  return m.sort((a, b) => rang[a.stufe] - rang[b.stufe])
}

/** Ausschluss vom Server (Nummern a und b eines Katalogs) an die Positionen des Plans hängen. */
export function ausschlussMeldung(x: { text?: string; a?: string; b?: string; katalog?: string }, positionen: KiPosition[]): Meldung | null {
  if (!x.text) return null
  const nrn = [x.a, x.b].filter(Boolean).map((n) => String(n).toLowerCase())
  const ids = positionen
    .filter((p) => nrn.includes(p.nr.toLowerCase()) && (!x.katalog || p.ebene === x.katalog))
    .map((p) => p.id)
  return { stufe: 'fehler', art: 'ausschluss', text: String(x.text), ...(ids.length ? { ids } : {}) }
}
