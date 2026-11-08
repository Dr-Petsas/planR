import { describe, expect, it } from 'vitest'
import { privatZeEntwurf, type PrivatEntwurf } from './index'

const ok = (r: ReturnType<typeof privatZeEntwurf>): PrivatEntwurf => {
  if (r.status !== 'ok') throw new Error(`Rückfrage: ${r.frage}`)
  return r
}
const goz = (e: PrivatEntwurf) => e.kalkulation.honorar.map((z) => `${z.nr}/${z.zahn}`)
const tp = (e: PrivatEntwurf) => Object.fromEntries(Object.entries(e.plan.zaehne).map(([z, d]) => [z, d.TP]))
const KASSE = /bonus|festzuschuss|bema|richtlinie|regelversorgung|gehören nicht in den hkp/i

describe('privater Zahnersatz per Sprache', () => {
  it('Brücke: Anker und Glied aus dem Auftrag, ohne Werkstoff wie die Regelversorgung, gerechnet nach GOZ/BEB', () => {
    const e = ok(privatZeEntwurf('Brücke von 14 auf 16', { 15: 'f', 14: 'ww', 16: 'kw' }, { patient: { name: 'Test', vorname: 'Anna' } }))
    expect(tp(e)).toEqual({ 14: 'KV', 15: 'BV', 16: 'K' })
    expect(goz(e)).toEqual(expect.arrayContaining(['5010/14', '5010/16', '5070/15', '2290/16']))
    expect(e.plan.nummer).toBe('')
    expect(e.plan.patient).toMatchObject({ name: 'Test', vorname: 'Anna' })
    expect(e.zusammenfassung).toMatchObject({ kronen: ['16', '14'], glieder: ['15'], ersetzt: ['15'] })
    expect(e.zusammenfassung.gesamt).toBe(e.kalkulation.gesamt)
    expect(e.zusammenfassung.gesamt).toBeGreaterThan(0)
    expect(e.hinweise.filter((h) => KASSE.test(h))).toEqual([])
    expect(e.hinweise).toContain('Abformung nicht genannt – konventioneller Abdruck angenommen.')
  })

  it('Vollkeramik: Kronen KM mit Keramik-Labor', () => {
    const e = ok(privatZeEntwurf('Vollkeramikkronen auf 26 und 36', { 26: 'ww', 36: 'kw' }))
    expect(tp(e)).toEqual({ 26: 'KM', 36: 'KM' })
    expect(goz(e)).toEqual(expect.arrayContaining(['2210/26', '2210/36']))
    expect(e.kalkulation.labor.map((z) => z.nr)).toContain('2281')
  })

  it('verschraubte Implantatkrone übernimmt das individuelle Abutment', () => {
    const e = ok(privatZeEntwurf('verschraubte Implantatkrone auf 36', { 36: 'f' }))
    expect(e.plan.implantat.abutment).toBe('individuell')
    expect(goz(e)).toEqual(expect.arrayContaining(['2200/36', '9050/36']))
    expect(goz(e).some((z) => z.startsWith('5080'))).toBe(false)
    expect(e.kalkulation.labor.map((z) => z.nr)).toContain('2033')
  })

  it('vollanatomische Zirkonkrone ohne Verblendschicht', () => {
    const e = ok(privatZeEntwurf('vollanatomische Zirkonkrone 16', { 16: 'ww' }))
    expect(tp(e)['16']).toBe('ZA')
    expect(e.kalkulation.labor.map((z) => z.nr)).toContain('2251')
    expect(e.kalkulation.labor.map((z) => z.nr)).not.toContain('2612')
  })

  it('Implantatkrone: Suprakonstruktion ohne Kassen-Hinweise, Chirurgie nur einmal erwähnt', () => {
    const e = ok(privatZeEntwurf('Implantatkrone auf 36', { 36: 'f' }))
    expect(tp(e)).toEqual({ 36: 'SK' })
    expect(e.zusammenfassung.implantatkronen).toEqual(['36'])
    expect(e.hinweise.filter((h) => KASSE.test(h))).toEqual([])
    expect(e.hinweise.filter((h) => /chirurgisch/i.test(h))).toHaveLength(1)
  })

  it('Rückfragen kommen wie beim HKP', () => {
    expect(privatZeEntwurf('Brücke von 14 auf 16', {})).toMatchObject({ status: 'rueckfrage', grund: 'befund_fehlt' })
    expect(privatZeEntwurf('Brücke von 14 auf 16', { 14: 'ww', 15: '', 16: 'kw' })).toMatchObject({ status: 'rueckfrage', grund: 'glied_vorhanden' })
    expect(privatZeEntwurf('Bitte etwas Schönes', { 14: 'ww' })).toMatchObject({ status: 'rueckfrage', grund: 'versorgung' })
  })

  it('Praxis-Einstellungen gehen in die Rechnung', () => {
    const basis = ok(privatZeEntwurf('Vollkeramikkronen auf 26', { 26: 'ww' }))
    const hoch = ok(privatZeEntwurf('Vollkeramikkronen auf 26', { 26: 'ww' }, { einstellungen: { gozFaktor: 3.5 } }))
    expect(hoch.zusammenfassung.honorar).toBeGreaterThan(basis.zusammenfassung.honorar)
  })
})
