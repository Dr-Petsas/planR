import { describe, expect, it } from 'vitest'
import { befundAuftrag, befundAusPvs, bridgeFolgtEinstellung, bridgeKann, bridgeKannGemeldet, bridgePvsGemeldet, bridgeSollPvs, bridgeWaehlen, datumIso, hkpFuerPvs, patientWaehlen, planInsPvsMoeglich, planungJeZahn, pvsFuerBridge, supraErneuerung, vermerkText } from './pvs'

describe('PVS-Vermerk', () => {
  it('ein Plan bzw. MKV und Privatvereinbarung als zwei DS-Win-Pläne', () => {
    const am = '2026-10-15T10:00:00.000Z'
    expect(vermerkText({ pvs: 'dampsoft', patientId: '1', planNr: 17, am }, 'DS-Win')).toBe('In DS-Win als Plan Nr. 17 angelegt (15.10.2026)')
    expect(vermerkText({ pvs: 'dampsoft', patientId: '1', planNr: 17, plaene: [17, 18], am }, 'DS-Win')).toBe('In DS-Win als Plan Nr. 17 und 18 angelegt (15.10.2026)')
  })

  it('DS-Win und DENS nehmen alle Privatpläne und die Füllungs-MKV', () => {
    expect(['privat-kv', 'privat-impl', 'privat-kons', 'kons-mkv', 'privat-kb'].every((m) => planInsPvsMoeglich('dampsoft', m))).toBe(true)
    expect(['privat-kv', 'privat-impl', 'privat-kons', 'kons-mkv', 'privat-kb'].every((m) => planInsPvsMoeglich('dens', m))).toBe(true)
    expect(planInsPvsMoeglich('dens', 'hkp')).toBe(false)
    expect(['privat-kv', 'privat-impl', 'privat-kons', 'kons-mkv', 'privat-kb'].every((m) => planInsPvsMoeglich('cgm-z1pro', m))).toBe(true)
    expect(planInsPvsMoeglich('ivoris', 'kons-mkv')).toBe(false)
    expect(planInsPvsMoeglich(undefined, 'kons-mkv')).toBe(false)
  })

  it('die Einstellung in PlanR ist der Schalter für die Bridge', () => {
    expect(bridgeSollPvs('dens', 'dampsoft')).toBe('dens')
    expect(bridgeSollPvs('dampsoft', 'dens')).toBe('dampsoft')
    expect(bridgeSollPvs('dampsoft', 'dampsoft')).toBeUndefined()
    expect(bridgeSollPvs('ivoris', 'dampsoft')).toBeUndefined()
    expect(bridgeSollPvs('', 'dampsoft')).toBeUndefined()
    expect(bridgeSollPvs('dens')).toBe('dens')
    expect(bridgeFolgtEinstellung('1.18')).toBe(true)
    expect(bridgeFolgtEinstellung('2.0')).toBe(true)
    expect(bridgeFolgtEinstellung('1.17')).toBe(false)
    expect(bridgeFolgtEinstellung(undefined)).toBe(false)
    expect(bridgePvsGemeldet('cgm-z1pro')).toBe('cgm-z1pro')
    expect(bridgePvsGemeldet('dens')).toBe('dens')
    expect(bridgePvsGemeldet('dampsoft')).toBe('dampsoft')
    expect(bridgePvsGemeldet('ivoris')).toBeUndefined()
    expect(bridgePvsGemeldet(null)).toBeUndefined()
  })

  it('die verbundene Bridge folgt der Ablage, die sie bedient, nicht ihrer eigenen alten Einstellung', () => {
    const ablagen = { standard: ['standard', 'p-kkz'] }
    const einstellung = {
      standard: { pvs: 'dens', geaendert: '2026-11-14T19:00:00.000Z' },
      'p-kkz': { pvs: 'dampsoft', geaendert: '2026-11-14T12:00:00.000Z' },
    }
    const verbunden = (m: string) => (m === 'p-kkz' ? { pvs: 'dampsoft' } : null)
    expect(pvsFuerBridge('p-kkz', ablagen, verbunden, einstellung)).toBe('dens')
    expect(pvsFuerBridge('p-kkz', ablagen, verbunden, {
      ...einstellung, standard: { pvs: 'cgm-z1pro', geaendert: '2026-11-14T19:05:00.000Z' },
    })).toBe('cgm-z1pro')
    expect(pvsFuerBridge('pc-1', {}, () => null, { 'pc-1': { pvs: 'dens', geaendert: '' } })).toBe('dens')
    expect(bridgeSollPvs(pvsFuerBridge('p-kkz', ablagen, verbunden, einstellung), 'dampsoft')).toBe('dens')
    expect(bridgeSollPvs(pvsFuerBridge('p-kkz', ablagen, verbunden, einstellung), 'dens')).toBeUndefined()
  })

  it('im Verbund bedient die Bridge, die das eingestellte Programm hat – die andere wird nicht umgestellt', () => {
    const bruecken = ['standard', 'p-kkz']
    const beide = (m: string) => (m === 'standard' ? { pvs: 'dens' } : { pvs: 'dampsoft' })
    expect(bridgeWaehlen(bruecken, 'dens', beide)).toBe('standard')
    expect(bridgeWaehlen(bruecken, 'dampsoft', beide)).toBe('p-kkz')
    // Keine fährt es: eine, die es auf dem Rechner hat, geht vor einer älteren ohne Angabe, die vor einer ohne das Programm
    const z1 = (m: string) => (m === 'standard' ? { pvs: 'dens', kann: ['dens'] } : { pvs: 'dampsoft', kann: ['dampsoft', 'cgm-z1pro'] })
    expect(bridgeWaehlen(bruecken, 'cgm-z1pro', z1)).toBe('p-kkz')
    expect(bridgeWaehlen(bruecken, 'cgm-z1pro', (m) => (m === 'standard' ? { pvs: 'dens', kann: ['dens'] } : { pvs: 'dampsoft' }))).toBe('p-kkz')
    // Nur eine verbunden, keine verbunden, keine eingerichtet
    expect(bridgeWaehlen(bruecken, 'dampsoft', (m) => (m === 'standard' ? { pvs: 'dens' } : null))).toBe('standard')
    expect(bridgeWaehlen(bruecken, 'dampsoft', () => null)).toBe('standard')
    expect(bridgeWaehlen([], 'dens', () => null)).toBeUndefined()
    expect(bridgeWaehlen(bruecken, '', (m) => (m === 'p-kkz' ? { pvs: 'dampsoft' } : null))).toBe('p-kkz')

    const ablagen = { standard: bruecken }
    const aufDampsoft = { standard: { pvs: 'dampsoft', geaendert: '2' }, 'p-kkz': { pvs: 'dampsoft', geaendert: '1' } }
    // Die DENS-Bridge bleibt DENS, solange die DS-Win-Bridge die Ablage bedient
    expect(bridgeSollPvs(pvsFuerBridge('standard', ablagen, beide, aufDampsoft), 'dens')).toBeUndefined()
    expect(bridgeSollPvs(pvsFuerBridge('p-kkz', ablagen, beide, aufDampsoft), 'dampsoft')).toBeUndefined()
    // Zurück auf DENS: die DS-Win-Bridge folgt nicht ihrer eigenen alten Einstellung und nicht der Ablage
    const aufDens = { ...aufDampsoft, standard: { pvs: 'dens', geaendert: '3' } }
    expect(pvsFuerBridge('p-kkz', ablagen, beide, aufDens)).toBe('')
    expect(pvsFuerBridge('standard', ablagen, beide, aufDens)).toBe('dens')
  })

  it('eine Bridge wird nie auf ein Programm gestellt, das auf ihrem Rechner fehlt', () => {
    expect(bridgeSollPvs('dampsoft', 'dens', ['dens'])).toBeUndefined()
    expect(bridgeSollPvs('dampsoft', 'dens', ['dens', 'dampsoft'])).toBe('dampsoft')
    expect(bridgeSollPvs('dampsoft', 'dens')).toBe('dampsoft')
    expect(bridgeKannGemeldet(null)).toBeUndefined()
    expect(bridgeKannGemeldet('dens,ivoris, dampsoft')).toEqual(['dens', 'dampsoft'])
    expect(bridgeKannGemeldet('')).toEqual([])
    expect(bridgeKann({ pvs: 'dens', kann: ['dens'] }, 'dampsoft')).toBe(false)
    expect(bridgeKann({ pvs: 'dens' }, 'dampsoft')).toBe(true)
    expect(bridgeKann({ pvs: 'dens', kann: [] }, 'dens')).toBe(true)
  })
})

