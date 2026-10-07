import { useState, useSyncExternalStore } from 'react'
import { STANDARD_ID, abo, anlegen, loeschen, mandantenStand, umbenennen, wechseln } from '../mandant'

const useMandanten = () => useSyncExternalStore(abo, mandantenStand)

/** Name des aktiven Mandanten im Kopf – nur, wenn es mehr als einen gibt */
export function MandantName() {
  const { liste, aktiv } = useMandanten()
  return liste.length > 1 ? <em className="mandant-chip" title={`Mandant ${aktiv.id}`}>{aktiv.name}</em> : null
}

export function MandantKarte() {
  const { liste, aktiv } = useMandanten()
  const [name, setName] = useState(aktiv.name)
  const [neu, setNeu] = useState('')
  const anlegenKlick = () => neu.trim() && anlegen(neu)

  return (
    <section className="mandant-karte">
      <h3>Mandant</h3>
      <p className="mandant-hilfe">
        Jede Praxis hat eigene Einstellungen, Preise und eine eigene Ablage. Direkt öffnen mit <code>?mandant={aktiv.id}</code>.
      </p>
      <div className="mandant-zeile">
        <label className="mandant-feld">
          Aktiver Mandant
          <select value={aktiv.id} onChange={(e) => wechseln(e.target.value)}>
            {liste.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
          </select>
        </label>
        <label className="mandant-feld">
          Anzeigename
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => umbenennen(aktiv.id, name)} />
        </label>
      </div>
      <div className="mandant-zeile">
        <label className="mandant-feld">
          Neuer Mandant
          <input value={neu} placeholder="z. B. Praxis Musterstadt" onChange={(e) => setNeu(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && anlegenKlick()} />
        </label>
        <button type="button" disabled={!neu.trim()} onClick={anlegenKlick}>Anlegen und wechseln</button>
        {aktiv.id !== STANDARD_ID && (
          <button
            type="button"
            className="mandant-loeschen"
            onClick={() => confirm(`Mandant „${aktiv.name}“ mit allen Plänen und Einstellungen in diesem Planer löschen?`) && loeschen(aktiv.id)}
          >
            Mandant löschen
          </button>
        )}
      </div>
    </section>
  )
}
