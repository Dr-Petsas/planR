import { describe, expect, it } from 'vitest'
import { implantateErfasst } from './implantat'
import type { ZahnZeilen } from '../types'

const zahn = (v: Partial<ZahnZeilen>): ZahnZeilen => ({ B: '', R: '', TP: '', ...v })

describe('Implantate nur, wenn der Plan sie trägt', () => {
  it('Krone und Brücke sind keine Implantate', () => {
    const zaehne = { '14': zahn({ TP: 'KM' }), '15': zahn({ B: 'f', TP: 'BM' }), '16': zahn({ TP: 'KM', R: 'KV' }) }
    expect(implantateErfasst(zaehne)).toEqual([])
  })

  it('Suprakonstruktion in der Therapie oder im Befund zählt', () => {
    expect(implantateErfasst({ '36': zahn({ TP: 'SKM' }) })).toEqual(['36'])
    expect(implantateErfasst({ '46': zahn({ B: 'sk' }) })).toEqual(['46'])
    expect(implantateErfasst({ '21': zahn({ B: 'i' }) })).toEqual(['21'])
  })
})
