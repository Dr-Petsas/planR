/**
 * Plantexte für DS-Win. Ältere DS-Win-Datenbestände führen den Zeichensatz cp850: Umlaute und ß gibt es dort,
 * typografische Zeichen (Halbgeviertstrich, deutsche Anführungszeichen, Auslassungspunkte, Euro) nicht.
 * Die Bridge lehnt solche Texte ab („… ist in DS-Win nicht darstellbar“), statt sie verstümmelt zu schreiben.
 * Deshalb gehen sie in der einfachen Schreibweise hinüber; der Plan in PlanR bleibt, wie er ist.
 */
const ERSATZ: Record<string, string> = {
  '\u2013': '-', '\u2014': '-', '\u2212': '-', '\u2010': '-', '\u2011': '-',
  '\u201e': '"', '\u201c': '"', '\u201d': '"', '\u00ab': '"', '\u00bb': '"',
  '\u201a': "'", '\u2018': "'", '\u2019': "'",
  '\u2026': '...', '\u20ac': 'EUR', '\u2022': '-',
  '\u00a0': ' ', '\u202f': ' ', '\u2009': ' ',
}

export function dsWinText(s: string): string {
  return Array.from(s, (z) => ERSATZ[z] ?? z).join('')
}

const FELDER = ['bezeichnung', 'begruendung'] as const

/** Kopie des Plans mit Titel, Bezeichnungen und Begründungen in DS-Win-Schreibweise. */
export function dsWinPlanText<T extends { titel?: unknown; positionen?: unknown }>(plan: T): T {
  const positionen = Array.isArray(plan.positionen)
    ? plan.positionen.map((p: Record<string, unknown>) => {
        const neu = { ...p }
        for (const f of FELDER) if (typeof neu[f] === 'string') neu[f] = dsWinText(neu[f] as string)
        return neu
      })
    : plan.positionen
  return { ...plan, ...(typeof plan.titel === 'string' ? { titel: dsWinText(plan.titel) } : {}), positionen }
}
