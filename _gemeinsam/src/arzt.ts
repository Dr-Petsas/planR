/**
 * Arzt für Stempel und Unterschrift: kommt mit /api/praxisdaten aus dem Pickadoc-Mitarbeiterprofil.
 * Die Unterschrift wird einmal blau eingefärbt (wie Kugelschreiber) und für alle Planer gemerkt.
 *
 * Quelle: F:\PlanR\_gemeinsam – Änderungen nur dort, dann `node tools/gemeinsam.mjs`.
 */

export interface ArztDaten {
  name: string
  /** blau eingefärbte Unterschrift als PNG-Data-URL, '' = in Pickadoc nicht hinterlegt */
  signatur: string
  /** Kennung der Originalunterschrift, damit nur neu gefärbt wird, wenn sie sich ändert */
  quelle: string
}

export const ARZT_KEY = 'planr.arzt.v1'
export const ARZT_EREIGNIS = 'planr-arzt'
export const STEMPEL_BLAU = '#1c3f94'

export function arztLesen(): ArztDaten | null {
  try {
    const r = typeof localStorage === 'undefined' ? null : JSON.parse(localStorage.getItem(ARZT_KEY) ?? 'null')
    return r && typeof r === 'object' && typeof r.name === 'string' ? r as ArztDaten : null
  } catch {
    return null
  }
}

const kennung = (s: string) => `${s.length}:${s.slice(-48)}`

/** Dunkle Striche → Stempelblau, Hintergrund (weiß oder transparent) → durchsichtig. */
export function blauFaerben(dataUrl: string): Promise<string> {
  return new Promise((fertig) => {
    if (!dataUrl || typeof document === 'undefined') return fertig(dataUrl)
    const bild = new Image()
    bild.onload = () => {
      const c = document.createElement('canvas')
      c.width = bild.naturalWidth
      c.height = bild.naturalHeight
      const ctx = c.getContext('2d')
      if (!ctx || !c.width || !c.height) return fertig(dataUrl)
      ctx.drawImage(bild, 0, 0)
      const d = ctx.getImageData(0, 0, c.width, c.height)
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(STEMPEL_BLAU.slice(i, i + 2), 16))
      let [x0, y0, x1, y1] = [c.width, c.height, -1, -1]
      for (let i = 0; i < d.data.length; i += 4) {
        const hell = (d.data[i] * 299 + d.data[i + 1] * 587 + d.data[i + 2] * 114) / 1000
        const roh = d.data[i + 3] * (255 - hell) / 255
        const deckung = roh < 12 ? 0 : Math.min(255, roh * 2.2)
        d.data[i] = r
        d.data[i + 1] = g
        d.data[i + 2] = b
        d.data[i + 3] = deckung
        if (deckung) {
          const p = i / 4
          const [x, y] = [p % c.width, Math.floor(p / c.width)]
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
        }
      }
      if (x1 < 0) return fertig('')
      ctx.putImageData(d, 0, 0)
      const rand = 4
      const [x, y] = [Math.max(0, x0 - rand), Math.max(0, y0 - rand)]
      const zu = document.createElement('canvas')
      zu.width = Math.min(c.width, x1 + rand + 1) - x
      zu.height = Math.min(c.height, y1 + rand + 1) - y
      zu.getContext('2d')?.drawImage(c, x, y, zu.width, zu.height, 0, 0, zu.width, zu.height)
      fertig(zu.toDataURL('image/png'))
    }
    bild.onerror = () => fertig('')
    bild.src = dataUrl
  })
}

/** Stand vom Server übernehmen; die Unterschrift nur bei Änderung neu färben. */
export async function arztUebernehmen(roh: { name?: unknown; signatur?: unknown } | null | undefined): Promise<void> {
  if (!roh || typeof roh.name !== 'string' || typeof localStorage === 'undefined') return
  const original = typeof roh.signatur === 'string' && roh.signatur.startsWith('data:image/') ? roh.signatur : ''
  const alt = arztLesen()
  const quelle = kennung(original)
  if (alt && alt.name === roh.name && alt.quelle === quelle) return
  const neu: ArztDaten = { name: roh.name, signatur: alt?.quelle === quelle ? alt.signatur : await blauFaerben(original), quelle }
  try {
    localStorage.setItem(ARZT_KEY, JSON.stringify(neu))
  } catch {
    return
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ARZT_EREIGNIS))
}

/** Stempelzeilen wie im Briefkopf: Praxis, Zahnarzt (ohne Doppelung), Anschrift, Telefon. */
export function stempelZeilen(p: { name: string; zahnarzt: string; strasse: string; plz: string; ort: string; telefon: string }, arztName = ''): string[] {
  const zahnarzt = (p.zahnarzt || arztName).trim()
  let name = p.name.trim()
  if (zahnarzt && name.includes(zahnarzt)) name = name.replace(zahnarzt, '').replace(/\s{2,}/g, ' ').trim()
  return [name, zahnarzt, p.strasse.trim(), [p.plz, p.ort].filter(Boolean).join(' ').trim(), p.telefon.trim() ? `Tel. ${p.telefon.trim()}` : '']
    .filter((z, i, a) => z && a.indexOf(z) === i)
}
