import type { ReactNode } from 'react'
import { datumDe } from '../engine/termine'
import type { Antragskopf, Einstellungen, ParFall, Patient } from '../types'

/** Ankreuzfeld wie im Vordruck; mit onClick zum Anklicken. */
export function X({ an, onClick, title }: { an: boolean; onClick?: () => void; title?: string }) {
  if (!onClick) return <span className={`kreuz${an ? ' an' : ''}`}>{an ? '✕' : ''}</span>
  return (
    <button type="button" className={`kreuz klickbar${an ? ' an' : ''}`} onClick={onClick} title={title}>
      {an ? '✕' : ''}
    </button>
  )
}

/** Eingabe direkt im Vordruck (im Druck nur Text). */
export function Fi({ value, onChange, type = 'text', breite, placeholder, mono, vorschlag }: {
  value: string | number; onChange?: (v: string) => void; type?: 'text' | 'date' | 'number'
  breite?: string; placeholder?: string; mono?: boolean
  /** Wert ist nur aus dem Fall vorgeschlagen, noch nicht im Formular eingetragen */
  vorschlag?: boolean
}) {
  if (!onChange) return <span className={mono ? 'mono' : ''}>{type === 'date' ? datumDe(String(value)) : value}</span>
  return (
    <input className={`fi${mono ? ' mono' : ''}${vorschlag ? ' vorschlag' : ''}`} type={type} value={value} placeholder={placeholder}
      title={vorschlag ? 'Vorschlag aus dem Fall – überschreiben zum Ändern' : undefined}
      style={breite ? { width: breite } : undefined} onChange={(e) => onChange(e.target.value)} />
  )
}

export function Versichertenfeld({ fall, einst, setFall, setEinst }: {
  fall: ParFall; einst: Einstellungen; setFall?: (f: ParFall) => void; setEinst?: (e: Einstellungen) => void
}) {
  const praxis = (key: 'abrechnungsNr' | 'zahnarztNr') => (
    <Fi value={einst.praxis[key]} onChange={setEinst ? (v) => setEinst({ ...einst, praxis: { ...einst.praxis, [key]: v } }) : undefined} />
  )
  const p = fall.patient
  const set = setFall ? (patch: Partial<Patient>) => setFall({ ...fall, patient: { ...p, ...patch } }) : null
  const f = (key: keyof Patient, extra: { breite?: string; type?: 'text' | 'date'; placeholder?: string } = {}) => (
    <Fi value={p[key] as string} onChange={set ? (v) => set({ [key]: v } as Partial<Patient>) : undefined} {...extra} />
  )
  return (
    <div className="vf">
      <div className="vf-zeile"><small>Krankenkasse bzw. Kostenträger</small>{f('kasse', { placeholder: 'Krankenkasse' })}</div>
      <div className="vf-zeile hoch">
        <small>Name, Vorname des Versicherten</small>
        <div className="vf-name">{f('name', { breite: '30mm', placeholder: 'Name' })}<span>,</span>{f('vorname', { breite: '26mm', placeholder: 'Vorname' })}</div>
        <small className="vf-geb">geb. am {f('geburtsdatum', { type: 'date', breite: '30mm' })}</small>
      </div>
      <div className="vf-drei">
        <div><small>Kostenträgerkennung</small>{f('kostentraegerkennung', { placeholder: 'IK' })}</div>
        <div><small>Versicherten-Nr.</small>{f('versichertennr')}</div>
        <div><small>Status</small>{f('status', { breite: '14mm' })}</div>
      </div>
      <div className="vf-drei">
        <div><small>Abrechnungs-Nr.</small>{praxis('abrechnungsNr')}</div>
        <div><small>Zahnarzt-Nr.</small>{praxis('zahnarztNr')}</div>
        <div><small>Datum</small><Fi type="date" value={fall.datum} onChange={setFall ? (v) => setFall({ ...fall, datum: v }) : undefined} /></div>
      </div>
    </div>
  )
}

const artText = (a: Antragskopf['artBehandlungsplan']) =>
  a === 'initial' ? 'PAR' : a === 'bev' ? 'BEV' : a === 'cpt' ? 'CPT' : 'UPT-Verlängerung'

/** Antragskopf rechts oben; `art` ersetzt die Auswahl "Art des Behandlungsplans" durch festen Text. */
export function Antragsbox({ a, set, art }: { a: Antragskopf; set?: (patch: Partial<Antragskopf>) => void; art?: string }) {
  const f = (key: keyof Antragskopf) => (
    <Fi value={a[key]} onChange={set ? (v) => set({ [key]: v } as Partial<Antragskopf>) : undefined} />
  )
  return (
    <div className="antragsbox">
      <div><small>Antragsnummer</small>{f('antragsnummer')}</div>
      <div><small>Antragsnummer ursprünglicher Behandlungsplan</small>{f('antragsnummerUrspruenglich')}</div>
      <div><small>Verarbeitungskennzeichen</small>{f('verarbeitungskennzeichen')}</div>
      <div><small>Art des Behandlungsplans</small>
        {art ?? (set ? (
          <select className="fi" value={a.artBehandlungsplan} onChange={(e) => set({ artBehandlungsplan: e.target.value as Antragskopf['artBehandlungsplan'] })}>
            <option value="initial">PAR</option><option value="bev">BEV</option><option value="cpt">CPT</option><option value="upt_verlaengerung">UPT-Verlängerung</option>
          </select>
        ) : <span>{artText(a.artBehandlungsplan)}</span>)}
      </div>
      <div className="antragsbox-fuss">
        <small>Seite</small>
        <small>Wechselkennzeichen {set ? (
          <select className="fi" value={a.wechselkennzeichen} onChange={(e) => set({ wechselkennzeichen: e.target.value as Antragskopf['wechselkennzeichen'] })}>
            <option value=""></option><option value="kasse">K</option><option value="zahnarzt">Z</option>
          </select>
        ) : <b>{a.wechselkennzeichen === 'kasse' ? 'K' : a.wechselkennzeichen === 'zahnarzt' ? 'Z' : ''}</b>}</small>
        <small>Akt.-Z. PVS {f('aktenzeichenPVS')}</small>
        <small>log. Version<br /><b className="mono">{a.logVersion}</b></small>
      </div>
    </div>
  )
}

export function Seite({ children, titel }: { children: ReactNode; titel: ReactNode }) {
  return (
    <div className="a4">
      <div className="a4-stand">- Stand: 17.12.2025 -</div>
      <div className="a4-kopf-titel">{titel}</div>
      {children}
    </div>
  )
}

export function Unterschrift({ text }: { text: ReactNode }) {
  return <div className="unterschrift"><small>{text}</small><div className="unterschrift-feld" /></div>
}
