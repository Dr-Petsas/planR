import { datumZeit, type Ablage, type AblageDaten, type AblageEintrag } from '../ablage'

const betragText = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

interface KnoepfeProps<P> {
  ablage: Ablage<P>
  daten: AblageDaten<P>
  eintrag: AblageEintrag<P> | undefined
  offen: boolean
  onNeu: () => void
  neuText: string
}

/** Speichern · Freigeben · Neu – gleiche Knöpfe in allen Planern */
export function AblageKnoepfe<P>({ ablage, daten, eintrag, offen, onNeu, neuText }: KnoepfeProps<P>) {
  const frei = eintrag?.status === 'freigegeben'
  return (
    <div className="aktionen">
      <span className={`ablage-stand ${frei ? 'frei' : offen ? 'ungespeichert' : ''}`}>
        {frei ? 'freigegeben' : offen ? 'nicht gespeichert' : 'gespeichert'}
      </span>
      {frei ? (
        <button className="sekundaer" onClick={() => confirm('Freigabe zurücknehmen? Der Plan kann danach wieder geändert werden.') && ablage.zuruecknehmen(daten.nummer)}>
          Freigabe zurücknehmen
        </button>
      ) : (
        <>
          <button className="sekundaer" onClick={() => ablage.speichern(daten)} disabled={!offen}>Speichern</button>
          <button className="sekundaer" onClick={() => confirm(`${daten.nummer} freigeben? Danach ist der Plan gesperrt.`) && ablage.freigeben(daten)}>Freigeben</button>
        </>
      )}
      <button className="primaer" onClick={onNeu}>{neuText}</button>
    </div>
  )
}

interface ListeProps<P> {
  ablage: Ablage<P>
  aktuell: string
  onLaden: (plan: P) => void
}

/** Gespeicherte Pläne mit Status, zum Öffnen und Löschen */
export function AblageListe<P>({ ablage, aktuell, onLaden }: ListeProps<P>) {
  if (!ablage.liste.length) return null
  return (
    <div className="block ablage">
      <h3>Gespeicherte Pläne <small>{ablage.liste.length}</small></h3>
      <table className="ablage-tabelle">
        <thead>
          <tr><th>Nummer</th><th>Patient</th><th className="r">Betrag</th><th>Status</th><th>Geändert</th><th /><th /></tr>
        </thead>
        <tbody>
          {ablage.liste.map((e) => (
            <tr key={e.nummer} className={e.nummer === aktuell ? 'aktuell' : ''}>
              <td className="mono">{e.nummer}</td>
              <td>{e.patient || '—'}</td>
              <td className="r mono">{betragText(e.betrag)}</td>
              <td>
                <span className={`ablage-status ${e.status}`} title={e.freigegebenAm ? `freigegeben am ${datumZeit(e.freigegebenAm)}` : undefined}>
                  {e.status === 'freigegeben' ? 'freigegeben' : 'Entwurf'}
                </span>
              </td>
              <td className="ablage-zeit">{datumZeit(e.geaendert)}</td>
              <td>
                {e.nummer === aktuell
                  ? <span className="ablage-offen">geöffnet</span>
                  : <button className="sekundaer klein-btn" onClick={() => onLaden(e.plan)}>öffnen</button>}
              </td>
              <td>
                <button className="x" title="löschen"
                  onClick={() => confirm(`${e.nummer}${e.patient ? ` (${e.patient})` : ''} endgültig löschen?`) && ablage.loeschen(e.nummer)}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Hinweis über dem gesperrten Editor */
export function Sperrhinweis<P>({ eintrag }: { eintrag: AblageEintrag<P> | undefined }) {
  if (eintrag?.status !== 'freigegeben') return null
  return (
    <p className="ablage-sperre">
      Freigegeben am {datumZeit(eintrag.freigegebenAm)} – der Plan ist gesperrt. Zum Ändern oben „Freigabe zurücknehmen“.
    </p>
  )
}
