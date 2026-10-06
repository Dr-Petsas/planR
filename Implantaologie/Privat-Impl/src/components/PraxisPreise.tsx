import { useState } from 'react'
import type { Einstellungen, Praxis } from '../types'
import { MATERIAL, materialPreis } from '../data/material'
import { euro } from '../engine/berechnung'

interface Props {
  einst: Einstellungen
  onChange: (e: Einstellungen) => void
}

function Feld({ label, wert, onChange, typ = 'text', breit }: { label: string; wert: string | number; onChange: (v: string) => void; typ?: string; breit?: boolean }) {
  return (
    <label className={`feld ${breit ? 'breit' : ''}`}>
      <span>{label}</span>
      <input type={typ} value={wert} step={typ === 'number' ? 'any' : undefined} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export function PraxisPreise({ einst, onChange }: Props) {
  const [suche, setSuche] = useState('')
  const pr = einst.praxis
  const setP = (f: keyof Praxis) => (v: string) => onChange({ ...einst, praxis: { ...pr, [f]: v } })
  const zahl = (v: string) => Number(v.replace(',', '.'))
  const preisSetzen = (id: string, v: string) => {
    const n = zahl(v)
    const overrides = { ...einst.materialPreise }
    if (!v.trim() || !Number.isFinite(n)) delete overrides[id]
    else overrides[id] = n
    onChange({ ...einst, materialPreise: overrides })
  }
  const liste = MATERIAL.filter((m) => {
    const s = suche.trim().toLowerCase()
    return !s || m.titel.toLowerCase().includes(s) || m.produkt.toLowerCase().includes(s) || m.id.includes(s)
  })

  return (
    <div className="block">
      <h3>Praxis (Briefkopf)</h3>
      <div className="formular">
        <Feld label="Praxisname" wert={pr.name} onChange={setP('name')} breit />
        <Feld label="Zahnärztin / Zahnarzt" wert={pr.zahnarzt} onChange={setP('zahnarzt')} breit />
        <Feld label="Straße, Nr." wert={pr.strasse} onChange={setP('strasse')} />
        <Feld label="PLZ Ort" wert={pr.plzOrt} onChange={setP('plzOrt')} />
        <Feld label="Telefon" wert={pr.telefon} onChange={setP('telefon')} />
        <Feld label="E-Mail" wert={pr.email} onChange={setP('email')} />
      </div>

      <h3>Abrechnung</h3>
      <div className="formular">
        <Feld label="GOZ-Standardfaktor" typ="number" wert={einst.gozFaktor} onChange={(v) => onChange({ ...einst, gozFaktor: zahl(v) })} />
        <Feld label="GOÄ-Standardfaktor" typ="number" wert={einst.goaeFaktor} onChange={(v) => onChange({ ...einst, goaeFaktor: zahl(v) })} />
        <Feld label="MwSt. Material/Labor (%)" typ="number" wert={einst.mwst} onChange={(v) => onChange({ ...einst, mwst: zahl(v) })} />
        <Feld label="Gültigkeit (Monate)" typ="number" wert={einst.gueltigMonate} onChange={(v) => onChange({ ...einst, gueltigMonate: Math.max(1, Math.round(zahl(v))) })} />
        <Feld label="Praxis-Stundensatz (€/h)" typ="number" wert={einst.stundensatz} onChange={(v) => onChange({ ...einst, stundensatz: zahl(v) })} />
      </div>
      <label className="chk breit">
        <input type="checkbox" checked={einst.erlaubeUeber35} onChange={(e) => onChange({ ...einst, erlaubeUeber35: e.target.checked })} />
        GOZ-Faktoren über 3,5 zulassen (nur mit schriftlicher Vereinbarung nach § 2 GOZ; erzeugt ein Vereinbarungsblatt)
      </label>
      <label className="chk breit">
        <input type="checkbox" checked={einst.materialAnalog} onChange={(e) => onChange({ ...einst, materialAnalog: e.target.checked })} />
        Material bei Analogleistungen einkalkulieren (Standard; sonst gesonderter Ausweis – strittig)
      </label>

      <h3>Materialpreise (Netto-EK, überschreibbar)</h3>
      <p className="hilfe">Leer lassen = Katalogpreis. Eigener Wert überschreibt den Standard-EK.</p>
      <input className="suche" placeholder="Material suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
      <table className="edit-tabelle preisliste">
        <thead><tr><th>Produkt</th><th>Rolle</th><th>Einheit</th><th className="r">Katalog</th><th className="r">Praxispreis</th><th>Quelle/Stand</th></tr></thead>
        <tbody>
          {liste.map((m) => (
            <tr key={m.id}>
              <td>{m.produkt} <small>({m.titel})</small></td>
              <td className="mono">{m.rolle}</td>
              <td>{m.einheit}</td>
              <td className="r">{euro(m.preis)}</td>
              <td className="r"><input className="mittel r" type="number" min={0} step={0.01} value={einst.materialPreise[m.id] ?? ''} placeholder={String(m.preis)} onChange={(e) => preisSetzen(m.id, e.target.value)} /></td>
              <td><small>{m.genau} · {m.stand}</small></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="kv-fuss">Effektiver EK Beispiel: {liste[0] ? `${liste[0].produkt} = ${euro(materialPreis(liste[0], einst.materialPreise))}` : '–'}</p>
    </div>
  )
}
