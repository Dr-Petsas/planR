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

  it('gesprochener Befund', () => {
    expect(befundVerstehen('es fehlen 15 bis 17 und 25 bis 27, 14 überkronungsbedürftig')).toMatchObject({ 15: 'f', 17: 'f', 25: 'f', 27: 'f', 14: 'ww' })
    const b = befundVerstehen('14 und 24 sind vorhanden, alle anderen fehlen', 'OK')
    expect(b[14]).toBe('')
    expect(b[11]).toBe('f')
    expect(b[18]).toBe('f')
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
