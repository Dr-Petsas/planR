import { useState } from 'react'
import { ANALOG } from '../data/gebuehren'
import { KZVEN, kzvAusPlz, kzvNachNr } from '../data/kzv'
import {
  PUNKTWERTE, PUNKTWERT_QUELLE, PUNKTWERT_STAND, csvParsen, ladeImport, speichereImport,
  type PunktwertErgebnis,
} from '../data/punktwerte'
import type { Einstellungen, Praxis } from '../types'
import { Feld, Karte, TextFeld } from './ui'

interface Props {
  einst: Einstellungen
  setEinst: (e: Einstellungen) => void
  punktwert: PunktwertErgebnis
}

const zahl = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

export default function EinstellungenReiter({ einst, setEinst, punktwert }: Props) {
  const setP = (patch: Partial<Praxis>) => setEinst({ ...einst, praxis: { ...einst.praxis, ...patch } })
  const [csv, setCsv] = useState('')
  const [importiert, setImportiert] = useState(ladeImport())
  const [meldung, setMeldung] = useState('')
  const plzKzv = kzvAusPlz(einst.praxis.plz)

  const importieren = () => {
    const tab = csvParsen(csv)
    const n = Object.keys(tab).length
    if (!n) { setMeldung('Keine gültigen Zeilen gefunden (Format: KZV-Nr;Primärkassen;Ersatzkassen).'); return }
    const neu = { ...importiert, ...tab }
    speichereImport(neu)
    setImportiert(neu)
    setMeldung(`${n} KZV-Punktwerte übernommen.`)
    setEinst({ ...einst })
  }

  return (
    <div className="reiter-inhalt">
      <Karte titel="Praxis">
        <div className="feld-raster">
          <TextFeld label="Praxisname" value={einst.praxis.name} onChange={(v) => setP({ name: v })} />
          <TextFeld label="Behandler" value={einst.praxis.behandler} onChange={(v) => setP({ behandler: v })} />
          <TextFeld label="Straße" value={einst.praxis.strasse} onChange={(v) => setP({ strasse: v })} />
          <TextFeld label="PLZ" value={einst.praxis.plz} onChange={(v) => setP({ plz: v })} />
          <TextFeld label="Ort" value={einst.praxis.ort} onChange={(v) => setP({ ort: v })} />
          <TextFeld label="Telefon" value={einst.praxis.telefon} onChange={(v) => setP({ telefon: v })} />
          <TextFeld label="Zahnarzt-Nr." value={einst.praxis.zahnarztNr} onChange={(v) => setP({ zahnarztNr: v })} />
          <TextFeld label="Abrechnungs-Nr." value={einst.praxis.abrechnungsNr} onChange={(v) => setP({ abrechnungsNr: v })} />
        </div>
      </Karte>

      <Karte titel="KZV und Punktwert" rechts={<span className="ergebnis-badge">{punktwert.wert.toFixed(4).replace('.', ',')} € · {quelleText(punktwert.quelle)}</span>}>
        <div className="feld-raster">
          <Feld label="KZV">
            <select value={einst.kzvNr} onChange={(e) => setEinst({ ...einst, kzvNr: e.target.value })}>
              <option value="">aus PLZ{plzKzv ? `: ${kzvNachNr(plzKzv)?.name}` : ' (PLZ fehlt)'}</option>
              {KZVEN.map((k) => <option key={k.nr} value={k.nr}>{k.nr} {k.name}</option>)}
            </select>
          </Feld>
          <Feld label="PAR-Punktwert von Hand (€)">
            <input type="text" value={einst.bemaPunktwertOverride ?? ''} placeholder="leer = Tabelle"
              onChange={(e) => setEinst({ ...einst, bemaPunktwertOverride: zahl(e.target.value) })} />
          </Feld>
          <Feld label="KCH-Punktwert Teil 1 (€)">
            <input type="text" value={einst.kchPunktwertOverride ?? ''} placeholder="leer = wie PAR"
              onChange={(e) => setEinst({ ...einst, kchPunktwertOverride: zahl(e.target.value) })} />
          </Feld>
        </div>
        <p className="hinweis-klein">{punktwert.hinweis} Anästhesie und Röntgen (BEMA Teil 1) laufen über den KCH-Punktwert.</p>

        <h3>Punktwerte je KZV</h3>
        <p className="hinweis-klein">Stand: {PUNKTWERT_STAND}. Quelle: {PUNKTWERT_QUELLE}. Importierte Werte haben Vorrang.</p>
        <table className="tabelle">
          <thead><tr><th>Nr.</th><th>KZV</th><th>Primärkassen</th><th>Ersatzkassen</th><th>Herkunft</th></tr></thead>
          <tbody>
            {KZVEN.map((k) => {
              const imp = importiert[k.nr]
              const w = imp ?? PUNKTWERTE[k.nr]
              return (
                <tr key={k.nr} className={k.nr === punktwert.kzvNr ? 'aktiv' : ''}>
                  <td>{k.nr}</td><td>{k.name}</td>
                  <td>{w ? w.primaer.toFixed(4).replace('.', ',') : 'bitte eintragen'}</td>
                  <td>{w ? w.ersatz.toFixed(4).replace('.', ',') : 'bitte eintragen'}</td>
                  <td>{imp ? 'Import' : w ? 'Richtwert' : '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Feld label="CSV-Import (KZV-Nr;Primärkassen;Ersatzkassen)" weit>
          <textarea rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'13;1,1550;1,1900\n37;1,1520;1,1880'} />
        </Feld>
        <div className="knopf-reihe">
          <button onClick={importieren}>Importieren</button>
          <button className="gefahr" onClick={() => { speichereImport({}); setImportiert({}); setMeldung('Import gelöscht.'); setEinst({ ...einst }) }}>Import löschen</button>
          {meldung && <span className="hinweis-klein">{meldung}</span>}
        </div>
      </Karte>

      <Karte titel="Private Zusatzleistungen">
        <div className="feld-raster">
          <Feld label="Standardfaktor GOZ/GOÄ">
            <input type="number" step={0.1} min={1} max={3.5} value={einst.gozFaktor}
              onChange={(e) => setEinst({ ...einst, gozFaktor: Number(e.target.value) || 2.3 })} />
          </Feld>
          <Feld label="Faktor GOÄ Röntgen (Abschnitt O)">
            <input type="number" step={0.1} min={1} max={2.5} value={einst.roentgenFaktor}
              onChange={(e) => setEinst({ ...einst, roentgenFaktor: Number(e.target.value) || 1.8 })} />
          </Feld>
        </div>
        <h3>Analogliste (§ 6 GOZ)</h3>
        <table className="tabelle">
          <thead><tr><th>Leistung</th><th>Bezug (Vorgabe)</th><th>Punkte</th></tr></thead>
          <tbody>
            {Object.entries(ANALOG).map(([k, a]) => (
              <tr key={k}>
                <td>{a.titel}</td>
                <td>{a.bezug} ({a.punkte})</td>
                <td>
                  <input type="number" min={0} value={einst.analogPunkte[k] ?? a.punkte}
                    onChange={(e) => setEinst({ ...einst, analogPunkte: { ...einst.analogPunkte, [k]: Number(e.target.value) } })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>
    </div>
  )
}

function quelleText(q: PunktwertErgebnis['quelle']) {
  return q === 'override' ? 'von Hand' : q === 'import' ? 'Import' : q === 'richtwert' ? 'Richtwert' : 'Fallback'
}
