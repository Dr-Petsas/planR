/**
 * Gelesene GOZ-Zeilen gegen das amtliche Gebührenverzeichnis prüfen.
 * Fängt Lesefehler der Texterkennung ab: B statt 8, O statt 0, Faktor 2,3 statt 3,5.
 * Was sich sicher berichtigen lässt, wird berichtigt und genannt. Der Rest geht als Hinweis an den Zahnarzt.
 */
export interface KatalogEintrag { nr: string; punkte: number }
export interface Katalog { punktwert: number; eintraege: KatalogEintrag[] }

interface Zeile { ebene: string; nr: string; anzahl: number; faktor?: number; betrag?: number }

// Zeichen, die die Texterkennung in Nummern mit Ziffern verwechselt.
const TAUSCH: Record<string, string> = { B: '8', O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', i: '1', S: '5', s: '5', Z: '2', z: '2', G: '6', b: '6', g: '9', q: '9' }

function mitZiffern(nr: string) {
  let aus = ''
  for (const c of nr) aus += TAUSCH[c] ?? c
  return aus
}

const euro = (n: number) => n.toFixed(2).replace('.', ',')

/** Prüft und berichtigt die Zeilen an Ort und Stelle. Gibt die Hinweise zurück. */
export function gozPruefen(zeilen: Zeile[], katalog: Katalog): string[] {
  const punkte = new Map(katalog.eintraege.map((e) => [e.nr, e.punkte]))
  const berichtigt: string[] = []
  const fremd: string[] = []
  const faktoren: string[] = []
  for (const z of zeilen) {
    if (z.ebene !== 'GOZ') continue
    let nr = z.nr.trim()
    // Analogleistung: 2197a zählt wie 2197.
    const kern = nr.toLowerCase().endsWith('a') && punkte.has(nr.slice(0, -1)) ? nr.slice(0, -1) : nr
    if (!punkte.has(kern)) {
      const versuch = mitZiffern(nr)
      const dreistellig = versuch.length === 3 ? `0${versuch}` : versuch
      if (dreistellig !== nr && punkte.has(dreistellig)) {
        berichtigt.push(`${nr} als ${dreistellig}`)
        z.nr = dreistellig
        nr = dreistellig
      } else {
        if (!fremd.includes(nr)) fremd.push(nr)
        continue
      }
    }
    const einfach = (punkte.get(punkte.has(nr) ? nr : kern) ?? 0) * katalog.punktwert
    if (z.faktor !== undefined && (z.faktor < 1 || z.faktor > 6)) {
      faktoren.push(`${nr}: Faktor ${String(z.faktor).replace('.', ',')}`)
    }
    if (!einfach || !z.betrag || !z.anzahl || z.faktor === undefined) continue
    // Der Betrag ist meist sauberer gelesen als der Faktor. Passt er auf einen glatten Faktor, gilt dieser.
    const ausBetrag = z.betrag / (einfach * z.anzahl)
    const glatt = Math.round(ausBetrag * 10) / 10
    if (Math.abs(ausBetrag - z.faktor) < 0.05) continue
    if (glatt >= 1 && glatt <= 3.5 && Math.abs(ausBetrag - glatt) < 0.02) {
      berichtigt.push(`${nr}: Faktor ${glatt.toFixed(1).replace('.', ',')} statt ${String(z.faktor).replace('.', ',')} (aus dem Betrag ${euro(z.betrag)} €)`)
      z.faktor = glatt
    }
    // Passt der Betrag auf keinen glatten Faktor, gehört er eher zu einer anderen Zeile: nichts ändern, nichts melden.
  }
  const aus: string[] = []
  if (berichtigt.length) aus.push(`Am Gebührenverzeichnis berichtigt: GOZ ${berichtigt.join('; ')}.`)
  if (fremd.length) aus.push(`Bitte gegenlesen, nicht im GOZ-Verzeichnis (GOÄ oder verlesen): ${fremd.join(', ')}.`)
  if (faktoren.length) aus.push(`Bitte gegenlesen: GOZ ${faktoren.join('; ')}.`)
  return aus
}
