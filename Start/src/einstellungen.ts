/** Praxisverwaltungssystem (PVS) und Bridge – Einstellungen der PlanR-Übersicht je Mandant */

export interface Pvs {
  id: string
  name: string
  hersteller: string
  /** Weg, über den die Bridge Pläne an das PVS übergibt */
  weg: string
  /** Bridge in MAS schon fertig gebaut (heute Dampsoft und DENS) */
  bereit: boolean
  /** Bridge braucht einen Übergabeordner */
  ordner?: boolean
}

export const PVS_LISTE: Pvs[] = [
  { id: 'dampsoft', name: 'DS-Win', hersteller: 'Dampsoft', weg: 'VDDS – „Holen“ in die offene Kartei', bereit: true },
  { id: 'cgm-z1pro', name: 'Z1.PRO', hersteller: 'CGM Dentalsysteme', weg: 'VDDS-Schnittstelle', bereit: false },
  { id: 'cgm-z1', name: 'Z1', hersteller: 'CGM Dentalsysteme', weg: 'VDDS-Schnittstelle', bereit: false },
  { id: 'evident', name: 'evident', hersteller: 'evident', weg: 'VDDS-Schnittstelle', bereit: false },
  { id: 'charly', name: 'charly', hersteller: 'solutio', weg: 'VDDS-Schnittstelle', bereit: false },
  { id: 'dens', name: 'DENSoffice', hersteller: 'DENS', weg: 'Übergabeordner (DENSappConnect)', bereit: true, ordner: true },
  { id: 'ivoris', name: 'ivoris', hersteller: 'Computer konkret', weg: 'VDDS-Schnittstelle', bereit: false },
  { id: 'linudent', name: 'LinuDent', hersteller: 'Pharmatechnik', weg: 'VDDS-Schnittstelle', bereit: false },
  { id: 'visident', name: 'VISIdent', hersteller: 'VISIdent', weg: 'VDDS-Schnittstelle', bereit: false },
  { id: 'vdds', name: 'Anderes PVS', hersteller: 'über VDDS-media', weg: 'Übergabeordner nach VDDS-media', bereit: false, ordner: true },
]

export interface Einstellungen {
  pvs: string
  bridge: boolean
  ordner: string
  geaendert: string
}

export const LEER: Einstellungen = { pvs: '', bridge: false, ordner: '', geaendert: '' }

export const pvsVon = (id: string) => PVS_LISTE.find((p) => p.id === id)

/** Gespeicherte bzw. gesendete Einstellungen prüfen. Ohne PVS gibt es keine Bridge. */
export function einstellungenPruefen(roh: unknown): Einstellungen {
  const r = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>
  const pvs = pvsVon(String(r.pvs ?? '')) ? String(r.pvs) : ''
  return {
    pvs,
    bridge: !!pvs && r.bridge === true,
    ordner: String(r.ordner ?? '').trim().slice(0, 260),
    geaendert: typeof r.geaendert === 'string' ? r.geaendert : '',
  }
}

export const MANDANT_RE = /^[a-z0-9-]{1,40}$/
