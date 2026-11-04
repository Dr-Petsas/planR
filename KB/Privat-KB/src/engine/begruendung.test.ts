import { describe, expect, it } from 'vitest'
import { rechnen, vorlageAnwenden } from './kb'
import { begruendungen, begruendungText } from './begruendung'
import { pvsPlaene } from './pvs'
import { VORLAGEN } from '../data/katalog'
import { neuerPlan, STANDARD_EINSTELLUNGEN as einst } from '../store'
import type { Plan } from '../types'

function plan(vorlagen: string[], faktor: number): Plan {
  const p = neuerPlan('PKB-2026-001', einst)
  const positionen = vorlagen.reduce((pos, id) => vorlageAnwenden(pos, VORLAGEN.find((v) => v.id === id)!.pos, einst), p.positionen)
  return { ...p, regler: { ...p.regler, faktor }, positionen }
}

describe('Begründungen über dem Schwellenwert', () => {
  it('bis 2,3 keine, darüber für jede GOZ-Leistung eine – auch im PVS-Export', () => {
    expect(begruendungen(rechnen(plan(['michigan', 'fal'], 2.3), einst).honorar)).toEqual([])
    const p = plan(['michigan', 'fal'], 3)
    const r = rechnen(p, einst)
    const b = begruendungen(r.honorar)
    expect(b.map((x) => x.zeile.nr)).toEqual([...new Set(r.honorar.filter((z) => (z.faktor ?? 0) > 2.3).map((z) => z.nr))])
    expect(b.map((x) => x.zeile.nr)).toEqual(['7010', '0040'])
    for (const x of b) expect(x.text).toMatch(/\S{3}/)
    const [kva] = pvsPlaene(p, r)
    for (const x of kva.positionen.filter((x) => x.ebene === 'GOZ')) expect(x.faktor! > 2.3 ? x.begruendung : 'ohne').toMatch(/\S{3}/)
  })

  it('Texte je Leistungsgruppe: UKPS, Funktionsanalyse, Röntgen', () => {
    const ukps = (text: string) => begruendungText({ ebene: 'GOZ', nr: '6070a', bemessung: '6070', text })
    expect(ukps('Eingliederung einer Unterkieferprotrusionsschiene (zweiteilig)')).toMatch(/Anpassung beider Schienenteile/)
    expect(ukps('Dreidimensionale Registrierung der Startprotrusionsposition')).toMatch(/Startprotrusionsposition/)
    expect(ukps('Nachadaption des Protrusionsgrads einer Unterkieferprotrusionsschiene')).toMatch(/Titration/)
    expect(ukps('Kontrolle der Unterkieferprotrusionsschiene')).toMatch(/Kontrollaufwand/)
    expect(begruendungText({ ebene: 'GOZ', nr: '8000', text: 'Klinische Funktionsanalyse' })).toMatch(/Kiefergelenken/)
    expect(begruendungText({ ebene: 'GOAE', nr: '5004', text: 'OPG' })).toMatch(/Befundung/)
  })
})
