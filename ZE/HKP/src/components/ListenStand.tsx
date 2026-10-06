import { useEffect, useState } from 'react'

/** Ergebnis des Aktualisierungsdienstes (tools/listen-aktualisieren.ts → public/listen-status.json) */
export interface StatusQuelle {
  id: string
  typ: string
  name: string
  status: 'aktuell' | 'neu' | 'warnung' | 'fehler' | 'manuell'
  meldung: string
  url?: string
  gueltigAb?: string
}
export interface ListenStatus {
  geprueftAm: string
  quellen: StatusQuelle[]
}

const SYMBOL: Record<StatusQuelle['status'], string> = { aktuell: '✓', neu: '★', warnung: '!', fehler: '✕', manuell: '✋' }

export function ListenStand() {
  const [status, setStatus] = useState<ListenStatus | null | 'fehlt'>(null)
  const [offen, setOffen] = useState(false)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}listen-status.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : 'fehlt'))
      .then(setStatus, () => setStatus('fehlt'))
  }, [])
  if (!status) return null
  if (status === 'fehlt')
    return <p className="hinweis info listen-stand">Der Aktualisierungsdienst hat die offiziellen Quellen noch nicht geprüft (<code>npm run listen</code>).</p>

  const auffaellig = status.quellen.filter((q) => q.status !== 'aktuell')
  const tage = Math.floor((Date.now() - Date.parse(status.geprueftAm)) / 86400000)
  return (
    <details className="listen-stand" open={offen} onToggle={(e) => setOffen((e.target as HTMLDetailsElement).open)}>
      <summary>
        <strong>Aktualität der Preislisten</strong> – zuletzt geprüft {new Date(status.geprueftAm).toLocaleString('de-DE')}
        {tage > 3 && <b className="badge gelb">seit {tage} Tagen nicht geprüft</b>}
        {' · '}{status.quellen.length - auffaellig.length} von {status.quellen.length} Quellen aktuell
        {auffaellig.length > 0 && <>, {auffaellig.length} mit Hinweis</>}
      </summary>
      <table className="tabelle">
        <thead><tr><th /><th>Liste</th><th>Gültig ab</th><th>Meldung</th></tr></thead>
        <tbody>
          {status.quellen.map((q) => (
            <tr key={q.id} className={`ls-${q.status}`}>
              <td title={q.status}>{SYMBOL[q.status]}</td>
              <td className="nowrap">{q.url ? <a href={q.url} target="_blank" rel="noreferrer">{q.name}</a> : q.name}</td>
              <td className="nowrap">{q.gueltigAb ? q.gueltigAb.split('-').reverse().join('.') : '–'}</td>
              <td>{q.meldung}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="klein">
        Der Dienst prüft täglich die Veröffentlichungen der 17 KZVen (BEL II), von GKV-Spitzenverband/KZBV (Festzuschüsse,
        ZE-Punktwert) und gesetze-im-internet.de (GOZ). Neue Listen werden geprüft eingespielt und gelten automatisch ab ihrem Stichtag.
      </p>
    </details>
  )
}
