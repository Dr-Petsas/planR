import { describe, expect, it } from 'vitest'
import { auftragVerstehen, befundAusAuftrag, befundVerstehen, planAusAuftrag } from './auftrag'

// Live-Anrufe 05.10.2026 18:35/18:36: Unterkiefer ging verloren bzw. nur der OK wurde angelegt.
const TELE = 'Pass auf, ich möchte, dass du eine Oberkäfertotalprothese machst. und eine Unterkiefer-Teleskoppprothese auf den Eckzähnen, die Vierer, Fünfer, Sechser, Siebner und Achter auf beiden Seiten fehlen'
const TOTAL = 'Es fehlen alle Zähne, ich möchte totale Oberkieferprothese und totale Unterkieferprothese geplant haben'

const kiefer = (a: ReturnType<typeof auftragVerstehen>) =>
  (a.teile ?? [a]).map((t) => `${t.kiefer}:${t.versorgung}`).sort()

describe('Aufträge für beide Kiefer (Live 05.10.2026)', () => {
  it('Hörfehler „Oberkäfer“ + Unterkiefer-Teleskope: zwei Kiefer, Pfeiler auf den Eckzähnen', () => {
    const a = auftragVerstehen(TELE)
    expect(kiefer(a)).toEqual(['OK:totalprothese', 'UK:teleskopprothese'])
    expect(a.teile?.find((t) => t.kiefer === 'UK')?.pfeiler.sort()).toEqual(['33', '43'])
  })

  it('Befund aus dem Auftrag behält die ganze Aufzählung und den Kiefer', () => {
    const b = befundVerstehen(befundAusAuftrag(TELE))
    for (const z of ['34', '35', '36', '37', '38', '44', '45', '46', '47', '48']) expect(b[z]).toBe('f')
    expect(Object.keys(b).some((z) => z.startsWith('1') || z.startsWith('2'))).toBe(false)
  })

  it('Teleskop-UK + Total-OK wird ohne Rückfrage geplant', () => {
    const r = planAusAuftrag(auftragVerstehen(TELE), befundVerstehen(befundAusAuftrag(TELE)))
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.plan.zaehne['33'].TP).toMatch(/^T/)
    expect(r.plan.zaehne['16'].TP).toBe('E')
  })

  it('„totale Oberkieferprothese und totale Unterkieferprothese“: beide Kiefer, keine Kiefer-Rückfrage', () => {
    expect(kiefer(auftragVerstehen(TOTAL))).toEqual(['OK:totalprothese', 'UK:totalprothese'])
    expect(kiefer(auftragVerstehen(`${TOTAL}. Für beide Kiefer, Oberkiefer und Unterkiefer`))).toEqual(['OK:totalprothese', 'UK:totalprothese'])
    const r = planAusAuftrag(auftragVerstehen(TOTAL), {})
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.plan.zaehne['16'].TP).toBe('E')
      expect(r.plan.zaehne['46'].TP).toBe('E')
    }
  })

  it('„Es fehlen alle Zähne“ vor beiden Kiefern gilt für beide Kiefer', () => {
    const b = befundVerstehen(befundAusAuftrag(TOTAL))
    for (const z of ['16', '21', '36', '44']) expect(b[z], z).toBe('f')
    const nurOben = befundVerstehen('im Oberkiefer fehlen alle Zähne, im Unterkiefer stehen 33 und 43')
    expect(nurOben['16']).toBe('f')
    expect(nurOben['46']).toBeUndefined()
  })

  it('weitere Formen für beide Kiefer', () => {
    for (const s of ['Totalprothese für beide Kiefer', 'Totalprothese im Ober- und Unterkiefer',
      'Vollprothese oben und unten', 'Oberkiefer und Unterkiefer je eine Totalprothese'])
      expect(kiefer(auftragVerstehen(s)), s).toEqual(['OK:totalprothese', 'UK:totalprothese'])
  })

  it('Gegenproben: ein Kiefer bleibt ein Kiefer', () => {
    expect(kiefer(auftragVerstehen('Im Oberkiefer eine Totalprothese, unten bleibt alles wie es ist'))).toEqual(['OK:totalprothese'])
    expect(kiefer(auftragVerstehen('Oberkiefertotalprothese'))).toEqual(['OK:totalprothese'])
    expect(kiefer(auftragVerstehen('Teleskopprothese im Unterkiefer auf 33 und 43'))).toEqual(['UK:teleskopprothese'])
  })
})

