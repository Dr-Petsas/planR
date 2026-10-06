// BEMA-Sachleistungsanteile (Kassenanteil) für die Mehrkostenberechnung.
//
// Hinweis: Der exakte Kassenanteil hängt vom regionalen BEMA-Punktwert (KZV)
// und vom Festzuschuss-/Sachleistungssystem ab. Die Werte hier sind
// praxisübliche Näherungen für 2026 und in „Praxis & Preise" editierbar.
// Beim Füllungs-Modell „GOZ-Differenz" wird der Kassenanteil vom GOZ-Betrag
// abgezogen; der Patient trägt nur die Mehrkosten (§ 28 Abs. 2 SGB V).

export interface BemaKassenanteil {
  key: string
  label: string
  standard: number // € Kassenanteil
}

export const BEMA_KASSENANTEILE: BemaKassenanteil[] = [
  { key: 'F1', label: 'BEMA 13a – Füllung einflächig', standard: 32 },
  { key: 'F2', label: 'BEMA 13b – Füllung zweiflächig', standard: 42 },
  { key: 'F3', label: 'BEMA 13c – Füllung dreiflächig', standard: 55 },
  { key: 'F4', label: 'BEMA 13d – Füllung mehr als dreiflächig', standard: 66 },
  { key: 'endoBasis', label: 'BEMA Trepanation/Aufbereitung (Basis)', standard: 30 },
  { key: 'endoKanal', label: 'BEMA je Wurzelkanal (WK + WF)', standard: 55 },
  { key: 'cp', label: 'BEMA Cp / Vitalerhaltung', standard: 14 },
]

export const STANDARD_KASSENANTEILE: Record<string, number> = Object.fromEntries(
  BEMA_KASSENANTEILE.map((b) => [b.key, b.standard]),
)

export const bemaLabel = (key: string) => BEMA_KASSENANTEILE.find((b) => b.key === key)?.label ?? key

/** BEMA-Füllungsschlüssel nach Flächenzahl. */
export const bemaFuellungKey = (flaechen: number): string => (flaechen <= 1 ? 'F1' : flaechen === 2 ? 'F2' : flaechen === 3 ? 'F3' : 'F4')
