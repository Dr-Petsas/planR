import type { Position } from '../types'

export interface RegelErgebnis {
  positionen: Position[]
  hinweise: string[]
}

/** GOZ-Nummern einer Region sammeln. */
const nummernInRegion = (ps: Position[], region: string) =>
  new Set(ps.filter((p) => p.ebene === 'GOZ' && p.zahn === region).map((p) => p.nr))

/**
 * Konfliktgraph aus GOZ-Bestimmungen und BZÄK-Hinweisen. Entfernt oder reduziert
 * Positionen, die nicht nebeneinander berechnungsfähig sind, und meldet jeden
 * Eingriff als Hinweis.
 */
export function regelwerkAnwenden(eingang: Position[]): RegelErgebnis {
  let positionen = [...eingang]
  const hinweise: string[] = []
  const raus = new Set<string>()

  const regionen = new Set(positionen.filter((p) => p.ebene === 'GOZ').map((p) => p.zahn))
  for (const region of regionen) {
    const nrs = nummernInRegion(positionen, region)
    const has = (nr: string) => nrs.has(nr)
    const find = (nr: string) => positionen.find((p) => p.ebene === 'GOZ' && p.zahn === region && p.nr === nr)

    // 9100 schließt 9090 und 9130 aus
    if (has('9100')) {
      for (const nr of ['9090', '9130']) if (has(nr)) { raus.add(find(nr)!.id); hinweise.push(`${region}: GOZ ${nr} ist neben 9100 nicht berechnungsfähig – entfernt.`) }
    }
    // 9110 nicht neben 9120 oder 9130 an derselben Kavität
    if (has('9110') && (has('9120') || has('9130'))) {
      raus.add(find('9110')!.id); hinweise.push(`${region}: GOZ 9110 ist neben 9120/9130 an derselben Kavität nicht berechnungsfähig – entfernt.`)
    }
    // 9100 neben 9110 nur zur Hälfte, neben 9120 nur zu einem Drittel
    const p9100 = find('9100')
    if (p9100 && !raus.has(p9100.id)) {
      if (has('9120')) { p9100.gebuehrenanteil = 1 / 3; hinweise.push(`${region}: GOZ 9100 neben 9120 nur zu einem Drittel.`) }
      else if (has('9110')) { p9100.gebuehrenanteil = 0.5; hinweise.push(`${region}: GOZ 9100 neben 9110 nur zur Hälfte.`) }
    }
    // 9150 nur zusammen mit 9100
    if (has('9150') && !has('9100')) {
      raus.add(find('9150')!.id); hinweise.push(`${region}: GOZ 9150 ist nur zusammen mit 9100 berechnungsfähig – entfernt.`)
    }
    // 4138 nicht, wenn in 9100/9120/9130 enthalten
    if (has('4138') && (has('9100') || has('9120') || has('9130'))) {
      raus.add(find('4138')!.id); hinweise.push(`${region}: GOZ 4138 (Membran) ist in 9100/9120/9130 enthalten – entfernt.`)
    }
    // 3100 nicht neben 9100 (und nicht neben 3090)
    if (has('3100') && (has('9100') || has('3090'))) {
      raus.add(find('3100')!.id); hinweise.push(`${region}: GOZ 3100 ist neben 9100/3090 nicht berechnungsfähig – entfernt.`)
    }
    // 9050 nicht neben 9010 oder 9040
    if (has('9050') && (has('9010') || has('9040'))) {
      raus.add(find('9050')!.id); hinweise.push(`${region}: GOZ 9050 ist neben 9010/9040 nicht berechnungsfähig – entfernt.`)
    }
  }

  // GOÄ 5370 (DVT) schließt Panoramaaufnahmen aus demselben Datensatz aus
  const hatDVT = positionen.some((p) => p.ebene === 'GOAE' && p.nr === '5370')
  if (hatDVT) {
    for (const p of positionen) if (p.ebene === 'GOAE' && (p.nr === '5002' || p.nr === '5004')) { raus.add(p.id); hinweise.push('GOÄ 5002/5004 (Panorama) ist neben 5370 aus demselben Datensatz nicht berechnungsfähig – entfernt.') }
  }

  positionen = positionen.filter((p) => !raus.has(p.id))
  return { positionen, hinweise }
}
