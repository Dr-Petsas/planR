import { useState, useSyncExternalStore } from 'react'
import { aktualisieren, datenAbo, datenVersion, standVon, type Aktualisierung, type Datenstand } from '../daten'

/** Neu zeichnen, sobald Punktwerte oder Listen aktualisiert wurden (in useMemo-Abhängigkeiten aufnehmen). */
export const useDatenVersion = () => useSyncExternalStore(datenAbo, datenVersion)

export const datumKurz = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—')

export type Meldung = { art: 'ok' | 'fehler'; text: string } | null

export function meldungAus(ergebnis: Aktualisierung[]): Meldung {
  const neu = ergebnis.filter((e) => e.geaendert)
  return neu.length
    ? { art: 'ok', text: `Aktualisiert: ${neu.map((e) => `${e.name} (Stand ${datumKurz(e.neu)})`).join(', ')}.` }
    : { art: 'ok', text: `Schon aktuell${ergebnis[0] ? ` (Stand ${datumKurz(ergebnis[0].alt)})` : ''}.` }
}

export const DIENST_FEHLT =
  'Datendienst nicht erreichbar (Startseite auf Port 5189 bzw. planr.pickadoc-tunnel.com). Es gelten weiter die bisherigen Werte.'

export interface GenutzteListe {
  datei: string
  name: string
  mitgeliefert: Datenstand
  /** gerade gültiger Stand (aktualisiert oder mitgeliefert) */
  aktuell: Datenstand
}

/**
 * Preislisten dieses Planers mit Stand und Knopf "Preislisten aktualisieren".
 * Die Rechen-Kerne lesen ihre Listen beim Start – nach einer Aktualisierung lädt die Seite neu
 * (der offene Plan liegt im Browser-Speicher und bleibt erhalten).
 */
export function ListenKarte({ listen, knopf = 'Preislisten aktualisieren', neueOrdner = [], hilfe }: {
  listen: GenutzteListe[]
  knopf?: string
  /** Ordner des Datendienstes, aus denen auch neue (nicht mitgelieferte) Listen geholt werden */
  neueOrdner?: string[]
  hilfe?: string
}) {
  useDatenVersion()
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<Meldung>(null)

  const holen = async () => {
    setLaeuft(true)
    setMeldung(null)
    try {
      const ergebnis = await aktualisieren(listen.map((l) => ({ datei: l.datei, mitgeliefert: l.mitgeliefert })), neueOrdner)
      setMeldung(meldungAus(ergebnis))
      if (ergebnis.some((e) => e.geaendert)) setTimeout(() => location.reload(), 1200)
    } catch {
      setMeldung({ art: 'fehler', text: DIENST_FEHLT })
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <div className="pw-karte">
      <div className="pw-kopf">
        <div>
          <h3>Preislisten</h3>
          <p className="pw-hilfe">{hilfe ?? 'Gebührenverzeichnisse und Laborpreise, mit denen dieser Planer rechnet.'}</p>
        </div>
        <button type="button" className="pw-knopf" disabled={laeuft || !listen.length} onClick={holen}>
          {laeuft ? 'Lädt …' : knopf}
        </button>
      </div>
      {meldung && <p className={`pw-meldung pw-${meldung.art}`}>{meldung.text}</p>}
      <table className="pw-tabelle">
        <thead><tr><th>Liste</th><th>Stand</th><th>Herkunft</th></tr></thead>
        <tbody>
          {listen.map((l) => (
            <tr key={l.datei}>
              <td>{l.name}</td>
              <td>{datumKurz(standVon(l.aktuell))}</td>
              <td>{standVon(l.aktuell) > standVon(l.mitgeliefert) ? 'aktualisiert' : 'mitgeliefert'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
