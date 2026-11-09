import { describe, expect, it } from 'vitest'
import type { Preisliste } from '../types'
import { STANDARD_LISTEN } from '../store/preislisten'
import { berechnen, type Listen } from './berechnung'
import { auftragVerstehen, befundAusAuftrag, befundVerstehen, planAusAuftrag, zaehneIn, type Befund } from './auftrag'

const liste = <T extends Preisliste['typ']>(typ: T, id: string) => STANDARD_LISTEN.find((l) => l.typ === typ && l.id === id) as Preisliste<T>
const LISTEN: Listen = {
  bema: liste('bema', 'bema-2026'), goz: liste('goz', 'goz-2012'), bel: liste('bel2', 'bel2-bayern-2026'),
  beb: liste('beb', 'beb-itz-2024'), fz: liste('festzuschuss', 'fz-2026'),
}
const SATZ = 'Erstelle mir einen HKP für Herrn Meier, für eine Teleskopprothese mit Teleskopen auf den OK 4ern und nach distal ersetzt als Cover Denture'
const fehlend = (...zs: string[]): Befund => Object.fromEntries(zs.map((z) => [z, 'f']))
const OK_OHNE_4 = ['18', '17', '16', '15', '13', '12', '11', '21', '22', '23', '25', '26', '27', '28']

