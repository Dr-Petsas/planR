import { useEffect, useMemo, useState } from 'react'
import { datenBasen } from '../daten'
import { pruefMerken, type KiPosition, type Meldung } from '../planKi'
import { ausschlussMeldung, planPruefen, type PruefOptionen } from '../pruefung'

/** Ausschlüsse zwischen den Positionen (Abrechnungstabelle auf dem PlanR-Server) */
async function ausschluesse(positionen: { ebene: string; nr: string; zahn: string }[], alle: KiPosition[]): Promise<Meldung[] | null> {
  for (const basis of datenBasen()) {
    try {
      const r = await fetch(basis.replace(/daten\/$/, 'api/plan/pruefen'), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionen }), signal: AbortSignal.timeout(12000),
      })
      if (!r.ok) continue
      const d = (await r.json()) as { ok?: boolean; meldungen?: { text?: string; a?: string; b?: string; katalog?: string }[] }
      if (!d.ok) return null
      return (d.meldungen ?? []).map((x) => ausschlussMeldung(x, alle)).filter((x): x is Meldung => !!x)
    } catch {
      /* nächste Adresse */
    }
  }
  return null
}

const WORT = { fehler: 'Fehler', warnung: 'Warnung', info: 'Hinweis' }

/** Prüfmodul oben im Plan: findet Fehler in den Positionen und zeigt die Hinweise der Rechnung. */
export function Pruefmodul({ positionen, ...o }: { positionen: KiPosition[] } & PruefOptionen) {
  const eigene = JSON.stringify(o.eigene ?? [])
  const hinweise = JSON.stringify(o.hinweise ?? [])
  const lokal = useMemo(
    () => planPruefen(positionen, o),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [positionen, eigene, hinweise, o.begruendung, o.ueber35],
  )
  const kurz = useMemo(
    () => JSON.stringify(positionen.filter((p) => p.nr && p.anzahl > 0).map((p) => ({ ebene: p.ebene, nr: p.nr, zahn: p.zahn }))),
    [positionen],
  )
  const [fern, setFern] = useState<{ fuer: string; meldungen: Meldung[] | null }>({ fuer: '', meldungen: [] })
  useEffect(() => {
    let aktuell = true
    const uhr = setTimeout(() => {
      const liste = JSON.parse(kurz) as { ebene: string; nr: string; zahn: string }[]
      if (liste.length < 2) { setFern({ fuer: kurz, meldungen: [] }); return }
      void ausschluesse(liste, positionen).then((meldungen) => { if (aktuell) setFern({ fuer: kurz, meldungen }) })
    }, 700)
    return () => { aktuell = false; clearTimeout(uhr) }
  }, [kurz])

  const alle = useMemo(() => {
    const fertig = [...(fern.meldungen ?? []), ...lokal]
    const rang = { fehler: 0, warnung: 1, info: 2 }
    return fertig.filter((m, i) => fertig.findIndex((x) => x.text === m.text) === i).sort((a, b) => rang[a.stufe] - rang[b.stufe])
  }, [lokal, fern])
  const laeuft = fern.fuer !== kurz
  // Die KI-Zeile liest mit und wartet, bis die Ausschlüsse zum jetzigen Stand da sind.
  useEffect(() => { pruefMerken(alle, laeuft) }, [alle, laeuft])

  const fehler = alle.filter((m) => m.stufe === 'fehler').length
  const warnung = alle.filter((m) => m.stufe === 'warnung').length
  const info = alle.length - fehler - warnung
  const stand = fehler ? 'fehler' : warnung ? 'warnung' : 'gut'
  const teile = [
    fehler ? `${fehler} Fehler` : '', warnung ? `${warnung} ${warnung === 1 ? 'Warnung' : 'Warnungen'}` : '',
    info ? `${info} ${info === 1 ? 'Hinweis' : 'Hinweise'}` : '',
  ].filter(Boolean)
  return (
    <details className={`pruefmodul pm-${stand}`} open={fehler > 0 || undefined}>
      <summary>
        <span className="pm-marke" aria-hidden="true">{fehler ? '!' : warnung ? '!' : '✓'}</span>
        <b>Prüfmodul</b>
        <span className="pm-stand">
          {teile.length ? teile.join(', ') : positionen.length ? 'keine Fehler gefunden' : 'noch keine Leistungen im Plan'}
          {laeuft ? ' · prüft Ausschlüsse …' : fern.meldungen === null ? ' · Ausschlussprüfung nicht erreichbar' : ''}
        </span>
      </summary>
      {alle.length > 0 && (
        <ul>
          {alle.map((m, i) => <li key={i} className={`pm-${m.stufe}`}><span>{WORT[m.stufe]}</span>{m.text}</li>)}
        </ul>
      )}
      {!alle.length && positionen.length > 0 && (
        <p>Geprüft: Anzahl, Betrag und Faktor jeder Position, doppelte Positionen und die Ausschlüsse der Gebührenordnung zwischen den Nummern.</p>
      )}
    </details>
  )
}
