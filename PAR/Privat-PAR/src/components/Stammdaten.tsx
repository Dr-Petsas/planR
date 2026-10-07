import type { Kassenart, Patient, Praxis } from '../stammdaten'
import { BESCHRIFTUNG } from '../stammdaten'

/** Kassenplaner zeigen IK, Status und Kassenart; Privatplaner nur den Kostenträger. */
export type Abrechnungsart = 'kasse' | 'privat'

interface FeldProps {
  label: string
  value: string
  onChange: (v: string) => void
  breit?: boolean
  typ?: 'text' | 'date' | 'email' | 'tel'
  platzhalter?: string
}

function Feld({ label, value, onChange, breit, typ = 'text', platzhalter }: FeldProps) {
  return (
    <label className={`sd-feld${breit ? ' sd-breit' : ''}`}>
      <span>{label}</span>
      <input type={typ} value={value} placeholder={platzhalter} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export function PatientFelder({ patient, onChange, art }: { patient: Patient; onChange: (p: Patient) => void; art: Abrechnungsart }) {
  const set = (patch: Partial<Patient>) => onChange({ ...patient, ...patch })
  const b = BESCHRIFTUNG
  return (
    <div className="sd-raster">
      <label className="sd-feld">
        <span>{b.anrede}</span>
        <select value={patient.anrede} onChange={(e) => set({ anrede: e.target.value })}>
          <option value="">–</option>
          <option value="Frau">Frau</option>
          <option value="Herr">Herr</option>
        </select>
      </label>
      <Feld label={b.vorname} value={patient.vorname} onChange={(v) => set({ vorname: v })} />
      <Feld label={b.name} value={patient.name} onChange={(v) => set({ name: v })} />
      <Feld label={b.geburtsdatum} typ="date" value={patient.geburtsdatum} onChange={(v) => set({ geburtsdatum: v })} />
      <Feld label={b.strasse} breit value={patient.strasse} onChange={(v) => set({ strasse: v })} />
      <Feld label={b.plz} value={patient.plz} onChange={(v) => set({ plz: v })} />
      <Feld label={b.ort} value={patient.ort} onChange={(v) => set({ ort: v })} />
      {art === 'kasse' ? (
        <>
          <Feld label={b.kasse} breit value={patient.kasse} platzhalter="z. B. AOK Bayern" onChange={(v) => set({ kasse: v })} />
          <label className="sd-feld">
            <span>{b.kassenart}</span>
            <select value={patient.kassenart} onChange={(e) => set({ kassenart: e.target.value as Kassenart })}>
              <option value="primaer">Primärkasse (AOK, BKK, IKK, LKK, Knappschaft)</option>
              <option value="ersatz">Ersatzkasse (TK, BARMER, DAK, KKH, hkk, HEK)</option>
            </select>
          </label>
          <Feld label={b.kassenNr} value={patient.kassenNr} platzhalter="9-stellig" onChange={(v) => set({ kassenNr: v })} />
          <Feld label={b.versichertenNr} value={patient.versichertenNr} onChange={(v) => set({ versichertenNr: v })} />
          <Feld label={b.status} value={patient.status} platzhalter="z. B. 1000000" onChange={(v) => set({ status: v })} />
        </>
      ) : (
        <>
          <Feld label="Versicherung / Kostenträger" breit value={patient.kasse} platzhalter="optional" onChange={(v) => set({ kasse: v })} />
          <Feld label={b.versichertenNr} value={patient.versichertenNr} platzhalter="optional" onChange={(v) => set({ versichertenNr: v })} />
        </>
      )}
    </div>
  )
}

export function PraxisFelder({ praxis, onChange, art }: { praxis: Praxis; onChange: (p: Praxis) => void; art: Abrechnungsart }) {
  const set = (patch: Partial<Praxis>) => onChange({ ...praxis, ...patch })
  const b = BESCHRIFTUNG
  return (
    <div className="sd-raster">
      <Feld label={b['praxis.name']} breit value={praxis.name} onChange={(v) => set({ name: v })} />
      <Feld label={b['praxis.zahnarzt']} breit value={praxis.zahnarzt} onChange={(v) => set({ zahnarzt: v })} />
      <Feld label={b['praxis.strasse']} breit value={praxis.strasse} onChange={(v) => set({ strasse: v })} />
      <Feld label={b['praxis.plz']} value={praxis.plz} onChange={(v) => set({ plz: v })} />
      <Feld label={b['praxis.ort']} value={praxis.ort} onChange={(v) => set({ ort: v })} />
      <Feld label={b['praxis.telefon']} typ="tel" value={praxis.telefon} onChange={(v) => set({ telefon: v })} />
      <Feld label={b['praxis.email']} typ="email" value={praxis.email} onChange={(v) => set({ email: v })} />
      {art === 'kasse' && (
        <>
          <Feld label={b['praxis.zahnarztNr']} value={praxis.zahnarztNr} onChange={(v) => set({ zahnarztNr: v })} />
          <Feld label={b['praxis.abrechnungsNr']} value={praxis.abrechnungsNr} onChange={(v) => set({ abrechnungsNr: v })} />
        </>
      )}
    </div>
  )
}