describe('Auftrag verstehen', () => {
  it('Teleskop-Cover-Denture auf den OK-Vierern', () => {
    expect(auftragVerstehen(SATZ)).toMatchObject({
      versorgung: 'teleskopprothese', kiefer: 'OK', pfeiler: ['14', '24'], coverDenture: true, mitAchtern: false,
    })
  })

  it('Bonusheft über zehn Jahre ist 75 Prozent', () => {
    expect(auftragVerstehen('Bonusheft zehn Jahre').bonus).toBe('75')
    expect(auftragVerstehen('ohne Bonus').bonus).toBe('60')
    expect(auftragVerstehen('Mach die Teleskope in Hochgold')).toMatchObject({ versorgung: 'teleskopprothese', werkstoff: 'hochgold' })
  })

  it('Zahnangaben: Spannen über die Mitte, Seiten, Wortformen', () => {
    expect(zaehneIn('13 bis 23')).toEqual(['13', '12', '11', '21', '22', '23'])
    expect(zaehneIn('auf dem rechten Vierer unten')).toEqual(['44'])
    expect(zaehneIn('Teleskope auf den Eckzähnen', 'UK')).toEqual(['43', '33'])
    expect(zaehneIn('die Frontzähne', 'OK')).toEqual(['13', '12', '11', '21', '22', '23'])
    expect(zaehneIn('Teleskope auf 33 und 43')).toEqual(['33', '43'])
  })

  it('Material, Abformung, Entfernen und Erhalten', () => {
    const a = auftragVerstehen('Konusprothese UK auf 33 und 43 in Hochgold, gescannt, 32 bis 42 werden entfernt')
    expect(a).toMatchObject({ versorgung: 'teleskopprothese', kiefer: 'UK', pfeiler: ['33', '43'], werkstoff: 'hochgold', abformung: 'scan' })
    expect(a.entfernen).toEqual(['42', '41', '31', '32'])
    expect(auftragVerstehen('Teleskope auf 13 und 23, die Front bleibt').erhalten).toEqual(['13', '12', '11', '21', '22', '23'])
  })

  it('Aufzählung beim Entfernen zählt ganz (Anruf 06.11.2026 08:38)', () => {
    const live = auftragVerstehen('All-on-6 im Oberkiefer auf den Implantaten 16, 13, 14, 23, 24 und 26, nach Entfernung der Zähne 15, 12, 11, 21, 22 und 25, festsitzende Prothese, Kasse.')
    expect(live.entfernen).toEqual(['15', '12', '11', '21', '22', '25'])
    expect(live.pfeiler).toEqual(['16', '13', '14', '23', '24', '26'])
    expect(auftragVerstehen('Teleskope auf 13 und 23, die Zähne 12, 11, 21 und 22 werden entfernt').entfernen).toEqual(['12', '11', '21', '22'])
    expect(auftragVerstehen('Teleskope auf 13 und 23, die Zähne 15, 16 und 17 bleiben').erhalten).toEqual(['15', '16', '17'])
    // Einzahl hinten gilt nur dem eigenen Zahn, ein vorn stehendes Verb endet am nächsten Satzteil ohne Zähne
    const einzeln = auftragVerstehen('Krone auf 16, 17, 15 wird entfernt')
    expect(einzeln.entfernen).toEqual(['15'])
    expect(auftragVerstehen('Entfernung 15, Kasse, 13 und 23').entfernen).toEqual(['15'])
  })

  it('gesprochener Befund', () => {
    expect(befundVerstehen('es fehlen 15 bis 17 und 25 bis 27, 14 überkronungsbedürftig')).toMatchObject({ 15: 'f', 17: 'f', 25: 'f', 27: 'f', 14: 'ww' })
    const b = befundVerstehen('14 und 24 sind vorhanden, alle anderen fehlen', 'OK')
    expect(b[14]).toBe('')
    expect(b[11]).toBe('f')
    expect(b[18]).toBe('f')
  })

  it('„Alle Zähne sind gesund“ beantwortet die Befundfrage (Anruf 07.10.2026 16:26)', () => {
    const b = befundVerstehen('Alle Zähne sind gesund', 'OK')
    expect(Object.keys(b).sort()).toEqual(['11', '12', '13', '14', '15', '16', '17', '18', '21', '22', '23', '24', '25', '26', '27', '28'])
    expect(Object.values(b).every((c) => c === '')).toBe(true)
    expect(befundVerstehen('es fehlt keiner', 'UK')[36]).toBe('')
    const c = befundVerstehen('16 fehlt, alle anderen Zähne sind vorhanden', 'OK')
    expect(c[16]).toBe('f')
    expect(c[15]).toBe('')
    expect(befundVerstehen('alle anderen fehlen', 'OK')[11]).toBe('f')
  })

  it('Implantat „am Zahn 26“ / „in Region 26“ ist die Implantatposition (Anruf 07.10.2026 19:36)', () => {
    const a = auftragVerstehen('Ich möchte einen Kostenvoranschlag erstellen für ein Implantat, und zwar am Zahn 26')
    expect([a.versorgung, a.pfeiler]).toEqual(['implantatkronen', ['26']])
    expect(auftragVerstehen('Ein einfaches Implantat ohne Knochenaufbau in Region 26').pfeiler).toEqual(['26'])
    expect(auftragVerstehen('Teleskopprothese im Oberkiefer, am Zahn 26 fehlt einer').pfeiler).toEqual([])
  })

  it('gesprochene Befund-Kürzel: „ww“ (Parakeet: „www“) und „kw“', () => {
    expect(befundVerstehen('Die Zähne 13 bis 23 sind www', 'OK')).toMatchObject({ 13: 'ww', 11: 'ww', 23: 'ww' })
    expect(befundVerstehen('14 ist k w', 'OK')[14]).toBe('kw')
  })

  it('alle eHKP-Befunde gesprochen erkennen – der neue Befund geht nach Dampsoft (Chef 14.10.2026)', () => {
    const faelle: [string, string][] = [
      ['15 ist überkront', 'k'], ['15 hat eine intakte Krone', 'k'], ['Krone auf 15 erneuerungsbedürftig', 'kw'],
      ['15 ist überkronungsbedürftig', 'ww'], ['15 ist weitgehend zerstört', 'ww'], ['15 nicht erhaltungswürdig', 'x'],
      ['15 mit Teildefekt', 'pw'], ['15 braucht eine Teilkrone', 'pw'], ['Teilkrone 15 erneuerungsbedürftig', 'pkw'],
      ['15 unzureichende Retention', 'ur'], ['15 ist ein Brückenglied', 'b'], ['Brückenglied 15 erneuerungsbedürftig', 'bw'],
      ['15 Teleskop vorhanden', 't'], ['Teleskop 15 erneuerungsbedürftig', 'tw'], ['Sekundärteil 15 erneuerungsbedürftig', 't2w'],
      ['15 durch Prothese ersetzt', 'e'], ['15 durch Prothese ersetzt und erneuerungsbedürftig', 'ew'],
      ['15 Adhäsivbrückenanker', 'a'], ['Adhäsivbrückenanker 15 erneuerungsbedürftig', 'aw'],
      ['15 Adhäsivbrückenglied', 'ab'], ['Adhäsivbrückenglied 15 erneuerungsbedürftig', 'abw'],
      ['15 Wurzelstiftkappe', 'r'], ['Wurzelstiftkappe 15 erneuerungsbedürftig', 'rw'],
      ['15 Implantat vorhanden', 'i'], ['15 ist ein Implantat', 'i'], ['Implantat 15 nicht erhaltungswürdig', 'ix'],
      ['15 Implantatkrone', 'sk'], ['Implantatkrone 15 erneuerungsbedürftig', 'skw'],
      ['15 Implantatbrückenglied', 'sb'], ['Implantatbrückenglied 15 erneuerungsbedürftig', 'sbw'],
      ['15 Implantatteleskop', 'st'], ['Implantatteleskop 15 erneuerungsbedürftig', 'stw'],
      ['15 ersetzt durch Implantatprothese', 'se'], ['15 ersetzt durch Implantatprothese erneuerungsbedürftig', 'sew'],
      ['15 Implantatverbindungselement', 'so'], ['Implantatverbindungselement 15 erneuerungsbedürftig', 'sow'],
      ['15 Lückenschluss', ')('], ['15 fehlt', 'f'], ['15 ist vorhanden', ''],
    ]
    for (const [satz, code] of faelle) expect([satz, befundVerstehen(satz, 'OK')[15]]).toEqual([satz, code])
  })

  it('Kürzel selbst diktiert: „15 sk“, „16 s k w“, „17 t 2 w“', () => {
    const b = befundVerstehen('15 sk, 16 s k w, 17 t 2 w, 14 pkw, 13 )(, 26 i, 27 ix', 'OK')
    expect([b[15], b[16], b[17], b[14], b[13], b[26], b[27]]).toEqual(['sk', 'skw', 't2w', 'pkw', ')(', 'i', 'ix'])
  })

  it('zweiter Befund im selben Satzteil: „es fehlen 16 und 17 und 15 ist überkront“', () => {
    expect(befundVerstehen('es fehlen 16 und 17 und 15 ist überkront', 'OK')).toEqual({ 16: 'f', 17: 'f', 15: 'k' })
    expect(befundVerstehen('16 und 17 fehlen und 14 und 15 sind überkront', 'OK')).toEqual({ 16: 'f', 17: 'f', 14: 'k', 15: 'k' })
    expect(befundVerstehen('16 ist überkront und 17 fehlt', 'OK')).toEqual({ 16: 'k', 17: 'f' })
    expect(befundVerstehen('16 und 17 fehlen', 'OK')).toEqual({ 16: 'f', 17: 'f' })
  })

  it('Befund ändern per Sprache: „47 Implantat“ und „15 und 13 Kronen“ erben kein Kürzel vom Nachbarn', () => {
    expect(befundVerstehen('37 zerstört. 47 Implantat')).toEqual({ 37: 'x', 47: 'i' })
    expect(befundVerstehen('14 Brückenglied, 15 und 13 Kronen')).toEqual({ 14: 'b', 15: 'k', 13: 'k' })
    expect(befundVerstehen('16 fehlt, 17, 18')).toEqual({ 16: 'f', 17: 'f', 18: 'f' })
    const live = befundVerstehen('Im Oberkiefer fehlen die Zähne 18 bis 14, 12, 11, 21 und 22 sowie 24 bis 28. Es sind nur die Zähne 13 und 23 vorhanden.')
    expect(live[13]).toBe('')
    expect(live[23]).toBe('')
    for (const z of ['18', '17', '16', '15', '14', '12', '11', '21', '22', '24', '25', '26', '27', '28']) expect(live[z], z).toBe('f')
    expect(live[33]).toBeUndefined()
    expect(befundAusAuftrag('Brücke von 34 auf 36, 37 Krone')).not.toMatch(/37/)
  })

  it('im Auftrag ist „15 ist ein Brückenglied“ Therapie, „17 ist überkront“ Befund', () => {
    expect(befundAusAuftrag('Brücke von 14 auf 16, 15 ist ein Brückenglied')).toBe('15 fehlt')
    expect(befundVerstehen(befundAusAuftrag('Brücke von 14 auf 16, 17 ist überkront'), 'OK')).toMatchObject({ 15: 'f', 17: 'k' })
  })

  it('beide Kiefer in einem Auftrag: OK Totalprothese, UK Teleskope (Gespräch 05.10.2026)', () => {
    const satz = 'Im Oberkiefer eine Totalprothese und im Unterkiefer eine Teleskopprothese auf die Dreier und Vierer beidseitig.'
    const a = auftragVerstehen(satz)
    expect(a.teile?.map((x) => [x.kiefer, x.versorgung, x.pfeiler.sort()])).toEqual([
      ['OK', 'totalprothese', []],
      ['UK', 'teleskopprothese', ['33', '34', '43', '44']],
    ])
    const befund = befundVerstehen('Im Unterkiefer stehen nur die Dreier und Vierer, die Front, die Fünfer, Sechser und Siebener fehlen', 'UK')
    const r = planAusAuftrag(a, befund)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    const tp = Object.fromEntries(Object.entries(r.plan.zaehne).filter(([, z]) => z.TP).map(([n, z]) => [n, z.TP]))
    expect(tp['11']).toBe('E')
    expect(tp['17']).toBe('E')
    expect(tp['33']).toMatch(/^T/)
    expect(tp['44']).toMatch(/^T/)
    expect(tp['41']).toBe('E')
    expect(r.hinweise).toContain('Oberkiefer: kein Befund genannt – für die Totalprothese als zahnlos angenommen.')
  })

  it('Befund wie gesprochen: „stehen nur“ und nachgestelltes „fehlen“', () => {
    const b = befundVerstehen('Und die Sechser und Siebener fehlen, es stehen also im Unterkiefer nur die Dreier und Vierer auf beiden Seiten.')
    expect(['33', '34', '43', '44'].map((z) => b[z])).toEqual(['', '', '', ''])
    expect(['31', '35', '36', '47', '48'].map((z) => b[z])).toEqual(['f', 'f', 'f', 'f', 'f'])
    const c = befundVerstehen('es fehlen 15 bis 18, 25 bis 28', 'OK')
    expect([c[15], c[18], c[25], c[28]]).toEqual(['f', 'f', 'f', 'f'])
  })

  it('Auftrag über mehrere Sätze (wie Clara ihn sammelt): Befund wird mitgenommen', () => {
    const text = [
      'Ich möchte einen Heil- und Kostenplan erstellen für Michael Petsas',
      'Im Oberkiefer eine Totalprothese',
      'und im Unterkiefer eine Teleskoppprothese auf die Dreier und Vierer beidseitig',
      'Und die Sechser und Siebener fehlen, es stehen also im Unterkiefer nur die Dreier und Vierer auf beiden Seiten',
    ].join('. ')
    const befundText = befundAusAuftrag(text)
    expect(befundText).not.toMatch(/prothese|kostenplan/)
    const a = auftragVerstehen(text)
    const r = planAusAuftrag(a, befundVerstehen(befundText, a.kiefer))
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.plan.zaehne['33'].TP).toMatch(/^T/)
    expect(r.plan.zaehne['36'].TP).toBe('E')
    expect(r.plan.zaehne['21'].TP).toBe('E')
  })

  it('beide Kiefer genannt, aber nur einer geplant: Kiefer wird erkannt', () => {
    const a = auftragVerstehen('Im Oberkiefer fehlt die Front. Im Unterkiefer eine Teleskopprothese auf 33 und 43.')
    expect(a.teile).toBeUndefined()
    expect(a.kiefer).toBe('UK')
    expect(a.versorgung).toBe('teleskopprothese')
  })

  it('Interims-Vollprothese nur Unterkiefer plant den Oberkiefer nicht (Zaharia 06.11.2026)', () => {
    const befund: Befund = {
      11: 'e', 12: 'e', 13: 'e', 14: 'e', 15: 'e', 16: 'e', 17: 'f', 18: 'f',
      21: 'e', 22: 'e', 23: 'e', 24: 'e', 25: 'e', 26: 'j', 27: 'f', 28: 'f',
      48: 'f', 47: 'e', 46: 'x', 45: 'b', 44: 'x', 43: 'x', 42: 'b', 41: 'b',
      31: 'b', 32: 'b', 33: 'x', 34: 'x', 35: 'b', 36: 'x', 37: 'e', 38: 'f',
    }
    const a = auftragVerstehen('Interimsvollprothese Unterkiefer, Eigenlabor')
    a.entfernen = ['46', '44', '43', '33', '34', '36']
    expect(a).toMatchObject({ versorgung: 'totalprothese', kiefer: 'UK', interim: true })
    const r = planAusAuftrag(a, befund)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.plan.weitere.interimUK).toBe(true)
    expect(r.plan.weitere.interimOK).toBe(false)
    expect(r.plan.befunde.map((b) => b.nr)).toContain('5.4')
    expect(r.plan.befunde.some((b) => b.zahnGebiet === 'OK' || b.zahnGebiet === '26')).toBe(false)
    expect(r.plan.positionen.some((p) => p.zahn === 'OK' || p.zahn === '26')).toBe(false)
    expect(r.plan.positionen.some((p) => p.nr === '97b' && p.zahn === 'UK')).toBe(true)
    expect(r.plan.positionen.some((p) => p.nr === '98c' || p.nr === '98b')).toBe(false)
    expect(r.plan.zaehne['16'].TP).toBe('')
    expect(r.plan.zaehne['36'].TP).toBe('E')
    const definitiv = planAusAuftrag({ ...a, interim: false }, befund)
    expect(definitiv.status).toBe('ok')
    if (definitiv.status !== 'ok') return
    expect(definitiv.plan.befunde.map((b) => b.nr)).toContain('4.4')
    expect(definitiv.plan.befunde.some((b) => b.zahnGebiet === 'OK')).toBe(false)
  })

  it('Vollprothese in beiden Kiefern ohne Befund: zahnlos angenommen', () => {
    const r = planAusAuftrag(auftragVerstehen('Im Oberkiefer eine Vollprothese und im Unterkiefer eine Vollprothese.'), {})
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.plan.befunde.map((x) => x.nr)).toEqual(expect.arrayContaining(['4.2', '4.4']))
  })

  it('gesprochener Befund ohne Achter: Restzahnbestand zählt richtig (4.x statt 3.x)', () => {
    const befund = befundVerstehen('14 und 24 vorhanden, 15 bis 17 fehlen, 25 bis 27 fehlen, 13 bis 23 fehlen', 'OK')
    const r = planAusAuftrag(auftragVerstehen(SATZ), befund)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.plan.befunde.map((x) => x.nr)).toEqual(expect.arrayContaining(['4.1', '4.6', '4.7']))
    expect(r.hinweise).toContain('18 und 28 nicht genannt – als fehlend angenommen.')
  })

  it('Kiefer-Aussage mitten im Auftrag: „Unterkiefer ist voll bezahnt“ plant keinen UK (Anruf 14.10.2026 12:30)', () => {
    const erster = 'Genau, da möchte ich einen heilen Kostenplan machen für eine Oberkiefer-Teleskoppprothese mit Teleskope auf 13 und 23 und die Zähne 14 bis 17 und 24 bis 27 ersetzen'
    const zweiter = 'Es fehlen 14 bis 17, 24 bis 27, die Achter fehlen alle, Unterkiefer ist voll bezahnt, und ich möchte Teleskope auf 13 und 23 und ersetzte Zähne prämolaren und molaren im Oberkiefer, acht Stück insgesamt'
    for (const satz of [zweiter, `${erster}. ${zweiter}`]) {
      const a = auftragVerstehen(satz)
      expect(a.teile).toBeUndefined()
      expect([a.kiefer, a.versorgung, a.pfeiler]).toEqual(['OK', 'teleskopprothese', ['13', '23']])
      const b = befundVerstehen(befundAusAuftrag(satz), a.kiefer)
      expect(['14', '17', '24', '27', '18', '28'].map((z) => b[z])).toEqual(['f', 'f', 'f', 'f', 'f', 'f'])
      expect(['31', '36', '41', '47'].map((z) => b[z])).toEqual(['', '', '', ''])
      expect(planAusAuftrag(a, b).status).toBe('ok')
    }
    const nurErster = auftragVerstehen(erster)
    expect([nurErster.kiefer, nurErster.pfeiler]).toEqual(['OK', ['13', '23']])
    expect(befundVerstehen(befundAusAuftrag(erster), 'OK')).toMatchObject({ 14: 'f', 17: 'f', 24: 'f', 27: 'f' })
  })

  it('Antwort auf „Für den Unterkiefer habe ich keinen Befund“: gilt dem genannten Kiefer, nicht dem Auftrags-Kiefer', () => {
    const b = befundVerstehen('es fehlen 14 bis 17. Im Unterkiefer sind alle Zähne vorhanden', 'OK')
    expect([b[14], b[36], b[41]]).toEqual(['f', '', ''])
    expect(b[11]).toBeUndefined()
    for (const s of ['unten sind alle da', 'im Unterkiefer fehlen keine', 'Unterkiefer vollbezahnt', 'im Unterkiefer fehlt keiner'])
      expect(befundVerstehen(s, 'OK')[46]).toBe('')
    expect(befundVerstehen('die sind alle da', 'UK')[36]).toBe('')
    expect(befundAusAuftrag('Unterkiefer ist voll bezahnt')).toBe('unterkiefer ist voll bezahnt')
    for (const uk of ['Im Unterkiefer die Sechser sind kariös', 'im Unterkiefer 36 ist nicht erhaltungswürdig']) {
      const a = auftragVerstehen(`Oberkiefer Teleskopprothese auf 13 und 23, 14 bis 17 und 24 bis 27 ersetzen. ${uk}`)
      expect([a.teile, a.kiefer, a.versorgung]).toEqual([undefined, 'OK', 'teleskopprothese'])
    }
  })
})

