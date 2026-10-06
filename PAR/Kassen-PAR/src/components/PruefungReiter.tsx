import type { Pruefmeldung } from '../engine/pruefung'
import { Karte } from './ui'

const ART_TEXT = { fehler: 'Fehler', warnung: 'Warnung', hinweis: 'Hinweis' }

export default function PruefungReiter({ meldungen }: { meldungen: Pruefmeldung[] }) {
  const bereiche = [...new Set(meldungen.map((m) => m.bereich))]
  return (
    <div className="reiter-inhalt">
      {meldungen.length === 0 && <Karte titel="Prüfung"><p>Keine Auffälligkeiten.</p></Karte>}
      {bereiche.map((b) => (
        <Karte key={b} titel={b}>
          <ul className="meldungen">
            {meldungen.filter((m) => m.bereich === b).map((m, i) => (
              <li key={i} className={m.art}><b>{ART_TEXT[m.art]}:</b> {m.text}</li>
            ))}
          </ul>
        </Karte>
      ))}
    </div>
  )
}
