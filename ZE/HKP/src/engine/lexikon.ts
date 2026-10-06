import { useEffect, useState } from 'react'

export interface LexikonEintrag {
  titel?: string
  beschreibung?: string
  voraussetzungen?: string
  begriffe?: string[]
  zielgruppe?: string
  url: string
}

export interface Lexikon {
  bel: Record<string, LexikonEintrag>
  beb: Record<string, LexikonEintrag>
}

let cache: Lexikon | null = null
let laden: Promise<Lexikon> | null = null

export function lexikonLaden(): Promise<Lexikon> {
  laden ??= Promise.all([import('../data/lexikon-bel.json'), import('../data/lexikon-beb.json')]).then(([bel, beb]) => {
    cache = { bel: bel.default.eintraege as Record<string, LexikonEintrag>, beb: beb.default.eintraege as Record<string, LexikonEintrag> }
    return cache
  })
  return laden
}

export function useLexikon(): Lexikon | null {
  const [lex, setLex] = useState(cache)
  useEffect(() => {
    if (!lex) lexikonLaden().then(setLex)
  }, [lex])
  return lex
}

export function lexikonEintrag(lex: Lexikon | null, art: 'bel' | 'beb', nr: string): LexikonEintrag | undefined {
  if (!lex) return undefined
  const n = nr.replace(/\s/g, '').padStart(4, '0')
  return lex[art][n]
}

export function lexikonKurz(e: LexikonEintrag | undefined, laenge = 400): string {
  if (!e) return ''
  const t = e.beschreibung ?? e.voraussetzungen ?? ''
  return t.length > laenge ? `${t.slice(0, laenge).replace(/\s\S*$/, '')} …` : t
}
