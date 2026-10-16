import { describe, expect, it } from 'vitest'
import { auftragVerstehen, befundAusAuftrag, befundVerstehen, planAusAuftrag } from './auftrag'

// Live-Anrufe 05.10.2026 18:35/18:36: Unterkiefer ging verloren bzw. nur der OK wurde angelegt.
const TELE = 'Pass auf, ich möchte, dass du eine Oberkäfertotalprothese machst. und eine Unterkiefer-Teleskoppprothese auf den Eckzähnen, die Vierer, Fünfer, Sechser, Siebner und Achter auf beiden Seiten fehlen'
const TOTAL = 'Es fehlen alle Zähne, ich möchte totale Oberkieferprothese und totale Unterkieferprothese geplant haben'

const kiefer = (a: ReturnType<typeof auftragVerstehen>) =>
  (a.teile ?? [a]).map((t) => `${t.kiefer}:${t.versorgung}`).sort()
const fehlend = (b: Record<string, string>) => Object.keys(b).filter((z) => b[z] === 'f').sort()

describe('Ober- und Unterkiefer gemeinsam, Stellen als Zahlwörter (Live 15.10.2026 14:26)', () => {
  const EINS = 'Ich möchte Teleskopprothese im Oberkiefer- und im Unterkieferplan auf den Eckzähnen, jeweils ein Teleskop, die Zähne vier, fünf, sechs, sieben auf jeder Seite fehlen, die Weisheitszähne fehlen auch alle'
  const ZWEI = 'Okay, nochmal, jeweils auf jeder Seite die Dreier, also die Eckzähne sind Teleskopzähne, die Zähne vier, fünf, sechs, sieben und acht auf jeder Seite fehlen, sowohl im Oberkiefer als auch im Unterkiefer. Ich möchte zwei Teleskopprothese planen mit Teleskop auf allen Dreiern'
  const FEHLT = ['14', '15', '16', '17', '18', '24', '25', '26', '27', '28', '34', '35', '36', '37', '38', '44', '45', '46', '47', '48']

  it.each([EINS, ZWEI])('beide Kiefer mit Teleskopen auf den Dreiern, Vierer bis Achter fehlen überall: %s', (s) => {
    const a = auftragVerstehen(s)
    expect(kiefer(a)).toEqual(['OK:teleskopprothese', 'UK:teleskopprothese'])
    expect(a.teile?.flatMap((t) => t.pfeiler).sort()).toEqual(['13', '23', '33', '43'])
    const b = befundVerstehen(befundAusAuftrag(s), a.kiefer)
    expect(fehlend(b)).toEqual(FEHLT)
    const r = planAusAuftrag(a, b)
    expect(r.status, JSON.stringify(r)).toBe('ok')
    if (r.status !== 'ok') return
    for (const z of ['13', '23', '33', '43']) expect(r.plan.zaehne[z].TP).toMatch(/^T/)
    for (const z of ['16', '26', '36', '46']) expect(r.plan.zaehne[z].TP).toBe('E')
  })

  it('„Zähne vier bis sieben“ ist eine Spanne; Anzahlen und FDI-Nummern bleiben unberührt', () => {
    expect(fehlend(befundVerstehen('im Oberkiefer fehlen die Zähne vier bis sieben'))).toEqual(['14', '15', '16', '17', '24', '25', '26', '27'])
    expect(fehlend(befundVerstehen('es fehlen die Zähne 14 bis 16', 'OK'))).toEqual(['14', '15', '16'])
    expect(kiefer(auftragVerstehen('zwei Teleskopprothesen im Oberkiefer auf 13 und 23'))).toEqual(['OK:teleskopprothese'])
  })
})

describe('Ganzer Kiefer fehlt, mit Ausnahmen (Eva live 16.10.2026 13:37)', () => {
  const OK = ['11', '12', '13', '14', '15', '16', '17', '18', '21', '22', '23', '24', '25', '26', '27', '28']
  it.each([
    'Du sollst für den Herrn Prodromus Fanelas den Befund im Oberkiefer auf alle Zähne fehlend setzen.',
    'im Oberkiefer sind alle Zähne fehlend',
    'im OK fehlen alle Zähne',
  ])('ganzer Oberkiefer fehlend: %s', (s) => {
    expect(fehlend(befundVerstehen(s))).toEqual(OK)
  })

  it.each([
    ['im Oberkiefer fehlen alle Zähne außer 13 und 23', ['13', '23']],
    ['im Oberkiefer fehlen alle Zähne bis auf 13 und 23', ['13', '23']],
    ['im Unterkiefer fehlen alle Zähne ausser den Eckzähnen', ['33', '43']],
  ])('„%s“: die Ausnahmen bleiben stehen', (s, bleiben) => {
    const b = befundVerstehen(s)
    for (const z of bleiben) expect(b[z]).toBe('')
    expect(fehlend(b)).toHaveLength(16 - bleiben.length)
  })
})

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