describe('Plan aus Auftrag', () => {
  it('nur 14 und 24 vorhanden: Teleskope 14/24, alle übrigen ersetzt, Festzuschuss 4.1/4.6/4.7', () => {
    const r = planAusAuftrag(auftragVerstehen(SATZ), { ...fehlend(...OK_OHNE_4), 14: '', 24: '' }, { bonus: '70' })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    const tp = Object.fromEntries(Object.entries(r.plan.zaehne).filter(([, v]) => v.TP).map(([z, v]) => [z, v.TP]))
    expect(tp).toMatchObject({ 14: 'TV', 24: 'TV', 17: 'E', 11: 'E', 27: 'E' })
    expect(tp[18]).toBeUndefined()
    expect(r.plan.befunde.map((b) => b.nr)).toEqual(expect.arrayContaining(['4.1', '4.6', '4.7']))
    expect(r.plan.abformung).toBe('abdruck')
    expect(r.hinweise.some((h) => h.startsWith('Abformung nicht genannt'))).toBe(true)
    const e = berechnen(r.plan, LISTEN)
    expect(e.summen.festzuschuss).toBeGreaterThan(0)
    expect(e.summen.eigenanteil).toBeGreaterThan(0)
    expect(e.positionen.some((p) => p.ebene === 'BEL' && p.nr === '1200' && p.zahn === '14')).toBe(true)
  })

  it('Totalprothese: Implantate ohne Suprakonstruktion sind Lücken, keine Zähne zum Entfernen', () => {
    const uk = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']
    const befund = fehlend(...uk)
    for (const z of ['46', '44', '43', '33', '34', '36']) befund[z] = 'i'
    const r = planAusAuftrag(auftragVerstehen('Unterkiefer Totalprothese'), befund)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.plan.zaehne['46']).toMatchObject({ B: 'i', TP: 'E' })
    expect(planAusAuftrag(auftragVerstehen('Unterkiefer Totalprothese'), { ...befund, 46: 'j' })).toMatchObject({ status: 'rueckfrage', grund: 'restzaehne', zaehne: ['46'] })
    expect(r.plan.zaehne['41']).toMatchObject({ B: 'f', TP: 'E' })
    expect(r.plan.befunde.map((b) => b.nr)).toContain('4.4')
    expect(r.hinweise.some((h) => h.includes('ohne Suprakonstruktion'))).toBe(true)
    const krone = { ...befund, 46: 'sk' }
    const intact = planAusAuftrag(auftragVerstehen('Unterkiefer Totalprothese'), krone)
    expect(intact.status).toBe('ok')
    if (intact.status === 'ok') expect(intact.plan.zaehne['46']).toMatchObject({ B: 'sk', R: '', TP: '' })
    const erneuerung = { ...befund, 46: 'skw' }
    expect(planAusAuftrag(auftragVerstehen('Unterkiefer Totalprothese'), erneuerung)).toMatchObject({ status: 'rueckfrage', grund: 'restzaehne', zaehne: ['46'] })
    const zahn = { ...befund, 41: '' }
    expect(planAusAuftrag(auftragVerstehen('Unterkiefer Totalprothese'), zahn)).toMatchObject({ status: 'rueckfrage', grund: 'restzaehne', zaehne: ['41'] })
    const trotzSatz = planAusAuftrag(auftragVerstehen('Totalprothese im Unterkiefer, 46 und 44 und 43 und 33 und 34 und 36 werden entfernt'), befund)
    expect(trotzSatz.status).toBe('ok')
    if (trotzSatz.status === 'ok') expect(trotzSatz.plan.zaehne['46']).toMatchObject({ B: 'i', TP: 'E' })
  })

  it('Frontzähne stehen noch: Rückfrage erhalten oder entfernen – danach geplant', () => {
    const befund = { ...fehlend('18', '17', '16', '15', '25', '26', '27', '28'), 14: '', 24: '', 13: '', 12: '', 11: '', 21: '', 22: '', 23: '' }
    const r = planAusAuftrag(auftragVerstehen(SATZ), befund)
    expect(r).toMatchObject({ status: 'rueckfrage', grund: 'restzaehne', zaehne: ['13', '12', '11', '21', '22', '23'] })
    const entfernt = planAusAuftrag(auftragVerstehen(`${SATZ}, die Frontzähne werden entfernt`), befund)
    expect(entfernt.status).toBe('ok')
    if (entfernt.status === 'ok') expect(entfernt.plan.zaehne['11']).toMatchObject({ B: 'x', TP: 'E' })
    const erhalten = planAusAuftrag(auftragVerstehen('Teleskopprothese mit Teleskopen auf den OK-Vierern, nach distal ersetzt, Front bleibt'), befund)
    expect(erhalten.status).toBe('ok')
    if (erhalten.status === 'ok') {
      expect(erhalten.plan.zaehne['11'].TP).toBe('')
      expect(erhalten.plan.zaehne['16'].TP).toBe('E')
    }
  })

  it('Pfeiler fehlt laut Befund, kein Befund, kein Kiefer: Rückfragen statt Raten', () => {
    expect(planAusAuftrag(auftragVerstehen(SATZ), { ...fehlend(...OK_OHNE_4, '14'), 24: '' })).toMatchObject({ status: 'rueckfrage', grund: 'pfeiler_fehlt', zaehne: ['14'] })
    expect(planAusAuftrag(auftragVerstehen(SATZ), {})).toMatchObject({ status: 'rueckfrage', grund: 'befund_fehlt' })
    expect(planAusAuftrag(auftragVerstehen('Teleskopprothese auf den Vierern'), { 14: '' })).toMatchObject({ status: 'rueckfrage', grund: 'kiefer' })
  })

  it('Zahnlos, Implantate Region 3, 4 und 6 je Quadrant, Brücken von 4 auf 6 und von 3 auf 3', () => {
    const befund = befundVerstehen('ändere den Befund bei Fanelas Prodromos auf zahnlos mit Implantaten in deek Regione 3 4 und 6 in jedem Quadranten')
    expect(befundVerstehen('zahnlos, Implantate in der Region drei, vier und sechs in jedem Quadranten')['36']).toBe('i')
    const implantate = ['13', '14', '16', '23', '24', '26', '33', '34', '36', '43', '44', '46']
    expect(implantate.every((z) => befund[z] === 'i')).toBe(true)
    expect(befund[15]).toBe('f')
    expect(befund[11]).toBe('f')
    expect(befund[17]).toBe('f')
    expect(befund[18]).toBe('f')
    expect(Object.values(befund).filter((c) => c === 'i')).toHaveLength(12)

    const a = auftragVerstehen('Brücken aus vollanatomischem Zirkon mit Vollverbelndung jeweils von 4 auf 6 und von 3 auf 3, mit Intraoralscan')
    expect(a.versorgung).toBe('bruecke')
    expect(a.abformung).toBe('scan')
    expect(a.verblendung).toBe('voll')
    expect(a.form).toBe('vollanatomisch')
    expect(a.teile?.map((t) => t.kiefer).sort()).toEqual(['OK', 'UK'])
    const okTeil = a.teile?.find((t) => t.kiefer === 'OK')
    expect(okTeil?.pfeiler.sort()).toEqual(['13', '14', '16', '23', '24', '26'])
    expect(okTeil?.glieder?.sort()).toEqual(['11', '12', '15', '21', '22', '25'])
    const ukTeil = a.teile?.find((t) => t.kiefer === 'UK')
    expect(ukTeil?.pfeiler.sort()).toEqual(['33', '34', '36', '43', '44', '46'])
    expect(ukTeil?.glieder?.sort()).toEqual(['31', '32', '35', '41', '42', '45'])

    const r = planAusAuftrag(a, befund)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.plan.abformung).toBe('scan')
    expect(r.plan.zaehne['14'].TP).toBe('SKM')
    expect(r.plan.zaehne['15'].TP).toBe('SBM')
    expect(r.plan.zaehne['13'].TP).toBe('SKM')
    expect(r.plan.zaehne['11'].TP).toBe('SBM')
    expect(r.plan.zaehne['44'].TP).toBe('SKM')
    expect(r.plan.zaehne['45'].TP).toBe('SBM')
    expect(r.plan.zaehne['17'].TP).toBe('')
    expect(r.plan.befunde.map((b) => b.nr)).toEqual(expect.arrayContaining(['4.2', '4.4']))
    const e = berechnen(r.plan, LISTEN)
    const pos = e.positionen.map((p) => `${p.ebene} ${p.nr} ${p.zahn}`)
    expect(pos).toContain('GOZ 5000 14')
    expect(pos).toContain('BEB 2612 14')
    expect(pos.some((p) => p.startsWith('BEB 2251'))).toBe(false)
    expect(pos.some((p) => p.startsWith('GOZ 5070'))).toBe(true)
    expect(pos.some((p) => p.startsWith('GOZ 0065'))).toBe(true)
    expect(auftragVerstehen('Brücke von 14 auf 16').pfeiler).toEqual(['14', '16'])
  })

  it('aufgelöste Zahnnummern: Implantate sind i, Unterkiefer-Brücken behalten die Glieder', () => {
    const befund = befundVerstehen('zahnlos. 13, 14, 16, 23, 24, 26, 33, 34, 36, 43, 44 und 46 sind Implantate.')
    for (const z of ['13', '14', '16', '23', '24', '26', '33', '34', '36', '43', '44', '46']) expect(befund[z]).toBe('i')
    expect(befund[15]).toBe('f')
    const a = auftragVerstehen('Implantatbrücken aus vollanatomischem Zirkon mit Vollverblendung, Intraoralscan. Oberkiefer von 14 auf 16, von 24 auf 26 und von 13 auf 23. Unterkiefer von 44 auf 46, von 34 auf 36 und von 43 auf 33.')
    const uk = a.teile?.find((t) => t.kiefer === 'UK')
    expect(uk?.glieder?.sort()).toEqual(['31', '32', '35', '41', '42', '45'])
    const r = planAusAuftrag(a, befund)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.plan.zaehne['33'].TP).toBe('SKM')
    expect(r.plan.zaehne['31'].TP).toBe('SBM')
    expect(r.plan.abformung).toBe('scan')
  })

  it('Brücke per Sprache: Anker, Glieder, Lücke als Befund (Gespräch 06.10.2026)', () => {
    const live = auftragVerstehen('Ich möchte eine Brücke planen von 14 auf 16 Zirkonkronen und 15 ist ein Brückenglied aus Zirkon.')
    expect(live).toMatchObject({ versorgung: 'bruecke', kiefer: 'OK', pfeiler: ['14', '16'], glieder: ['15'], werkstoff: 'zirkon' })
    expect(auftragVerstehen('Brücke 14 bis 16')).toMatchObject({ pfeiler: ['14', '16'], glieder: ['15'] })
    expect(auftragVerstehen('Brücke auf 34 und 37')).toMatchObject({ kiefer: 'UK', pfeiler: ['34', '37'], glieder: ['35', '36'] })
    expect(auftragVerstehen('Brücke 13 auf 16, 14 und 15 sind Brückenglieder')).toMatchObject({ pfeiler: ['13', '16'], glieder: ['14', '15'] })
    expect(befundAusAuftrag('Brücke von 14 auf 16, 15 als Brückenglied')).toBe('15 fehlt')
    expect(befundAusAuftrag('Brücke 24 auf 27, 25 und 26 fehlen')).toBe('25 und 26 fehlen')

    const r = planAusAuftrag(live, { 15: 'f' })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.plan.zaehne['14'].TP).toBe('KM')
    expect(r.plan.zaehne['15'].TP).toBe('BM')
    expect(r.plan.zaehne['16'].TP).toBe('KM')
    expect(r.plan.befunde.map((b) => b.nr)).toContain('2.1')
    const e = berechnen(r.plan, LISTEN)
    expect(e.summen.festzuschuss).toBeGreaterThan(0)
    expect(e.summen.gesamt).toBeGreaterThan(e.summen.festzuschuss)

    const nem = planAusAuftrag(auftragVerstehen('Brücke von 14 auf 16'), { 15: 'f' })
    expect(nem.status).toBe('ok')
    expect(planAusAuftrag(auftragVerstehen('Brücke von 14 auf 16'), { 15: '' })).toMatchObject({ status: 'rueckfrage', grund: 'glied_vorhanden', zaehne: ['15'] })
    expect(planAusAuftrag(auftragVerstehen('Brücke von 14 auf 16'), { 15: 'f', 16: 'f' })).toMatchObject({ status: 'rueckfrage', grund: 'pfeiler_fehlt', zaehne: ['16'] })
    expect(planAusAuftrag(auftragVerstehen('Eine Brücke bitte'), { 15: 'f' })).toMatchObject({ status: 'rueckfrage', grund: 'pfeiler' })
  })

  it('Implantatkronen per Sprache: SK auf den Lücken (Gespräch 06.10.2026 15:38)', () => {
    const satz = 'Hallo, ich brauche ein Implantat HKP für Implantatkronen auf 14 und 15 bei Erika Musterfrau. Zirkonkrone.'
    const a = auftragVerstehen(satz)
    expect(a).toMatchObject({ versorgung: 'implantatkronen', kiefer: 'OK', pfeiler: ['14', '15'], werkstoff: 'zirkon' })
    expect(befundAusAuftrag(satz)).toBe('14 und 15 fehlen')
    const r = planAusAuftrag(a, befundVerstehen(befundAusAuftrag(satz)))
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.plan.zaehne['14'].TP).toMatch(/^SK/)
    expect(r.plan.zaehne['15'].TP).toMatch(/^SK/)
    const e = berechnen(r.plan, LISTEN)
    expect(e.positionen.some((p) => p.ebene === 'GOZ' && p.nr === '9050')).toBe(true)
    expect(e.summen.gesamt).toBeGreaterThan(e.summen.festzuschuss)
    expect(planAusAuftrag(auftragVerstehen('Implantatkrone auf 36'), { 36: '' })).toMatchObject({ status: 'rueckfrage', grund: 'zahn_vorhanden', zaehne: ['36'] })
    expect(planAusAuftrag(auftragVerstehen('Implantatkrone auf 36, 36 wird entfernt'), { 36: '' }).status).toBe('ok')
    expect(planAusAuftrag(auftragVerstehen('Ein Implantat bitte'), { 15: 'f' })).toMatchObject({ status: 'rueckfrage', grund: 'pfeiler' })
  })

  it('Kronen: Befund muss die Krone tragen; Keramik wird gleichartig, Material wird gesetzt', () => {
    expect(planAusAuftrag(auftragVerstehen('Krone auf 16'), { 16: '' })).toMatchObject({ status: 'rueckfrage', grund: 'krone_befund' })
    const r = planAusAuftrag(auftragVerstehen('Zirkonkronen auf 16 und 26'), { 16: 'ww', 26: 'kw' })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.plan.zaehne['16'].TP).toBe('KM')
    expect(r.plan.werkstoffe).toEqual({ 16: 'zirkon', 26: 'zirkon' })
    expect(berechnen(r.plan, LISTEN).positionen.filter((p) => p.material).map((p) => p.betrag)).toEqual([15, 15])
  })
})
