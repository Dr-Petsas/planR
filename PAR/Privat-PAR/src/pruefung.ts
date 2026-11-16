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

export function planPruefen(positionen: KiPosition[], o: PruefOptionen = {}): Meldung[] {
  const m: Meldung[] = [...(o.eigene ?? [])]
  const gesehen = new Map<string, number>()
  for (const p of positionen) {
    const name = kiName(p)
    if (!(p.anzahl > 0)) m.push({ stufe: 'fehler', text: `${name}: Anzahl ist ${p.anzahl}. Die Position rechnet nichts.` })
    else if (!(p.betrag > 0)) {
      m.push(istHonorar(p.ebene)
        ? { stufe: 'fehler', text: `${name}: kein Betrag. Die Nummer ist in der Gebührenliste nicht hinterlegt oder der Faktor fehlt.` }
        : { stufe: 'warnung', text: `${name}: kein Preis eingetragen.` })
    }
    if (!p.text.trim() || p.text.trim() === '–') m.push({ stufe: 'warnung', text: `${name}: kein Leistungstext.` })
    if (istHonorar(p.ebene) && p.faktor !== undefined) {
      if (p.faktor > 3.5) {
        m.push(o.ueber35
          ? { stufe: 'warnung', text: `${name}: Faktor ${f(p.faktor)} über 3,5. Das gilt nur mit schriftlicher Vereinbarung nach § 2 Abs. 1 und 2 GOZ vor der Behandlung.` }
          : { stufe: 'fehler', text: `${name}: Faktor ${f(p.faktor)} über 3,5 ohne Vereinbarung nach § 2 GOZ.` })
      } else if (p.faktor < 1) {
        m.push({ stufe: 'warnung', text: `${name}: Faktor ${f(p.faktor)} unter dem Einfachsatz.` })
      } else if (o.begruendung && istGoz(p.ebene) && p.faktor > 2.3 && !p.begruendung?.trim()) {
        m.push({ stufe: 'warnung', text: `${name}: Faktor ${f(p.faktor)} über 2,3 ohne Begründung (§ 10 Abs. 3 GOZ).` })
      }
    }
    if (istHonorar(p.ebene)) {
      const k = `${p.ebene}|${p.nr}|${p.zahn}`
      gesehen.set(k, (gesehen.get(k) ?? 0) + 1)
      if (gesehen.get(k) === 2) m.push({ stufe: 'warnung', text: `${name} steht zweimal im Plan.` })
    }
  }
  for (const h of new Set(o.hinweise ?? [])) m.push({ stufe: 'info', text: h })
  const rang = { fehler: 0, warnung: 1, info: 2 }
  return m.sort((a, b) => rang[a.stufe] - rang[b.stufe])
}
