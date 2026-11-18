/**
 * Probe-Matrix der KI-Zeile, für jeden Planer gleich: eine Änderung und ihr »zurück« in einer Sitzung,
 * dazu drei Abrechnungsfragen, die den Plan nicht anfassen dürfen. Läuft nur mit VITE_KI_LIVE=1
 * (siehe kiProbe.ts); die Antworten stehen im Protokoll und sind zum fachlichen Gegenlesen gedacht.
 */
import { describe, expect, it } from 'vitest'
import { KI_LIVE, kiProbe, probeSitzung } from './kiProbe'
import type { PlanKiDienst } from './planKi'

/** erwartet: muss in der Antwort stehen (mehrere: alle); verboten: darf nicht darin stehen */
export interface MatrixFrage { text: string; erwartet?: RegExp | RegExp[]; verboten?: RegExp | RegExp[] }

export function kiMatrix<P>(o: {
  planer: string
  bau: (lesen: () => P, schreiben: (plan: P) => void) => PlanKiDienst
  /** Ausgangsplan, frisch je Probe */
  start: () => P
  /** Ein Satz, der den Plan sicher ändert */
  aendern: string
  /** Genau drei Fragen zur Abrechnung dieses Plans */
  fragen: [MatrixFrage, MatrixFrage, MatrixFrage]
}) {
  const bild = (p: P) => JSON.stringify(p)
  describe.skipIf(!KI_LIVE)(`KI-Matrix live: ${o.planer}`, { timeout: 240_000 }, () => {
    it('nimmt die letzte Änderung zurück', async () => {
      const start = o.start()
      const s = probeSitzung(o.bau, start)
      const a = await kiProbe({ plan: start, text: o.aendern, blick: s.blick, anwenden: s.anwenden })
      expect(a.getan.length).toBeGreaterThan(0)
      expect(bild(s.plan())).not.toBe(bild(start))
      const b = await kiProbe({ plan: s.plan(), text: 'Nimm das bitte wieder zurück.', verlauf: a.verlauf, blick: s.blick, anwenden: s.anwenden })
      expect(b.schritte.some((x) => x.op === 'zurueck')).toBe(true)
      expect(bild(s.plan())).toBe(bild(start))
    })
    it('sagt ehrlich, wenn es nichts zurückzunehmen gibt', async () => {
      const start = o.start()
      const s = probeSitzung(o.bau, start)
      const r = await kiProbe({ plan: start, text: 'Mach deine letzte Änderung rückgängig.', blick: s.blick, anwenden: s.anwenden })
      expect(bild(s.plan())).toBe(bild(start))
      expect(r.text).toMatch(/nichts|keine|nicht/i)
    })
    o.fragen.forEach((f, i) => {
      it(`Abrechnungsfrage ${i + 1}: ${f.text}`, async () => {
        const start = o.start()
        const s = probeSitzung(o.bau, start)
        const r = await kiProbe({ plan: start, text: f.text, blick: s.blick, anwenden: s.anwenden })
        expect(r.schritte).toHaveLength(0)
        expect(bild(s.plan())).toBe(bild(start))
        expect(r.text.length).toBeGreaterThan(40)
        expect(r.text).not.toMatch(/keine Antwort bekommen/i)
        for (const e of [f.erwartet ?? []].flat()) expect(r.text).toMatch(e)
        for (const v of [f.verboten ?? []].flat()) expect(r.text).not.toMatch(v)
        expect(r.text).not.toMatch(/FAKTOREN|GRUNDSÄTZE|BEMA-RECHNUNG|AUSSCHLUSS-TABELLE/)
      })
    })
  })
}
