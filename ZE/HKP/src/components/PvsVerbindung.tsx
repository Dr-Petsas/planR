import { useState } from 'react'
import { pvsBasisSetzen, pvsStatus, usePvsVerbindung } from '../store/pvs'

/** Verbindung zum lokalen PVS-Connector (pvsConnectoR) */
export function PvsVerbindung() {
  const v = usePvsVerbindung()
  const [eingabe, setEingabe] = useState(v.basis)
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null)

  async function pruefen() {
    pvsBasisSetzen(eingabe)
    setMeldung({ text: 'prüfe …' })
    try {
      const s = await pvsStatus()
      setMeldung({
        text: `Verbunden mit ${s.service} (${s.mode}). HKP-Anlage: ${s.clinicalCreate ? 'ja' : 'nein'}.`,
      })
    } catch (e) {
      setMeldung({ text: `⚠ ${e instanceof Error ? e.message : String(e)}`, fehler: true })
    }
  }

  return (
    <section className="es-block es-mas">
      <header className="es-kopf">
        PVS-Connector
        <span className="es-status">lokal</span>
        <small>Patienten suchen und HKPs im Praxisverwaltungssystem anlegen – über den lokalen Connector.</small>
      </header>
      <div className="es-mas-inhalt">
        <label className="es-schluessel">
          Connector-URL (leer = Vite-Proxy /pvs → 127.0.0.1:8770)
          <input
            type="url"
            value={eingabe}
            placeholder="http://127.0.0.1:8770"
            autoComplete="off"
            onChange={(ev) => setEingabe(ev.target.value)}
          />
        </label>
        <div className="es-knoepfe">
          <button onClick={pruefen}>Speichern und Verbindung prüfen</button>
        </div>
        {meldung && <p className={`es-meldung${meldung.fehler ? ' fehler' : ''}`}>{meldung.text}</p>}
        <p className="es-info">
          Patientensuche auf Teil 1 über Vor- und Nachname. Der Connector mappt den PlanR-Plan auf das jeweilige PVS.
        </p>
      </div>
    </section>
  )
}
