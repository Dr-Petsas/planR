import type { Abformung, ImplantatAngaben } from '../types'
import { IMPLANTATSYSTEME, KOMPONENTEN, implantatsystem, type Komponente } from '../data/implantatsysteme'
import { ABUTMENTS, LOEFFEL } from '../engine/planung'
import { euro } from '../engine/berechnung'

const GENAU: Record<string, string> = { ja: 'Listenpreise', teilweise: 'teilweise geschätzt', geschaetzt: 'Richtwerte' }

export function ImplantatFelder({ wert, onChange, abformung }: { wert: ImplantatAngaben; onChange: (a: ImplantatAngaben) => void; abformung: Abformung }) {
  const sys = implantatsystem(wert.system)
  const set = <K extends keyof ImplantatAngaben>(k: K, v: ImplantatAngaben[K]) => onChange({ ...wert, [k]: v })
  return (
    <div className="impl-felder">
      <label className="feld breit">
        <span>Implantatsystem</span>
        <select value={sys.id} onChange={(e) => set('system', e.target.value)}>
          {IMPLANTATSYSTEME.map((s) => <option key={s.id} value={s.id}>{s.hersteller} – {s.system}</option>)}
        </select>
      </label>
      <label className="feld">
        <span>Abutment</span>
        <select value={wert.abutment} onChange={(e) => set('abutment', e.target.value as ImplantatAngaben['abutment'])}>
          {ABUTMENTS.map((a) => <option key={a.id} value={a.id}>{a.titel}</option>)}
        </select>
      </label>
      <div className="feld">
        <span>Abformung Implantat</span>
        {abformung === 'scan' ? <div className="impl-info">Intraoralscan mit Scanbody</div>
          : abformung === '' ? <div className="impl-info offen-text">Abformung noch offen</div>
            : LOEFFEL.map((l) => (
              <label key={l.id} className="impl-radio">
                <input type="radio" name="impl-loeffel" checked={wert.loeffel === l.id} onChange={() => set('loeffel', l.id)} /> {l.titel}
              </label>
            ))}
      </div>
      <p className="impl-preise" title={`Quelle: ${sys.quelle}`}>
        {(Object.keys(KOMPONENTEN) as Komponente[]).map((k) => <span key={k}>{KOMPONENTEN[k]} <b>{euro(sys.preise[k])}</b></span>)}
        <small>{GENAU[sys.genau]}, Stand {sys.stand}</small>
      </p>
    </div>
  )
}
