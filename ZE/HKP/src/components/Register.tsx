import { useCallback, useEffect, useState } from 'react'
import type { HkpPlan } from '../types'
import type { Ergebnis } from '../engine/berechnung'
import { euro } from '../format'
import {
  RegisterFehler, STATUS_TEXT, aktivSetzen, planStand, registerAnlegen, registerListe, registerStatusSetzen, schluesselSetzen, useVerbindung, verbunden,
  type HkpStatus, type RegisterKopf,
} from '../store/register'
import type { RegisterAbgleich } from '../store/registerAbgleich'

const datum = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '')
const zeit = (iso?: string) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '')
const QUELLE: Record<string, string> = { lena01: 'Lena-Erstuntersuchung', gesprochen: 'gesprochen', 'gesprochen+lena01': 'gesprochen + Lena', pvs: 'Praxisprogramm', planr: 'PlanR' }

/** Zeile über dem Formular: Verknüpfung, Status, Freigabe, Konflikte */
export function RegisterLeiste({ r, onStatus }: { r: RegisterAbgleich; onStatus: (s: HkpStatus) => void }) {
  const { aktiv, abgleich, geaendert } = r
  if (!aktiv) return null
  return (
    <div className={`register-leiste ${abgleich.art === 'konflikt' ? 'konflikt' : ''}`}>
      <span>Register: <strong>{aktiv.label}</strong> · <span className={`status status-${aktiv.status}`}>{STATUS_TEXT[aktiv.status]}</span></span>
      <span className="klein">
        {abgleich.art === 'speichert' ? 'speichert …' : abgleich.art === 'fehler' ? `⚠ ${abgleich.text}` : abgleich.art === 'neu_geladen' ? abgleich.text : geaendert ? 'Änderungen werden gespeichert …' : 'gespeichert'}
      </span>
      {aktiv.status === 'wartet_auf_freigabe' && abgleich.art !== 'konflikt' && (
        <button className="primaer" onClick={() => onStatus('freigegeben')} title="Nur hier – Clara kann nicht freigeben">✓ Freigeben</button>
      )}
      {abgleich.art === 'konflikt' && (
        <>
          <span>⚠ Im Register geändert ({abgleich.aktuell.verlauf?.at(-1)?.wer}: {abgleich.aktuell.verlauf?.at(-1)?.was}), hier ebenfalls.</span>
          <button onClick={() => r.registerStandLaden()}>Register-Stand laden</button>
          <button onClick={() => r.ueberschreiben()}>Meinen Stand speichern</button>
        </>
      )}
      <button className="klein" onClick={r.loesen} title="Plan bleibt in PlanR, wird aber nicht mehr abgeglichen">Verknüpfung lösen</button>
    </div>
  )
}

/** Schlüssel direkt hier eingeben – einmal pro Gerät, danach erscheinen Claras HKPs */
function SchluesselEingabe({ onEinstellungen }: { onEinstellungen: () => void }) {
  const [wert, setWert] = useState('')
  const [fehler, setFehler] = useState('')
  const [prueft, setPrueft] = useState(false)

  async function verbinden() {
    if (!wert.trim()) return
    setPrueft(true)
    schluesselSetzen(wert)
    try {
      await registerListe()
      setFehler('')
    } catch (e) {
      schluesselSetzen('')
      setFehler(e instanceof RegisterFehler && e.status === 401 ? 'Der Schlüssel stimmt nicht.' : e instanceof Error ? e.message : String(e))
    } finally {
      setPrueft(false)
    }
  }

  return (
    <section className="abschnitt">
      <h3>HKP-Register</h3>
      <p>Hier erscheinen alle erstellten HKPs (auch die von Clara). Einmal auf diesem Gerät den MAS-Schlüssel eingeben:</p>
      <form className="schluessel-eingabe" onSubmit={(ev) => { ev.preventDefault(); verbinden() }}>
        <input type="password" autoComplete="current-password" placeholder="MAS-Schlüssel" value={wert} onChange={(ev) => setWert(ev.target.value)} />
        <button className="primaer" type="submit" disabled={prueft || !wert.trim()}>{prueft ? 'prüft …' : 'Verbinden'}</button>
        <button type="button" onClick={onEinstellungen}>Einstellungen</button>
      </form>
      {fehler && <p className="fehler">⚠ {fehler}</p>}
    </section>
  )
}

