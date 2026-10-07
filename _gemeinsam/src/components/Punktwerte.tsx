import { useState } from 'react'
import { aktualisieren, standVon } from '../daten'
import { KZVEN, kzvAusPlz, kzvNachNr } from '../data/kzv'
import {
  BEREICH_NAME, MITGELIEFERT, PUNKTWERTE_DATEI, csvLesen, eigeneSetzen, eigeneWerte, ermittlePunktwert, punktwertTabelle,
  tabellenZeilen, type Leistungsbereich,
} from '../punktwerte'
import type { Praxis } from '../stammdaten'
import { DIENST_FEHLT as FEHLER, datumKurz as datum, meldungAus, useDatenVersion, type Meldung } from './Listen'

const euro4 = (x?: number) => (x ? x.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '—')

interface PunktwertProps {
  /** Leistungsbereiche dieses Planers, der erste ist der Hauptbereich. */
  bereiche: Leistungsbereich[]
  praxis: Praxis
  setPraxis: (p: Praxis) => void
  /** Fest eingetragene Punktwerte je Bereich (leer = Tabelle). */
  fest: Partial<Record<Leistungsbereich, number | null>>
  setFest: (f: Partial<Record<Leistungsbereich, number | null>>) => void
}

/** KZV/Bundesland, Punktwerte mit Stand und Quelle, Knopf "Punktwerte aktualisieren", feste und eigene Werte. */
export function PunktwertKarte({ bereiche, praxis, setPraxis, fest, setFest }: PunktwertProps) {
  useDatenVersion()
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<Meldung>(null)
  const [csv, setCsv] = useState('')
  const [csvBereich, setCsvBereich] = useState<Leistungsbereich>(bereiche[0])
  const [offen, setOffen] = useState(false)
  const tab = punktwertTabelle()
  const plzKzv = kzvAusPlz(praxis.plz)
  const eigen = eigeneWerte()

  const holen = async () => {
    setLaeuft(true)
    setMeldung(null)
    try {
      setMeldung(meldungAus(await aktualisieren([{ datei: PUNKTWERTE_DATEI, mitgeliefert: MITGELIEFERT }])))
    } catch {
      setMeldung({ art: 'fehler', text: FEHLER })
    } finally {
      setLaeuft(false)
    }
  }

  const csvUebernehmen = () => {
    const { werte, zeilen } = csvLesen(csv, csvBereich, eigen)
    if (!zeilen) {
      setMeldung({ art: 'fehler', text: 'Keine gültige Zeile erkannt. Format: KZV-Nr;Primärkassen;Ersatzkassen' })
      return
    }
    eigeneSetzen(werte)
    setCsv('')
    setMeldung({ art: 'ok', text: `${zeilen} eigene Punktwerte übernommen (${csvBereich}).` })
  }

  return (
    <div className="pw-karte">
      <div className="pw-kopf">
        <div>
          <h3>KZV und Punktwerte</h3>
          <p className="pw-hilfe">
            Die Punktwerte vereinbart die KZV der Praxis mit den Kassen, getrennt nach Primär- und Ersatzkassen.
            Tabelle Stand {datum(standVon(tab))} · {tab.quelle}
          </p>
        </div>
        <button type="button" className="pw-knopf" disabled={laeuft} onClick={holen}>
          {laeuft ? 'Lädt …' : 'Punktwerte aktualisieren'}
        </button>
      </div>
      {meldung && <p className={`pw-meldung pw-${meldung.art}`}>{meldung.text}</p>}

      <div className="pw-raster">
        <label className="sd-feld sd-breit">
          <span>KZV / Bundesland</span>
          <select value={praxis.kzvNr} onChange={(e) => setPraxis({ ...praxis, kzvNr: e.target.value })}>
            <option value="">aus der Praxis-PLZ{plzKzv ? `: ${kzvNachNr(plzKzv)?.name}` : ' (PLZ fehlt)'}</option>
            {KZVEN.map((k) => <option key={k.nr} value={k.nr}>{k.name} ({k.kurz})</option>)}
          </select>
        </label>
      </div>

      <table className="pw-tabelle">
        <thead>
          <tr><th>Bereich</th><th className="r">Primärkassen</th><th className="r">Ersatzkassen</th><th>Quelle</th><th className="r">fest (€)</th></tr>
        </thead>
        <tbody>
          {bereiche.map((b) => {
            const p = ermittlePunktwert({ bereich: b, praxis, kassenart: 'primaer', fest: fest[b] })
            const e = ermittlePunktwert({ bereich: b, praxis, kassenart: 'ersatz', fest: fest[b] })
            return (
              <tr key={b}>
                <td>{BEREICH_NAME[b]}</td>
                <td className="r">{euro4(p.wert)} €</td>
                <td className="r">{euro4(e.wert)} €</td>
                <td className={p.geprueft ? '' : 'pw-warn'}>{p.hinweis}</td>
                <td className="r">
                  <input
                    type="number" min={0} step={0.0001} placeholder="Tabelle" value={fest[b] ?? ''}
                    onChange={(ev) => setFest({ ...fest, [b]: ev.target.value ? +ev.target.value : null })}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="pw-hilfe">Ein fester Wert gilt für Primär- und Ersatzkassen gleichermaßen und hat Vorrang vor der Tabelle.</p>

      <button type="button" className="pw-klapp" onClick={() => setOffen(!offen)}>
        {offen ? '▾' : '▸'} Alle KZVen und praxiseigene Werte
      </button>
      {offen && (
        <div className="pw-details">
          {bereiche.map((b) => (
            <table key={b} className="pw-tabelle pw-klein">
              <caption>{BEREICH_NAME[b]}</caption>
              <thead><tr><th>KZV</th><th className="r">Primär</th><th className="r">Ersatz</th><th>gültig ab</th><th className="r">eigen</th></tr></thead>
              <tbody>
                {tabellenZeilen(b).map(({ kzv, tabelle, eigen: ew }) => (
                  <tr key={kzv.nr} className={kzv.nr === (praxis.kzvNr || plzKzv) ? 'pw-aktiv' : ''}>
                    <td>{kzv.nr} {kzv.name}</td>
                    <td className="r">{euro4(tabelle?.primaer)}</td>
                    <td className="r">{euro4(tabelle?.ersatz)}</td>
                    <td className={tabelle?.geprueft === false ? 'pw-warn' : ''}>{tabelle?.gueltigAb ? datum(tabelle.gueltigAb) : '—'}{tabelle?.geprueft === false ? ' (ungeprüft)' : ''}</td>
                    <td className="r">{ew ? `${euro4(ew.primaer)} / ${euro4(ew.ersatz)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
          <div className="pw-csv">
            <p className="pw-hilfe">Eigene Werte aus dem KZV-Rundschreiben einfügen, je Zeile <code>KZV-Nr;Primärkassen;Ersatzkassen</code> (z. B. <code>11;1,2345;1,2567</code>).</p>
            <textarea rows={3} value={csv} onChange={(e) => setCsv(e.target.value)} />
            <div className="pw-zeile">
              <select value={csvBereich} onChange={(e) => setCsvBereich(e.target.value as Leistungsbereich)}>
                {bereiche.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <button type="button" onClick={csvUebernehmen} disabled={!csv.trim()}>Eigene Werte übernehmen</button>
              {Object.keys(eigen).length > 0 && (
                <button type="button" className="pw-weg" onClick={() => { eigeneSetzen({}); setMeldung({ art: 'ok', text: 'Eigene Werte gelöscht.' }) }}>
                  Eigene Werte löschen
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
