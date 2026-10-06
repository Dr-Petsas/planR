import { useState } from 'react'
import { aitZaehne, leistungsblock } from '../engine/strecke'
import { pruefeBefund } from '../engine/pruefung'
import { heute, id, leererBefund } from '../store'
import type { Befund, BefundPhase, ParFall } from '../types'
import { Blatt2Chart } from './Blatt2Chart'
import { Feld, Karte, TextFeld } from './ui'

const PHASE_LABEL: Record<BefundPhase, string> = {
  initial: 'Initialbefund',
  beva: 'BEV a',
  bevb: 'BEV b',
  upt: 'UPT g / Kontrolle',
}

interface Props { fall: ParFall; setFall: (f: ParFall) => void }

export default function Blatt2Reiter({ fall, setFall }: Props) {
  const [aktivId, setAktivId] = useState(fall.befunde[0]?.id ?? '')
  const befund = fall.befunde.find((b) => b.id === aktivId) ?? fall.befunde[0]

  const setBefund = (b: Befund) => setFall({ ...fall, befunde: fall.befunde.map((x) => (x.id === b.id ? b : x)) })

  const neu = (phase: BefundPhase, kopieVon?: Befund) => {
    const b = kopieVon
      ? { ...structuredClone(kopieVon), id: id(), phase, datum: heute(), bezeichnung: PHASE_LABEL[phase] }
      : leererBefund(phase, PHASE_LABEL[phase], heute())
    if (kopieVon) for (const z of Object.values(b.zaehne)) { z.st = z.st.map(() => null); z.bop = z.bop.map(() => false); z.aitOverride = null }
    setFall({ ...fall, befunde: [...fall.befunde, b] })
    setAktivId(b.id)
  }

  const loeschen = (b: Befund) => {
    if (fall.befunde.length <= 1) return
    if (!confirm(`Befund „${b.bezeichnung}" vom ${b.datum} löschen?`)) return
    const rest = fall.befunde.filter((x) => x.id !== b.id)
    setFall({ ...fall, befunde: rest })
    setAktivId(rest[0].id)
  }

  const lb = leistungsblock(fall)
  const ait = aitZaehne(befund)
  const meldungen = pruefeBefund(befund)

  return (
    <div className="reiter-inhalt">
      <Karte titel="Befunde" rechts={
        <div className="knopf-reihe">
          <button onClick={() => neu('beva', befund)}>+ BEV a</button>
          <button onClick={() => neu('bevb', befund)}>+ BEV b</button>
          <button onClick={() => neu('upt', befund)}>+ UPT g</button>
        </div>
      }>
        <div className="befund-liste">
          {fall.befunde.map((b) => (
            <button key={b.id} className={`befund-chip${b.id === befund.id ? ' aktiv' : ''}`} onClick={() => setAktivId(b.id)}>
              <b>{b.bezeichnung}</b><span>{b.datum}</span>
            </button>
          ))}
        </div>
        <div className="feld-raster">
          <TextFeld label="Bezeichnung" value={befund.bezeichnung} onChange={(v) => setBefund({ ...befund, bezeichnung: v })} />
          <Feld label="Phase">
            <select value={befund.phase} onChange={(e) => setBefund({ ...befund, phase: e.target.value as BefundPhase })}>
              {(Object.keys(PHASE_LABEL) as BefundPhase[]).map((p) => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
            </select>
          </Feld>
          <Feld label="Datum">
            <input type="date" value={befund.datum} onChange={(e) => setBefund({ ...befund, datum: e.target.value })} />
          </Feld>
          <Feld label=" ">
            <button className="gefahr" disabled={fall.befunde.length <= 1} onClick={() => loeschen(befund)}>Befund löschen</button>
          </Feld>
        </div>
        <p className="hinweis-klein">Neue Befunde übernehmen den Zahnstatus (ZS, FB, Lockerung) des gerade gewählten Befunds; die Messwerte bleiben leer.</p>
      </Karte>

      <Karte titel={`Parodontalstatus Blatt 2 – ${befund.bezeichnung}`}>
        <Blatt2Chart befund={befund} onChange={setBefund} />
        <div className="zs-legende">
          ZS: 0 vorhanden · 1 fehlend (X) · 2 nicht erhaltungswürdig · 3 Krone · 4 Brückenpfeiler · 5 Ersatz · 6 Implantat
        </div>
        <Feld label="Bemerkungen (Blatt 2)" weit>
          <textarea rows={2} value={fall.bemerkung} onChange={(e) => setFall({ ...fall, bemerkung: e.target.value })} />
        </Feld>
        {meldungen.length > 0 && (
          <ul className="meldungen">
            {meldungen.map((m, i) => <li key={i} className={m.art}>{m.text}</li>)}
          </ul>
        )}
      </Karte>

      <Karte titel="Leistungsblock (Blatt 2, Version 2.1.0)">
        <table className="tabelle leistungsblock">
          <thead>
            <tr><th>Geb.-Nr.</th><th>4</th><th>ATG</th><th>MHU</th><th>AIT a</th><th>AIT b</th><th>BEV a</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>geplant</td>
              <td>{lb['4']}</td><td>{lb.ATG}</td><td>{lb.MHU}</td><td>{lb.AITa}</td><td>{lb.AITb}</td><td>{lb.BEVa}</td>
            </tr>
            {fall.uebernahmefall && (
              <tr>
                <td>ab Behandlungseinstieg</td>
                {(['4', 'ATG', 'MHU', 'AITa', 'AITb', 'BEVa'] as const).map((k) => (
                  <td key={k}>{Math.max(0, lb[k] - fall.zusatz.vorherLeistungen[k])}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
        <p className="hinweis-klein">
          AIT dieses Befunds: einwurzelig {ait.ein.join(', ') || '–'} · mehrwurzelig {ait.mehr.join(', ') || '–'}.
          Implantate, Brückenglieder und nicht erhaltungswürdige Zähne zählen nicht. Die UPT steht nicht im
          Leistungsblock; 108 und 111 werden nicht beantragt.
        </p>
      </Karte>
    </div>
  )
}