// Live-Anruf 05.10.2026 23:00: Befund-Diktat „Teleskop auf 13 und 23, ersetzte Zähne …“ / „es fehlen 14, 15, …“
describe('Befund-Diktat mit Aufzählung nach dem Verb (Live 05.10.2026 23:00)', () => {
  const fehlend = (b: Record<string, string>) => Object.keys(b).filter((z) => b[z] === 'f').sort()

  it('„es fehlen 14, 15, 16, …“ behält die ganze Liste', () => {
    const b = befundVerstehen(befundAusAuftrag('Also es fehlen 14, 15, 16, 17, 18, 24, 25, 26, 27, 28'))
    expect(fehlend(b)).toEqual(['14', '15', '16', '17', '18', '24', '25', '26', '27', '28'])
  })

  it('„ersetzte Zähne …“ am Teleskop-Satzteil ist Befund, keine Pfeiler', () => {
    for (const s of ['Teleskop auf den Zähnen 13 und 23 ersetzte Zähne 14, 15, 16, 24, 25, 26',
      'Teleskop auf den Zähnen 13 und 23, ersetzte Zähne 14, 15, 16, 24, 25, 26']) {
      expect(auftragVerstehen(s).pfeiler.sort(), s).toEqual(['13', '23'])
      expect(fehlend(befundVerstehen(befundAusAuftrag(s))), s).toEqual(['14', '15', '16', '24', '25', '26'])
    }
  })

  it('ganzer Auftrag aus dem Anruf wird ohne Rückfrage geplant', () => {
    const s = 'Ja, bitte, mit einem anderen Befund, und zwar mit Teleskop auf den Szenen 13 und 23 ersetzte Zähne 14, 15, 16, 24, 25, 26. '
      + 'Also es fehlen 14, 15, 16, 17, 18, 24, 25, 26, 27, 28. Auf 13 und auf 23'
    const a = auftragVerstehen(s)
    expect(kiefer(a)).toEqual(['OK:teleskopprothese'])
    const r = planAusAuftrag(a, befundVerstehen(befundAusAuftrag(s), 'OK'))
    expect(r.status, JSON.stringify(r)).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.plan.zaehne['13'].TP).toMatch(/^T/)
    expect(r.plan.zaehne['23'].TP).toMatch(/^T/)
    expect(r.plan.zaehne['16'].TP).toBe('E')
  })

  it('„die restlichen Zähne sind ersetzt“ heißt: Rest fehlt', () => {
    const b = befundVerstehen('13 und 23 vorhanden, die restlichen Zähne sind ersetzt', 'OK')
    expect(b['13']).toBe('')
    expect(b['16']).toBe('f')
    expect(b['21']).toBe('f')
  })

  it('Gegenproben: Pfeilerliste ohne Befund-Wort bleibt komplett, Befund vor der Liste unverändert', () => {
    expect(auftragVerstehen('Teleskope auf 13, 23 und 14').pfeiler.sort()).toEqual(['13', '14', '23'])
    expect(auftragVerstehen('Teleskope auf 33 und 43, 34, 35 fehlen').pfeiler.sort()).toEqual(['33', '43'])
    expect(auftragVerstehen('Teleskopprothese oben. Auf 13 und auf 23').pfeiler.sort()).toEqual(['13', '23'])
    expect(fehlend(befundVerstehen(befundAusAuftrag('die 14, 15 und 16 fehlen, Teleskope auf 13 und 23')))).toEqual(['14', '15', '16'])
  })
})
