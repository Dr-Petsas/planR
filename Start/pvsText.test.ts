import { describe, expect, it } from 'vitest'
import { dsWinPlanText, dsWinText } from './pvsText'

/**
 * Plan Schiene (Privat-KB), 24.11.2026: DS-Win lehnte ab mit „Text Position 13 ist in DS-Win nicht darstellbar.“
 * Die Analogpositionen tragen „… – entsprechend GOZ 4000“; der Halbgeviertstrich fehlt im Zeichensatz der Praxis (cp850).
 */
describe('Plantexte für DS-Win', () => {
  it('schreibt den Halbgeviertstrich der Analogposition als Bindestrich', () => {
    expect(dsWinText('Eingangsuntersuchung zur Versorgung mit einer Unterkieferprotrusionsschiene – entsprechend GOZ 4000'))
      .toBe('Eingangsuntersuchung zur Versorgung mit einer Unterkieferprotrusionsschiene - entsprechend GOZ 4000')
  })

  it('lässt Umlaute und ß stehen und ersetzt die übrigen Satzzeichen', () => {
    expect(dsWinText('Mundöffnungsbegrenzung, Größe „M“ … 12 € ‚x‘ — y')).toBe('Mundöffnungsbegrenzung, Größe "M" ... 12 EUR \'x\' - y')
    expect(dsWinText('geschütztes\u00a0Leerzeichen, 3\u202fmm')).toBe('geschütztes Leerzeichen, 3 mm')
  })

  it('wandelt Titel, Bezeichnung und Begründung und lässt Zahlen und Nummern unberührt', () => {
    const plan = {
      format: 'planr-plan', titel: 'Schiene – UKPS',
      positionen: [
        { ebene: 'GOZ', nr: '4000a', betrag: 12.5, bezeichnung: 'Untersuchung – entsprechend GOZ 4000', begruendung: 'Erhöhter Aufwand – Schlafapnoe' },
        { ebene: 'BEB', nr: '0009', betrag: 3 },
      ],
    }
    expect(dsWinPlanText(plan)).toEqual({
      format: 'planr-plan', titel: 'Schiene - UKPS',
      positionen: [
        { ebene: 'GOZ', nr: '4000a', betrag: 12.5, bezeichnung: 'Untersuchung - entsprechend GOZ 4000', begruendung: 'Erhöhter Aufwand - Schlafapnoe' },
        { ebene: 'BEB', nr: '0009', betrag: 3 },
      ],
    })
    expect(plan.titel).toBe('Schiene – UKPS')
  })
})