const t = (id: string, firstName: string, lastName: string, birthDate = '') => ({ id, firstName, lastName, birthDate })

describe('PVS-Export: Patient zuordnen', () => {
  it('Datum aus Plan und PVS vergleichbar', () => {
    expect(datumIso('3.7.1958')).toBe('1958-07-03')
    expect(datumIso('1958-07-03')).toBe('1958-07-03')
    expect(datumIso('irgendwas')).toBe('')
  })

  it('genau ein gleichnamiger Patient, Groß-/Kleinschreibung und Leerzeichen egal', () => {
    const treffer = [t('1', 'Helmut', 'Mustermann'), t('2', 'Helmuth', 'Mustermann'), t('3', 'Helmut', 'Mustermann-Klein')]
    expect(patientWaehlen(treffer, { vorname: ' helmut ', name: 'MUSTERMANN' }, 'DENSoffice')).toEqual({ id: '1' })
  })

  it('Geburtsdatum im Plan entscheidet zwischen Namensgleichen', () => {
    const treffer = [t('1', 'Anna', 'Muster', '1960-01-01'), t('2', 'Anna', 'Muster', '1985-05-05')]
    expect(patientWaehlen(treffer, { vorname: 'Anna', name: 'Muster', geburtsdatum: '05.05.1985' }, 'DENSoffice')).toEqual({ id: '2' })
  })

  it('ohne eindeutigen Treffer kein Schreiben', () => {
    const zwei = [t('1', 'Anna', 'Muster'), t('2', 'Anna', 'Muster')]
    expect(patientWaehlen(zwei, { vorname: 'Anna', name: 'Muster' }, 'DENSoffice').fehler).toMatch(/2-mal.*Geburtsdatum/)
    expect(patientWaehlen([], { vorname: 'Anna', name: 'Muster' }, 'DENSoffice').fehler).toMatch(/gibt es in DENSoffice nicht/)
    expect(patientWaehlen([t('1', 'Anna', 'Muster', '1960-01-01')], { vorname: 'Anna', name: 'Muster', geburtsdatum: '1985-05-05' }, 'DENSoffice').fehler)
      .toMatch(/anderem Geburtsdatum/)
    expect(patientWaehlen([t('1', 'Anna', 'Muster')], { vorname: '', name: 'Muster' }, 'DENSoffice').fehler).toMatch(/fehlt/)
  })
})

