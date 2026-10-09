import { describe, expect, it, vi } from 'vitest'
import { geloescht, rueckgaengig, wiederEinfuegen } from './rueckgaengig'

describe('Rückgängig', () => {
  it('fügt an der alten Stelle wieder ein, nicht doppelt', () => {
    expect(wiederEinfuegen(['a', 'c'], 'b', 1)).toEqual(['a', 'b', 'c'])
    expect(wiederEinfuegen(['a', 'c'], 'b', 9)).toEqual(['a', 'c', 'b'])
    expect(wiederEinfuegen([{ id: 1 }], { id: 1 }, 0, (x, y) => x.id === y.id)).toHaveLength(1)
  })
  it('nimmt Löschungen in umgekehrter Reihenfolge zurück', () => {
    vi.stubGlobal('window', { setTimeout: () => 0 })
    const log: string[] = []
    geloescht('eins', () => log.push('eins'))
    geloescht('zwei', () => log.push('zwei'))
    expect(rueckgaengig()).toBe(true)
    expect(rueckgaengig()).toBe(true)
    expect(rueckgaengig()).toBe(false)
    expect(log).toEqual(['zwei', 'eins'])
    vi.unstubAllGlobals()
  })
})
