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
      { kuerzel: 'PA', titel: 'Privat-PAR-Planer', zweck: 'Heil- und Kostenplan PAR privat', text: 'GOZ Abschnitt E · Analogleistungen BZÄK 2026 oder Beratungsforum', art: 'Privat', host: 'privat-par', port: 5210 },
    ],
  },
  {
    name: 'Kieferbruch und Kiefergelenk',
    planer: [
      { kuerzel: 'KB', titel: 'Kassen-KB-Planer', zweck: 'Kieferbruch und Aufbissbehelfe', text: 'eFormular 2 · BEMA Teil 2 und BEL II der KZV', art: 'Kasse', host: 'kb', port: 5206 },
      { kuerzel: 'KB', titel: 'Privat-KB-Planer', zweck: 'Schienentherapie privat', text: 'GOZ Abschnitt H/J und BEB · Funktionsdiagnostik', art: 'Privat', host: 'privat-kb', port: 5208 },
    ],
  },
  {
    name: 'Kieferorthopädie',
    planer: [
      { kuerzel: 'KFO', titel: 'Kassen-KFO-Planer', zweck: 'Kieferorthopädischer Behandlungsplan', text: 'eFormular 4 · BEMA Teil 3 · KIG · Mehrleistungen nach Vordruck 4d', art: 'Kasse', host: 'kfo', port: 5212 },
      { kuerzel: 'KFO', titel: 'Privat-KFO-Planer', zweck: 'Heil- und Kostenplan KFO privat', text: 'GOZ Abschnitt G · Behandlungsaufgabe, Diagnostik und Material', art: 'Privat', host: 'privat-kfo', port: 5214 },
    ],
  },
]

const MODUL: Record<string, { kuerzel: string; art: Art }> = {
  hkp: { kuerzel: 'HKP', art: 'Kasse' },
  'privat-kv': { kuerzel: 'ZE', art: 'Privat' },
  'privat-impl': { kuerzel: 'IMPL', art: 'Privat' },
  'kons-mkv': { kuerzel: 'MKV', art: 'Kasse' },
  'privat-kons': { kuerzel: 'KONS', art: 'Privat' },
  'kassen-par': { kuerzel: 'PAR', art: 'Kasse' },
  'privat-par': { kuerzel: 'PA', art: 'Privat' },
  'kassen-kb': { kuerzel: 'KB', art: 'Kasse' },
  'privat-kb': { kuerzel: 'KB', art: 'Privat' },
  'kassen-kfo': { kuerzel: 'KFO', art: 'Kasse' },
  'privat-kfo': { kuerzel: 'KFO', art: 'Privat' },
}

/** Planer, in dem ein gespeicherter Plan entstanden ist. */
export function planerZuModul(modul: string): Planer | undefined {
  const ziel = MODUL[modul]
  if (!ziel) return undefined
  return BEREICHE.flatMap((b) => b.planer).find((p) => p.kuerzel === ziel.kuerzel && p.art === ziel.art)
}

/** Adresse eines Planers: über den Tunnel die Subdomain, am Praxis-PC der lokale Port; ?mandant= wird durchgereicht. */
export function adresse(p: Planer, ort: { protocol: string; hostname: string; search: string }): string | null {
  if (!p.host || !p.port) return null
  const tunnel = ort.hostname.endsWith('.pickadoc-tunnel.com')
  const basis = tunnel ? `https://${p.host}.pickadoc-tunnel.com/` : `${ort.protocol}//${ort.hostname || 'localhost'}:${p.port}/`
  const mandant = new URLSearchParams(ort.search).get('mandant')
  return mandant ? `${basis}?mandant=${encodeURIComponent(mandant)}` : basis
}