describe('PVS-Export: HKP-Daten', () => {
  it('nimmt die berechneten Positionen (Material, Menge nach Werkstoff) statt der gespeicherten Planzeilen', () => {
    const plan = {
      patient: { name: 'Muster' }, verwaltung: { ausstellungsdatum: '2026-10-09', erlaeuterung: 'lang' }, zuschuss: { bonus: 60 }, zaehne: { 16: { B: 'ww' } },
      positionen: [{ id: 'a', ebene: 'BEL', nr: '9700', anzahl: 2 }],
    }
    const ergebnis = {
      versorgungsart: 'regel', summen: { gesamt: 1 }, befunde: [{ nr: '1.1' }], hinweise: ['groß'],
      positionen: [
        { id: 'a', ebene: 'BEL', nr: '9700', anzahl: 1, zahn: '26', labor: 'eigen', betrag: 17.22, einzelpreis: 17.22, text: 'NEM' },
        { id: 'mat-16', ebene: 'MAT', nr: '', anzahl: 2.5, zahn: '16', labor: 'eigen', betrag: 350, einzelpreis: 140, bezeichnung: 'Hochgoldlegierung (Au ≥ 75 %), Krone' },
        { id: 'g', ebene: 'GOZ', nr: '2210', anzahl: 1, zahn: '15', faktor: 3.5, betrag: 330.31, einzelpreis: 330.31, punkte: 1678, faktorBegruendung: 'lang' },
      ],
    }
    const d = JSON.parse(hkpFuerPvs(plan, ergebnis))
    expect(d.positionen).toEqual([
      { id: 'a', ebene: 'BEL', nr: '9700', anzahl: 1, zahn: '26', labor: 'eigen' },
      { id: 'mat-16', ebene: 'MAT', nr: '', anzahl: 2.5, zahn: '16', labor: 'eigen', bezeichnung: 'Hochgoldlegierung (Au ≥ 75 %), Krone' },
      { id: 'g', ebene: 'GOZ', nr: '2210', anzahl: 1, zahn: '15' },
    ])
    expect(d.ergebnis.positionen[1]).toEqual({ id: 'mat-16', betrag: 350, einzelpreis: 140 })
    expect(d.ergebnis.positionen[2]).toEqual({ id: 'g', betrag: 330.31, einzelpreis: 330.31, punkte: 1678, faktor: 3.5 })
    expect(d.verwaltung).toEqual({ ausstellungsdatum: '2026-10-09' })
    expect(d.patient).toBeUndefined()
    expect(d.ergebnis.hinweise).toBeUndefined()
  })

  it('erneuerte Suprakonstruktion (Befundklasse 7): Zeile R leer, Kürzel in Zeile TP, andersartig (BMV-Z Anlage 14d)', () => {
    const ergebnis = { versorgungsart: 'gleichartig', summen: {}, befunde: [{ nr: '7.2' }], positionen: [{ id: 'g', ebene: 'GOZ', nr: '2200', anzahl: 1, zahn: '24' }] }
    const zaehne = { 24: { B: 'skw', R: 'SKV', TP: '' }, 25: { B: 'sbw', R: 'SBV', TP: '' }, 26: { B: 'skw', R: 'SK', TP: 'SKM' }, 16: { B: 'ww', R: 'K', TP: '' } }
    const d = JSON.parse(hkpFuerPvs({ zaehne, versorgungsart: 'auto' }, ergebnis))
    expect(d.zaehne['24']).toEqual({ B: 'skw', R: '', TP: 'SKV', planung: 'SKV' })
    expect(d.zaehne['25']).toEqual({ B: 'sbw', R: '', TP: 'SBV', planung: 'SBV' })
    expect(d.zaehne['26']).toEqual({ B: 'skw', R: '', TP: 'SKM', planung: 'SKM' })
    expect(d.zaehne['16']).toEqual({ B: 'ww', R: 'K', TP: '', planung: '' })
    expect(d.ergebnis.versorgungsart).toBe('andersartig')
  })

  it('Suprakonstruktion als Regelversorgung bleibt in Zeile R: Ausnahmefall Nr. 36 (7.6) und von Hand gesetzte Versorgungsart', () => {
    const ergebnis = { versorgungsart: 'gleichartig', summen: {}, befunde: [], positionen: [{ id: 'g', ebene: 'GOZ', nr: '5230', anzahl: 1, zahn: 'UK' }] }
    const zaehne = { 33: { B: 'sow', R: 'SO', TP: '' }, 34: { B: 'sew', R: 'SE', TP: '' }, 13: { B: 'sow', R: 'SO', TP: '' } }
    expect(supraErneuerung({ zaehne, klinisch: { atrophieUK: true } })).toEqual(['13'])
    const d = JSON.parse(hkpFuerPvs({ zaehne, klinisch: { atrophieOK: true, atrophieUK: true } }, ergebnis))
    expect(d.zaehne['33'].R).toBe('SO')
    expect(d.zaehne['34']).toMatchObject({ B: 'sew', R: 'SE', TP: '' })
    expect(d.ergebnis.versorgungsart).toBe('gleichartig')
    const hand = JSON.parse(hkpFuerPvs({ zaehne: { 36: { B: 'skw', R: 'SK', TP: '' } }, versorgungsart: 'gleichartig' }, ergebnis))
    expect(hand.zaehne['36'].R).toBe('SK')
    expect(hand.ergebnis.versorgungsart).toBe('gleichartig')
    expect(supraErneuerung({ zaehne: { 36: { B: 'skw', R: '', TP: '' }, 12: { B: 'f', R: 'B', TP: 'SKM' } } })).toEqual([])
  })

  it('Zeile TP: Implantat statt Regelbrücke lässt die Anker leer, Regelbrücke und Prothese bleiben', () => {
    const implantat = planungJeZahn(
      { 35: { R: 'K' }, 36: { B: 'f', R: 'B', TP: 'SK' }, 37: { R: 'K' } },
      [{ ebene: 'GOZ', nr: '2270', zahn: '36' }, { ebene: 'BEB', nr: '0009', zahn: 'UK' }, { ebene: 'BEMA', nr: '19', zahn: '36' }],
    )
    expect(implantat).toEqual({ 35: '', 36: 'SK', 37: '' })
    const regel = planungJeZahn(
      { 34: { R: 'K' }, 35: { B: 'f', R: 'B' }, 36: { R: 'K' }, 31: { B: 'f', R: 'E' }, 41: { B: 'f', R: 'E' } },
      [{ ebene: 'BEMA', nr: '91b', zahn: '34' }, { ebene: 'BEMA', nr: '91b', zahn: '36' }, { ebene: 'BEMA', nr: '92', zahn: '34-36' }, { ebene: 'BEMA', nr: '96a', zahn: 'UK' }],
    )
    expect(regel).toEqual({ 34: 'K', 35: 'B', 36: 'K', 31: 'E', 41: 'E' })
  })
})

