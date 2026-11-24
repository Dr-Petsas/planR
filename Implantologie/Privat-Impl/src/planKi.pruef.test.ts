import { describe, expect, it } from 'vitest'
import { freiAnwenden, hinweiseMitPruef, listeAnwenden, pruefMerken, type FreiPlan, type KiSchritt, type KiPosition, type ListenPos } from './planKi'

describe('Prüfmodul-Hinweise für die KI-Zeile', () => {
  it('lässt unvollständige Planer-Hinweise das Prüfmodul nicht verdrängen', () => {
    pruefMerken([
      { stufe: 'warnung', art: 'begruendung_fehlt', ids: ['a1'], text: 'GOZ 2197: Faktor 3,5 ohne Begründung' },
      { stufe: 'fehler', art: 'faktor_ueber_35', ids: ['a2'], text: 'GOZ 2290: Faktor 3,8 ohne Vereinbarung' },
    ])
    const eigene = [{ stufe: 'info' as const, text: 'Hinweis der Rechnung ohne Art' }]
    const raus = hinweiseMitPruef(eigene)
    expect(raus).toHaveLength(2)
    expect(raus[0].art).toBe('begruendung_fehlt')
    expect(raus[0].ids).toEqual(['a1'])
    expect(raus[1].art).toBe('faktor_ueber_35')
  })

  it('nimmt Planer-Hinweise, wenn das Prüfmodul noch nichts gemeldet hat', () => {
    pruefMerken([])
    const eigene = [{ stufe: 'info' as const, art: 'rechnung' as const, text: 'Nur Engine' }]
    expect(hinweiseMitPruef(eigene)).toEqual(eigene)
  })
})

describe('Begründung im Korrekturlauf', () => {
  const zeilen: KiPosition[] = [
    { id: 'p1', ebene: 'GOZ', nr: '2197', zahn: '16', anzahl: 1, faktor: 3.5, betrag: 100, text: 'Krone' },
  ]

  it('trägt die Begründung in die Positionsliste ein', () => {
    const liste: ListenPos[] = [{ id: 'p1', ebene: 'GOZ', nr: '2197', anzahl: 1, faktor: 3.5 }]
    const r = listeAnwenden(
      liste,
      [{ op: 'setze', id: 'p1', begruendung: 'Erschwerte Präparation bei tiefer Zerstörung.' }],
      zeilen,
      { ebenen: ['GOZ'], neu: (s, id) => ({ id, ebene: s.ebene, nr: s.nr, anzahl: s.anzahl }) },
    )
    expect(r.nicht).toEqual([])
    expect(r.getan[0]).toContain('Begründung eingetragen')
    expect(r.liste[0].begruendung).toBe('Erschwerte Präparation bei tiefer Zerstörung.')
  })

  it('trägt die Begründung in Anpassungen eines freien Plans ein', () => {
    const plan: FreiPlan = { manuell: [], anpassungen: {}, entfernt: [] }
    const r = freiAnwenden(plan, [{ op: 'setze', id: 'p1', begruendung: 'Hoher Zeitaufwand.' }] as KiSchritt[], zeilen, { ebenen: ['GOZ'] })
    expect(r.nicht).toEqual([])
    expect(r.getan[0]).toContain('Begründung eingetragen')
    expect(r.plan.anpassungen.p1.begruendung).toBe('Hoher Zeitaufwand.')
  })
})
