import type { MaterialPreis } from '../types'

// Materialien/Laborleistungen für konservierende Mehrkostenleistungen.
// In „Praxis & Preise" editierbar; die Materialklasse (Kostenleiste) skaliert
// die Preise (günstig / Standard / hochwertig).

export const STANDARD_MATERIAL: MaterialPreis[] = [
  { id: 'keramik-inlay', name: 'Keramik-Einlagefüllung (Labor)', preis: 185, einheit: 'je Zahn' },
  { id: 'cadcam-inlay', name: 'CAD/CAM-Keramik (chairside)', preis: 120, einheit: 'je Zahn' },
  { id: 'gold-inlay', name: 'Gold-Einlagefüllung (Labor + Legierung)', preis: 330, einheit: 'je Zahn' },
  { id: 'komposit', name: 'Komposit-/Adhäsivset (Mehrschicht)', preis: 0, einheit: 'je Füllung' },
  { id: 'glasfaserstift', name: 'Glasfaserstift', preis: 18, einheit: 'je Stift' },
]

export const MATERIAL_KLASSE_FAKTOR = [0.85, 1.0, 1.2] as const

export const materialKlasseName = (k: number) => ['günstig', 'Standard', 'hochwertig'][k] ?? 'Standard'
