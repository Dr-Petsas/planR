export type Art = 'Kasse' | 'Privat'

export interface Planer {
  kuerzel: string
  titel: string
  zweck: string
  text: string
  art: Art
  /** Subdomain unter pickadoc-tunnel.com */
  host?: string
  /** lokaler Port (vite preview) */
  port?: number
}

export interface Bereich {
  name: string
  planer: Planer[]
}

export const BEREICHE: Bereich[] = [
  {
    name: 'Zahnersatz',
    planer: [
      { kuerzel: 'HKP', titel: 'HKP-Planer', zweck: 'Heil- und Kostenplan Zahnersatz', text: 'BEMA, GOZ, BEL II und BEB · Festzuschüsse · Register in MAS', art: 'Kasse', host: 'hkp', port: 5181 },
      { kuerzel: 'ZE', titel: 'Privat-ZE-Planer', zweck: 'Kostenvoranschlag Zahnersatz', text: 'GOZ und BEB · Kronenmaterial, Abformung, Implantatprothetik', art: 'Privat', host: 'privat-hkp', port: 5191 },
    ],
  },
  {
    name: 'Implantologie',
    planer: [
      { kuerzel: 'IMPL', titel: 'Implantologie-Planer', zweck: 'Kostenvoranschlag Implantologie', text: 'GOZ, GOÄ und Analogpositionen · Augmentation je Region', art: 'Privat', host: 'implantologie', port: 5196 },
    ],
  },
  {
    name: 'Konservierend',
    planer: [
      { kuerzel: 'MKV', titel: 'Füllungs-MKV-Planer', zweck: 'Mehrkostenvereinbarung Füllungen', text: '§ 28 Abs. 2 SGB V · BEMA 13a–d gegen GOZ', art: 'Kasse', host: 'mkv', port: 5204 },
      { kuerzel: 'KONS', titel: 'Privat-Kons-Planer', zweck: 'Kostenvoranschlag Kons', text: 'Füllungen, Inlays, Analog- und Exotenpositionen', art: 'Privat', host: 'kons', port: 5198 },
    ],
  },
  {
    name: 'Parodontologie',
    planer: [
      { kuerzel: 'PAR', titel: 'Kassen-PAR-Planer', zweck: 'Parodontitis-Behandlungsplan', text: 'eFormular 5 · BEMA Teil 4 · Behandlungsstrecke und UPT', art: 'Kasse', host: 'par', port: 5202 },
    ],
  },
  {
    name: 'Kieferbruch und Kiefergelenk',
    planer: [
      { kuerzel: 'KB', titel: 'Kassen-KB-Planer', zweck: 'Kieferbruch und Aufbissbehelfe', text: 'BEMA Teil 2', art: 'Kasse' },
      { kuerzel: 'KB', titel: 'Privat-KB-Planer', zweck: 'Schienentherapie privat', text: 'GOZ und BEB', art: 'Privat' },
    ],
  },
]

/** Adresse eines Planers: über den Tunnel die Subdomain, am Praxis-PC der lokale Port; ?mandant= wird durchgereicht. */
export function adresse(p: Planer, ort: { protocol: string; hostname: string; search: string }): string | null {
  if (!p.host || !p.port) return null
  const tunnel = ort.hostname.endsWith('.pickadoc-tunnel.com')
  const basis = tunnel ? `https://${p.host}.pickadoc-tunnel.com/` : `${ort.protocol}//${ort.hostname || 'localhost'}:${p.port}/`
  const mandant = new URLSearchParams(ort.search).get('mandant')
  return mandant ? `${basis}?mandant=${encodeURIComponent(mandant)}` : basis
}