export function RegisterSeite({ plan, ergebnis, r, onGeoeffnet, onEinstellungen }: {
  plan: HkpPlan
  ergebnis: Ergebnis
  r: RegisterAbgleich
  onGeoeffnet: () => void
  onEinstellungen: () => void
}) {
  const istVerbunden = verbunden(useVerbindung())
  const [liste, setListe] = useState<RegisterKopf[] | null>(null)
  const [fehler, setFehler] = useState('')
  const [alle, setAlle] = useState(false)
  const [offen, setOffen] = useState<string | null>(null)

  const neuLaden = useCallback(async () => {
    try { setListe(await registerListe()); setFehler('') } catch (e) { setFehler(e instanceof Error ? e.message : String(e)) }
  }, [])
  useEffect(() => { if (istVerbunden) neuLaden() }, [istVerbunden, neuLaden])

  if (!istVerbunden) return <SchluesselEingabe onEinstellungen={onEinstellungen} />


  async function status(h: RegisterKopf, s: HkpStatus) {
    try {
      const neu = await registerStatusSetzen(h.id, h.version, s)
      if (r.aktiv?.id === h.id) aktivSetzen({ ...r.aktiv, version: neu.version, status: neu.status })
      await neuLaden()
    } catch (e) {
      alert(e instanceof RegisterFehler && e.status === 409 ? 'Der HKP wurde inzwischen geändert – Liste neu geladen.' : String(e instanceof Error ? e.message : e))
      await neuLaden()
    }
  }

  async function oeffnen(h: RegisterKopf) {
    if (!r.aktiv && plan.positionen.length && !confirm('Der aktuelle Plan ist nicht im Register und wird ersetzt. Fortfahren?')) return
    try { await r.laden(h.id); onGeoeffnet() } catch (e) { alert(e instanceof Error ? e.message : String(e)) }
  }

  async function aktuellenAnlegen() {
    try {
      const h = await registerAnlegen(plan, ergebnis)
      aktivSetzen({ id: h.id, version: h.version, status: h.status, label: h.patient.label, stand: planStand(plan) })
      await neuLaden()
    } catch (e) { alert(e instanceof Error ? e.message : String(e)) }
  }

  const sichtbar = (liste ?? []).filter((h) => alle || !['verworfen', 'abgerechnet', 'abgelehnt'].includes(h.status))
  const warten = (liste ?? []).filter((h) => h.status === 'wartet_auf_freigabe').length

  return (
    <section className="abschnitt register">
      <h3>HKP-Register {warten > 0 && <span className="badge-warten">{warten} warten auf Freigabe</span>}</h3>
      <div className="werkzeuge-zeile">
        <button onClick={neuLaden}>↻ Aktualisieren</button>
        {!r.aktiv && <button onClick={aktuellenAnlegen} disabled={!plan.patient.name}>Aktuellen Plan ins Register</button>}
        <label className="klein"><input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} /> auch verworfene, abgelehnte und abgerechnete</label>
      </div>
      {fehler && <p className="hinweis fehler">{fehler}</p>}
      {liste && !sichtbar.length && <p>Keine HKPs.</p>}
      {sichtbar.length > 0 && (
        <table className="register-tabelle">
          <thead><tr><th>Patient</th><th>HKP</th><th>erstellt</th><th>Status</th><th className="zahl">Gesamt</th><th className="zahl">Eigenanteil</th><th /></tr></thead>
          <tbody>
            {sichtbar.map((h) => (
              <RegisterZeile key={h.id} h={h} geoeffnet={r.aktiv?.id === h.id} offen={offen === h.id}
                onToggle={() => setOffen(offen === h.id ? null : h.id)} onOeffnen={() => oeffnen(h)} onStatus={(s) => status(h, s)} />
            ))}
          </tbody>
        </table>
      )}
      <p className="klein">
        Clara legt HKPs nur als Entwurf an („wartet auf Freigabe“). Freigeben geht ausschließlich hier. Positionen ändert Clara nur,
        solange der HKP auf Freigabe wartet – jede Änderung steht im Verlauf.
      </p>
    </section>
  )
}

function RegisterZeile({ h, geoeffnet, offen, onToggle, onOeffnen, onStatus }: {
  h: RegisterKopf; geoeffnet: boolean; offen: boolean; onToggle: () => void; onOeffnen: () => void; onStatus: (s: HkpStatus) => void
}) {
  return (
    <>
      <tr className={geoeffnet ? 'geoeffnet' : ''}>
        <td><button className="link" onClick={onToggle}>{offen ? '▾' : '▸'} {h.patient.label}</button></td>
        <td>{h.versorgungText ?? 'HKP'}{h.kiefer ? ` ${h.kiefer}` : ''}{h.erstelltVon === 'clara' && <span className="badge-clara" title="per Sprache von Clara angelegt">Clara</span>}</td>
        <td>{datum(h.erstellt)}</td>
        <td>
          <select className={`status status-${h.status}`} value={h.status} onChange={(e) => onStatus(e.target.value as HkpStatus)}>
            {(Object.keys(STATUS_TEXT) as HkpStatus[]).map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}
          </select>
        </td>
        <td className="zahl">{h.summen ? euro(h.summen.gesamt) : ''}</td>
        <td className="zahl">{h.summen ? euro(h.summen.eigenanteil) : ''}</td>
        <td className="aktionen">
          {h.status === 'wartet_auf_freigabe' && <button className="primaer" onClick={() => onStatus('freigegeben')}>✓ Freigeben</button>}
          <button onClick={onOeffnen} disabled={geoeffnet}>{geoeffnet ? 'geöffnet' : 'Öffnen'}</button>
        </td>
      </tr>
      {offen && (
        <tr className="register-details">
          <td colSpan={7}>
            {h.auftragText && <p><strong>Eingesprochen:</strong> „{h.auftragText}“</p>}
            {h.befundQuelle && <p><strong>Befund:</strong> {QUELLE[h.befundQuelle.art] ?? h.befundQuelle.art}{h.befundQuelle.datum ? ` vom ${datum(h.befundQuelle.datum)}` : ''}</p>}
            {h.summen && <p><strong>Festzuschuss</strong> {euro(h.summen.festzuschuss)} · <strong>Material</strong> {euro(h.summen.material)}</p>}
            {!!h.hinweise?.length && <ul className="klein">{h.hinweise.map((x) => <li key={x}>{x}</li>)}</ul>}
            {h.offeneAenderung && <p className="hinweis warnung">Clara hat eine Änderung vorgeschlagen, die noch nicht bestätigt ist.</p>}
            {!!h.verlauf?.length && (
              <details><summary>Verlauf ({h.verlauf.length})</summary>
                <ul className="klein">{h.verlauf.map((v, i) => <li key={i}>{zeit(v.at)} · {v.wer}: {v.was}</li>)}</ul>
              </details>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