describe('Befund aus dem und ins PVS', () => {
  const zahn = (status: string) => ({ raw: '', status, missing: status === 'f' })
  it('übernimmt jedes Kürzel unverändert, auch eigene des PVS', () => {
    const b = befundAusPvs({
      version: 'v1', current: { date: '', teeth: { 18: zahn('f'), 16: zahn('sk'), 15: zahn('t1'), 11: zahn('') } },
      items: [{ date: '2026-10-12' }, { date: '2025-01-01' }],
    })
    expect(b?.version).toBe('v1')
    expect(b?.datum).toBe('2026-10-12')
    expect(b?.zaehne).toMatchObject({ 18: 'f', 16: 'sk', 15: 't1', 11: '', 48: '' })
    const implantat = befundAusPvs({
      version: 'v1', current: { date: '', teeth: { 13: zahn('j'), 24: zahn('j 2'), 46: zahn('j 1'), 15: zahn('t1') } },
    })
    expect(implantat?.zaehne).toMatchObject({ 13: 'i', 24: 'i', 46: 'i', 15: 't1' })
    expect(Object.keys(b!.zaehne)).toHaveLength(32)
    expect(befundAusPvs({ current: { teeth: {} } })).toBeNull()
  })

  it('schreibt nur die genannten Kiefer, ohne Kürzel heißt vorhanden', () => {
    const t = befundAuftrag({ 18: 'f', 17: '', 16: 'kw', 36: 'x' }, ['OK'])
    expect(t).toEqual({ 18: 'f', 17: 'healthy', 16: 'kw' })
    expect(befundAuftrag({ 18: 'f', 36: 'x' }, ['OK', 'UK', 'XX'])).toEqual({ 18: 'f', 36: 'x' })
    expect(befundAuftrag({ 18: 'f' }, [])).toEqual({})
  })
})
