import { useState } from 'react'
import type { Abformung, HkpPlan, ImplantatAngaben } from '../types'
import { IMPLANTATSYSTEME, KOMPONENTEN, implantatsystem, type Komponente } from '../data/implantatsysteme'
import { ABUTMENTS } from '../engine/implantat'
import { ABFORMUNG_ARTEN, LOEFFEL, PROTHESE_ARTEN } from '../engine/abformung'
import { euro } from '../format'

const GENAU: Record<string, string> = { ja: 'Listenpreise', teilweise: 'teilweise geschätzt', geschaetzt: 'Richtwerte' }

export function ImplantatFelder({ wert, onChange, abformung }: { wert: ImplantatAngaben; onChange: (a: ImplantatAngaben) => void; abformung: Abformung }) {
  const sys = implantatsystem(wert.system)
  const set = <K extends keyof ImplantatAngaben>(k: K, v: ImplantatAngaben[K]) => onChange({ ...wert, [k]: v })
  return (
    <div className="impl-felder">
      <fieldset className="impl-abformung">
        <legend>Abformung Implantat</legend>
        {abformung === 'scan'
          ? <span title="Scanbody, GOZ 0065 je Kieferhälfte/Frontzahnbereich, gedrucktes Modell mit digitalem Analog">Intraoralscan mit Scanbody</span>
          : LOEFFEL.map((l) => (
            <label key={l.id} className="check">
              <input type="radio" name="impl-loeffel" checked={(wert.abformung === 'offen' ? 'offen' : 'geschlossen') === l.id} onChange={() => set('abformung', l.id)} />
              {l.titel}
            </label>
          ))}
      </fieldset>
      <label className="impl-feld">Abutment
        <select value={wert.abutment} onChange={(e) => set('abutment', e.target.value as ImplantatAngaben['abutment'])}>
          {ABUTMENTS.map((a) => <option key={a.id} value={a.id}>{a.titel}</option>)}
        </select>
      </label>
      <label className="impl-feld">Implantatsystem
        <select value={sys.id} onChange={(e) => set('system', e.target.value)}>
          {IMPLANTATSYSTEME.map((s) => <option key={s.id} value={s.id}>{s.hersteller} – {s.system}</option>)}
        </select>
      </label>
      <p className="impl-preise" title={`Quelle: ${sys.quelle}`}>
        {(Object.keys(KOMPONENTEN) as Komponente[]).map((k) => <span key={k}>{KOMPONENTEN[k]} <b>{euro(sys.preise[k])}</b></span>)}
        <small>{GENAU[sys.genau]}, Stand {sys.stand}</small>
      </p>
    </div>
  )
}

/** Rückfrage vor dem Berechnen, solange die Abformung des Plans nicht festgelegt ist */
export function AbformungFrage({ implantate, wahl, implantat, onOk, onAbbruch }: {
  implantate: string[]
  wahl: Pick<HkpPlan, 'abformung' | 'abformungProthese'>
  implantat: ImplantatAngaben
  onOk: (wahl: Pick<HkpPlan, 'abformung' | 'abformungProthese'>, implantat: ImplantatAngaben) => void
  onAbbruch: () => void
}) {
  const [art, setArt] = useState<Abformung>(wahl.abformung)
  const [prothese, setProthese] = useState<Abformung>(wahl.abformungProthese)
  const [imp, setImp] = useState(implantat)
  const optionen = (arten: typeof ABFORMUNG_ARTEN, wert: Abformung, setzen: (a: Abformung) => void, name: string, abwaehlbar = false) => (
    <div className="abformung-wahl">
      {arten.map((a) => (
        <label key={a.id} className={`abformung-option${wert === a.id ? ' aktiv' : ''}`}>
          <input type="radio" name={name} checked={wert === a.id} onChange={() => setzen(a.id)} onClick={() => abwaehlbar && wert === a.id && setzen('')} />
          <b>{a.titel}</b>
          <small>{a.text}</small>
        </label>
      ))}
    </div>
  )
  return (
    <div className="dialog-hintergrund" onClick={onAbbruch}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>Abformung: Intraoralscan oder Abdruck?</h3>
        <p>Davon hängen GOZ 0065, die Modelle im Labor{implantate.length ? ' und die Abformteile der Implantate' : ''} ab.</p>
        <h4>1. Präparierte Zähne / Primärkronen</h4>
        {optionen(ABFORMUNG_ARTEN, art, setArt, 'abformung')}
        <h4>2. Herausnehmbarer Teil <small>nur bei Kombinations-/Prothesenarbeit, z. B. nach dem Einsetzen der Primärkronen – nochmals anklicken zum Abwählen</small></h4>
        {optionen(PROTHESE_ARTEN, prothese, setProthese, 'abformung-prothese', true)}
        {implantate.length > 0 && (
          <>
            <h4>Implantatkrone {implantate.join(', ')}</h4>
            <ImplantatFelder wert={imp} onChange={setImp} abformung={art} />
          </>
        )}
        <div className="dialog-knoepfe">
          <button onClick={onAbbruch}>Abbrechen</button>
          <button className="primaer" disabled={!art} onClick={() => onOk({ abformung: art, abformungProthese: prothese }, imp)}>Übernehmen und berechnen</button>
        </div>
      </div>
    </div>
  )
}
