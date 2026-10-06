import type { LeistungsArt } from '../types'

// Vollständiger MKV-Katalog konservierende Zahnheilkunde.
// Jede Therapie wird per Zahn im Zahnschema über ein Kürzel gewählt; die
// Detailtabelle blendet nur die zur Kategorie passenden Felder ein.
// Die GOZ-/BEMA-Positionen erzeugt die Engine (planung.ts) aus diesen Metadaten.

export interface KatalogFelder {
  flaechen?: boolean // 1..5 (Füllung) bzw. 1..3 (Inlay)
  kanaele?: boolean // 1..4 (Endo)
  material?: boolean // Materialauswahl
  mikroskop?: boolean
  elektrometrie?: boolean
  maschinell?: boolean
  kofferdam?: boolean
  revision?: boolean
}

export interface KatalogEintrag {
  id: string
  kuerzel: string
  titel: string
  kurz: string
  kategorie: string // 'fuellung' | 'inlay' | 'endo' | 'versiegelung' | 'vitalerhaltung' | 'aufbau'
  art: LeistungsArt
  felder: KatalogFelder
  materialVorgabe?: string
  hinweis: string
}

export const KONS_KATALOG: KatalogEintrag[] = [
  {
    id: 'fuellung',
    kuerzel: 'F',
    titel: 'Kompositfüllung (Adhäsiv-/Mehrschichttechnik)',
    kurz: 'Komposit-Mehrschichtfüllung statt einfacher Kassenfüllung',
    kategorie: 'fuellung',
    art: 'mehrkosten',
    felder: { flaechen: true, material: true, kofferdam: true },
    materialVorgabe: 'komposit',
    hinweis:
      'Mehrkostenvereinbarung nach § 28 Abs. 2 SGB V: Die Kasse trägt den Sachleistungsanteil einer plastischen Füllung, der Patient zahlt die Mehrkosten für die höherwertige Komposit-Mehrschichtfüllung.',
  },
  {
    id: 'inlay',
    kuerzel: 'I',
    titel: 'Einlagefüllung / Inlay (Keramik, Gold, CAD/CAM)',
    kurz: 'Laborgefertigte oder chairside Einlagefüllung',
    kategorie: 'inlay',
    art: 'mehrkosten',
    felder: { flaechen: true, material: true, kofferdam: true },
    materialVorgabe: 'keramik-inlay',
    hinweis:
      'Andersartige Versorgung: Kasse trägt den Sachleistungsanteil der vergleichbaren plastischen Füllung, der Patient zahlt die Mehrkosten inklusive Labor.',
  },
  {
    id: 'endo',
    kuerzel: 'W',
    titel: 'Wurzelkanalbehandlung – private Mehrleistung',
    kurz: 'Endo mit Mehrleistungen (Kassenzahn)',
    kategorie: 'endo',
    art: 'mehrkosten',
    felder: { kanaele: true, mikroskop: true, elektrometrie: true, maschinell: true, kofferdam: true, revision: true },
    hinweis:
      'Zahn erfüllt die Kassenkriterien: Kasse trägt den Regelanteil, der Patient zahlt die Mehrkosten für maschinelle Aufbereitung, elektrometrische Längenmessung und Mikroskop.',
  },
  {
    id: 'endoPrivat',
    kuerzel: 'WV',
    titel: 'Wurzelkanalbehandlung – komplett privat',
    kurz: 'Endo ohne Kassenleistung (Verlangensleistung)',
    kategorie: 'endo',
    art: 'verlangen',
    felder: { kanaele: true, mikroskop: true, elektrometrie: true, maschinell: true, kofferdam: true, revision: true },
    hinweis:
      'Zahn erfüllt die Kassenrichtlinien nicht (z. B. nicht sicher erhaltungswürdig). Die Behandlung ist Verlangensleistung nach § 1 Abs. 2, § 2 Abs. 3 GOZ und wird komplett privat berechnet.',
  },
  {
    id: 'versiegelung',
    kuerzel: 'V',
    titel: 'Fissurenversiegelung',
    kurz: 'Versiegelung (Prämolaren / Erwachsene)',
    kategorie: 'versiegelung',
    art: 'verlangen',
    felder: {},
    hinweis:
      'Kassenleistung nur an bleibenden Molaren (6er/7er) bis zum 18. Lebensjahr. Alle übrigen Versiegelungen sind Verlangensleistung (GOZ 2000, je Zahn).',
  },
  {
    id: 'vitalerhaltung',
    kuerzel: 'UE',
    titel: 'Vitalerhaltung / Überkappung (Caries profunda)',
    kurz: 'Erhaltung der vitalen Pulpa',
    kategorie: 'vitalerhaltung',
    art: 'mehrkosten',
    felder: { kofferdam: true },
    hinweis:
      'Maßnahme zur Erhaltung der vitalen Pulpa (GOZ 2330). Kasse trägt den Regelanteil, der Patient die Mehrkosten des höheren Aufwands.',
  },
  {
    id: 'aufbau',
    kuerzel: 'A',
    titel: 'Aufbaufüllung / Stiftaufbau (adhäsiv)',
    kurz: 'Adhäsiver Stumpfaufbau, ggf. mit Glasfaserstift',
    kategorie: 'aufbau',
    art: 'verlangen',
    felder: { material: true, kofferdam: true },
    materialVorgabe: 'glasfaserstift',
    hinweis:
      'Adhäsiver Aufbau eines zerstörten Zahnes (GOZ 2180, adhäsive Befestigung 2197, ggf. Glasfaserstift). Als private Mehrleistung vereinbart.',
  },
]

export const KATALOG_NACH_ID: Record<string, KatalogEintrag> = Object.fromEntries(KONS_KATALOG.map((k) => [k.id, k]))
export const KATALOG_NACH_KUERZEL: Record<string, KatalogEintrag> = Object.fromEntries(KONS_KATALOG.map((k) => [k.kuerzel.toUpperCase(), k]))

export const kuerzelFuer = (id: string) => KATALOG_NACH_ID[id]?.kuerzel ?? ''
