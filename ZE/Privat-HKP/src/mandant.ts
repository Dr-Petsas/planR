/** Ein Mandant = eine Praxis mit eigenen Einstellungen, Preisen und eigener Ablage. Kürzel = spätere MAS-Client-ID. */
export interface Mandant {
  id: string
  name: string
}

const LISTE_KEY = 'planr.mandanten.v1'
const AKTIV_KEY = 'planr.mandant.v1'
/** Der Standard-Mandant liest die alten Schlüssel ohne Zusatz – vorhandene Daten bleiben ihm erhalten. */
export const STANDARD_ID = 'standard'
const STANDARD: Mandant = { id: STANDARD_ID, name: 'Praxis' }

const speicher = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage)

export function kennung(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** Speicherschlüssel eines Mandanten */
export const schluessel = (key: string, mandantId: string) => (mandantId === STANDARD_ID ? key : `${key}@${mandantId}`)

function lesen(): Mandant[] {
  let liste: Mandant[] = []
  try {
    const roh = JSON.parse(speicher()?.getItem(LISTE_KEY) ?? '[]')
    if (Array.isArray(roh)) liste = roh.filter((m) => m && typeof m.id === 'string' && kennung(m.id) === m.id && m.id)
  } catch {
    liste = []
  }
  const standard = liste.find((m) => m.id === STANDARD_ID) ?? STANDARD
  return [standard, ...liste.filter((m) => m.id !== STANDARD_ID)].map((m) => ({ id: m.id, name: String(m.name || m.id) }))
}

const schreiben = (liste: Mandant[]) => speicher()?.setItem(LISTE_KEY, JSON.stringify(liste))

/** Aktiver Mandant beim Laden der Seite; ?mandant=kürzel wählt (und legt bei Bedarf an). */
function starten(): { liste: Mandant[]; aktiv: Mandant } {
  const liste = lesen()
  let id = speicher()?.getItem(AKTIV_KEY) ?? STANDARD_ID
  const aufruf = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('mandant')
  if (aufruf && kennung(aufruf)) {
    id = kennung(aufruf)
    if (!liste.some((m) => m.id === id)) {
      liste.push({ id, name: aufruf.trim() })
      schreiben(liste)
    }
    speicher()?.setItem(AKTIV_KEY, id)
  }
  return { liste, aktiv: liste.find((m) => m.id === id) ?? liste[0] }
}

let stand = starten()
/** Gilt für die ganze Sitzung; ein Wechsel lädt die Seite neu, damit alle Speicher den neuen Mandanten lesen. */
export const MANDANT_ID = stand.aktiv.id
export const mk = (key: string) => schluessel(key, MANDANT_ID)

const abonnenten = new Set<() => void>()
const melden = (liste: Mandant[]) => {
  schreiben(liste)
  stand = { liste, aktiv: liste.find((m) => m.id === MANDANT_ID) ?? liste[0] }
  abonnenten.forEach((f) => f())
}
export const abo = (f: () => void) => {
  abonnenten.add(f)
  return () => abonnenten.delete(f)
}
export const mandantenStand = () => stand

export function wechseln(id: string) {
  speicher()?.setItem(AKTIV_KEY, id)
  const url = new URL(location.href)
  url.searchParams.delete('mandant')
  location.replace(url.toString())
}

export function anlegen(name: string) {
  const basis = kennung(name) || 'praxis'
  let id = basis
  for (let i = 2; stand.liste.some((m) => m.id === id); i++) id = `${basis}-${i}`
  schreiben([...stand.liste, { id, name: name.trim() }])
  wechseln(id)
}

export function umbenennen(id: string, name: string) {
  if (name.trim()) melden(stand.liste.map((m) => (m.id === id ? { ...m, name: name.trim() } : m)))
}

/** Löscht den Mandanten samt aller seiner Daten in diesem Planer */
export function loeschen(id: string) {
  const s = speicher()
  if (id === STANDARD_ID || !s) return
  for (let i = s.length - 1; i >= 0; i--) {
    const k = s.key(i)
    if (k?.endsWith(`@${id}`)) s.removeItem(k)
  }
  schreiben(stand.liste.filter((m) => m.id !== id))
  if (id === MANDANT_ID) wechseln(STANDARD_ID)
  else melden(stand.liste.filter((m) => m.id !== id))
}
