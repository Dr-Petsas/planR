import { describe, expect, it } from 'vitest'
import { leererPlan } from './store/plan'
import { hkpAnwenden, schalter } from './kiPlan'
import { rechnen } from './clara'
import type { HkpPlan } from './types'
import type { KiSchritt } from './planKi'

const zahn = (z: string, felder: Record<string, string | boolean>): KiSchritt => ({ op: 'zahn', zahn: z, felder })
const sch = (name: string, wert: string | boolean): KiSchritt => ({ op: 'schalter', name, wert })

/** Krone auf 16 (Befund ww), fertig gerechnet. */
function mitKrone(): HkpPlan {
  const r = hkpAnwenden(leererPlan(), [zahn('16', { befund: 'ww' })])
  expect(r.nicht).toEqual([])
  return r.plan
}

describe('KI-Zeile: Angaben im Kassen-HKP', () => {
  it('Bonus und Härtefall ändern den Zuschuss, nicht das Zahnschema', () => {
    const p = mitKrone()
    const r = hkpAnwenden(p, [sch('bonus', '75'), sch('haertefall', true)])
    expect(r.nicht).toEqual([])
    expect(r.plan.zuschuss).toEqual({ bonus: '75', haertefall: true })
    expect(r.plan.zaehne).toEqual(p.zaehne)
    expect(r.plan.positionen).toEqual(p.positionen)
    expect(hkpAnwenden(r.plan, [sch('bonus', '75')]).nicht[0]).toContain('schon')
    expect(hkpAnwenden(p, [sch('bonus', '80')]).nicht[0]).toContain('kenne ich nicht')
  })

  it('Versorgungsart lässt sich festlegen und wieder dem Planer überlassen', () => {
    const r = hkpAnwenden(mitKrone(), [sch('versorgungsart', 'gleichartig')])
    expect(r.plan.versorgungsart).toBe('gleichartig')
    expect(hkpAnwenden(r.plan, [sch('versorgungsart', 'auto')]).plan.versorgungsart).toBe('auto')
  })

  it('Intraoralscan und Eigenlabor laufen über die Ausführung des Planers', () => {
    const p = mitKrone()
    const r = hkpAnwenden(p, [sch('abformung', 'scan'), sch('labor', 'praxis')])
    expect(r.nicht).toEqual([])
    expect(r.plan.abformung).toBe('scan')
    expect(r.plan.einstellungen.labor).toBe('praxis')
    expect(r.getan.join(' ')).toContain('neu gerechnet')
  })

  it('Zirkon für alle Kronen stellt die Planung auf vollkeramisch und wählt das Material', () => {
    const p = mitKrone()
    expect(schalter(p).find((s) => s.name === 'kronenmaterial')?.wert).toBe('')
    const r = hkpAnwenden(p, [sch('kronenmaterial', 'zirkon')])
    expect(r.nicht).toEqual([])
    expect(r.plan.zaehne['16'].TP).toBe('KM')
    expect(r.plan.werkstoffe['16']).toBe('zirkon')
    expect(schalter(r.plan).find((s) => s.name === 'kronenmaterial')?.wert).toBe('zirkon')
  })

  it('Verblendung: voll und zurück ändern den Plan; was schon so ist, wird nicht als Änderung gemeldet', () => {
    const p = hkpAnwenden(leererPlan(), [zahn('14', { befund: 'kw' }), zahn('15', { befund: 'f' }), zahn('16', { befund: 'kw' })]).plan
    // Die Regelbrücke 14-16 ist schon vestibulär verblendet (KV, BV, K): das ist keine Änderung.
    const gleich = hkpAnwenden(p, [sch('verblendung', 'vestibulaer')])
    expect(gleich.getan).toEqual([])
    expect(gleich.nicht[0]).toContain('schon so verblendet')
    expect(gleich.plan).toBe(p)
    const voll = hkpAnwenden(p, [sch('verblendung', 'voll')])
    expect(voll.nicht).toEqual([])
    expect(voll.plan.zaehne['16'].TP).toBe('KM')
    expect(rechnen(voll.plan).summen.gesamt).toBeGreaterThan(rechnen(p).summen.gesamt)
    const zurueck = hkpAnwenden(voll.plan, [sch('verblendung', 'vestibulaer')])
    expect(zurueck.nicht).toEqual([])
    expect(zurueck.plan.zaehne['16'].TP).toBe('')
    expect(rechnen(zurueck.plan).summen.gesamt).toBeCloseTo(rechnen(p).summen.gesamt, 2)
  })

  it('Kronen dazu: der Planer trägt den Befund selbst ein und lässt den Rest stehen', () => {
    const vor = mitKrone()
    const r = hkpAnwenden(vor, [{ op: 'schalter', name: 'kronenDazu', wert: '24,25' }])
    expect(r.nicht).toEqual([])
    expect(r.plan.zaehne['24']?.B).toBe('ww')
    expect(r.plan.zaehne['25']?.B).toBe('ww')
    expect(r.plan.zaehne['24']?.TP ?? '').toBe('')
    for (const z of Object.keys(vor.zaehne)) if (z !== '24' && z !== '25') expect(r.plan.zaehne[z]?.B).toBe(vor.zaehne[z]?.B)
    expect(rechnen(r.plan).summen.gesamt).toBeGreaterThan(rechnen(vor).summen.gesamt)
    // Ein fehlender Zahn bekommt keine Krone.
    const luecke = hkpAnwenden(vor, [zahn('24', { befund: 'f' })]).plan
    const n = hkpAnwenden(luecke, [{ op: 'schalter', name: 'kronenDazu', wert: '24' }])
    expect(n.getan).toEqual([])
    expect(n.nicht[0]).toContain('fehlt')
  })

  it('eine Krone auf einem fehlenden Zahn nimmt der Planer nicht an', () => {
    const r = hkpAnwenden(mitKrone(), [zahn('24', { befund: 'f', planung: 'K' })])
    expect(r.getan).toEqual([])
    expect(r.nicht[0]).toContain('fehlenden Zahn')
    expect(r.plan.zaehne['24']?.B ?? '').toBe('')
    // Ein Brückenglied auf der Lücke bleibt möglich.
    expect(hkpAnwenden(mitKrone(), [zahn('24', { befund: 'f', planung: 'B' })]).nicht).toEqual([])
  })

  it('Material an einem einzelnen Zahn, auch im selben Schritt wie der Befund', () => {
    const r = hkpAnwenden(leererPlan(), [zahn('16', { befund: 'ww', werkstoff: 'hochgold' }), zahn('26', { befund: 'ww' })])
    expect(r.nicht).toEqual([])
    expect(r.plan.werkstoffe).toEqual({ 16: 'hochgold' })
    const k = hkpAnwenden(r.plan, [zahn('26', { werkstoff: 'zirkon' })])
    expect(k.nicht).toEqual([])
    expect(k.plan.zaehne['26'].TP).toBe('KM')
    expect(k.plan.zaehne['16'].TP).toBe('')
    expect(k.plan.werkstoffe).toEqual({ 16: 'hochgold', 26: 'zirkon' })
    const m = hkpAnwenden(k.plan, [zahn('26', { werkstoff: 'nem' })])
    expect(m.plan.zaehne['26'].TP).toBe('')
    expect(m.plan.werkstoffe['26']).toBe('nem')
  })

  it('ohne Einheit am Zahn gibt es kein Material und keine Materialschalter', () => {
    const r = hkpAnwenden(leererPlan(), [zahn('11', { werkstoff: 'zirkon' })])
    expect(r.getan).toEqual([])
    expect(r.nicht[0]).toContain('keine Krone')
    expect(schalter(leererPlan()).some((s) => s.name === 'kronenmaterial' || s.name.startsWith('implantat.'))).toBe(false)
  })

  it('eine Zeile, die nicht als Position im Plan steht, bleibt unangetastet', () => {
    const r = hkpAnwenden(mitKrone(), [{ op: 'weg', id: 'x' } as KiSchritt])
    expect(r.getan).toEqual([])
    expect(r.nicht[0]).toContain('nicht als eigene Position')
  })

  it('einzelne Positionen: entfernen, Faktor, hinzufügen', () => {
    const p = mitKrone()
    const goz = p.positionen.find((x) => x.ebene === 'GOZ')
    const erste = p.positionen[0]
    const weg = hkpAnwenden(p, [{ op: 'weg', id: erste.id }])
    expect(weg.nicht).toEqual([])
    expect(weg.plan.positionen.some((x) => x.id === erste.id)).toBe(false)
    expect(weg.plan.ausgeschlossen).toContain(`${erste.ebene}|${erste.nr}|${erste.zahn}`)
    expect(rechnen(weg.plan).summen.gesamt).toBeLessThan(rechnen(p).summen.gesamt)
    if (goz) {
      const f = hkpAnwenden(p, [{ op: 'setze', id: goz.id, faktor: 3.5 }])
      expect(f.nicht).toEqual([])
      expect(f.plan.positionen.find((x) => x.id === goz.id)?.faktor).toBe(3.5)
      expect(hkpAnwenden(p, [{ op: 'setze', id: goz.id, faktor: 5 }]).nicht[0]).toContain('3,5')
    }
    expect(hkpAnwenden(p, [{ op: 'setze', id: erste.id, preis: 1 }]).nicht[0]).toContain('Preis')
    const h = hkpAnwenden(p, [{ op: 'hinzu', ebene: 'GOZ', nr: '2197', zahn: '16', anzahl: 1 }])
    expect(h.nicht).toEqual([])
    expect(h.plan.positionen.some((x) => x.ebene === 'GOZ' && x.nr === '2197' && x.zahn === '16')).toBe(true)
    expect(hkpAnwenden(p, [{ op: 'hinzu', ebene: 'GOZ', nr: '99999', zahn: '16', anzahl: 1 }]).nicht[0]).toContain('Preisliste')
  })

  it('Bemerkung, Wiederherstellung und Zielbetrag', () => {
    const p = mitKrone()
    const b = hkpAnwenden(p, [sch('bemerkung', ' Patient wünscht Ratenzahlung ')])
    expect(b.plan.bemerkungen).toBe('Patient wünscht Ratenzahlung')
    expect(hkpAnwenden(b.plan, [sch('bemerkung', 'Patient wünscht Ratenzahlung')]).nicht[0]).toContain('schon')
    expect(hkpAnwenden(b.plan, [sch('bemerkung', '')]).plan.bemerkungen).toBe('')

    const r = hkpAnwenden(leererPlan(), [sch('reparatur.6.2', 'uk')])
    expect(r.nicht).toEqual([])
    expect(r.plan.reparaturen.map((x) => [x.art, x.gebiet])).toEqual([['6.2', 'UK']])
    expect(rechnen(r.plan).positionen.some((x) => x.nr === '100b')).toBe(true)
    expect(hkpAnwenden(r.plan, [sch('reparatur.6.2', 'links')]).nicht[0]).toContain('OK oder UK')
    expect(hkpAnwenden(r.plan, [sch('reparatur.6.2', '')]).plan.reparaturen).toEqual([])

    const z = schalter(p, {}).find((s) => s.name === 'zielEigenanteil')
    expect(typeof z?.wert).toBe('number')
    expect(schalter(p).some((s) => s.name === 'zielEigenanteil')).toBe(false)
    const vor = rechnen(p).summen.eigenanteil
    const hoch = hkpAnwenden(p, [{ op: 'schalter', name: 'zielEigenanteil', wert: vor + 150 }], {})
    expect(hoch.nicht).toEqual([])
    const nach = rechnen(hoch.plan).summen.eigenanteil
    expect(nach).toBeGreaterThan(vor)
    expect(hoch.getan.join(' ')).toContain('Zielbetrag')
    expect(hkpAnwenden(p, [{ op: 'schalter', name: 'zielEigenanteil', wert: 'viel' as never }], {}).nicht[0]).toContain('Betrag')
  })

  it('der Härtefall hebt den Festzuschuss in der Rechnung, die Gesamtsumme bleibt', () => {
    const p = mitKrone()
    const h = hkpAnwenden(p, [sch('haertefall', true)]).plan
    const vor = rechnen(p).summen
    const nach = rechnen(h).summen
    expect(nach.festzuschuss).toBeGreaterThan(vor.festzuschuss)
    expect(nach.gesamt).toBe(vor.gesamt)
    const b = rechnen(hkpAnwenden(p, [sch('bonus', '75')]).plan).summen
    expect(b.festzuschuss).toBeGreaterThan(vor.festzuschuss)
    expect(b.festzuschuss).toBeLessThan(nach.festzuschuss)
  })
})
